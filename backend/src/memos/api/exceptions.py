import logging

from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.requests import Request
from fastapi.responses import JSONResponse


logger = logging.getLogger(__name__)


class APIExceptionHandler:
    """Centralized exception handling for MemOS APIs."""

    @staticmethod
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        """Handle request validation errors."""
        errors = exc.errors()
        logger.error(f"Validation error: {errors}")
        
        # 提取第一个错误消息作为主要消息，方便前端显示
        error_msg = "Parameter validation error"
        if errors:
            first_error = errors[0]
            # 如果是自定义的 ValueError，通常消息在 msg 中
            msg = first_error.get("msg", "")
            if msg.startswith("Value error, "):
                error_msg = msg.replace("Value error, ", "")
            else:
                error_msg = msg or error_msg

        # 确保所有错误都可以被 JSON 序列化
        serializable_errors = []
        for error in errors:
            serializable_error = {
                "loc": list(error.get("loc", [])),
                "msg": str(error.get("msg", "")),
                "type": str(error.get("type", "")),
            }
            if "ctx" in error:
                serializable_error["ctx"] = {k: str(v) for k, v in error["ctx"].items()}
            serializable_errors.append(serializable_error)
            
        return JSONResponse(
            status_code=422,
            content={
                "code": 422,
                "message": error_msg,
                "detail": error_msg,  # 这里的 detail 设为字符串，兼容前端 fetch 报错逻辑
                "errors": serializable_errors,  # 原始错误列表放在新字段中
                "data": None,
            },
        )

    @staticmethod
    async def value_error_handler(request: Request, exc: ValueError):
        """Handle ValueError exceptions globally."""
        logger.error(f"ValueError: {exc}")
        return JSONResponse(
            status_code=400,
            content={"code": 400, "message": str(exc), "data": None},
        )

    @staticmethod
    async def global_exception_handler(request: Request, exc: Exception):
        """Handle all unhandled exceptions globally."""
        logger.error(f"Exception: {exc}")
        return JSONResponse(
            status_code=500,
            content={"code": 500, "message": str(exc), "data": None},
        )

    @staticmethod
    async def http_error_handler(request: Request, exc: HTTPException):
        """Handle HTTP exceptions globally."""
        logger.error(f"HTTP error {exc.status_code}: {exc.detail}")
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.status_code, "message": str(exc.detail), "data": None},
        )
