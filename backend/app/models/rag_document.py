"""
RAG Document model.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class EmbeddingStatus(str, enum.Enum):
    """Embedding processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class RAGDocument(Base):
    """
    RAG Document - stores document metadata and extracted text.
    
    Documents belong to a RAG knowledge base. Original files are stored on filesystem,
    extracted text is stored in database, embeddings are stored in vector DB.
    """
    __tablename__ = "rag_documents"

    id = Column(Integer, primary_key=True, index=True)
    rag_id = Column(Integer, ForeignKey('rag_knowledge_bases.id'), nullable=False, index=True)
    title = Column(String(255), nullable=False)  # Filename or user-provided title
    content = Column(Text, nullable=False)  # Extracted text content (full text)
    file_path = Column(String(500), nullable=True)  # Relative path to original file (e.g., "rag_documents/rag_1/doc_1.pdf")
    document_metadata = Column(JSON, nullable=True)  # Document metadata (file size, upload date, file type, etc.) - renamed from 'metadata' (reserved in SQLAlchemy)
    embedding_status = Column(SQLEnum(EmbeddingStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=EmbeddingStatus.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    rag = relationship("RAGKnowledgeBase", back_populates="documents")

