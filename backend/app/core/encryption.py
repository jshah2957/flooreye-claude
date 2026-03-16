"""
AES-256-GCM encryption for sensitive integration credentials.

Config values are encrypted before storage and decrypted on read.
The encryption key comes from settings.ENCRYPTION_KEY (base64-encoded 32 bytes).
"""

import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _get_key() -> bytes:
    """Decode the base64 encryption key from settings."""
    key_b64 = settings.ENCRYPTION_KEY
    try:
        key = base64.b64decode(key_b64)
        if len(key) != 32:
            raise ValueError(f"Encryption key must be 32 bytes, got {len(key)}")
        return key
    except Exception:
        # Fallback: use SHA-256 hash of the key string — DEV ONLY
        import hashlib
        import logging
        logging.getLogger(__name__).warning(
            "ENCRYPTION_KEY is not a valid 32-byte base64 key. "
            "Using SHA-256 fallback. Set a proper key for production!"
        )
        return hashlib.sha256(key_b64.encode()).digest()


def encrypt_config(config_dict: dict) -> str:
    """Encrypt a config dict to a base64-encoded AES-256-GCM ciphertext string."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce
    plaintext = json.dumps(config_dict).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    # Store as base64(nonce + ciphertext)
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
