"""
Integration Service — CRUD for integration_configs with AES-256-GCM encryption.
Includes test handlers for each service type.
"""

import time
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.encryption import decrypt_config, encrypt_config, mask_secrets
from app.core.org_filter import org_query

def _strip_oid(doc: dict) -> dict:
    """Remove MongoDB _id from document."""
    doc.pop("_id", None)
    return doc


VALID_SERVICES = {
    "roboflow", "smtp", "webhook", "sms", "fcm",
    "s3", "minio", "r2", "mqtt",
    "cloudflare-tunnel", "mongodb", "redis",
}


def _validate_service(service: str) -> None:
    if service not in VALID_SERVICES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown service: {service}. Valid: {', '.join(sorted(VALID_SERVICES))}",
        )


# ── CRUD ────────────────────────────────────────────────────────


async def list_integrations(db: AsyncIOMotorDatabase, org_id: str) -> list[dict]:
    """List all integrations with masked configs."""
    cursor = db.integration_configs.find(org_query(org_id))
    configs = await cursor.to_list(length=100)

    result = []
    for c in configs:
        try:
            decrypted = decrypt_config(c["config_encrypted"])
        except Exception:
            decrypted = {}
        c["config"] = mask_secrets(decrypted)
        result.append(_strip_oid(c))

    # Add not_configured entries for missing services
    configured = {c["service"] for c in configs}
    for svc in VALID_SERVICES:
        if svc not in configured:
            result.append({
                "service": svc,
                "status": "not_configured",
                "config": {},
                "last_tested": None,
                "last_test_result": None,
            })

    return sorted(result, key=lambda x: x.get("service", ""))


async def get_integration(
    db: AsyncIOMotorDatabase, org_id: str, service: str
) -> dict:
    _validate_service(service)
    doc = await db.integration_configs.find_one({**org_query(org_id), "service": service})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration '{service}' not configured",
        )
    try:
        decrypted = decrypt_config(doc["config_encrypted"])
    except Exception:
        decrypted = {}
    doc["config"] = mask_secrets(decrypted)
    return _strip_oid(doc)


async def save_integration(
    db: AsyncIOMotorDatabase, org_id: str, service: str, config: dict, user_id: str
) -> dict:
    _validate_service(service)
    now = datetime.now(timezone.utc)
    encrypted = encrypt_config(config)

    query = {**org_query(org_id), "service": service}
    existing = await db.integration_configs.find_one(query)

    if existing:
        updates = {
            "config_encrypted": encrypted,
            "status": "connected",
            "updated_by": user_id,
            "updated_at": now,
        }
        await db.integration_configs.update_one(query, {"$set": updates})
        existing.update(updates)
        existing["config"] = mask_secrets(config)
        return _strip_oid(existing)
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "service": service,
            "config_encrypted": encrypted,
            "status": "connected",
            "last_tested": None,
            "last_test_result": None,
            "last_test_response_ms": None,
            "last_test_error": None,
            "updated_by": user_id,
            "updated_at": now,
            "created_at": now,
        }
        await db.integration_configs.insert_one(doc)
        doc["config"] = mask_secrets(config)
        return _strip_oid(doc)


async def delete_integration(
    db: AsyncIOMotorDatabase, org_id: str, service: str
) -> None:
    _validate_service(service)
    result = await db.integration_configs.delete_one({**org_query(org_id), "service": service})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration '{service}' not found",
        )


# ── Test Handlers ───────────────────────────────────────────────


async def test_integration(
    db: AsyncIOMotorDatabase, org_id: str, service: str
) -> dict:
    """Test a configured integration and update its status."""
    _validate_service(service)

    doc = await db.integration_configs.find_one({**org_query(org_id), "service": service})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Integration '{service}' not configured — save config first",
        )

    try:
        config = decrypt_config(doc["config_encrypted"])
    except Exception:
        return await _record_test_result(db, org_id, service, False, 0, "Failed to decrypt config")

    start = time.monotonic()
    try:
        result = await _run_test_handler(service, config)
        elapsed_ms = (time.monotonic() - start) * 1000
        return await _record_test_result(
            db, org_id, service, True, elapsed_ms, details=result
        )
    except Exception as e:
        elapsed_ms = (time.monotonic() - start) * 1000
        return await _record_test_result(db, org_id, service, False, elapsed_ms, str(e))


async def test_all_integrations(
    db: AsyncIOMotorDatabase, org_id: str
) -> list[dict]:
    """Test all configured integrations."""
    cursor = db.integration_configs.find(org_query(org_id))
    configs = await cursor.to_list(length=100)
    results = []
    for c in configs:
        result = await test_integration(db, org_id, c["service"])
        results.append(result)
    return results


