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
from app.models.organization_tool_access import OrganizationToolAccess

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
    
    - Shows organization's pipelines + system pipelines (is_system=True, visible to all)
    - System processes belong to platform admin but are visible to all users
    - Query params: user_id, system (true/false)
    """
    query = db.query(AnalysisType).filter(AnalysisType.is_active == 1)
    
    # Filter by organization context: show system pipelines (is_system=True) + current org's pipelines
    if current_organization:
        query = query.filter(
            (AnalysisType.organization_id == current_organization.id) | (AnalysisType.is_system == True)
        )
    else:
        # Not authenticated - only show system pipelines
        query = query.filter(AnalysisType.is_system == True)
    
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
    """List current user's own analysis types in current organization (excludes system processes)."""
    analysis_types = db.query(AnalysisType).filter(
        AnalysisType.user_id == current_user.id,
        AnalysisType.organization_id == current_organization.id,
        AnalysisType.is_system == False,  # Exclude system processes from "My processes"
        AnalysisType.is_active == 1
    ).all()
    return analysis_types


@router.get("/system", response_model=List[AnalysisTypeResponse])
async def list_system_analysis_types(
    db: Session = Depends(get_db),
    researchflow_session: Optional[str] = Cookie(None)
):
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
    is_system: Optional[bool] = False  # Only platform admins can set this to True


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
    is_system: Optional[bool] = None  # Only platform admins can change this


