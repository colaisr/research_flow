"""
API endpoints for analysis types.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Cookie
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from app.core.database import get_db
from app.models.analysis_type import AnalysisType
from app.core.auth import get_current_admin_user_dependency, get_current_user_dependency, verify_session, get_current_organization_dependency
from app.models.user import User
from app.models.organization import Organization

router = APIRouter()


class AnalysisTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    name: str
    display_name: str
    description: str | None
    version: str
    config: dict
    is_active: int
    user_id: int | None
    is_system: bool
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=List[AnalysisTypeResponse])
async def list_analysis_types(
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    system: Optional[bool] = Query(None, description="Filter by system pipelines (true) or user pipelines (false)"),
    researchflow_session: Optional[str] = Cookie(None),
    current_organization: Optional[Organization] = Depends(get_current_organization_dependency)
):
    """List analysis types with optional filtering.
    
    - Shows organization's pipelines + system pipelines (organization_id IS NULL)
    - Query params: user_id, system (true/false)
    """
    query = db.query(AnalysisType).filter(AnalysisType.is_active == 1)
    
    # Filter by organization context: show system pipelines (NULL org_id) + current org's pipelines
    if current_organization:
        query = query.filter(
            (AnalysisType.organization_id == current_organization.id) | (AnalysisType.organization_id.is_(None))
        )
    else:
        # Not authenticated - only show system pipelines
        query = query.filter(AnalysisType.organization_id.is_(None), AnalysisType.is_system == True)
    
    # Apply filters
    if user_id is not None:
        query = query.filter(AnalysisType.user_id == user_id)
    
    if system is not None:
        query = query.filter(AnalysisType.is_system == system)
    
    analysis_types = query.all()
    return analysis_types


@router.get("/my", response_model=List[AnalysisTypeResponse])
async def list_my_analysis_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List current user's own analysis types in current organization."""
    analysis_types = db.query(AnalysisType).filter(
        AnalysisType.user_id == current_user.id,
        AnalysisType.organization_id == current_organization.id,
        AnalysisType.is_active == 1
    ).all()
    return analysis_types


@router.get("/system", response_model=List[AnalysisTypeResponse])
async def list_system_analysis_types(db: Session = Depends(get_db)):
    """List system analysis types (available to all users)."""
    analysis_types = db.query(AnalysisType).filter(
        AnalysisType.is_system == True,
        AnalysisType.is_active == 1
    ).all()
    return analysis_types


@router.get("/{analysis_type_id}", response_model=AnalysisTypeResponse)
async def get_analysis_type(analysis_type_id: int, db: Session = Depends(get_db)):
    """Get analysis type details by ID."""
    analysis_type = db.query(AnalysisType).filter(AnalysisType.id == analysis_type_id).first()
    if not analysis_type:
        raise HTTPException(status_code=404, detail="Analysis type not found")
    return analysis_type


@router.get("/name/{name}", response_model=AnalysisTypeResponse)
async def get_analysis_type_by_name(name: str, db: Session = Depends(get_db)):
    """Get analysis type by name (e.g., 'daystart')."""
    analysis_type = db.query(AnalysisType).filter(AnalysisType.name == name).first()
    if not analysis_type:
        raise HTTPException(status_code=404, detail="Analysis type not found")
    return analysis_type


class CreateAnalysisTypeRequest(BaseModel):
    """Request model for creating a new analysis type."""
    name: str
    display_name: str
    description: Optional[str] = None
    version: str = "1.0.0"
    config: Dict[str, Any]
    is_active: int = 1


class UpdateAnalysisTypeConfigRequest(BaseModel):
    """Request model for updating analysis type configuration."""
    config: Dict[str, Any]


class UpdateAnalysisTypeRequest(BaseModel):
    """Request model for updating analysis type."""
    display_name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[int] = None


