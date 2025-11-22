"""
Credential encryption service for tool configurations.
Uses Fernet symmetric encryption from cryptography library.
"""
import base64
import hashlib
from cryptography.fernet import Fernet
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def get_encryption_key() -> bytes:
    """Get encryption key from SESSION_SECRET.
    
    Derives a Fernet-compatible key from SESSION_SECRET.
    Fernet requires a 32-byte key, so we hash the secret.
    """
    from app.core.config import SESSION_SECRET
    
    if not SESSION_SECRET:
        raise ValueError("SESSION_SECRET not configured. Cannot encrypt credentials.")
    
    # Derive a 32-byte key from SESSION_SECRET using SHA256
    key = hashlib.sha256(SESSION_SECRET.encode()).digest()
    # Fernet uses base64url encoding, so encode the key
    return base64.urlsafe_b64encode(key)


def encrypt_credential(plaintext: str) -> str:
    """Encrypt a credential string.
    
    Args:
        plaintext: The plaintext credential to encrypt
        
    Returns:
        Encrypted string (base64-encoded)
        
    Raises:
        ValueError: If SESSION_SECRET is not configured
    """
    if not plaintext:
        return ""
    
    try:
        key = get_encryption_key()
        fernet = Fernet(key)
        encrypted = fernet.encrypt(plaintext.encode())
        return encrypted.decode()
    except Exception as e:
        logger.error(f"Failed to encrypt credential: {e}")
        raise ValueError(f"Encryption failed: {e}")


def decrypt_credential(encrypted: str) -> str:
    """Decrypt a credential string.
    
    Args:
        encrypted: The encrypted credential (base64-encoded)
        
    Returns:
        Decrypted plaintext string
        
    Raises:
        ValueError: If decryption fails or SESSION_SECRET is not configured
    """
    if not encrypted:
        return ""
    
    try:
        key = get_encryption_key()
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted.encode())
        return decrypted.decode()
    except Exception as e:
        logger.error(f"Failed to decrypt credential: {e}")
        raise ValueError(f"Decryption failed: {e}")


def encrypt_tool_config(config: dict) -> dict:
    """Encrypt sensitive fields in tool configuration.
    
    Encrypts:
    - api_key_encrypted -> api_key_encrypted (encrypted)
    - password_encrypted -> password_encrypted (encrypted)
    
    Args:
        config: Tool configuration dictionary
        
    Returns:
        Configuration dictionary with encrypted credentials
    """
    encrypted_config = config.copy()
    
    # Encrypt API key if present
    if 'api_key_encrypted' in encrypted_config and encrypted_config['api_key_encrypted']:
        # Check if already encrypted (starts with 'gAAAAAB' for Fernet)
        if not encrypted_config['api_key_encrypted'].startswith('gAAAAAB'):
            encrypted_config['api_key_encrypted'] = encrypt_credential(encrypted_config['api_key_encrypted'])
    
    # Encrypt password if present
    if 'password_encrypted' in encrypted_config and encrypted_config['password_encrypted']:
        # Check if already encrypted
        if not encrypted_config['password_encrypted'].startswith('gAAAAAB'):
            encrypted_config['password_encrypted'] = encrypt_credential(encrypted_config['password_encrypted'])
    
    return encrypted_config


def decrypt_tool_config(config: dict) -> dict:
    """Decrypt sensitive fields in tool configuration.
    
    Decrypts:
    - api_key_encrypted -> api_key (decrypted, for use)
    - password_encrypted -> password (decrypted, for use)
    
    Args:
        config: Tool configuration dictionary with encrypted credentials
        
    Returns:
        Configuration dictionary with decrypted credentials (as api_key and password)
    """
    decrypted_config = config.copy()
    
    # Decrypt API key if present
    if 'api_key_encrypted' in decrypted_config and decrypted_config['api_key_encrypted']:
        try:
            decrypted_config['api_key'] = decrypt_credential(decrypted_config['api_key_encrypted'])
        except Exception as e:
            logger.warning(f"Failed to decrypt api_key: {e}")
            decrypted_config['api_key'] = ""
    
    # Decrypt password if present
    if 'password_encrypted' in decrypted_config and decrypted_config['password_encrypted']:
        try:
            decrypted_config['password'] = decrypt_credential(decrypted_config['password_encrypted'])
        except Exception as e:
            logger.warning(f"Failed to decrypt password: {e}")
            decrypted_config['password'] = ""
    
    return decrypted_config

