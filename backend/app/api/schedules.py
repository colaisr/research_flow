"""
Schedules API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.auth import get_current_user_dependency, get_current_organization_dependency
from app.models.schedule import Schedule
from app.models.organization import Organization
from app.models.user import User
from app.models.analysis_type import AnalysisType
from app.services.scheduler.scheduler_service import (
    add_schedule_job,
    remove_schedule_job,
    reload_schedule,
    calculate_next_run
)

router = APIRouter()


class ScheduleConfig(BaseModel):
    """Schedule configuration."""
    time: Optional[str] = None  # HH:MM format for daily/weekly
    day_of_week: Optional[int] = None  # 0-6 (Monday-Sunday) for weekly
    interval_minutes: Optional[int] = None  # for interval type
    cron_expression: Optional[str] = None  # for cron type


class ScheduleCreate(BaseModel):
    """Request model for creating a schedule."""
    analysis_type_id: int
    schedule_type: str  # 'daily', 'weekly', 'interval', 'cron'
    schedule_config: ScheduleConfig
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    """Request model for updating a schedule."""
    schedule_type: Optional[str] = None
    schedule_config: Optional[ScheduleConfig] = None
    is_active: Optional[bool] = None


class ScheduleResponse(BaseModel):
    """Response model for a schedule."""
    id: int
    analysis_type_id: int
    analysis_type_name: str
    schedule_type: str
    schedule_config: dict
    is_active: bool
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[ScheduleResponse])
async def list_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List all schedules for the current organization."""
    schedules = db.query(Schedule).filter(
        Schedule.organization_id == current_organization.id
    ).order_by(Schedule.created_at.desc()).all()
    
    result = []
    for schedule in schedules:
        analysis_type = db.query(AnalysisType).filter(
            AnalysisType.id == schedule.analysis_type_id
        ).first()
        
        result.append(ScheduleResponse(
            id=schedule.id,
            analysis_type_id=schedule.analysis_type_id,
            analysis_type_name=analysis_type.display_name if analysis_type else f"Process {schedule.analysis_type_id}",
            schedule_type=schedule.schedule_type,
            schedule_config=schedule.schedule_config,
            is_active=schedule.is_active,
            last_run_at=schedule.last_run_at,
            next_run_at=schedule.next_run_at,
            created_at=schedule.created_at,
            updated_at=schedule.updated_at
        ))
    
    return result


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    request: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Create a new schedule."""
    # Verify analysis type exists and belongs to organization
    analysis_type = db.query(AnalysisType).filter(
        AnalysisType.id == request.analysis_type_id,
        AnalysisType.organization_id == current_organization.id
    ).first()
    
    if not analysis_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis type not found"
        )
    
    # Validate schedule config based on type
    config_dict = request.schedule_config.dict(exclude_none=True)
    
    if request.schedule_type == 'daily':
        if 'time' not in config_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="time is required for daily schedule"
            )
    elif request.schedule_type == 'weekly':
        if 'time' not in config_dict or 'day_of_week' not in config_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="time and day_of_week are required for weekly schedule"
            )
    elif request.schedule_type == 'interval':
        if 'interval_minutes' not in config_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="interval_minutes is required for interval schedule"
            )
    elif request.schedule_type == 'cron':
        if 'cron_expression' not in config_dict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cron_expression is required for cron schedule"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid schedule_type: {request.schedule_type}"
        )
    
    # Create schedule
    schedule = Schedule(
        user_id=current_user.id,
        organization_id=current_organization.id,
        analysis_type_id=request.analysis_type_id,
        schedule_type=request.schedule_type,
        schedule_config=config_dict,
        is_active=request.is_active
    )
    
    # Calculate next run time
    schedule.next_run_at = calculate_next_run(schedule)
    
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    
    # Add to scheduler if active
    if schedule.is_active:
        add_schedule_job(schedule)
    
    analysis_type = db.query(AnalysisType).filter(
        AnalysisType.id == schedule.analysis_type_id
    ).first()
    
    return ScheduleResponse(
        id=schedule.id,
        analysis_type_id=schedule.analysis_type_id,
        analysis_type_name=analysis_type.display_name if analysis_type else f"Process {schedule.analysis_type_id}",
        schedule_type=schedule.schedule_type,
        schedule_config=schedule.schedule_config,
        is_active=schedule.is_active,
        last_run_at=schedule.last_run_at,
        next_run_at=schedule.next_run_at,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at
    )


@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Get a schedule by ID."""
    schedule = db.query(Schedule).filter(
        Schedule.id == schedule_id,
        Schedule.organization_id == current_organization.id
    ).first()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    analysis_type = db.query(AnalysisType).filter(
        AnalysisType.id == schedule.analysis_type_id
    ).first()
    
    return ScheduleResponse(
        id=schedule.id,
        analysis_type_id=schedule.analysis_type_id,
        analysis_type_name=analysis_type.display_name if analysis_type else f"Process {schedule.analysis_type_id}",
        schedule_type=schedule.schedule_type,
        schedule_config=schedule.schedule_config,
        is_active=schedule.is_active,
        last_run_at=schedule.last_run_at,
        next_run_at=schedule.next_run_at,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at
    )


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: int,
    request: ScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Update a schedule."""
    schedule = db.query(Schedule).filter(
        Schedule.id == schedule_id,
        Schedule.organization_id == current_organization.id
    ).first()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    # Update fields
    if request.schedule_type is not None:
        schedule.schedule_type = request.schedule_type
    
    if request.schedule_config is not None:
        schedule.schedule_config = request.schedule_config.dict(exclude_none=True)
    
    if request.is_active is not None:
        schedule.is_active = request.is_active
    
    # Recalculate next run time
    schedule.next_run_at = calculate_next_run(schedule)
    
    db.commit()
    db.refresh(schedule)
    
    # Update scheduler
    if schedule.is_active:
        reload_schedule(schedule.id)
    else:
        remove_schedule_job(schedule.id)
    
    analysis_type = db.query(AnalysisType).filter(
        AnalysisType.id == schedule.analysis_type_id
    ).first()
    
    return ScheduleResponse(
        id=schedule.id,
        analysis_type_id=schedule.analysis_type_id,
        analysis_type_name=analysis_type.display_name if analysis_type else f"Process {schedule.analysis_type_id}",
        schedule_type=schedule.schedule_type,
        schedule_config=schedule.schedule_config,
        is_active=schedule.is_active,
        last_run_at=schedule.last_run_at,
        next_run_at=schedule.next_run_at,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at
    )


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Delete a schedule."""
    schedule = db.query(Schedule).filter(
        Schedule.id == schedule_id,
        Schedule.organization_id == current_organization.id
    ).first()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    # Remove from scheduler
    remove_schedule_job(schedule.id)
    
    # Delete from database
    db.delete(schedule)
    db.commit()
    
    return None

