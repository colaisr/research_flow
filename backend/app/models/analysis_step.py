"""
Analysis step model (intrastep outputs).
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AnalysisStep(Base):
    __tablename__ = "analysis_steps"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("analysis_runs.id"), nullable=False)
    step_name = Column(String(50), nullable=False)  # "wyckoff", "smc", "vsa", "delta", "ict", "merge"
    input_blob = Column(JSON, nullable=True)  # Prompt and context as JSON
    output_blob = Column(Text, nullable=True)  # LLM output text
    llm_model = Column(String(100), nullable=True)  # Model used, e.g., "openai/gpt-4o-mini"
    tokens_used = Column(Integer, default=0)
    input_tokens = Column(Integer, default=0, nullable=False)  # Input tokens used
    output_tokens = Column(Integer, default=0, nullable=False)  # Output tokens used
    provider = Column(String(100), nullable=True)  # Provider name, e.g., "openrouter"
    cost_per_1k_input = Column(Float, nullable=True)  # Cost per 1K input tokens
    cost_per_1k_output = Column(Float, nullable=True)  # Cost per 1K output tokens
    cost_est = Column(Float, default=0.0)  # Estimated cost in USD
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    run = relationship("AnalysisRun", back_populates="steps")

