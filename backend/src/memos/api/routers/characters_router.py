"""
角色管理API路由
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.models.characters import Character
from memos.api.models.work import Work
from memos.api.services.work_service import WorkService

router = APIRouter(prefix="/api/v1/characters", tags=["角色管理"])


@router.get("/", response_model=Dict[str, Any])
async def list_characters(
    work_id: int = Query(..., description="作品ID"),
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品的角色列表
    """
    work_service = WorkService(db)
    
    # 检查作品是否存在和访问权限
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )
    
    # 检查访问权限
    if not await work_service.can_access_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )
    
    # 查询该作品的所有角色
    stmt = select(Character).where(
        Character.work_id == work_id,
        Character.is_active == True
    ).order_by(
        Character.is_main_character.desc(),
        Character.name.asc()
    )
    
    result = await db.execute(stmt)
    characters = result.scalars().all()
    
    return {
        "characters": [char.to_dict() for char in characters],
        "total": len(characters)
    }


@router.get("/{character_id}", response_model=Dict[str, Any])
async def get_character(
    character_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取角色详情
    """
    work_service = WorkService(db)
    
    # 查询角色
    stmt = select(Character).where(Character.id == character_id)
    result = await db.execute(stmt)
    character = result.scalar_one_or_none()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    
    # 检查访问权限
    if not await work_service.can_access_work(
        user_id=current_user_id,
        work_id=character.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )
    
    return character.to_dict()