@router.post("", response_model=AnalysisTypeResponse)
async def create_analysis_type(
    request: CreateAnalysisTypeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Create a new analysis type (user pipeline) in current organization."""
    # Check if name already exists in this organization
    existing = db.query(AnalysisType).filter(
        AnalysisType.name == request.name,
        AnalysisType.organization_id == current_organization.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Analysis type with this name already exists in this organization")
    
    # Validate config structure
    if "steps" not in request.config:
        raise HTTPException(status_code=400, detail="Config must contain 'steps' array")
    
    # Create new analysis type
    analysis_type = AnalysisType(
        name=request.name,
        display_name=request.display_name,
        description=request.description,
        version=request.version,
        config=request.config,
        is_active=request.is_active,
        user_id=current_user.id,  # Set to current user
        is_system=False,  # User-created pipeline
        organization_id=current_organization.id  # Set to current organization
    )
    
    db.add(analysis_type)
    db.commit()
    db.refresh(analysis_type)
    
    return analysis_type


@router.put("/{analysis_type_id}", response_model=AnalysisTypeResponse)
async def update_analysis_type(
    analysis_type_id: int,
    request: UpdateAnalysisTypeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Update analysis type (user's own in current organization or admin for system pipelines)."""
    analysis_type = db.query(AnalysisType).filter(AnalysisType.id == analysis_type_id).first()
    if not analysis_type:
        raise HTTPException(status_code=404, detail="Analysis type not found")
    
    # Check organization context - can only edit pipelines in current organization
    if analysis_type.organization_id != current_organization.id and analysis_type.organization_id is not None:
        raise HTTPException(
            status_code=403,
            detail="You can only edit pipelines in your current organization context"
        )
    
    # Check permissions
    # User can edit their own pipelines in their organization
    # Admin can edit any pipeline
    # Non-admin cannot edit system pipelines
    if analysis_type.user_id != current_user.id:
        if analysis_type.is_system:
            if not current_user.is_platform_admin():
                raise HTTPException(
                    status_code=403,
                    detail="Only platform admins can edit system pipelines"
                )
        else:
            # User trying to edit another user's pipeline
            raise HTTPException(
                status_code=403,
                detail="You can only edit your own pipelines"
            )
    
    # Update fields
    if request.display_name is not None:
        analysis_type.display_name = request.display_name
    if request.description is not None:
        analysis_type.description = request.description
    if request.version is not None:
        analysis_type.version = request.version
    if request.config is not None:
        # Validate config structure
        if "steps" not in request.config:
            raise HTTPException(status_code=400, detail="Config must contain 'steps' array")
        analysis_type.config = request.config
    if request.is_active is not None:
        analysis_type.is_active = request.is_active
    
    db.commit()
    db.refresh(analysis_type)
    
    return analysis_type


@router.put("/{analysis_type_id}/config", response_model=AnalysisTypeResponse)
async def update_analysis_type_config(
    analysis_type_id: int,
    request: UpdateAnalysisTypeConfigRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """Update analysis type configuration (user's own or admin for system pipelines)."""
    analysis_type = db.query(AnalysisType).filter(AnalysisType.id == analysis_type_id).first()
    if not analysis_type:
        raise HTTPException(status_code=404, detail="Analysis type not found")
    
    # Check permissions (same as update_analysis_type)
    if analysis_type.user_id != current_user.id:
        if analysis_type.is_system:
            if not current_user.is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Only admins can edit system pipelines"
                )
        else:
            raise HTTPException(
                status_code=403,
                detail="You can only edit your own pipelines"
            )
    
    # Validate config structure
    if "steps" not in request.config:
        raise HTTPException(status_code=400, detail="Config must contain 'steps' array")
    
    # Update config
    analysis_type.config = request.config
    db.commit()
    db.refresh(analysis_type)
    
    return analysis_type


@router.delete("/{analysis_type_id}")
async def delete_analysis_type(
    analysis_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """Delete analysis type (user's own or admin for any pipeline)."""
    analysis_type = db.query(AnalysisType).filter(AnalysisType.id == analysis_type_id).first()
    if not analysis_type:
        raise HTTPException(status_code=404, detail="Analysis type not found")
    
    # Check permissions
    # User can delete their own pipelines
    # Admin can delete any pipeline
    # Non-admin cannot delete system pipelines
    if analysis_type.user_id != current_user.id:
        if analysis_type.is_system:
            if not current_user.is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Only admins can delete system pipelines"
                )
        else:
            raise HTTPException(
                status_code=403,
                detail="You can only delete your own pipelines"
            )
    
    # Soft delete by setting is_active = 0
    analysis_type.is_active = 0
    db.commit()
    
    return {"success": True, "message": "Analysis type deleted"}


@router.post("/{analysis_type_id}/duplicate", response_model=AnalysisTypeResponse)
async def duplicate_analysis_type(
    analysis_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """Duplicate an analysis type (creates a user copy)."""
    source_analysis = db.query(AnalysisType).filter(AnalysisType.id == analysis_type_id).first()
    if not source_analysis:
        raise HTTPException(status_code=404, detail="Analysis type not found")
    
    if not source_analysis.is_active:
        raise HTTPException(status_code=400, detail="Cannot duplicate inactive analysis type")
    
    # Create a copy with a new name
    import copy
    new_name = f"{source_analysis.name}_copy_{current_user.id}_{int(datetime.now().timestamp())}"
    
    # Check if name already exists
    existing = db.query(AnalysisType).filter(AnalysisType.name == new_name).first()
    if existing:
        # Add timestamp if name collision
        new_name = f"{new_name}_{int(datetime.now().timestamp())}"
    
    # Deep copy the config
    new_config = copy.deepcopy(source_analysis.config)
    
    # Create new analysis type
    new_analysis = AnalysisType(
        name=new_name,
        display_name=f"{source_analysis.display_name} (Copy)",
        description=source_analysis.description,
        version=source_analysis.version,
        config=new_config,
        is_active=1,
        user_id=current_user.id,  # Set to current user
        is_system=False  # User-created pipeline
    )
    
    db.add(new_analysis)
    db.commit()
    db.refresh(new_analysis)
    
    return new_analysis
