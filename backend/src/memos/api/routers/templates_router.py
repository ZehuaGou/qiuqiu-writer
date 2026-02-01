"""
作品信息模板管理API路由
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_

from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.services.template_service import TemplateService
from memos.api.models.template import WorkTemplate, TemplateField, WorkInfoExtended

# 辅助函数：确保返回的是 AsyncSession 对象，而不是生成器
async def get_db_session(db: AsyncSession = Depends(get_async_db)) -> AsyncSession:
    """
    确保返回的是 AsyncSession 对象，而不是生成器
    FastAPI 的 Depends 应该已经处理了生成器，但为了安全起见，我们再次检查
    """
    # FastAPI 的 Depends 应该已经处理了生成器，直接返回
    # 但如果仍然是生成器，尝试获取会话对象
    if hasattr(db, '__aiter__') and not hasattr(db, 'execute'):
        # 如果是生成器，尝试获取会话对象
        try:
            db = await db.__anext__()
        except StopAsyncIteration:
            raise ValueError("无法从生成器获取数据库会话")
    
    return db

# Temporary schemas - will be replaced with proper schema files
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class WorkTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    work_type: str
    category: Optional[str] = None
    template_config: Optional[Dict[str, Any]] = None  # 模板配置，包含 modules（组件配置，包括 dataKey 和 dataDependencies）
    settings: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = False
    tags: Optional[List[str]] = None
    source_template_id: Optional[int] = None  # 另存为时传入被另存的模板 id，后端会同步复制其 prompt

class WorkTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    template_config: Optional[Dict[str, Any]] = None  # 模板配置，包含 modules（组件配置，包括 dataKey 和 dataDependencies）
    settings: Optional[Dict[str, Any]] = None
    category: Optional[str] = None
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None

class WorkTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    work_type: str
    is_system: Optional[bool] = False
    is_public: Optional[bool] = False
    creator_id: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    template_config: Optional[Dict[str, Any]] = None  # 模板配置，包含 modules（组件配置，包括 dataKey 和 dataDependencies）
    settings: Optional[Dict[str, Any]] = None
    usage_count: Optional[int] = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class TemplateFieldCreate(BaseModel):
    field_name: str
    field_type: str
    field_label: str

class TemplateFieldUpdate(BaseModel):
    field_label: Optional[str] = None

class TemplateFieldResponse(BaseModel):
    id: int
    field_name: str
    field_type: str
    field_label: str

class WorkInfoExtendedCreate(BaseModel):
    template_id: int
    field_values: Dict[str, Any]

class WorkInfoExtendedUpdate(BaseModel):
    field_values: Optional[Dict[str, Any]] = None

class WorkInfoExtendedResponse(BaseModel):
    id: int
    work_id: str
    template_id: int
    field_values: Dict[str, Any]

router = APIRouter(prefix="/api/v1/templates", tags=["作品模板管理"])


# 作品模板管理
@router.post("/", response_model=WorkTemplateResponse)
async def create_template(
    template_data: WorkTemplateCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建作品模板
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # 验证 template_config 中是否包含 dataKey 和 dataDependencies
    if template_data.template_config and "modules" in template_data.template_config:
        modules = template_data.template_config["modules"]
        logger.info(f"📥 创建模板: {template_data.name}, 包含 {len(modules)} 个模块")
        
        def validate_modules(components, path=""):
            for comp in components:
                current_path = f"{path} > {comp.get('label', comp.get('id', 'unknown'))}"
                if comp.get("dataKey"):
                    data_key = comp.get("dataKey")
                    data_deps = comp.get("dataDependencies", [])
                    logger.info(f"✅ 组件 {current_path}: dataKey='{data_key}', dataDependencies={data_deps}")
                # 递归检查 tabs 中的组件
                if comp.get("type") == "tabs" and comp.get("config", {}).get("tabs"):
                    for tab in comp["config"]["tabs"]:
                        if tab.get("components"):
                            validate_modules(tab["components"], f"{current_path} > {tab.get('label', tab.get('id', 'unknown'))}")
        
        for module in modules:
            module_name = module.get("name", module.get("id", "unknown"))
            logger.info(f"📦 模块: {module_name}")
            if "components" in module:
                validate_modules(module["components"], module_name)
    
    template_service = TemplateService(db)

    create_kwargs = template_data.dict()
    source_template_id = create_kwargs.pop("source_template_id", None)

    template = await template_service.create_template(
        creator_id=current_user_id,
        **create_kwargs
    )
    
    # 另存为：同步复制源模板关联的 prompt 到新模板
    if source_template_id is not None:
        try:
            await template_service.copy_prompts_from_template_to_template(
                source_template_id=source_template_id,
                new_template_id=template.id,
                creator_id=current_user_id,
            )
            logger.info(
                "另存为时已复制 prompt: source_template_id=%s, new_template_id=%s",
                source_template_id,
                template.id,
            )
        except Exception as e:
            logger.warning("另存为时复制 prompt 失败（不影响模板创建）: %s", e)
    
    # 验证保存后的数据
    if template.template_config and "modules" in template.template_config:
        logger.info(f"✅ 模板已保存，ID: {template.id}, template_config 包含 {len(template.template_config.get('modules', []))} 个模块")

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="create_template",
        target_type="template",
        target_id=template.id,
        details={"name": template.name, "work_type": template.work_type},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return template.to_dict(include_fields=True)


@router.get("/", response_model=List[WorkTemplateResponse])
async def list_templates(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    category: Optional[str] = Query(None, description="模板分类"),
    is_public: Optional[bool] = Query(None, description="是否公开"),
    is_system: Optional[bool] = Query(None, description="是否系统模板"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    include_fields: bool = Query(False, description="是否包含字段信息"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> List[Dict[str, Any]]:
    """
    获取模板列表
    """
    template_service = TemplateService(db)

    filters = {}
    if work_type:
        filters["work_type"] = work_type
    if category:
        filters["category"] = category
    if is_public is not None:
        filters["is_public"] = is_public
    if is_system is not None:
        filters["is_system"] = is_system
    if search:
        filters["search"] = search

    templates, total = await template_service.get_templates(
        user_id=current_user_id,
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    return [
        template.to_dict(include_fields=include_fields, include_stats=True)
        for template in templates
    ]


@router.get("/ensure-default-novel", response_model=WorkTemplateResponse)
async def ensure_default_novel_template(
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    确保当前用户有默认小说模板：有则返回，没有则用系统小说标准模板创建一份并返回。
    """
    template_service = TemplateService(db)
    try:
        template = await template_service.ensure_user_default_novel_template(current_user_id)
        return template.to_dict(include_fields=True, include_stats=True)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )


