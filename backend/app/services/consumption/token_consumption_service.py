"""
Token consumption service for recording and analyzing token usage.
"""
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_, or_
from app.services.consumption.consumption_models import (
    ConsumptionStats,
    ConsumptionHistoryItem,
    ChartDataPoint,
)
from app.services.pricing import calculate_pricing


def record_consumption(
    db: Session,
    user_id: int,
    organization_id: int,
    model_name: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    run_id: Optional[int] = None,
    step_id: Optional[int] = None,
    rag_query_id: Optional[int] = None,
    source_type: str = "subscription",
    source_name: Optional[str] = None
) -> int:
    """
    Record token consumption in database.
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        model_name: Model name (e.g., "openai/gpt-4o-mini")
        provider: Provider name (e.g., "openrouter")
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        run_id: Optional run ID
        step_id: Optional step ID
        rag_query_id: Optional RAG query ID
        source_type: Source type ("subscription", "balance", "package")
        source_name: Optional source name (e.g., pipeline name, RAG name)
    
    Returns:
        Consumption record ID
    """
    # Calculate pricing
    pricing_calc = calculate_pricing(
        db, model_name, provider, input_tokens, output_tokens
    )
    
    if not pricing_calc:
        raise ValueError(f"Pricing not found for model {model_name} ({provider})")
    
    # Get exchange rate
    from app.services.pricing import get_exchange_rate
    exchange_rate = get_exchange_rate()
    
    # Calculate tokens charged (total tokens)
    total_tokens = input_tokens + output_tokens
    tokens_charged = total_tokens
    
    # Insert consumption record
    result = db.execute(
        text("""
            INSERT INTO token_consumption
            (user_id, organization_id, run_id, step_id, rag_query_id,
             model_name, provider, input_tokens, output_tokens, total_tokens,
             cost_per_1k_input_usd, cost_per_1k_output_usd, price_per_1k_usd,
             exchange_rate_usd_to_rub, cost_rub, price_rub,
             source_type, tokens_charged, source_name, consumed_at)
            VALUES
            (:user_id, :org_id, :run_id, :step_id, :rag_query_id,
             :model_name, :provider, :input_tokens, :output_tokens, :total_tokens,
             :cost_input, :cost_output, :price_per_1k,
             :exchange_rate, :cost_rub, :price_rub,
             :source_type, :tokens_charged, :source_name, CURRENT_TIMESTAMP)
        """),
        {
            "user_id": user_id,
            "org_id": organization_id,
            "run_id": run_id,
            "step_id": step_id,
            "rag_query_id": rag_query_id,
            "model_name": model_name,
            "provider": provider,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
            "cost_input": float(pricing_calc.cost_per_1k_input_usd),
            "cost_output": float(pricing_calc.cost_per_1k_output_usd),
            "price_per_1k": float(pricing_calc.price_per_1k_usd),
            "exchange_rate": float(exchange_rate),
            "cost_rub": float(pricing_calc.our_cost_rub),
            "price_rub": float(pricing_calc.user_price_rub),
            "source_type": source_type,
            "tokens_charged": tokens_charged,
            "source_name": source_name,
        }
    )
    
    db.commit()
    return result.lastrowid


