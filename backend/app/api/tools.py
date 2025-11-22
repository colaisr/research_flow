"""
Tools management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.models.user_tool import ToolType
from datetime import datetime, timezone
from app.core.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.user_tool import UserTool, ToolType
from app.models.organization_tool_access import OrganizationToolAccess
from app.core.auth import get_current_user_dependency
from app.core.auth import get_current_organization_dependency
from app.services.tools.encryption import encrypt_tool_config

router = APIRouter()


class CreateToolRequest(BaseModel):
    tool_type: str  # 'database', 'api', 'rag'
    display_name: str
    config: Dict[str, Any]
    is_shared: bool = True


class UpdateToolRequest(BaseModel):
    display_name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class ToolResponse(BaseModel):
    id: int
    user_id: int
    organization_id: Optional[int]
    tool_type: str
    display_name: str
    config: Dict[str, Any]
    is_active: bool
    is_shared: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class OrganizationToolAccessRequest(BaseModel):
    is_enabled: bool


class OrganizationToolAccessResponse(BaseModel):
    tool_id: int
    tool_name: str
    tool_type: str
    is_enabled: bool

    class Config:
        from_attributes = True


def check_tool_ownership(db: Session, user: User, tool_id: int) -> UserTool:
    """Check if user owns the tool."""
    tool = db.query(UserTool).filter(UserTool.id == tool_id).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tool not found"
        )
    if tool.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this tool"
        )
    return tool


def get_user_owned_organizations(db: Session, user_id: int) -> List[Organization]:
    """Get all organizations where user is owner."""
    return db.query(Organization).filter(Organization.owner_id == user_id).all()


def ensure_tool_access_entries(db: Session, tool: UserTool, user: User):
    """Ensure organization_tool_access entries exist for all orgs where user is owner."""
    if not tool.is_shared:
        return
    
    owned_orgs = get_user_owned_organizations(db, user.id)
    for org in owned_orgs:
        # Check if access entry already exists
        existing = db.query(OrganizationToolAccess).filter(
            OrganizationToolAccess.organization_id == org.id,
            OrganizationToolAccess.tool_id == tool.id
        ).first()
        
        if not existing:
            # Create access entry with is_enabled=True by default
            access = OrganizationToolAccess(
                organization_id=org.id,
                tool_id=tool.id,
                is_enabled=True
            )
            db.add(access)
    
    db.commit()


def get_available_tools_for_org(db: Session, user: User, organization_id: int) -> List[UserTool]:
    """Get all tools available in the given organization context."""
    # Get all tools owned by user
    user_tools = db.query(UserTool).filter(
        UserTool.user_id == user.id,
        UserTool.is_active == True
    ).all()
    
    # Check if user is owner of the organization
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        return []
    
    if organization.owner_id != user.id:
        # User is not owner, return empty list
        return []
    
    # Filter tools that are enabled for this organization
    available_tools = []
    for tool in user_tools:
        if not tool.is_shared:
            # Tool is not shared, skip it
            continue
        
        # Check organization_tool_access
        access = db.query(OrganizationToolAccess).filter(
            OrganizationToolAccess.organization_id == organization_id,
            OrganizationToolAccess.tool_id == tool.id
        ).first()
        
        # If no access entry exists, default to enabled (for backward compatibility)
        if access is None or access.is_enabled:
            available_tools.append(tool)
    
    return available_tools


@router.get("/tools", response_model=List[ToolResponse])
async def list_tools(
    tool_type: Optional[str] = Query(None, description="Filter by tool type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List tools available in current organization context."""
    tools = get_available_tools_for_org(db, current_user, current_organization.id)
    
    # Filter by tool_type if provided
    if tool_type:
        tools = [t for t in tools if t.tool_type == tool_type]
    
    return tools


@router.post("/tools", response_model=ToolResponse)
async def create_tool(
    request: CreateToolRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Create a new tool."""
    # Validate tool_type
    try:
        tool_type_enum = ToolType(request.tool_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid tool_type: {request.tool_type}. Must be one of: database, api, rag"
        )
    
    # Encrypt credentials in config before saving
    encrypted_config = encrypt_tool_config(request.config)
    
    # Create tool
    tool = UserTool(
        user_id=current_user.id,
        organization_id=current_organization.id,  # Home org reference
        tool_type=tool_type_enum.value,
        display_name=request.display_name,
        config=encrypted_config,
        is_active=True,
        is_shared=request.is_shared
    )
    
    db.add(tool)
    db.commit()
    db.refresh(tool)
    
    # Auto-create organization_tool_access entries for all owned orgs if is_shared=True
    if tool.is_shared:
        ensure_tool_access_entries(db, tool, current_user)
    
    return tool


@router.get("/tools/{tool_id}", response_model=ToolResponse)
async def get_tool(
    tool_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Get tool details."""
    # Check ownership
    tool = check_tool_ownership(db, current_user, tool_id)
    
    # Check if tool is available in current org
    available_tools = get_available_tools_for_org(db, current_user, current_organization.id)
    if tool not in available_tools:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tool is not available in this organization"
        )
    
    return tool


