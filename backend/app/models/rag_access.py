"""
RAG Access model for role-based access control.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class RAGRole(str, enum.Enum):
    """RAG access roles."""
    OWNER = "owner"
    EDITOR = "editor"
    FILE_MANAGER = "file_manager"
    VIEWER = "viewer"


class RAGAccess(Base):
    """
    RAG Access - role-based access control for RAGs.
    
    Defines which users have access to which RAGs and what role they have.
    Owner is auto-assigned on RAG creation (creator).
    """
    __tablename__ = "rag_access"

    id = Column(Integer, primary_key=True, index=True)
    rag_id = Column(Integer, ForeignKey('rag_knowledge_bases.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # 'owner', 'editor', 'file_manager', 'viewer'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    rag = relationship("RAGKnowledgeBase", back_populates="access")
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint('rag_id', 'user_id', name='uq_rag_access_rag_user'),
    )

