"""
API服务层模块
"""

from memos.api.services.ai_service import AIService, get_ai_service

__all__ = ["AIService", "get_ai_service"]

# WriterAI应用服务（延迟导入，避免循环依赖）
def get_user_service():
    """获取用户服务（延迟导入）"""
    from memos.api.services.user_service import UserService
    return UserService

def get_auth_service():
    """获取认证服务（延迟导入）"""
    from memos.api.services.auth_service import AuthService
    return AuthService

def get_chapter_service():
    """获取章节服务（延迟导入）"""
    from memos.api.services.chapter_service import ChapterService
    return ChapterService

def get_template_service():
    """获取模板服务（延迟导入）"""
    from memos.api.services.template_service import TemplateService
    return TemplateService

def get_work_service():
    """获取作品服务（延迟导入）"""
    from memos.api.services.work_service import WorkService
    return WorkService

def get_sharedb_service():
    """获取ShareDB服务（延迟导入）"""
    from memos.api.services.sharedb_service import ShareDBService
    return ShareDBService

