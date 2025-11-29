"""
Token package management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user_dependency, get_current_organization_dependency, get_current_admin_user_optional
from app.models.user import User
from app.models.organization import Organization
from app.services.balance import add_tokens, get_token_balance

router = APIRouter()


# Response Models
class TokenPackageResponse(BaseModel):
    id: int
    name: str
    display_name: str
    description: Optional[str]
    token_amount: int
    price_rub: Decimal
    is_active: bool
    is_visible: bool

    class Config:
        from_attributes = True


class PurchaseTokenPackageRequest(BaseModel):
    package_id: int
    reason: Optional[str] = None  # Admin note for why tokens were added


class PurchaseTokenPackageResponse(BaseModel):
    success: bool
    message: str
    package_id: int
    token_amount: int
    price_rub: Decimal
    new_balance: int


@router.get("", response_model=List[TokenPackageResponse])
async def list_token_packages(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
):
    """List all available token packages (visible and active)."""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT id, name, display_name, description, token_amount, price_rub, is_active, is_visible
            FROM token_packages
            WHERE is_active = 1 AND is_visible = 1
            ORDER BY token_amount ASC
        """)
    )
    
    packages = []
    for row in result:
        packages.append(TokenPackageResponse(
            id=row.id,
            name=row.name,
            display_name=row.display_name,
            description=row.description,
            token_amount=row.token_amount,
            price_rub=row.price_rub,
            is_active=bool(row.is_active),
            is_visible=bool(row.is_visible),
        ))
    
    return packages


@router.post("/{package_id}/purchase", response_model=PurchaseTokenPackageResponse)
async def purchase_token_package(
    package_id: int,
    request: PurchaseTokenPackageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
    admin_user: Optional[User] = Depends(get_current_admin_user_optional),
):
    """
    Purchase token package.
    
    For regular users: This endpoint records the purchase intent and shows placeholder payment.
    Payment processing will be integrated later via payment gateway.
    
    For admins: Can manually add tokens (bypasses payment placeholder).
    """
    from sqlalchemy import text
    
    # Verify package exists and is active
    result = db.execute(
        text("""
            SELECT id, name, display_name, token_amount, price_rub, is_active
            FROM token_packages
            WHERE id = :package_id
        """),
        {"package_id": package_id}
    )
    package = result.fetchone()
    
    if not package:
        raise HTTPException(status_code=404, detail="Token package not found")
    
    if not package.is_active:
        raise HTTPException(status_code=400, detail="Token package is not active")
    
    # Verify package_id matches request
    if package_id != request.package_id:
        raise HTTPException(
            status_code=400,
            detail="Package ID in URL does not match request body"
        )
    
    # Check if user is admin (can bypass payment)
    is_admin = admin_user is not None and admin_user.id == current_user.id
    
    if is_admin:
        # Admin can manually add tokens (bypasses payment)
        reason = request.reason or f"Purchased package: {package.display_name} (admin)"
        new_balance = add_tokens(
            db=db,
            user_id=current_user.id,
            organization_id=current_organization.id,
            amount=package.token_amount,
            reason=reason
        )
        
        # Record purchase in token_purchases table
        db.execute(
            text("""
                INSERT INTO token_purchases
                (user_id, organization_id, package_id, token_amount, price_rub, purchased_at)
                VALUES
                (:user_id, :org_id, :package_id, :token_amount, :price_rub, CURRENT_TIMESTAMP)
            """),
            {
                "user_id": current_user.id,
                "org_id": current_organization.id,
                "package_id": package_id,
                "token_amount": package.token_amount,
                "price_rub": package.price_rub,
            }
        )
        db.commit()
        
        return PurchaseTokenPackageResponse(
            success=True,
            message=f"Successfully added {package.token_amount} tokens to balance",
            package_id=package_id,
            token_amount=package.token_amount,
            price_rub=package.price_rub,
            new_balance=new_balance.balance,
        )
    else:
        # Regular user: Record purchase intent (payment will be processed via gateway later)
        # For now, we just record the purchase intent and return success
        # In the future, this will integrate with payment gateway
        # The frontend will show placeholder payment banner
        
        # Record purchase in token_purchases table (pending payment)
        db.execute(
            text("""
                INSERT INTO token_purchases
                (user_id, organization_id, package_id, token_amount, price_rub, purchased_at)
                VALUES
                (:user_id, :org_id, :package_id, :token_amount, :price_rub, CURRENT_TIMESTAMP)
            """),
            {
                "user_id": current_user.id,
                "org_id": current_organization.id,
                "package_id": package_id,
                "token_amount": package.token_amount,
                "price_rub": package.price_rub,
            }
        )
        db.commit()
        
        # Get current balance (tokens not added yet - waiting for payment)
        balance = get_token_balance(db, current_user.id, current_organization.id)
        
        return PurchaseTokenPackageResponse(
            success=True,
            message=f"Purchase recorded. Payment processing required.",
            package_id=package_id,
            token_amount=package.token_amount,
            price_rub=package.price_rub,
            new_balance=balance.balance,  # Balance unchanged until payment confirmed
        )


class PurchaseHistoryItem(BaseModel):
    id: int
    package_id: int
    package_name: str
    package_display_name: str
    token_amount: int
    price_rub: Decimal
    purchased_at: datetime

    class Config:
        from_attributes = True


class PurchaseHistoryResponse(BaseModel):
    purchases: List[PurchaseHistoryItem]
    total: int


@router.get("/purchases", response_model=PurchaseHistoryResponse)
async def get_purchase_history(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """Get purchase history for the current user/organization."""
    
    # Get total count
    count_result = db.execute(
        text("""
            SELECT COUNT(*) as total
            FROM token_purchases
            WHERE user_id = :user_id AND organization_id = :org_id
        """),
        {"user_id": current_user.id, "org_id": current_organization.id}
    )
    total = count_result.fetchone()[0]
    
    # Get purchases
    result = db.execute(
        text("""
            SELECT 
                p.id, p.package_id, p.token_amount, p.price_rub, p.purchased_at,
                pk.name as package_name, pk.display_name as package_display_name
            FROM token_purchases p
            INNER JOIN token_packages pk ON p.package_id = pk.id
            WHERE p.user_id = :user_id AND p.organization_id = :org_id
            ORDER BY p.purchased_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {
            "user_id": current_user.id,
            "org_id": current_organization.id,
            "limit": limit,
            "offset": offset,
        }
    )
    
    purchases = []
    for row in result:
        purchases.append(PurchaseHistoryItem(
            id=row.id,
            package_id=row.package_id,
            package_name=row.package_name,
            package_display_name=row.package_display_name,
            token_amount=row.token_amount,
            price_rub=row.price_rub,
            purchased_at=row.purchased_at,
        ))
    
    return PurchaseHistoryResponse(
        purchases=purchases,
        total=total,
    )

