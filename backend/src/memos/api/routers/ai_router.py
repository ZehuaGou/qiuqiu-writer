"""
AI接口路由
提供章节分析、健康检查和默认提示词接口
"""

import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from memos.api.ai_models import (
    AnalyzeChapterRequest,
    DefaultPromptData,
    DefaultPromptResponse,
    ErrorResponse,
    HealthCheckData,
    HealthCheckResponse,
)
from memos.api.services.ai_service import get_ai_service
from memos.log import get_logger


logger = get_logger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Analysis"])


@router.post(
    "/analyze-chapter",
    summary="章节分析接口",
    description="对小说章节内容进行AI分析，返回结构化的章节分析结果（流式响应）",
    responses={
        200: {"description": "分析成功，返回流式响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        429: {"model": ErrorResponse, "description": "请求过于频繁"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_chapter(request: AnalyzeChapterRequest):
    """
    对章节内容进行AI分析

    Args:
        request: 章节分析请求

    Returns:
        StreamingResponse: 服务器发送事件流
    """
    try:
        # 验证请求参数
        if not request.content or len(request.content.strip()) == 0:
            raise HTTPException(status_code=400, detail="章节内容不能为空")

        # 获取AI服务
        ai_service = get_ai_service()

        # 检查服务状态
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

        # 获取分析设置
        settings = request.settings or AnalyzeChapterRequest.model_fields["settings"].default_factory()

        logger.info(
            f"Received chapter analysis request: "
            f"content_length={len(request.content)}, "
            f"model={settings.model}, "
            f"temperature={settings.temperature}, "
            f"max_tokens={settings.max_tokens}"
        )

        # 执行流式分析
        async def generate_analysis():
            """生成分析响应"""
            try:
                async for message in ai_service.analyze_chapter_stream(
                    content=request.content,
                    prompt=request.prompt,
                    model=settings.model,
                    temperature=settings.temperature,
                    max_tokens=settings.max_tokens,
                ):
                    yield message
            except Exception as e:
                logger.error(f"Error in analysis stream: {traceback.format_exc()}")
                import json
                error_data = json.dumps({"type": "error", "message": str(e)})
                yield f"data: {error_data}\n\n"

        return StreamingResponse(
            generate_analysis(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # 禁用nginx缓冲
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze chapter: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.get(
    "/health",
    summary="健康检查接口",
    description="检查AI服务是否可用",
    response_model=HealthCheckResponse,
    responses={
        200: {"model": HealthCheckResponse, "description": "服务正常"},
        500: {"model": ErrorResponse, "description": "服务异常"},
    },
)
async def health_check():
    """
    健康检查

    Returns:
        HealthCheckResponse: 服务状态信息
    """
    try:
        ai_service = get_ai_service()

        # 获取当前时间（ISO 8601格式）
        current_time = datetime.now(timezone.utc).isoformat()

        # 检查服务状态
        is_healthy = ai_service.is_healthy()
        status = "healthy" if is_healthy else "unhealthy"

        # 获取可用模型列表
        available_models = ai_service.get_available_models()

        health_data = HealthCheckData(
            status=status, models=available_models, timestamp=current_time
        )

        logger.info(f"Health check: status={status}, models={len(available_models)}")

        return HealthCheckResponse(
            code=200,
            message="服务正常" if is_healthy else "服务不可用",
            data=health_data,
        )

    except Exception as e:
        logger.error(f"Health check failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"健康检查失败: {str(e)}")


@router.get(
    "/default-prompt",
    summary="获取默认提示词接口",
    description="获取默认的章节分析提示词模板",
    response_model=DefaultPromptResponse,
    responses={
        200: {"model": DefaultPromptResponse, "description": "成功获取默认提示词"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
    },
)
async def get_default_prompt():
    """
    获取默认提示词

    Returns:
        DefaultPromptResponse: 默认提示词信息
    """
    try:
        ai_service = get_ai_service()
        default_prompt = ai_service.get_default_prompt()

        prompt_data = DefaultPromptData(
            prompt=default_prompt,
            version="1.0",
        )

        logger.info("Retrieved default prompt")

        return DefaultPromptResponse(
            code=200,
            message="成功",
            data=prompt_data,
        )

    except Exception as e:
        logger.error(f"Failed to get default prompt: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"获取默认提示词失败: {str(e)}")

