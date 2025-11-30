"""
Token balance service for managing token balances.

Token Consumption Priority:
1. First: Use subscription allocation (tokens_used_this_period)
2. Second: Use token balance (token_balances.balance)
3. Third: Block request (no overages)
"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.services.balance.balance_models import TokenBalance, TokenChargeResult
from app.services.subscription import get_active_subscription


def get_token_balance(
    db: Session,
    user_id: int,
    organization_id: int
) -> TokenBalance:
    """
    Get token balance for user/organization.
    
    Creates balance record if it doesn't exist (with 0 balance).
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
    
    Returns:
        TokenBalance object
    """
    # Check if balance exists
    result = db.execute(
        text("""
            SELECT id, user_id, organization_id, balance, created_at, updated_at
            FROM token_balances
            WHERE user_id = :user_id AND organization_id = :org_id
        """),
        {"user_id": user_id, "org_id": organization_id}
    )
    
    row = result.fetchone()
    
    if row:
        return TokenBalance.from_db_row(row)
    
    # Create balance if it doesn't exist
    db.execute(
        text("""
            INSERT INTO token_balances (user_id, organization_id, balance)
            VALUES (:user_id, :org_id, 0)
        """),
        {"user_id": user_id, "org_id": organization_id}
    )
    db.commit()
    
    # Get created balance
    result = db.execute(
        text("""
            SELECT id, user_id, organization_id, balance, created_at, updated_at
            FROM token_balances
            WHERE user_id = :user_id AND organization_id = :org_id
        """),
        {"user_id": user_id, "org_id": organization_id}
    )
    
    row = result.fetchone()
    if not row:
        raise Exception("Failed to create token balance")
    
    return TokenBalance.from_db_row(row)


def add_tokens(
    db: Session,
    user_id: int,
    organization_id: int,
    amount: int,
    reason: Optional[str] = None
) -> TokenBalance:
    """
    Add tokens to balance (admin operation).
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        amount: Number of tokens to add
        reason: Optional reason for adding tokens
    
    Returns:
        Updated TokenBalance object
    """
    if amount <= 0:
        raise ValueError("Amount must be positive")
    
    # Get or create balance
    balance = get_token_balance(db, user_id, organization_id)
    
    # Add tokens
    db.execute(
        text("""
            UPDATE token_balances
            SET balance = balance + :amount,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :balance_id
        """),
        {"balance_id": balance.id, "amount": amount}
    )
    db.commit()
    
    # Get updated balance
    result = db.execute(
        text("""
            SELECT id, user_id, organization_id, balance, created_at, updated_at
            FROM token_balances
            WHERE id = :balance_id
        """),
        {"balance_id": balance.id}
    )
    
    row = result.fetchone()
    if not row:
        raise Exception("Failed to retrieve updated balance")
    
    return TokenBalance.from_db_row(row)


def set_token_balance(
    db: Session,
    user_id: int,
    organization_id: int,
    amount: int,
    reason: Optional[str] = None
) -> TokenBalance:
    """
    Set token balance directly (admin operation).
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        amount: New balance amount (can be negative)
        reason: Optional reason for setting balance
    
    Returns:
        Updated TokenBalance object
    """
    # Get or create balance
    balance = get_token_balance(db, user_id, organization_id)
    
    # Set balance directly
    db.execute(
        text("""
            UPDATE token_balances
            SET balance = :amount,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :balance_id
        """),
        {"balance_id": balance.id, "amount": amount}
    )
    db.commit()
    
    # Get updated balance
    result = db.execute(
        text("""
            SELECT id, user_id, organization_id, balance, created_at, updated_at
            FROM token_balances
            WHERE id = :balance_id
        """),
        {"balance_id": balance.id}
    )
    
    row = result.fetchone()
    if not row:
        raise Exception("Failed to retrieve updated balance")
    
    return TokenBalance.from_db_row(row)


def charge_tokens(
    db: Session,
    user_id: int,
    organization_id: int,
    amount: int,
    source_type: str = "subscription"
) -> TokenChargeResult:
    """
    Charge tokens from subscription allocation or balance.
    
    Priority:
    1. First: Use subscription allocation (tokens_used_this_period)
    2. Second: Use token balance (token_balances.balance)
    3. Third: Block request (no overages)
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        amount: Number of tokens to charge
        source_type: Preferred source type ("subscription" or "balance")
    
    Returns:
        TokenChargeResult object
    """
    if amount <= 0:
        raise ValueError("Amount must be positive")
    
    # Get active subscription
    subscription = get_active_subscription(db, user_id, organization_id)
    
    subscription_tokens_available = 0
    subscription_tokens_used = 0
    subscription_tokens_allocated = 0
    
    if subscription:
        subscription_tokens_allocated = subscription.tokens_allocated
        subscription_tokens_used = subscription.tokens_used_this_period
        # Allow negative subscription tokens - we'll use balance to cover any excess
        subscription_tokens_available = subscription.tokens_allocated - subscription.tokens_used_this_period
    else:
        subscription_tokens_available = 0
    
    # Get token balance
    balance = get_token_balance(db, user_id, organization_id)
    balance_tokens_available = balance.balance
    
    # Calculate total available (subscription can be negative, but balance covers it)
    total_available = subscription_tokens_available + balance_tokens_available
    
    # Only block if total available is insufficient (both subscription + balance exhausted)
    if total_available < amount:
        return TokenChargeResult(
            success=False,
            tokens_charged=0,
            source="none",
            remaining_subscription_tokens=subscription_tokens_available,
            remaining_balance=balance_tokens_available,
            message=f"Недостаточно токенов. Доступно: {total_available}, Требуется: {amount}"
        )
    
    # Charge tokens: allow subscription to go negative, use balance to cover excess
    tokens_charged_from_subscription = 0
    tokens_charged_from_balance = 0
    
    # Priority 1: Charge from subscription first (allows negative)
    if subscription:
        # Charge all from subscription first
        tokens_charged_from_subscription = amount
        
        # Update subscription (may go negative)
        db.execute(
            text("""
                UPDATE user_subscriptions
                SET tokens_used_this_period = tokens_used_this_period + :amount,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :subscription_id
            """),
            {
                "subscription_id": subscription.id,
                "amount": tokens_charged_from_subscription,
            }
        )
        
        # Calculate new subscription available (may be negative)
        new_subscription_available = subscription_tokens_available - amount
        
        # Priority 2: If subscription went negative, use balance to cover the negative part
        if new_subscription_available < 0 and balance_tokens_available > 0:
            # Use balance to cover the negative subscription
            balance_needed = min(-new_subscription_available, balance_tokens_available)
            
            if balance_needed > 0:
                tokens_charged_from_balance = balance_needed
                tokens_charged_from_subscription = amount - balance_needed
                
                # Adjust subscription (reduce charge by balance amount)
                db.execute(
                    text("""
                        UPDATE user_subscriptions
                        SET tokens_used_this_period = tokens_used_this_period - :amount,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = :subscription_id
                    """),
                    {
                        "subscription_id": subscription.id,
                        "amount": balance_needed,
                    }
                )
                
                # Charge from balance
                db.execute(
                    text("""
                        UPDATE token_balances
                        SET balance = balance - :amount,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = :balance_id
                    """),
                    {
                        "balance_id": balance.id,
                        "amount": balance_needed,
                    }
                )
    
    db.commit()
    
    # Calculate remaining tokens
    remaining_subscription = subscription_tokens_available - tokens_charged_from_subscription if subscription else 0
    remaining_balance = balance_tokens_available - tokens_charged_from_balance
    
    # Determine source
    if tokens_charged_from_subscription > 0 and tokens_charged_from_balance > 0:
        source = "subscription+balance"
    elif tokens_charged_from_subscription > 0:
        source = "subscription"
    elif tokens_charged_from_balance > 0:
        source = "balance"
    else:
        source = "none"
    
    return TokenChargeResult(
        success=True,
        tokens_charged=tokens_charged_from_subscription + tokens_charged_from_balance,
        source=source,
        remaining_subscription_tokens=remaining_subscription,
        remaining_balance=remaining_balance,
        message=None,
    )


def get_available_tokens(
    db: Session,
    user_id: int,
    organization_id: int
) -> int:
    """
    Get total available tokens (subscription allocation + balance).
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
    
    Returns:
        Total available tokens
    """
    # Get active subscription
    subscription = get_active_subscription(db, user_id, organization_id)
    
    subscription_tokens_available = 0
    if subscription:
        # Ensure subscription_tokens_available is never negative (can't have negative available)
        subscription_tokens_available = max(0, subscription.tokens_allocated - subscription.tokens_used_this_period)
    
    # Get token balance
    balance = get_token_balance(db, user_id, organization_id)
    balance_tokens_available = balance.balance
    
    return subscription_tokens_available + balance_tokens_available