@router.post("", response_model=AnalysisTypeResponse)
async def create_analysis_type(
    request: CreateAnalysisTypeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Create a new analysis type (user pipeline or system process).
    
    - Regular users can only create user pipelines (is_system=False)
    - Platform admins can create system processes (is_system=True) which are visible to all users
    """
    # Validate: Only platform admins can create system processes
    is_system = request.is_system or False
    if is_system and not current_user.is_platform_admin():
        raise HTTPException(
            status_code=403,
            detail="Only platform admins can create system processes"
        )
    
    # Check if name already exists
    # For system processes, check globally; for user processes, check in organization
    if is_system:
        existing = db.query(AnalysisType).filter(
            AnalysisType.name == request.name,
            AnalysisType.is_system == True
        ).first()
    else:
        existing = db.query(AnalysisType).filter(
            AnalysisType.name == request.name,
            AnalysisType.organization_id == current_organization.id
        ).first()
    
    if existing:
        if is_system:
            raise HTTPException(status_code=400, detail="System process with this name already exists")
        else:
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
        user_id=current_user.id,  # Set to current user (admin for system processes)
        is_system=is_system,
        organization_id=current_organization.id  # Set to current organization (admin's org for system processes)
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
    
    # Check permissions
    # System processes: only platform admin can edit (regardless of organization)
    if analysis_type.is_system:
        if not current_user.is_platform_admin():
            raise HTTPException(
                status_code=403,
                detail="Only platform admins can edit system pipelines"
            )
    else:
        # User processes: check ownership and organization context
        if analysis_type.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only edit your own pipelines"
            )
        
        # Check organization context - can only edit pipelines in current organization
        if analysis_type.organization_id != current_organization.id:
            raise HTTPException(
                status_code=403,
                detail="You can only edit pipelines in your current organization context"
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
    
    # Update is_system flag (only platform admins can change this)
    if request.is_system is not None:
        if not current_user.is_platform_admin():
            raise HTTPException(
                status_code=403,
                detail="Only platform admins can change system process flag"
            )
        
        # If converting to system process, check for name conflicts globally
        if request.is_system and not analysis_type.is_system:
            existing_system = db.query(AnalysisType).filter(
                AnalysisType.name == analysis_type.name,
                AnalysisType.is_system == True,
                AnalysisType.id != analysis_type.id
            ).first()
            if existing_system:
                raise HTTPException(
                    status_code=400,
                    detail="A system process with this name already exists"
                )
        
        analysis_type.is_system = request.is_system
    
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
            if not current_user.is_platform_admin():
                raise HTTPException(
                    status_code=403,
                    detail="Only platform admins can edit system pipelines"
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
    # Platform admin can delete any pipeline (including system pipelines)
    # Non-admin cannot delete system pipelines
    if analysis_type.user_id != current_user.id:
        if analysis_type.is_system:
            if not current_user.is_platform_admin():
                raise HTTPException(
                    status_code=403,
                    detail="Only platform admins can delete system pipelines"
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
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Duplicate an analysis type (creates a user copy).
    
    Handles tool references by copying tools from source process owner (typically platform admin).
    If source process uses tools, they are automatically copied to the user.
    
    Strategy:
    1. System processes belong to platform admin user
    2. Tools in system processes belong to admin
    3. When duplicating, admin's tools are copied to user
    4. Tool references are updated to point to user's copied tools
    """
    from app.models.user_tool import UserTool
    from app.models.organization_tool_access import OrganizationToolAccess
    import copy
    
    def get_user_owned_organizations(db: Session, user_id: int):
        """Get all organizations where user is owner."""
        return db.query(Organization).filter(Organization.owner_id == user_id).all()
    
    def ensure_tool_access_entries(db: Session, tool: UserTool, user: User):
        """Ensure organization_tool_access entries exist for all orgs where user is owner."""
        if not tool.is_shared:
            return
        
        owned_orgs = get_user_owned_organizations(db, user.id)
        for org in owned_orgs:
            existing = db.query(OrganizationToolAccess).filter(
                OrganizationToolAccess.organization_id == org.id,
                OrganizationToolAccess.tool_id == tool.id
            ).first()
            if not existing:
                access = OrganizationToolAccess(
                    organization_id=org.id,
                    tool_id=tool.id,
                    is_enabled=True
                )
                db.add(access)
    
    source_analysis = db.query(AnalysisType).filter(AnalysisType.id == analysis_type_id).first()
    if not source_analysis:
        raise HTTPException(status_code=404, detail="Analysis type not found")
    
    if not source_analysis.is_active:
        raise HTTPException(status_code=400, detail="Cannot duplicate inactive analysis type")
    
    # Create a copy with a new name
    new_name = f"{source_analysis.name}_copy_{current_user.id}_{int(datetime.now().timestamp())}"
    
    # Check if name already exists
    existing = db.query(AnalysisType).filter(AnalysisType.name == new_name).first()
    if existing:
        # Add timestamp if name collision
        new_name = f"{new_name}_{int(datetime.now().timestamp())}"
    
    # Deep copy the config
    new_config = copy.deepcopy(source_analysis.config)
    
    # Process tool references: copy tools from source process owner to current user
    tool_id_mapping = {}  # Maps source_tool_id -> user_tool_id
    tools_created = []  # Track newly created tools for user notification
    
    # Get source process owner (typically platform admin for system processes)
    source_owner_id = source_analysis.user_id
    if not source_owner_id:
        # Legacy: if user_id is None, skip tool copying (old system processes)
        pass
    else:
        # Collect all tool IDs from step configs
        for step in new_config.get('steps', []):
            tool_references = step.get('tool_references', [])
            for tool_ref in tool_references:
                source_tool_id = tool_ref.get('tool_id')
                if source_tool_id and source_tool_id not in tool_id_mapping:
                    # Load source tool (belongs to source process owner, typically admin)
                    source_tool = db.query(UserTool).filter(
                        UserTool.id == source_tool_id,
                        UserTool.user_id == source_owner_id  # Ensure tool belongs to source owner
                    ).first()
                    
                    if not source_tool:
                        # Tool doesn't exist or doesn't belong to source owner - skip
                        continue
                    
                    # Check if user already has a tool with same display_name and tool_type
                    user_tool = db.query(UserTool).filter(
                        UserTool.user_id == current_user.id,
                        UserTool.display_name == source_tool.display_name,
                        UserTool.tool_type == source_tool.tool_type,
                        UserTool.is_active == True
                    ).first()
                    
                    if user_tool:
                        # User already has this tool - use it
                        tool_id_mapping[source_tool_id] = user_tool.id
                    else:
                        # Copy tool from source owner (admin) to user
                        # Note: Config is copied as-is (credentials are encrypted, may need re-entry)
                        new_tool = UserTool(
                            user_id=current_user.id,
                            organization_id=current_organization.id,
                            tool_type=source_tool.tool_type,
                            display_name=source_tool.display_name,
                            config=copy.deepcopy(source_tool.config),
                            is_active=True,
                            is_shared=source_tool.is_shared
                        )
                        db.add(new_tool)
                        db.flush()  # Get the new tool ID
                        
                        # Ensure tool access entries for all user's organizations
                        ensure_tool_access_entries(db, new_tool, current_user)
                        
                        tool_id_mapping[source_tool_id] = new_tool.id
                        tools_created.append(new_tool.display_name)
        
        # Update tool_references with new tool IDs
        for step in new_config.get('steps', []):
            tool_references = step.get('tool_references', [])
            for tool_ref in tool_references:
                source_tool_id = tool_ref.get('tool_id')
                if source_tool_id in tool_id_mapping:
                    tool_ref['tool_id'] = tool_id_mapping[source_tool_id]
                elif source_tool_id:
                    # Tool not found and couldn't be created - keep reference but it will show error when executed
                    # User can manually fix it in the editor by selecting a different tool
                    pass
    
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
