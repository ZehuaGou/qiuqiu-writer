# API routers module

# Import AI router separately to avoid circular dependencies
from memos.api.routers.ai_router import router as ai_router

# Product and Server routers are imported on demand to avoid initialization issues
__all__ = ["ai_router"]

# Lazy import for product_router and server_router
def get_product_router():
    from memos.api.routers.product_router import router
    return router

def get_server_router():
    from memos.api.routers.server_router import router
    return router
