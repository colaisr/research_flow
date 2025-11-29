"""
Admin pricing management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import get_current_admin_user_dependency
from app.models.user import User
from app.services.pricing.adapters import get_adapter

router = APIRouter()


# Request/Response Models
class ModelPricingResponse(BaseModel):
    id: int
    model_name: str
    provider: str
    cost_per_1k_input_usd: Decimal
    cost_per_1k_output_usd: Decimal
    platform_fee_percent: Decimal
    price_per_1k_usd: Decimal
    is_active: bool
    is_visible: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class UpdatePricingRequest(BaseModel):
    cost_per_1k_input_usd: Optional[Decimal] = None
    cost_per_1k_output_usd: Optional[Decimal] = None
    platform_fee_percent: Optional[Decimal] = None
    price_per_1k_usd: Optional[Decimal] = None
    is_active: Optional[bool] = None
    is_visible: Optional[bool] = None


class PricingSyncResponse(BaseModel):
    success: bool
    message: str
    models_synced: int


@router.get("", response_model=List[ModelPricingResponse])
async def get_all_pricing(
    provider: Optional[str] = Query(None, description="Filter by provider"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Get all model pricing (admin only)."""
    from sqlalchemy import text
    
    where_clauses = []
    params = {}
    
    if provider:
        where_clauses.append("mp.provider = :provider")
        params["provider"] = provider
    
    if is_active is not None:
        where_clauses.append("mp.is_active = :is_active")
        params["is_active"] = 1 if is_active else 0
    
    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    result = db.execute(
        text(f"""
            SELECT 
                mp.id, mp.model_name, mp.provider, mp.cost_per_1k_input_usd, mp.cost_per_1k_output_usd,
                mp.platform_fee_percent, mp.price_per_1k_usd, mp.is_active, mp.is_visible,
                mp.created_at, mp.updated_at,
                am.display_name
            FROM model_pricing mp
            LEFT JOIN available_models am ON am.name = mp.model_name AND am.provider = mp.provider
            WHERE {where_sql}
            ORDER BY mp.provider, mp.model_name
        """),
        params
    )
    
    pricing_list = []
    for row in result:
        pricing_list.append(ModelPricingResponse(
            id=row.id,
            model_name=row.model_name,
            provider=row.provider,
            cost_per_1k_input_usd=row.cost_per_1k_input_usd,
            cost_per_1k_output_usd=row.cost_per_1k_output_usd,
            platform_fee_percent=row.platform_fee_percent,
            price_per_1k_usd=row.price_per_1k_usd,
            is_active=bool(row.is_active),
            is_visible=bool(row.is_visible),
            created_at=row.created_at.isoformat() if row.created_at else None,
            updated_at=row.updated_at.isoformat() if row.updated_at else None,
            display_name=row.display_name if hasattr(row, 'display_name') else None,
        ))
    
    return pricing_list