def get_consumption_stats(
    db: Session,
    user_id: int,
    organization_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> ConsumptionStats:
    """
    Get consumption statistics for a user/organization.
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        start_date: Optional start date filter
        end_date: Optional end date filter
    
    Returns:
        ConsumptionStats object
    """
    # Build WHERE clause
    where_clauses = ["user_id = :user_id", "organization_id = :org_id"]
    params = {"user_id": user_id, "org_id": organization_id}
    
    if start_date:
        where_clauses.append("consumed_at >= :start_date")
        params["start_date"] = start_date
    
    if end_date:
        where_clauses.append("consumed_at <= :end_date")
        params["end_date"] = end_date
    
    where_sql = " AND ".join(where_clauses)
    
    # Build query
    query = text(f"""
        SELECT 
            SUM(total_tokens) as total_tokens,
            SUM(cost_rub) as total_cost_rub,
            SUM(price_rub) as total_price_rub,
            COUNT(*) as consumption_count,
            MIN(consumed_at) as period_start,
            MAX(consumed_at) as period_end
        FROM token_consumption
        WHERE {where_sql}
    """)
    
    result = db.execute(query, params)
    stats_row = result.fetchone()  # Save the main stats row before loops overwrite 'row'
    
    # Get breakdown by model
    model_query = text(f"""
        SELECT 
            model_name,
            SUM(total_tokens) as tokens,
            SUM(cost_rub) as cost,
            SUM(price_rub) as price,
            COUNT(*) as count
        FROM token_consumption
        WHERE {where_sql}
        GROUP BY model_name
    """)
    
    model_result = db.execute(model_query, params)
    by_model = {}
    for row in model_result:
        by_model[row.model_name] = {
            "tokens": int(row.tokens or 0),
            "cost": Decimal(str(row.cost or 0)),
            "price": Decimal(str(row.price or 0)),
            "count": int(row.count or 0),
        }
    
    # Get breakdown by provider
    provider_query = text(f"""
        SELECT 
            provider,
            SUM(total_tokens) as tokens,
            SUM(cost_rub) as cost,
            SUM(price_rub) as price,
            COUNT(*) as count
        FROM token_consumption
        WHERE {where_sql}
        GROUP BY provider
    """)
    
    provider_result = db.execute(provider_query, params)
    by_provider = {}
    for row in provider_result:
        by_provider[row.provider] = {
            "tokens": int(row.tokens or 0),
            "cost": Decimal(str(row.cost or 0)),
            "price": Decimal(str(row.price or 0)),
            "count": int(row.count or 0),
        }
    
    return ConsumptionStats(
        total_tokens=int(stats_row.total_tokens or 0) if stats_row else 0,
        total_cost_rub=Decimal(str(stats_row.total_cost_rub or 0)) if stats_row else Decimal(0),
        total_price_rub=Decimal(str(stats_row.total_price_rub or 0)) if stats_row else Decimal(0),
        consumption_count=int(stats_row.consumption_count or 0) if stats_row else 0,
        period_start=stats_row.period_start if stats_row and stats_row.period_start else datetime.now(timezone.utc),
        period_end=stats_row.period_end if stats_row and stats_row.period_end else datetime.now(timezone.utc),
        by_model=by_model,
        by_provider=by_provider,
    )


def get_consumption_history(
    db: Session,
    user_id: int,
    organization_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    model_name: Optional[str] = None,
    provider: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[ConsumptionHistoryItem]:
    """
    Get consumption history with filters.
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        start_date: Optional start date filter
        end_date: Optional end date filter
        model_name: Optional model name filter
        provider: Optional provider filter
        limit: Maximum number of records
        offset: Offset for pagination
    
    Returns:
        List of ConsumptionHistoryItem objects
    """
    # Build query
    where_clauses = ["user_id = :user_id", "organization_id = :org_id"]
    params = {"user_id": user_id, "org_id": organization_id}
    
    if start_date:
        where_clauses.append("consumed_at >= :start_date")
        params["start_date"] = start_date
    
    if end_date:
        where_clauses.append("consumed_at <= :end_date")
        params["end_date"] = end_date
    
    if model_name:
        where_clauses.append("model_name = :model_name")
        params["model_name"] = model_name
    
    if provider:
        where_clauses.append("provider = :provider")
        params["provider"] = provider
    
    where_sql = " AND ".join(where_clauses)
    
    query = text(f"""
        SELECT 
            id, consumed_at, model_name, provider,
            input_tokens, output_tokens, total_tokens,
            cost_rub, price_rub, source_type,
            run_id, step_id, source_name
        FROM token_consumption
        WHERE {where_sql}
        ORDER BY consumed_at DESC
        LIMIT :limit OFFSET :offset
    """)
    
    params["limit"] = limit
    params["offset"] = offset
    
    result = db.execute(query, params)
    
    history = []
    for row in result:
        history.append(ConsumptionHistoryItem(
            id=row.id,
            consumed_at=row.consumed_at,
            model_name=row.model_name,
            provider=row.provider,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            total_tokens=row.total_tokens,
            cost_rub=Decimal(str(row.cost_rub)),
            price_rub=Decimal(str(row.price_rub)),
            source_type=row.source_type,
            run_id=row.run_id,
            step_id=row.step_id,
            source_name=row.source_name if hasattr(row, 'source_name') else None,
        ))
    
    return history


def get_consumption_chart_data(
    db: Session,
    user_id: int,
    organization_id: int,
    start_date: datetime,
    end_date: datetime,
    group_by: str = "day"  # "day", "week", "month"
) -> List[ChartDataPoint]:
    """
    Get consumption data for charts.
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        start_date: Start date
        end_date: End date
        group_by: Grouping ("day", "week", "month")
    
    Returns:
        List of ChartDataPoint objects
    """
    # Determine date format based on group_by
    if group_by == "day":
        date_format = "DATE(consumed_at)"
    elif group_by == "week":
        date_format = "DATE(DATE_SUB(consumed_at, INTERVAL WEEKDAY(consumed_at) DAY))"
    elif group_by == "month":
        date_format = "DATE_FORMAT(consumed_at, '%Y-%m-01')"
    else:
        date_format = "DATE(consumed_at)"
    
    query = text(f"""
        SELECT 
            {date_format} as date,
            SUM(total_tokens) as tokens,
            SUM(cost_rub) as cost_rub,
            SUM(price_rub) as price_rub
        FROM token_consumption
        WHERE user_id = :user_id 
          AND organization_id = :org_id
          AND consumed_at >= :start_date
          AND consumed_at <= :end_date
        GROUP BY {date_format}
        ORDER BY date ASC
    """)
    
    result = db.execute(query, {
        "user_id": user_id,
        "org_id": organization_id,
        "start_date": start_date,
        "end_date": end_date,
    })
    
    chart_data = []
    for row in result:
        chart_data.append(ChartDataPoint(
            date=str(row.date),
            tokens=int(row.tokens or 0),
            cost_rub=Decimal(str(row.cost_rub or 0)),
            price_rub=Decimal(str(row.price_rub or 0)),
        ))
    
    return chart_data

