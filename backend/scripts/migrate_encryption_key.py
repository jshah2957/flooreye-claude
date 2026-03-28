"""
Encryption Key Migration Script — re-encrypts all data from old key to new key.

Usage:
    # Dry run (shows what would be migrated):
    python -m scripts.migrate_encryption_key --dry-run

    # Actual migration:
    python -m scripts.migrate_encryption_key --new-key <base64-encoded-32-byte-key>

    # Generate a new key:
    python -m scripts.migrate_encryption_key --generate-key

The script:
1. Derives the OLD key from the current ENCRYPTION_KEY using the same SHA-256 fallback
2. Decrypts all encrypted fields using the OLD key
3. Re-encrypts using the NEW key
4. Is idempotent — tries new key first, skips already-migrated records
"""

import argparse
import asyncio
import base64
import hashlib
import json
import logging
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("migrate")

# The OLD key derivation: SHA-256 of the raw base64 string (the dev fallback method)
OLD_KEY_B64 = "bG9jYWwtZGV2LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMh"
OLD_KEY = hashlib.sha256(OLD_KEY_B64.encode()).digest()  # 32 bytes


def _decrypt_with_key(encrypted: str, key: bytes) -> str | None:
    """Try to decrypt a value with a given key. Returns None on failure."""
    try:
        aesgcm = AESGCM(key)
        raw = base64.b64decode(encrypted)
        nonce = raw[:12]
        ciphertext = raw[12:]
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode("utf-8")
    except Exception:
        return None


def _encrypt_with_key(plaintext: str, key: bytes) -> str:
    """Encrypt a string with a given key."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def _decrypt_config_with_key(encrypted: str, key: bytes) -> dict | None:
    """Try to decrypt a config dict with a given key."""
    plaintext = _decrypt_with_key(encrypted, key)
    if plaintext is None:
        return None
    try:
        return json.loads(plaintext)
    except json.JSONDecodeError:
        return None


def _encrypt_config_with_key(config: dict, key: bytes) -> str:
    """Encrypt a config dict with a given key."""
    return _encrypt_with_key(json.dumps(config), key)


async def migrate(new_key: bytes, dry_run: bool = False):
    """Run the full migration."""
    from app.core.config import settings

    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB]

    total_migrated = 0
    total_skipped = 0
    total_failed = 0

    # ── Migrate cameras ──────────────────────────────────────────
    log.info("=== Migrating cameras ===")
    cameras = await db.cameras.find({}).to_list(1000)
    for cam in cameras:
        cam_id = cam.get("id", str(cam.get("_id", "?")))
        changed = False

        for field in ("stream_url_encrypted", "credentials_encrypted"):
            value = cam.get(field)
            if not value:
                continue

            # Try new key first (idempotent — already migrated?)
            if _decrypt_with_key(value, new_key) is not None:
                log.info("  Camera %s.%s — already on new key, skipping", cam_id[:8], field)
                total_skipped += 1
                continue

            # Try old key
            plaintext = _decrypt_with_key(value, OLD_KEY)
            if plaintext is None:
                log.error("  Camera %s.%s — FAILED: cannot decrypt with old or new key", cam_id[:8], field)
                total_failed += 1
                continue

            # Re-encrypt with new key
            new_encrypted = _encrypt_with_key(plaintext, new_key)

            # Verify round-trip
            verify = _decrypt_with_key(new_encrypted, new_key)
            if verify != plaintext:
                log.error("  Camera %s.%s — FAILED: round-trip verification mismatch", cam_id[:8], field)
                total_failed += 1
                continue

            if dry_run:
                log.info("  Camera %s.%s — WOULD migrate (plaintext: %s...)", cam_id[:8], field, plaintext[:20])
                total_migrated += 1
            else:
                await db.cameras.update_one(
                    {"_id": cam["_id"]},
                    {"$set": {field: new_encrypted}},
                )
                log.info("  Camera %s.%s — migrated", cam_id[:8], field)
                total_migrated += 1
                changed = True

    # ── Migrate integration_configs ──────────────────────────────
    log.info("=== Migrating integration_configs ===")
    configs = await db.integration_configs.find({}).to_list(100)
    for cfg in configs:
        service = cfg.get("service", "?")
        value = cfg.get("config_encrypted")
        if not value:
            continue

        # Try new key first
        if _decrypt_config_with_key(value, new_key) is not None:
            log.info("  Integration %s — already on new key, skipping", service)
            total_skipped += 1
            continue

        # Try old key
        config_dict = _decrypt_config_with_key(value, OLD_KEY)
        if config_dict is None:
            log.error("  Integration %s — FAILED: cannot decrypt with old or new key", service)
            total_failed += 1
            continue

        # Re-encrypt
        new_encrypted = _encrypt_config_with_key(config_dict, new_key)

        # Verify
        verify = _decrypt_config_with_key(new_encrypted, new_key)
        if verify != config_dict:
            log.error("  Integration %s — FAILED: round-trip verification mismatch", service)
            total_failed += 1
            continue

        if dry_run:
            log.info("  Integration %s — WOULD migrate (keys: %s)", service, list(config_dict.keys()))
            total_migrated += 1
        else:
            await db.integration_configs.update_one(
                {"_id": cfg["_id"]},
                {"$set": {"config_encrypted": new_encrypted}},
            )
            log.info("  Integration %s — migrated", service)
            total_migrated += 1

    # ── Summary ──────────────────────────────────────────────────
    log.info("")
    log.info("=== Migration %s ===", "DRY RUN COMPLETE" if dry_run else "COMPLETE")
    log.info("  Migrated: %d", total_migrated)
    log.info("  Skipped (already on new key): %d", total_skipped)
    log.info("  Failed: %d", total_failed)

    if total_failed > 0:
        log.error("  ⚠ Some records failed — check logs above")

    client.close()
    return total_failed == 0


def main():
    parser = argparse.ArgumentParser(description="Migrate encryption key")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be migrated without changing data")
    parser.add_argument("--new-key", type=str, help="New base64-encoded 32-byte encryption key")
    parser.add_argument("--generate-key", action="store_true", help="Generate a new production key and exit")
    args = parser.parse_args()

    if args.generate_key:
        key = base64.b64encode(os.urandom(32)).decode()
        print(f"Generated key: {key}")
        print(f"Set in .env:   ENCRYPTION_KEY={key}")
        return

    if not args.new_key and not args.dry_run:
        parser.error("--new-key is required (or use --dry-run to preview)")

    if args.dry_run:
        # For dry run, use a dummy new key to test decryption with old key
        new_key = os.urandom(32)
    else:
        try:
            new_key = base64.b64decode(args.new_key)
            if len(new_key) != 32:
                parser.error(f"Key must decode to 32 bytes, got {len(new_key)}")
        except Exception as e:
            parser.error(f"Invalid base64 key: {e}")

    log.info("Old key (SHA-256 derived): %s...", OLD_KEY.hex()[:16])
    log.info("New key: %s...", new_key.hex()[:16])
    log.info("Mode: %s", "DRY RUN" if args.dry_run else "LIVE MIGRATION")
    log.info("")

    success = asyncio.run(migrate(new_key, args.dry_run))
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
