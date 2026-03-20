"""Polls backend for pending commands and executes them."""

import asyncio
import logging

import httpx

from config import config

log = logging.getLogger("edge-agent.commands")


class CommandPoller:
    """Polls /edge/commands every 30s and executes received commands."""

    def __init__(self, inference_client):
        self.inference = inference_client
        self.poll_interval = 30

    async def poll_loop(self):
        """Continuously poll for commands."""
        async with httpx.AsyncClient(timeout=10) as client:
            while True:
                try:
                    resp = await client.get(
                        f"{config.BACKEND_URL}/api/v1/edge/commands",
                        headers=config.auth_headers(),
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        commands = data.get("data", [])
                        for cmd in commands:
                            await self._execute(client, cmd)
                except Exception as e:
                    log.debug(f"Command poll failed: {e}")
                await asyncio.sleep(self.poll_interval)

    async def _execute(self, client: httpx.AsyncClient, cmd: dict):
        """Execute a single command and ACK it."""
        cmd_id = cmd.get("id", "")
        cmd_type = cmd.get("type", "")
        payload = cmd.get("payload", {})

        log.info(f"Executing command: {cmd_type} (id={cmd_id})")
        result = {}

        try:
            if cmd_type == "ping":
                result = {"pong": True}
            elif cmd_type == "reload_model":
                model_path = payload.get("model_path", "")
                if model_path:
                    result = await self.inference.load_model(model_path)
                else:
                    # Reload the current model (re-read from disk)
                    health = await self.inference.health()
                    result = {"reloaded": True, "version": health.get("model_version")}
            elif cmd_type == "deploy_model":
                download_url = payload.get("download_url", "")
                checksum = payload.get("checksum")
                version_id = payload.get("version_id", "model")
                if download_url:
                    result = await self.inference.download_model_from_url(
                        download_url, checksum, f"{version_id}.onnx"
                    )
                else:
                    log.warning("deploy_model missing download_url in payload")
                    result = {"error": "No download_url provided"}
            elif cmd_type == "push_config":
                for key, value in payload.items():
                    upper_key = key.upper()
                    if hasattr(config, upper_key):
                        setattr(config, upper_key, value)
                        log.info(f"Config updated: {upper_key} = {value}")
                result = {"applied": True, "keys": list(payload.keys())}
            elif cmd_type == "update_classes":
                classes = payload.get("classes", [])
                if classes:
                    # Update alert classes on inference server
                    alert_names = set()
                    for cls in classes:
                        name = cls.get("name", "")
                        if cls.get("alert_on_detect", True) and cls.get("enabled", True):
                            alert_names.add(name)
                    # Write classes to local config for persistence
                    from local_config import local_config as lc
                    import json
                    import os
                    classes_path = os.path.join(lc.config_dir, "alert_classes.json")
                    with open(classes_path, "w") as f:
                        json.dump(list(alert_names), f)
                    # Update inference server in-memory
                    try:
                        from predict import update_alert_classes
                        update_alert_classes(alert_names)
                    except Exception:
                        pass
                    result = {"updated": True, "alert_classes": len(alert_names), "total_classes": len(classes)}
                    log.info("Classes updated: %d alert classes from %d total", len(alert_names), len(classes))
                else:
                    result = {"updated": False, "reason": "no classes in payload"}
            elif cmd_type == "restart_agent":
                log.warning("Restart command received — agent will restart")
                result = {"restarting": True}
            else:
                log.warning(f"Unknown command type: {cmd_type}")
                result = {"error": f"Unknown command: {cmd_type}"}

            # ACK the command
            await client.post(
                f"{config.BACKEND_URL}/api/v1/edge/commands/{cmd_id}/ack",
                json={"result": result, "status": "completed"},
                headers=config.auth_headers(),
            )
            log.info(f"Command {cmd_type} completed and ACKed")

        except Exception as e:
            log.error(f"Command {cmd_type} failed: {e}")
            try:
                await client.post(
                    f"{config.BACKEND_URL}/api/v1/edge/commands/{cmd_id}/ack",
                    json={"result": {"error": str(e)}, "status": "failed"},
                    headers=config.auth_headers(),
                )
            except Exception:
                pass
