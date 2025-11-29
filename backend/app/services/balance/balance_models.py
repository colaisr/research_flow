"""
Token balance model classes.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class TokenBalance:
    """Token balance data class."""
    id: int
    user_id: int
    organization_id: int
    balance: int
    created_at: datetime
    updated_at: datetime
    
    @classmethod
    def from_db_row(cls, row) -> "TokenBalance":
        """Create TokenBalance from database row."""
        return cls(
            id=row.id,
            user_id=row.user_id,
            organization_id=row.organization_id,
            balance=row.balance,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


@dataclass
class TokenChargeResult:
    """Result of token charging operation."""
    success: bool
    tokens_charged: int
    source: str  # "subscription" or "balance"
    remaining_subscription_tokens: int
    remaining_balance: int
    message: Optional[str] = None