@router.get("/public", response_model=List[WorkTemplateResponse])
async def get_public_templates(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    category: Optional[str] = Query(None, description="模板分类"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("usage_count", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    include_fields: bool = Query(False, description="是否包含字段信息"),
    db: AsyncSession = Depends(get_db_session)
) -> List[Dict[str, Any]]:
    """
    获取公开模板列表
    """
    template_service = TemplateService(db)

    filters = {"is_public": True}
    if work_type:
        filters["work_type"] = work_type
    if category:
        filters["category"] = category
    if search:
        filters["search"] = search

    templates = await template_service.get_public_templates(
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    return [
        template.to_dict(include_fields=include_fields, include_stats=True)
        for template in templates
    ]


@router.get("/{template_id}", response_model=WorkTemplateResponse)
async def get_template(
    template_id: int,
    include_fields: bool = Query(True, description="是否包含字段信息"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取模板详情
    """
    template_service = TemplateService(db)

    template = await template_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在"
        )

    # 检查访问权限
    if not await template_service.can_access_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该模板的权限"
        )

    return template.to_dict(include_fields=include_fields, include_stats=True)


@router.put("/{template_id}", response_model=WorkTemplateResponse)
async def update_template(
    template_id: int,
    template_update: WorkTemplateUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新模板信息
    """
    template_service = TemplateService(db)

    # 检查模板是否存在
    template = await template_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在"
        )

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 更新模板
    updated_template = await template_service.update_template(
        template_id=template_id,
        **template_update.dict(exclude_unset=True)
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="update_template",
        target_type="template",
        target_id=template_id,
        details=template_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return updated_template.to_dict(include_fields=True)


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    删除模板
    """
    template_service = TemplateService(db)

    # 检查模板是否存在
    template = await template_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在"
        )

    # 检查删除权限
    if template.creator_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有模板创建者可以删除模板"
        )

    # 删除模板
    await template_service.delete_template(template_id)

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="delete_template",
        target_type="template",
        target_id=template_id,
        details={"name": template.name},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {"message": "模板删除成功"}


# 模板字段管理
@router.post("/{template_id}/fields", response_model=TemplateFieldResponse)
async def add_template_field(
    template_id: int,
    field_data: TemplateFieldCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    添加模板字段
    """
    template_service = TemplateService(db)

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 添加字段
    field = await template_service.add_template_field(
        template_id=template_id,
        **field_data.dict()
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="add_template_field",
        target_type="template_field",
        target_id=field.id,
        details={
            "template_id": template_id,
            "field_name": field.field_name,
            "field_type": field.field_type
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return field.to_dict()


@router.put("/{template_id}/fields/{field_id}", response_model=TemplateFieldResponse)
async def update_template_field(
    template_id: int,
    field_id: int,
    field_update: TemplateFieldUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新模板字段
    """
    template_service = TemplateService(db)

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 更新字段
    field = await template_service.update_template_field(
        field_id=field_id,
        **field_update.dict(exclude_unset=True)
    )

    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="字段不存在"
        )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="update_template_field",
        target_type="template_field",
        target_id=field_id,
        details=field_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return field.to_dict()


@router.delete("/{template_id}/fields/{field_id}")
async def delete_template_field(
    template_id: int,
    field_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    删除模板字段
    """
    template_service = TemplateService(db)

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 删除字段
    success = await template_service.delete_template_field(field_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="字段不存在"
        )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="delete_template_field",
        target_type="template_field",
        target_id=field_id,
        details={"template_id": template_id},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {"message": "字段删除成功"}


# 作品信息扩展管理
@router.post("/works/{work_id}/extended", response_model=WorkInfoExtendedResponse)
async def create_work_extended_info(
    work_id: int,
    extended_data: WorkInfoExtendedCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建作品扩展信息
    """
    template_service = TemplateService(db)

    # 检查作品编辑权限
    if not await template_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 创建扩展信息
    extended_info = await template_service.create_work_extended_info(
        work_id=work_id,
        **extended_data.dict()
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="create_work_extended_info",
        target_type="work_extended_info",
        target_id=extended_info.id,
        details={
            "work_id": work_id,
            "template_id": extended_data.template_id
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return extended_info.to_dict(include_template_info=True)


@router.get("/works/{work_id}/extended", response_model=WorkInfoExtendedResponse)
async def get_work_extended_info(
    work_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品扩展信息
    """
    template_service = TemplateService(db)

    # 检查作品访问权限
    if not await template_service.can_access_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )

    extended_info = await template_service.get_work_extended_info(work_id)
    if not extended_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品扩展信息不存在"
        )

    return extended_info.to_dict(include_template_info=True)


@router.put("/works/{work_id}/extended", response_model=WorkInfoExtendedResponse)
async def update_work_extended_info(
    work_id: int,
    extended_update: WorkInfoExtendedUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新作品扩展信息
    """
    template_service = TemplateService(db)

    # 检查作品编辑权限
    if not await template_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 更新扩展信息
    extended_info = await template_service.update_work_extended_info(
        work_id=work_id,
        **extended_update.dict(exclude_unset=True)
    )

    if not extended_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品扩展信息不存在"
        )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="update_work_extended_info",
        target_type="work_extended_info",
        target_id=extended_info.id,
        details=extended_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return extended_info.to_dict(include_template_info=True)


@router.post("/works/{work_id}/apply-template/{template_id}")
async def apply_template_to_work(
    work_id: int,
    template_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    将模板应用到作品
    """
    template_service = TemplateService(db)

    # 检查作品编辑权限
    if not await template_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 应用模板
    extended_info = await template_service.apply_template_to_work(
        work_id=work_id,
        template_id=template_id
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="apply_template_to_work",
        target_type="work",
        target_id=work_id,
        details={"template_id": template_id},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {
        "message": "模板应用成功",
        "extended_info": extended_info.to_dict(include_template_info=True)
    }


# 工具函数
def get_client_ip(request: Request) -> Optional[str]:
    """获取客户端IP地址"""
    # 优先从 X-Forwarded-For 头获取（如果使用代理）
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    # 从 X-Real-IP 头获取
    if "x-real-ip" in request.headers:
        return request.headers["x-real-ip"]
    # 最后尝试从 request.client 获取
    if request.client:
        return getattr(request.client, "host", None)
    return None


def get_user_agent(request: Request) -> Optional[str]:
    """获取用户代理"""
    return request.headers.get("user-agent")