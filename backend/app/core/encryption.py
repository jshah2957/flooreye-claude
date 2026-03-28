"""
AES-256-GCM encryption for sensitive credentials — bulletproof key handling.

Accepts ANY key input (base64, hex, raw string, any length) and normalizes
to a valid 32-byte AES key. Never crashes on bad keys — normalizes or rejects
clearly depending on environment.

Key resolution priority:
1. Valid base64-encoded 32-byte key → use directly (production-ready)
2. Valid hex-encoded 32-byte key → use directly
3. Any other string → derive 32 bytes via SHA-256 + log WARNING
4. Missing/empty key in production → refuse to start with clear instructions
5. Missing/empty key in dev/test → auto-generate deterministic dev key + log WARNING
"""

import base64
import hashlib
import json
import logging
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

log = logging.getLogger(__name__)

# Deterministic dev key — NEVER used in production
_DEV_KEY_SEED = "flooreye-development-encryption-seed-do-not-use-in-production"
_DEV_KEY = hashlib.sha256(_DEV_KEY_SEED.encode()).digest()  # 32 bytes, deterministic

# Cache the resolved key to avoid re-computing on every call
_resolved_key: bytes | None = None
_resolved_key_source: str = ""


def _resolve_key() -> bytes:
    """Resolve ENCRYPTION_KEY from settings into a valid 32-byte AES key.

    This function NEVER crashes on bad input. It normalizes any input
    to 32 bytes, logging warnings for non-ideal configurations.
    In production with missing/empty key, it raises ValueError with
    clear instructions.
    """
    global _resolved_key, _resolved_key_source

    if _resolved_key is not None:
        return _resolved_key

    env = getattr(settings, "ENVIRONMENT", "development")
    is_prod = env == "production"
    raw = getattr(settings, "ENCRYPTION_KEY", "")

    # Case 1: Missing or empty key
    if not raw or not raw.strip():
        if is_prod:
            raise ValueError(
                "ENCRYPTION_KEY is required in production. "
                "Generate one with: python -c \"import os,base64; print(base64.b64encode(os.urandom(32)).decode())\""
            )
        log.warning(
            "ENCRYPTION_KEY is empty — using deterministic dev key. "
            "NOT SAFE FOR PRODUCTION. Set a proper key in .env."
        )
        _resolved_key = _DEV_KEY
        _resolved_key_source = "dev-auto"
        return _resolved_key

    # Case 2: Try base64 decode → exactly 32 bytes (ideal)
    try:
        decoded = base64.b64decode(raw)
        if len(decoded) == 32:
            _resolved_key = decoded
            _resolved_key_source = "base64-32"
            return _resolved_key
    except Exception:
        pass

    # Case 3: Try hex decode → exactly 32 bytes
    try:
        decoded = bytes.fromhex(raw)
        if len(decoded) == 32:
            _resolved_key = decoded
            _resolved_key_source = "hex-32"
            return _resolved_key
    except Exception:
        pass

    # Case 4: Any other input → normalize via SHA-256 to get exactly 32 bytes
    # This handles: wrong-length base64, raw strings, passwords, anything
    if is_prod:
        log.warning(
            "ENCRYPTION_KEY is not a valid 32-byte base64 or hex key. "
            "Deriving a 32-byte key via SHA-256. This works but is not ideal. "
            "Generate a proper key: python -c \"import os,base64; print(base64.b64encode(os.urandom(32)).decode())\""
        )
    else:
        log.warning(
            "ENCRYPTION_KEY is not a standard format — deriving via SHA-256 (development mode)."
        )
    _resolved_key = hashlib.sha256(raw.encode()).digest()
    _resolved_key_source = "sha256-derived"
    return _resolved_key


def _get_key() -> bytes:
    """Get the 32-byte AES encryption key. Cached after first resolution."""
    return _resolve_key()


def get_key_source() -> str:
    """Return how the key was resolved (for diagnostics/health checks)."""
    _resolve_key()  # ensure resolved
    return _resolved_key_source


def generate_production_key() -> str:
    """Generate a cryptographically secure production-ready encryption key.

    Returns a base64-encoded 32-byte random key suitable for ENCRYPTION_KEY in .env.
    """
    return base64.b64encode(os.urandom(32)).decode()


def verify_encryption() -> dict:
    """Run a test encrypt/decrypt cycle. Returns status dict for health checks.

    Call this at startup to confirm encryption is working before accepting requests.
    """
    try:
        key = _get_key()
        source = get_key_source()
        # Test round-trip
        test_value = "flooreye-encryption-test-" + os.urandom(8).hex()
        encrypted = encrypt_string(test_value)
        decrypted = decrypt_string(encrypted)
        if decrypted != test_value:
            return {"ok": False, "error": "Round-trip mismatch", "key_source": source}
        return {"ok": True, "key_source": source, "key_length": len(key)}
    except Exception as e:
        return {"ok": False, "error": str(e), "key_source": "failed"}


def invalidate_key_cache():
    """Clear the cached key (used during key rotation/migration)."""
    global _resolved_key, _resolved_key_source
    _resolved_key = None
    _resolved_key_source = ""


# ── Encrypt / Decrypt Functions ──────────────────────────────────────────


def encrypt_config(config_dict: dict) -> str:
    """Encrypt a config dict to a base64-encoded AES-256-GCM ciphertext string."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce
    plaintext = json.dumps(config_dict).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_config(encrypted: str) -> dict:
    """Decrypt a base64-encoded AES-256-GCM ciphertext back to a config dict."""
    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ciphertext = raw[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))


def encrypt_string(plaintext: str) -> str:
    """Encrypt a plaintext string to a base64-encoded AES-256-GCM ciphertext."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_string(encrypted: str) -> str:
    """Decrypt a base64-encoded AES-256-GCM ciphertext back to a plaintext string."""
    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ciphertext = raw[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")


def mask_secrets(config_dict: dict) -> dict:
    """Return a copy with sensitive fields masked for display."""
    sensitive_keys = {
        "api_key", "secret_key", "password", "token", "access_key",
        "secret_access_key", "credentials", "private_key", "auth_token",
    }
    masked = {}
    for k, v in config_dict.items():
        if any(sk in k.lower() for sk in sensitive_keys) and isinstance(v, str) and len(v) > 4:
            masked[k] = v[:4] + "****"
        else:
            masked[k] = v
    return masked
