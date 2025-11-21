"""
User model for authentication.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)  # Deprecated, use role instead
    role = Column(String(50), nullable=False, default='org_admin')  # 'admin', 'org_admin', 'org_user'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    features = relationship("UserFeature", back_populates="user", cascade="all, delete-orphan")
    
    def is_platform_admin(self) -> bool:
        """Check if user is platform admin."""
        return self.role == 'admin'
    
    def is_org_admin(self) -> bool:
        """Check if user is organization admin (or platform admin)."""
        return self.role in ('admin', 'org_admin')
    
    def is_org_user(self) -> bool:
        """Check if user is organization user."""
        return self.role == 'org_user'

