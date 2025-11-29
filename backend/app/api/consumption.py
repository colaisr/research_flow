"""
Token consumption API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, time, timezone
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import get_current_user_dependency, get_current_organization_dependency, get_current_admin_user_dependency
from app.models.user import User
from app.models.organization import Organization
from app.services.consumption import (
    get_consumption_stats,
    get_consumption_history,
    get_consumption_chart_data,
)

router = APIRouter()


# Response Models
class ConsumptionStatsByModel(BaseModel):
    tokens: int
    cost: Decimal
    price: Decimal
    count: int


class ConsumptionStatsByProvider(BaseModel):
    tokens: int
    cost: Decimal
    price: Decimal
    count: int


class ConsumptionStatsResponse(BaseModel):
    total_tokens: int
    total_cost_rub: Decimal
    total_price_rub: Decimal
    consumption_count: int
    period_start: datetime
    period_end: datetime
    by_model: dict[str, ConsumptionStatsByModel]
    by_provider: dict[str, ConsumptionStatsByProvider]


class ConsumptionHistoryItemResponse(BaseModel):
    id: int
    consumed_at: datetime
    model_name: str
    provider: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_rub: Decimal
    price_rub: Decimal
    source_type: str
    run_id: Optional[int]
    step_id: Optional[int]
    source_name: Optional[str] = None


class ConsumptionHistoryResponse(BaseModel):
    items: List[ConsumptionHistoryItemResponse]
    total: int
    limit: int
    offset: int


class ChartDataPointResponse(BaseModel):
    date: str
    tokens: int
    cost_rub: Decimal
    price_rub: Decimal


class ChartDataResponse(BaseModel):
    data: List[ChartDataPointResponse]
    group_by: str


@router.get("/stats", response_model=ConsumptionStatsResponse)
async def get_consumption_stats_endpoint(
    start_date: Optional[datetime] = Query(None, description="Start date filter (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date filter (ISO format)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """Get consumption statistics for the current user/organization."""
    # Adjust end_date to end of day if it's at midnight (date-only input)
    adjusted_end_date = end_date
    if end_date:
        # Ensure timezone-aware (assume UTC if naive)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        # Adjust to end of day if it's at midnight (date-only input)
        if end_date.hour == 0 and end_date.minute == 0 and end_date.second == 0:
            adjusted_end_date = datetime.combine(end_date.date(), time.max, tzinfo=end_date.tzinfo)
    
    stats = get_consumption_stats(
        db=db,
        user_id=current_user.id,
        organization_id=current_organization.id,
        start_date=start_date,
        end_date=adjusted_end_date,
    )
    
    # Convert by_model and by_provider to response format
    by_model = {
        model_name: ConsumptionStatsByModel(**data)
        for model_name, data in stats.by_model.items()
    }
    
    by_provider = {
        provider: ConsumptionStatsByProvider(**data)
        for provider, data in stats.by_provider.items()
    }
    
    return ConsumptionStatsResponse(
        total_tokens=stats.total_tokens,
        total_cost_rub=stats.total_cost_rub,
        total_price_rub=stats.total_price_rub,
        consumption_count=stats.consumption_count,
        period_start=stats.period_start,
        period_end=stats.period_end,
        by_model=by_model,
        by_provider=by_provider,
    )


@router.get("/history", response_model=ConsumptionHistoryResponse)
async def get_consumption_history_endpoint(
    start_date: Optional[datetime] = Query(None, description="Start date filter (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date filter (ISO format)"),
    model_name: Optional[str] = Query(None, description="Filter by model name"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """Get consumption history with filters and pagination."""
    # Adjust end_date to end of day if it's at midnight (date-only input)
    adjusted_end_date = end_date
    if end_date:
        # Ensure timezone-aware (assume UTC if naive)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        # Adjust to end of day if it's at midnight (date-only input)
        if end_date.hour == 0 and end_date.minute == 0 and end_date.second == 0:
            adjusted_end_date = datetime.combine(end_date.date(), time.max, tzinfo=end_date.tzinfo)
    
    history = get_consumption_history(
        db=db,
        user_id=current_user.id,
        organization_id=current_organization.id,
        start_date=start_date,
        end_date=adjusted_end_date,
        model_name=model_name,
        provider=provider,
        limit=limit,
        offset=offset,
    )
    
    # Get total count for pagination
    from sqlalchemy import text
    where_clauses = ["user_id = :user_id", "organization_id = :org_id"]
    params = {
        "user_id": current_user.id,
        "org_id": current_organization.id,
    }
    
    if start_date:
        where_clauses.append("consumed_at >= :start_date")
        params["start_date"] = start_date
    
    if end_date:
        where_clauses.append("consumed_at <= :end_date")
        params["end_date"] = adjusted_end_date
    
    if model_name:
        where_clauses.append("model_name = :model_name")
        params["model_name"] = model_name
    
    if provider:
        where_clauses.append("provider = :provider")
        params["provider"] = provider
    
    where_sql = " AND ".join(where_clauses)
    
    count_result = db.execute(
        text(f"SELECT COUNT(*) as total FROM token_consumption WHERE {where_sql}"),
        params
    )
    total = count_result.fetchone()[0]
    
    items = [
        ConsumptionHistoryItemResponse(
            id=item.id,
            consumed_at=item.consumed_at,
            model_name=item.model_name,
            provider=item.provider,
            input_tokens=item.input_tokens,
            output_tokens=item.output_tokens,
            total_tokens=item.total_tokens,
            cost_rub=item.cost_rub,
            price_rub=item.price_rub,
            source_type=item.source_type,
            run_id=item.run_id,
            step_id=item.step_id,
            source_name=item.source_name,
        )
        for item in history
    ]
    
    return ConsumptionHistoryResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/chart", response_model=ChartDataResponse)
async def get_consumption_chart_data_endpoint(
    start_date: datetime = Query(..., description="Start date (ISO format)"),
    end_date: datetime = Query(..., description="End date (ISO format)"),
    group_by: str = Query("day", regex="^(day|week|month)$", description="Grouping: day, week, or month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """Get consumption data for charts with date grouping."""
    # Adjust end_date to end of day if it's at midnight (date-only input)
    adjusted_end_date = end_date
    if end_date.hour == 0 and end_date.minute == 0 and end_date.second == 0:
        adjusted_end_date = datetime.combine(end_date.date(), time.max, tzinfo=end_date.tzinfo if end_date.tzinfo else timezone.utc)
    
    chart_data = get_consumption_chart_data(
        db=db,
        user_id=current_user.id,
        organization_id=current_organization.id,
        start_date=start_date,
        end_date=adjusted_end_date,
        group_by=group_by,
    )
    
    data = [
        ChartDataPointResponse(
            date=point.date,
            tokens=point.tokens,
            cost_rub=point.cost_rub,
            price_rub=point.price_rub,
        )
        for point in chart_data
    ]
    
    return ChartDataResponse(
        data=data,
        group_by=group_by,
    )


@router.get("/stats/user/{user_id}", response_model=ConsumptionStatsResponse)
async def get_user_consumption_stats_admin(
    user_id: int,
    start_date: Optional[datetime] = Query(None, description="Start date filter (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date filter (ISO format)"),
    organization_id: Optional[int] = Query(None, description="Organization ID filter"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Get consumption statistics for a specific user (admin only)."""
    # Get user's personal organization if organization_id not provided
    if not organization_id:
        from app.services.organization import get_user_personal_organization
        org = get_user_personal_organization(db, user_id)
        if not org:
            raise HTTPException(status_code=404, detail="User organization not found")
        organization_id = org.id
    
    stats = get_consumption_stats(
        db=db,
        user_id=user_id,
        organization_id=organization_id,
        start_date=start_date,
        end_date=end_date,
    )
    
    # Convert to response format
    by_model = {
        model_name: ConsumptionStatsByModel(**data)
        for model_name, data in stats.by_model.items()
    }
    
    by_provider = {
        provider: ConsumptionStatsByProvider(**data)
        for provider, data in stats.by_provider.items()
    }
    
    return ConsumptionStatsResponse(
        total_tokens=stats.total_tokens,
        total_cost_rub=stats.total_cost_rub,
        total_price_rub=stats.total_price_rub,
        consumption_count=stats.consumption_count,
        period_start=stats.period_start,
        period_end=stats.period_end,
        by_model=by_model,
        by_provider=by_provider,
    )