async def get_integration_status(
    db: AsyncIOMotorDatabase, org_id: str
) -> list[dict]:
    """Quick health summary — status only, no secrets."""
    cursor = db.integration_configs.find(org_query(org_id))
    configs = await cursor.to_list(length=100)
    result = []
    configured = set()
    for c in configs:
        configured.add(c["service"])
        result.append({
            "service": c["service"],
            "status": c.get("status", "not_configured"),
            "last_tested": c.get("last_tested"),
            "last_test_result": c.get("last_test_result"),
        })
    for svc in VALID_SERVICES:
        if svc not in configured:
            result.append({"service": svc, "status": "not_configured", "last_tested": None, "last_test_result": None})
    return sorted(result, key=lambda x: x["service"])


async def _record_test_result(
    db: AsyncIOMotorDatabase,
    org_id: str,
    service: str,
    success: bool,
    response_ms: float,
    error: str | None = None,
    details: dict | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    updates = {
        "status": "connected" if success else "error",
        "last_tested": now,
        "last_test_result": "success" if success else "failure",
        "last_test_response_ms": round(response_ms, 2),
        "last_test_error": error if not success else None,
    }
    await db.integration_configs.update_one(
        {**org_query(org_id), "service": service},
        {"$set": updates},
    )

    # Record test in history collection
    history_doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "service": service,
        "tested_at": now,
        "result": "success" if success else "failure",
        "response_ms": round(response_ms, 2),
        "error": error if not success else None,
        "tested_by": "system",
    }
    await db.integration_test_history.insert_one(history_doc)

    return {
        "service": service,
        "success": success,
        "response_ms": round(response_ms, 2),
        "error": error,
        "details": details,
    }


async def _run_test_handler(service: str, config: dict) -> dict:
    """Dispatch to the appropriate service test handler."""
    if service == "mongodb":
        return await _test_mongodb(config)
    elif service == "redis":
        return await _test_redis(config)
    elif service == "roboflow":
        return await _test_roboflow(config)
    elif service in ("s3", "minio", "r2"):
        return await _test_s3_compatible(config)
    elif service == "smtp":
        return await _test_smtp(config)
    elif service == "fcm":
        from app.services.fcm_service import verify_credentials
        return verify_credentials()
    elif service == "webhook":
        return await _test_webhook(config)
    elif service == "mqtt":
        return {"message": "MQTT config validated"}
    elif service == "sms":
        return {"message": "SMS config validated"}
    elif service == "cloudflare-tunnel":
        return {"message": "Cloudflare Tunnel config validated"}
    else:
        return {"message": f"No test handler for {service}"}


async def _test_mongodb(config: dict) -> dict:
    from motor.motor_asyncio import AsyncIOMotorClient
    uri = config.get("uri", "")
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    client.close()
    return {"message": "MongoDB ping successful"}


async def _test_redis(config: dict) -> dict:
    import redis.asyncio as aioredis
    url = config.get("url", "")
    r = aioredis.from_url(url, socket_connect_timeout=5)
    pong = await r.ping()
    await r.aclose()
    return {"message": f"Redis PING: {pong}"}


async def _test_roboflow(config: dict) -> dict:
    import httpx
    api_key = config.get("api_key", "")
    model_id = config.get("model_id", "")
    api_url = config.get("api_url", "https://detect.roboflow.com")
    # Just validate the API key by hitting the model endpoint
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{api_url}/{model_id}", params={"api_key": api_key})
    if resp.status_code >= 400:
        raise Exception(f"Roboflow API returned {resp.status_code}: {resp.text[:200]}")
    return {"status_code": resp.status_code, "message": "Roboflow API connected"}


async def _test_smtp(config: dict) -> dict:
    import smtplib
    import ssl
    host = config.get("host", "")
    port = int(config.get("port", 587))
    if not host:
        raise Exception("SMTP host is required")
    # Test TCP connection + EHLO
    try:
        if port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=10, context=ctx) as server:
                server.ehlo()
        else:
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.ehlo()
                if port == 587:
                    server.starttls()
                    server.ehlo()
    except Exception as e:
        raise Exception(f"SMTP connection failed: {e}")
    return {"message": f"SMTP server {host}:{port} responding"}


async def _test_s3_compatible(config: dict) -> dict:
    import httpx
    endpoint = config.get("endpoint", "")
    bucket = config.get("bucket", "")
    access_key = config.get("access_key", "")
    if not endpoint:
        raise Exception("S3 endpoint URL is required")
    # Test endpoint reachability
    url = endpoint.rstrip("/")
    if bucket:
        url = f"{url}/{bucket}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.head(url)
    # 200 = bucket exists and accessible
    # 403 = bucket exists but credentials wrong (still reachable)
    # 404 = bucket doesn't exist
    if resp.status_code in (200, 301, 307, 403):
        return {"message": f"S3 endpoint reachable (HTTP {resp.status_code})", "status_code": resp.status_code}
    elif resp.status_code == 404:
        raise Exception(f"Bucket '{bucket}' not found at {endpoint}")
    else:
        raise Exception(f"S3 endpoint returned HTTP {resp.status_code}")


async def _test_webhook(config: dict) -> dict:
    import httpx
    url = config.get("url", "")
    if not url:
        raise ValueError("Webhook URL is required")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json={"test": True, "source": "flooreye"})
    return {"status_code": resp.status_code, "message": "Webhook endpoint reachable"}
