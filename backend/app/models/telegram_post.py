"""
Telegram post model.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class PostStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class TelegramPost(Base):
    __tablename__ = "telegram_posts"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("analysis_runs.id"), nullable=False)
    message_text = Column(Text, nullable=False)
    status = Column(SQLEnum(PostStatus), default=PostStatus.PENDING, nullable=False)
    message_id = Column(String(50), nullable=True)  # Telegram message ID
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    run = relationship("AnalysisRun", back_populates="telegram_posts")

