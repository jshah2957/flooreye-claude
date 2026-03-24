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
        self.poll_interval = config.COMMAND_POLL_INTERVAL

    async def poll_loop(self):
        """Continuously poll for commands."""
        async with httpx.AsyncClient(timeout=config.BACKEND_REQUEST_TIMEOUT) as client:
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
        cmd_type = cmd.get("command_type") or cmd.get("type", "")
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
                _SAFE_CONFIG_FIELDS = {
                    "CAPTURE_FPS", "CONFIDENCE_THRESHOLD", "MIN_DETECTION_AREA",
                    "TEMPORAL_K", "TEMPORAL_M", "DRY_REF_DELTA_THRESHOLD",
                    "COOLDOWN_AFTER_ALERT_SECONDS", "UPLOAD_INTERVAL_SECONDS",
                    "MAX_UPLOADS_PER_MIN", "DETECTION_ENABLED", "ENABLE_PREVIEW",
                    "RESOLUTION_WIDTH", "RESOLUTION_HEIGHT", "INFERENCE_MODE",
                    "UPLOAD_BOTH_FRAMES", "SHARE_CLEAN_FRAMES", "AUTO_CLIP_ON_DETECTION",
                    "AUTO_CLIP_DURATION_SECONDS", "FRAME_SAMPLE_RATE",
                }
                applied = []
                rejected = []
                for key, value in payload.items():
                    upper_key = key.upper()
                    if upper_key in _SAFE_CONFIG_FIELDS and hasattr(config, upper_key):
                        setattr(config, upper_key, value)
                        applied.append(upper_key)
                        log.info(f"Config updated: {upper_key} = {value}")
                    else:
                        rejected.append(upper_key)
                        log.warning("push_config rejected unsafe/unknown key: %s", upper_key)
                result = {"applied": applied, "rejected": rejected}
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
                    import os
                    classes_path = os.path.join(lc.config_dir, "alert_classes.json")
                    lc._write_json(classes_path, list(alert_names))
                    # Store full class overrides for edge incident engine
                    overrides_path = os.path.join(lc.config_dir, "class_overrides.json")
                    lc._write_json(overrides_path, classes)
                    # Update inference server in-memory
                    try:
                        from predict import update_alert_classes
                        update_alert_classes(alert_names)
                    except Exception:
                        pass
                    result = {"updated": True, "alert_classes": len(alert_names), "total_classes": len(classes)}
                    log.info("Classes updated: %d alert classes from %d total (overrides stored)", len(alert_names), len(classes))
                else:
                    result = {"updated": False, "reason": "no classes in payload"}
            elif cmd_type == "update_notification_rules":
                rules = payload.get("notification_rules", [])
                from local_config import local_config as lc
                import os
                rules_path = os.path.join(lc.config_dir, "notification_rules.json")
                lc._write_json(rules_path, rules)
                result = {"updated": True, "rules_count": len(rules)}
                log.info("Notification rules updated: %d rules stored", len(rules))
            elif cmd_type == "restart_agent":
                log.warning("Restart command received — agent will restart in 2 seconds")
                result = {"restarting": True}
                # ACK happens below, then schedule exit — Docker restart policy restarts the container
                import os as _os
                asyncio.get_event_loop().call_later(2.0, lambda: _os._exit(1))
            else:
                log.warning(f"Unknown command type: {cmd_type}")
                result = {"error": f"Unknown command: {cmd_type}"}

            # ACK the command
            await client.post(
                f"{config.BACKEND_URL}/api/v1/edge/commands/{cmd_id}/ack",
                json={
                    "result": result,
                    "status": "completed",
                    "retry_count": cmd.get("retry_count", 0),
                },
                headers=config.auth_headers(),
            )
            log.info(f"Command {cmd_type} completed and ACKed")

        except Exception as e:
            log.error(f"Command {cmd_type} failed: {e}")
            try:
                await client.post(
                    f"{config.BACKEND_URL}/api/v1/edge/commands/{cmd_id}/ack",
                    json={
                        "result": {"error": str(e)},
                        "status": "failed",
                        "retry_count": cmd.get("retry_count", 0),
                    },
                    headers=config.auth_headers(),
                )
            except Exception:
                pass
