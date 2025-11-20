"""
Analysis run model.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class RunStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    MODEL_FAILURE = "model_failure"  # Partial failure due to model errors (rate limits, not found, etc.)


class TriggerType(str, enum.Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id = Column(Integer, primary_key=True, index=True)
    trigger_type = Column(SQLEnum(TriggerType), nullable=False)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), nullable=False)
    analysis_type_id = Column(Integer, ForeignKey("analysis_types.id"), nullable=True)  # NULL for legacy runs
    timeframe = Column(String(10), nullable=False)  # e.g., "M15", "H1", "D1"
    status = Column(SQLEnum(RunStatus, values_callable=lambda x: [e.value for e in x]), default=RunStatus.QUEUED, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    cost_est_total = Column(Float, default=0.0)  # Estimated total cost in USD

    # Relationships
    instrument = relationship("Instrument", backref="runs")
    analysis_type = relationship("AnalysisType", back_populates="runs")
    steps = relationship("AnalysisStep", back_populates="run", cascade="all, delete-orphan")
    telegram_posts = relationship("TelegramPost", back_populates="run", cascade="all, delete-orphan")

