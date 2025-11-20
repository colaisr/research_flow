"""
Authentication utilities and dependencies.
"""
from fastapi import Depends, HTTPException, status, Cookie
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.user import User
from app.core.config import SESSION_SECRET
import hashlib
import hmac
import json
from datetime import datetime, timedelta

# Simple session storage (in-memory for MVP, can move to Redis/DB later)
_sessions: dict[str, dict] = {}


def create_session(user_id: int, email: str, is_admin: bool) -> str:
    """Create a session token."""
    session_data = {
        'user_id': user_id,
        'email': email,
        'is_admin': is_admin,
        'created_at': datetime.utcnow().isoformat(),
    }
    
    # Create signed session token
    session_json = json.dumps(session_data, sort_keys=True)
    signature = hmac.new(
        SESSION_SECRET.encode() if SESSION_SECRET else b'default-secret-change-in-prod',
        session_json.encode(),
        hashlib.sha256
    ).hexdigest()
    
    session_token = f"{session_json}.{signature}"
    _sessions[session_token] = session_data
    
    return session_token


def verify_session(session_token: str) -> Optional[dict]:
    """Verify and get session data."""
    if not session_token:
        return None
    
    # Check in-memory cache first
    if session_token in _sessions:
        return _sessions[session_token]
    
    # Verify signature
    try:
        parts = session_token.rsplit('.', 1)
        if len(parts) != 2:
            return None
        
        session_json, signature = parts
        expected_signature = hmac.new(
            SESSION_SECRET.encode() if SESSION_SECRET else b'default-secret-change-in-prod',
            session_json.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            return None
        
        session_data = json.loads(session_json)
        
        # Check expiration (24 hours)
        created_at = datetime.fromisoformat(session_data['created_at'])
        if datetime.utcnow() - created_at > timedelta(hours=24):
            return None
        
        # Cache it
        _sessions[session_token] = session_data
        return session_data
    except Exception:
        return None


def delete_session(session_token: str):
    """Delete a session."""
    if session_token in _sessions:
        del _sessions[session_token]


def get_current_user_dependency(
    maxsignal_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> User:
    """Dependency to get current authenticated user."""
    if not maxsignal_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    session_data = verify_session(maxsignal_session)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )
    
    user = db.query(User).filter(User.id == session_data['user_id']).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    return user


def get_current_admin_user_dependency(
    current_user: User = Depends(get_current_user_dependency)
) -> User:
    """Dependency to get current admin user."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

