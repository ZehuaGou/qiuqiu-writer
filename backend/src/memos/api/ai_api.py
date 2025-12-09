#!/usr/bin/env python3
"""
独立的AI接口服务
专门用于拆书分析功能
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 直接导入AI路由，避免其他路由的依赖问题
from memos.api.routers.ai_router import router as ai_router


# 配置日志
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# 创建FastAPI应用
app = FastAPI(
    title="WawaWriter AI Analysis API",
    description="AI接口服务 - 用于小说章节分析",
    version="1.0.0",
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册AI路由
app.include_router(ai_router)

logger.info("✅ AI router registered successfully")


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": "WawaWriter AI Analysis API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/ai/health",
            "analyze": "/ai/analyze-chapter",
            "prompt": "/ai/default-prompt",
            "docs": "/docs",
        },
    }


if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="启动AI接口服务")
    parser.add_argument("--port", type=int, default=8001, help="服务端口")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="服务主机")
    parser.add_argument("--workers", type=int, default=1, help="工作进程数")
    args = parser.parse_args()

    logger.info(f"🚀 Starting AI API服务 on {args.host}:{args.port}")
    
    uvicorn.run(
        "memos.api.ai_api:app",
        host=args.host,
        port=args.port,
        workers=args.workers,
        reload=False,
    )

