"""
作品管理API路由
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_

from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.services.work_service import WorkService
from memos.api.schemas.work import (
    WorkCreate, WorkUpdate, WorkResponse, WorkListResponse,
    WorkCollaboratorCreate, WorkCollaboratorUpdate, WorkCollaboratorResponse
)
from memos.api.models.work import Work, WorkCollaborator

router = APIRouter(prefix="/api/v1/works", tags=["作品管理"])


@router.post("/", response_model=WorkResponse)
async def create_work(
    work_data: WorkCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建新作品
    """
    work_service = WorkService(db)

    work = await work_service.create_work(
        owner_id=current_user_id,
        **work_data.dict()
    )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="create",
        target_type="work",
        target_id=work.id,
        details={"title": work.title, "work_type": work.work_type},
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return work.to_dict()


@router.get("/", response_model=WorkListResponse)
async def list_works(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    status: Optional[str] = Query(None, description="作品状态"),
    category: Optional[str] = Query(None, description="作品分类"),
    genre: Optional[str] = Query(None, description="作品流派"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    include_collaborators: bool = Query(False, description="是否包含协作者信息"),
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品列表
    """
    work_service = WorkService(db)

    filters = {}
    if work_type:
        filters["work_type"] = work_type
    if status:
        filters["status"] = status
    if category:
        filters["category"] = category
    if genre:
        filters["genre"] = genre
    if search:
        filters["search"] = search

    works, total = await work_service.get_user_works(
        user_id=current_user_id,
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    return {
        "works": [
            work.to_dict(include_collaborators=include_collaborators)
            for work in works
        ],
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size
    }


@router.get("/public", response_model=WorkListResponse)
async def get_public_works(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    category: Optional[str] = Query(None, description="作品分类"),
    genre: Optional[str] = Query(None, description="作品流派"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    db: AsyncSession = Depends(get_async_db)
) -> Dict[str, Any]:
    """
    获取公开作品列表
    """
    work_service = WorkService(db)

    filters = {"is_public": True}
    if work_type:
        filters["work_type"] = work_type
    if category:
        filters["category"] = category
    if genre:
        filters["genre"] = genre
    if search:
        filters["search"] = search

    works, total = await work_service.get_public_works(
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    return {
        "works": [work.to_dict() for work in works],
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size
    }


@router.get("/{work_id}", response_model=WorkResponse)
async def get_work(
    work_id: int,
    include_collaborators: bool = Query(False, description="是否包含协作者信息"),
    include_chapters: bool = Query(False, description="是否包含章节信息"),
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品详情
    """
    work_service = WorkService(db)

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

    return work.to_dict(
        include_collaborators=include_collaborators,
        include_chapters=include_chapters
    )


@router.put("/{work_id}", response_model=WorkResponse)
async def update_work(
    work_id: int,
    work_update: WorkUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新作品信息
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 更新作品
    updated_work = await work_service.update_work(
        work_id=work_id,
        **work_update.dict(exclude_unset=True)
    )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="update",
        target_type="work",
        target_id=work_id,
        details=work_update.dict(exclude_unset=True),
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return updated_work.to_dict()


@router.delete("/{work_id}")
async def delete_work(
    work_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    删除作品
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查删除权限（只有所有者可以删除）
    if work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有作品所有者可以删除作品"
        )

    # 删除作品
    await work_service.delete_work(work_id)

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="delete",
        target_type="work",
        target_id=work_id,
        details={"title": work.title},
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return {"message": "作品删除成功"}


@router.post("/{work_id}/publish")
async def publish_work(
    work_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    发布作品
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有发布该作品的权限"
        )

    # 发布作品
    published_work = await work_service.publish_work(work_id)

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="publish",
        target_type="work",
        target_id=work_id,
        details={"title": work.title},
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return published_work.to_dict()


@router.post("/{work_id}/archive")
async def archive_work(
    work_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    归档作品
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有归档该作品的权限"
        )

    # 归档作品
    archived_work = await work_service.archive_work(work_id)

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="archive",
        target_type="work",
        target_id=work_id,
        details={"title": work.title},
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return archived_work.to_dict()


# 协作者管理
@router.get("/{work_id}/collaborators", response_model=List[WorkCollaboratorResponse])
async def get_work_collaborators(
    work_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> List[Dict[str, Any]]:
    """
    获取作品协作者列表
    """
    work_service = WorkService(db)

    # 检查访问权限
    if not await work_service.can_access_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )

    collaborators = await work_service.get_work_collaborators(work_id)
    return [collaborator.to_dict() for collaborator in collaborators]


@router.post("/{work_id}/collaborators", response_model=WorkCollaboratorResponse)
async def add_collaborator(
    work_id: int,
    collaborator_data: WorkCollaboratorCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    添加协作者
    """
    work_service = WorkService(db)

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有添加协作者的权限"
        )

    # 检查目标用户是否存在
    target_user = await work_service.get_user_by_username_or_email(
        collaborator_data.username_or_email
    )
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 添加协作者
    collaborator = await work_service.add_collaborator(
        work_id=work_id,
        user_id=target_user.id,
        permission=collaborator_data.permission,
        role=collaborator_data.role,
        invited_by=current_user_id
    )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="add_collaborator",
        target_type="work",
        target_id=work_id,
        details={
            "collaborator_user_id": target_user.id,
            "permission": collaborator_data.permission
        },
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return collaborator.to_dict()


@router.put("/{work_id}/collaborators/{user_id}", response_model=WorkCollaboratorResponse)
async def update_collaborator(
    work_id: int,
    user_id: int,
    collaborator_update: WorkCollaboratorUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新协作者权限
    """
    work_service = WorkService(db)

    # 检查是否为所有者
    work = await work_service.get_work_by_id(work_id)
    if not work or work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有作品所有者可以修改协作者权限"
        )

    # 更新协作者
    collaborator = await work_service.update_collaborator(
        work_id=work_id,
        user_id=user_id,
        **collaborator_update.dict(exclude_unset=True)
    )

    if not collaborator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="协作者不存在"
        )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="update_collaborator",
        target_type="work",
        target_id=work_id,
        details={
            "collaborator_user_id": user_id,
            **collaborator_update.dict(exclude_unset=True)
        },
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return collaborator.to_dict()


@router.delete("/{work_id}/collaborators/{user_id}")
async def remove_collaborator(
    work_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    移除协作者
    """
    work_service = WorkService(db)

    # 检查是否为所有者
    work = await work_service.get_work_by_id(work_id)
    if not work or work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有作品所有者可以移除协作者"
        )

    # 移除协作者
    success = await work_service.remove_collaborator(work_id=work_id, user_id=user_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="协作者不存在"
        )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="remove_collaborator",
        target_type="work",
        target_id=work_id,
        details={"collaborator_user_id": user_id},
        ip_address=get_client_ip(Request),
        user_agent=get_user_agent(Request)
    )

    return {"message": "协作者移除成功"}


# 工具函数
def get_client_ip(request: Request) -> Optional[str]:
    """获取客户端IP地址"""
    return request.client.host if request.client else None


def get_user_agent(request: Request) -> Optional[str]:
    """获取用户代理"""
    return request.headers.get("user-agent")