@router.put("/tools/{tool_id}", response_model=ToolResponse)
async def update_tool(
    tool_id: int,
    request: UpdateToolRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """Update tool."""
    tool = check_tool_ownership(db, current_user, tool_id)
    
    # Update fields
    if request.display_name is not None:
        tool.display_name = request.display_name
    if request.config is not None:
        # Encrypt credentials in config before saving
        tool.config = encrypt_tool_config(request.config)
    if request.is_active is not None:
        tool.is_active = request.is_active
    
    tool.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(tool)
    
    return tool


@router.delete("/tools/{tool_id}")
async def delete_tool(
    tool_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """Delete tool (not allowed for now - prevent breaking analyses)."""
    tool = check_tool_ownership(db, current_user, tool_id)
    
    # Check if tool is used in any analyses
    from app.models.analysis_step import AnalysisStep
    used_in_steps = db.query(AnalysisStep).filter(
        AnalysisStep.tool_id == tool_id
    ).first()
    
    if used_in_steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete tool: Tool is used in one or more analyses"
        )
    
    # Delete organization_tool_access entries
    db.query(OrganizationToolAccess).filter(
        OrganizationToolAccess.tool_id == tool_id
    ).delete()
    
    # Delete tool
    db.delete(tool)
    db.commit()
    
    return {"success": True, "message": "Tool deleted"}


@router.post("/tools/{tool_id}/test")
async def test_tool(
    tool_id: int,
    test_params: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """Test tool connection."""
    tool = check_tool_ownership(db, current_user, tool_id)
    
    # Check if tool is active
    if not tool.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot test inactive tool. Please activate the tool first."
        )
    
    from app.services.tools import ToolExecutor
    
    executor = ToolExecutor(db=db)
    
    try:
        # Prepare test parameters based on tool type
        if tool.tool_type == ToolType.API.value:
            # For API tools, use default test parameters
            params = test_params or {}
            if tool.config.get('connector_type') == 'predefined':
                connector_name = tool.config.get('connector_name', '').lower()
                if connector_name in ['binance', 'ccxt']:
                    params.setdefault('instrument', 'BTC/USDT')
                    params.setdefault('timeframe', 'H1')
                elif connector_name == 'yfinance':
                    params.setdefault('instrument', 'AAPL')
                    params.setdefault('timeframe', 'D1')
                elif connector_name == 'tinkoff':
                    params.setdefault('instrument', 'SBER')
                    params.setdefault('timeframe', 'D1')
            else:
                # Generic API - test with GET request
                params.setdefault('endpoint', '/')
                params.setdefault('method', 'GET')
        elif tool.tool_type == ToolType.DATABASE.value:
            # For database tools, use a simple SELECT query
            params = test_params or {}
            params.setdefault('query', 'SELECT 1 as test')
        else:
            params = test_params or {}
        
        result = executor.execute_tool(tool, params)
        
        return {
            "success": True,
            "message": "Tool test successful",
            "tool_type": tool.tool_type,
            "result": result
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Tool test failed: {str(e)}",
            "tool_type": tool.tool_type,
            "error": str(e)
        }


@router.get("/organizations/{org_id}/tools", response_model=List[OrganizationToolAccessResponse])
async def list_organization_tools(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """List all user's tools with access status for this organization."""
    # Check if user is owner of the organization
    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    if organization.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the owner of this organization"
        )
    
    # Get all user's tools (only active and shared)
    user_tools = db.query(UserTool).filter(
        UserTool.user_id == current_user.id,
        UserTool.is_shared == True,  # Only show shared tools
        UserTool.is_active == True  # Only show active tools
    ).all()
    
    # Build response with access status
    result = []
    for tool in user_tools:
        access = db.query(OrganizationToolAccess).filter(
            OrganizationToolAccess.organization_id == org_id,
            OrganizationToolAccess.tool_id == tool.id
        ).first()
        
        # Default to enabled if no access entry exists
        is_enabled = access.is_enabled if access else True
        
        result.append(OrganizationToolAccessResponse(
            tool_id=tool.id,
            tool_name=tool.display_name,
            tool_type=tool.tool_type,
            is_enabled=is_enabled
        ))
    
    return result


@router.put("/organizations/{org_id}/tools/{tool_id}/access")
async def update_organization_tool_access(
    org_id: int,
    tool_id: int,
    request: OrganizationToolAccessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency)
):
    """Enable/disable tool for organization."""
    # Check if user is owner of the organization
    organization = db.query(Organization).filter(Organization.id == org_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    if organization.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the owner of this organization"
        )
    
    # Check if user owns the tool
    tool = check_tool_ownership(db, current_user, tool_id)
    
    # Get or create access entry
    access = db.query(OrganizationToolAccess).filter(
        OrganizationToolAccess.organization_id == org_id,
        OrganizationToolAccess.tool_id == tool_id
    ).first()
    
    if not access:
        access = OrganizationToolAccess(
            organization_id=org_id,
            tool_id=tool_id,
            is_enabled=request.is_enabled
        )
        db.add(access)
    else:
        access.is_enabled = request.is_enabled
    
    db.commit()
    db.refresh(access)
    
    return {
        "success": True,
        "tool_id": tool_id,
        "organization_id": org_id,
        "is_enabled": access.is_enabled
    }