@router.get("/models/{model_id}", response_model=ModelPricingResponse)
async def get_model_pricing(
    model_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Get specific model pricing (admin only)."""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT 
                id, model_name, provider, cost_per_1k_input_usd, cost_per_1k_output_usd,
                platform_fee_percent, price_per_1k_usd, is_active, is_visible,
                created_at, updated_at
            FROM model_pricing
            WHERE id = :model_id
        """),
        {"model_id": model_id}
    )
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Model pricing not found")
    
    return ModelPricingResponse(
        id=row.id,
        model_name=row.model_name,
        provider=row.provider,
        cost_per_1k_input_usd=row.cost_per_1k_input_usd,
        cost_per_1k_output_usd=row.cost_per_1k_output_usd,
        platform_fee_percent=row.platform_fee_percent,
        price_per_1k_usd=row.price_per_1k_usd,
        is_active=bool(row.is_active),
        is_visible=bool(row.is_visible),
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.put("/models/{model_id}", response_model=ModelPricingResponse)
async def update_model_pricing(
    model_id: int,
    request: UpdatePricingRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Update model pricing (admin only)."""
    from sqlalchemy import text
    
    # Get current pricing
    result = db.execute(
        text("SELECT * FROM model_pricing WHERE id = :model_id"),
        {"model_id": model_id}
    )
    current = result.fetchone()
    
    if not current:
        raise HTTPException(status_code=404, detail="Model pricing not found")
    
    # Build update query
    updates = []
    params = {"model_id": model_id}
    
    if request.cost_per_1k_input_usd is not None:
        updates.append("cost_per_1k_input_usd = :cost_input")
        params["cost_input"] = request.cost_per_1k_input_usd
    
    if request.cost_per_1k_output_usd is not None:
        updates.append("cost_per_1k_output_usd = :cost_output")
        params["cost_output"] = request.cost_per_1k_output_usd
    
    if request.platform_fee_percent is not None:
        updates.append("platform_fee_percent = :fee_percent")
        params["fee_percent"] = request.platform_fee_percent
    
    if request.price_per_1k_usd is not None:
        updates.append("price_per_1k_usd = :price_per_1k")
        params["price_per_1k"] = request.price_per_1k_usd
    
    if request.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = 1 if request.is_active else 0
    
    if request.is_visible is not None:
        updates.append("is_visible = :is_visible")
        params["is_visible"] = 1 if request.is_visible else 0
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # If price_per_1k_usd not provided but costs or fee changed, recalculate
    if request.price_per_1k_usd is None and (request.cost_per_1k_input_usd is not None or 
                                             request.cost_per_1k_output_usd is not None or 
                                             request.platform_fee_percent is not None):
        # Get current or new values
        cost_input = request.cost_per_1k_input_usd if request.cost_per_1k_input_usd is not None else current.cost_per_1k_input_usd
        cost_output = request.cost_per_1k_output_usd if request.cost_per_1k_output_usd is not None else current.cost_per_1k_output_usd
        fee_percent = request.platform_fee_percent if request.platform_fee_percent is not None else current.platform_fee_percent
        
        # Calculate new price
        avg_cost = (float(cost_input) + float(cost_output)) / 2
        new_price = avg_cost * (1 + float(fee_percent) / 100)
        
        updates.append("price_per_1k_usd = :price_per_1k")
        params["price_per_1k"] = new_price
    
    updates.append("updated_at = CURRENT_TIMESTAMP")
    
    # Update
    db.execute(
        text(f"""
            UPDATE model_pricing
            SET {', '.join(updates)}
            WHERE id = :model_id
        """),
        params
    )
    db.commit()
    
    # Get updated pricing
    result = db.execute(
        text("""
            SELECT 
                id, model_name, provider, cost_per_1k_input_usd, cost_per_1k_output_usd,
                platform_fee_percent, price_per_1k_usd, is_active, is_visible,
                created_at, updated_at
            FROM model_pricing
            WHERE id = :model_id
        """),
        {"model_id": model_id}
    )
    
    row = result.fetchone()
    return ModelPricingResponse(
        id=row.id,
        model_name=row.model_name,
        provider=row.provider,
        cost_per_1k_input_usd=row.cost_per_1k_input_usd,
        cost_per_1k_output_usd=row.cost_per_1k_output_usd,
        platform_fee_percent=row.platform_fee_percent,
        price_per_1k_usd=row.price_per_1k_usd,
        is_active=bool(row.is_active),
        is_visible=bool(row.is_visible),
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.post("/sync-openrouter", response_model=PricingSyncResponse)
async def sync_openrouter_pricing(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Sync pricing from OpenRouter API (admin only)."""
    try:
        adapter = get_adapter("openrouter")
        models_synced = adapter.sync_to_database(
            db=db,
            provider="openrouter",
            platform_fee_percent=40.0
        )
        
        return PricingSyncResponse(
            success=True,
            message=f"Successfully synced {models_synced} models from OpenRouter",
            models_synced=models_synced,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync pricing from OpenRouter: {str(e)}"
        )


@router.post("/sync-gemini", response_model=PricingSyncResponse)
async def sync_gemini_pricing(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Sync pricing from Gemini API (admin only, placeholder for future)."""
    try:
        adapter = get_adapter("gemini")
        models_synced = adapter.sync_to_database(
            db=db,
            provider="gemini",
            platform_fee_percent=40.0
        )
        
        return PricingSyncResponse(
            success=True,
            message=f"Successfully synced {models_synced} models from Gemini",
            models_synced=models_synced,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync pricing from Gemini: {str(e)}"
        )

