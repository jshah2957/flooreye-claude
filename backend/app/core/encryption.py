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
        # Only allow fallback in development
        if getattr(settings, 'ENVIRONMENT', 'development') == 'production':
            raise ValueError(
                "ENCRYPTION_KEY must be a valid base64-encoded 32-byte key in production. "
                "Generate one with: python -c \"import os,base64; print(base64.b64encode(os.urandom(32)).decode())\""
            )
        import hashlib
        import logging
        logging.getLogger(__name__).warning(
            "ENCRYPTION_KEY is not valid base64. Using SHA-256 fallback (development only)."
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
