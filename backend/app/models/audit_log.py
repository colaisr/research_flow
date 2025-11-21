"""
Audit log model for tracking admin actions, especially impersonation.
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AuditLog(Base):
    """Audit log for tracking admin actions and impersonation events."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action_type = Column(String(50), nullable=False, index=True)  # 'impersonation_start', 'impersonation_end', 'user_update', 'feature_update', etc.
    admin_user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)  # Admin who performed the action
    target_user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)  # Target user (if applicable)
    details = Column(JSON, nullable=True)  # Additional details about the action
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(500), nullable=True)  # Browser/client user agent
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationships
    admin_user = relationship("User", foreign_keys=[admin_user_id])
    target_user = relationship("User", foreign_keys=[target_user_id])

