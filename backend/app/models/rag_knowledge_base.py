"""
RAG Knowledge Base model.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class RAGKnowledgeBase(Base):
    """
    RAG Knowledge Base - stores metadata for a knowledge base.
    
    RAGs belong to organizations and can be accessed by organization members based on roles.
    """
    __tablename__ = "rag_knowledge_bases"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    vector_db_type = Column(String(50), nullable=False, default="chromadb")  # "chromadb" or "qdrant" (future)
    embedding_model = Column(String(255), nullable=False)  # e.g., "openai/text-embedding-3-small"
    document_count = Column(Integer, nullable=False, default=0)
    min_similarity_score = Column(Float, nullable=True)  # Minimum similarity score threshold for filtering results. None = no filtering.
    public_access_token = Column(String(64), nullable=True, unique=True, index=True)  # Public access token for sharing (generated on demand)
    public_access_mode = Column(String(50), nullable=True)  # "full_editor" or "folder_only"
    public_access_enabled = Column(Boolean, nullable=False, default=False)  # Whether public access is enabled
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization", foreign_keys=[organization_id])
    documents = relationship("RAGDocument", back_populates="rag", cascade="all, delete-orphan")
    access = relationship("RAGAccess", back_populates="rag", cascade="all, delete-orphan")

