"""
AI服务层
处理AI模型调用和章节分析逻辑
"""

import json
import os
from datetime import datetime, timezone

from typing import AsyncGenerator
from openai import AsyncOpenAI, OpenAIError

from memos.log import get_logger


logger = get_logger(__name__)
DEFAULT_SYSTEM_PROMPT = """
# 角色
你是一位经验丰富的小说编辑和文学分析专家，擅长深度解读故事内容，帮助读者更好地理解和思考小说情节。

# 任务
请对以下章节内容进行全面、深入的分析。

"""

# 默认章节分析提示词
DEFAULT_ANALYSIS_PROMPT = """

"""


class AIService:
    """AI服务类，处理与AI模型的交互"""

    def __init__(self):
        """初始化AI服务"""
        self.api_key = os.getenv("OPENAI_API_KEY",)
        # OpenAI 客户端会自动添加 /v1 路径，所以 base_url 不应该包含 /v1
        base_url_env = os.getenv("OPENAI_API_BASE", "https://api.deepseek.com")
        # 如果环境变量中已经包含了 /v1，则移除它
        if base_url_env.endswith("/v1"):
            base_url_env = base_url_env[:-3]
        # 移除末尾的斜杠（如果有）
        base_url_env = base_url_env.rstrip("/")
        # 确保使用 HTTPS 协议（如果配置了 http://，自动转换为 https://）
        if base_url_env.startswith("http://") and "localhost" not in base_url_env and "127.0.0.1" not in base_url_env:
            logger.warning(f"检测到 base_url 使用 HTTP 协议，自动转换为 HTTPS: {base_url_env}")
            base_url_env = base_url_env.replace("http://", "https://", 1)
        # 如果没有协议前缀，默认使用 https://
        if not base_url_env.startswith(("http://", "https://")):
            base_url_env = f"https://{base_url_env}"
        self.base_url = base_url_env
        self.default_model = os.getenv("DEFAULT_AI_MODEL", "deepseek-chat")

        if not self.api_key:
            logger.warning("OPENAI_API_KEY not set, AI service may not work properly")

        # 初始化OpenAI客户端
        self.client = AsyncOpenAI(
            api_key=self.api_key or "dummy-key",  # 提供一个默认值以避免初始化失败
            base_url=self.base_url,
        )

        # 可用的模型列表（包含默认模型）
        self.available_models = [
            "deepseek-chat",  # DeepSeek 通用对话模型
        ]
        
        # 确保默认模型在可用列表中
        if self.default_model not in self.available_models:
            self.available_models.append(self.default_model)

        logger.info(f"AI Service initialized with base_url: {self.base_url}, default_model: {self.default_model}")

    def get_default_prompt(self) -> str:
        """获取默认的章节分析提示词"""
        return DEFAULT_ANALYSIS_PROMPT

    def get_default_system_prompt(self) -> str:
        """获取默认的系统提示词"""
        return DEFAULT_SYSTEM_PROMPT

    def get_available_models(self) -> list[str]:
        """获取可用的AI模型列表"""
        return self.available_models

    def is_healthy(self) -> bool:
        """检查AI服务是否健康"""
        return bool(self.api_key)

    async def analyze_chapter_stream(
        self,
        content: str,
        prompt: str | None = None,
        system_prompt: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 20000,
        use_json_format: bool = True,
    ) -> str:
        """
        分析章节内容（非流式）

        Args:
            content: 章节内容
            prompt: 自定义用户提示词（可选，用于替换 {content} 变量）
            system_prompt: 自定义系统提示词（可选，描述AI的身份和角色）
            model: AI模型名称
            temperature: 生成温度
            max_tokens: 最大token数
            use_json_format: 是否使用JSON格式响应（默认True，用于分析接口；False用于生成文本内容）

        Returns:
            完整的AI响应文本内容
        """
        try:
            # 检查API密钥
            if not self.api_key:
                raise ValueError("未配置OPENAI_API_KEY，无法使用AI服务")

            # 如果没有显式传入模型，使用服务的默认模型，避免向接口发送 null
            model_name = model or self.default_model

            # 记录开始时间
            start_time = datetime.now(timezone.utc)

            # 获取系统提示词（从外部获取或使用默认值）
            system_content = system_prompt or self.get_default_system_prompt()
            
            # 构建用户提示词（从外部获取或使用默认值）
            user_prompt = prompt or self.get_default_prompt()
            # 使用 replace 而不是 format，避免 JSON 模板中的大括号冲突
            user_content = user_prompt.replace("{content}", content)

            logger.info(
                f"Starting chapter analysis with model: {model_name}, "
                f"temperature: {temperature}, max_tokens: {max_tokens}, "
                f"base_url: {self.base_url}, use_json_format: {use_json_format}"
            )
            logger.debug(f"System prompt length: {len(system_content)}, User prompt length: {len(user_content)}")

            # 调用OpenAI/DeepSeek 兼容 API 进行非流式生成
            create_params = {
                "model": model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": system_content,
                    },
                    {"role": "user", "content": user_content},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
            }
            
            # 只有在需要JSON格式时才添加response_format参数
            if use_json_format:
                create_params["response_format"] = {
                    'type': 'json_object'
                }
            
            response = await self.client.chat.completions.create(**create_params)
            
            # 从非流式响应中获取完整内容
            if not response.choices or len(response.choices) == 0:
                raise ValueError("AI服务返回空响应")
            
            # 获取完整文本内容
            full_text = response.choices[0].message.content or ""
            
            # 获取token使用信息
            total_tokens = 0
            completion_tokens = 0
            if hasattr(response, 'usage') and response.usage:
                total_tokens = response.usage.total_tokens or 0
                completion_tokens = response.usage.completion_tokens or 0

            # 计算耗时
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()

            # 调试日志：打印完整的 AI 返回内容（截断避免过长）
            if full_text:
                preview = full_text[:2000]
                logger.info(
                    f"Full AI response text (truncated to 2000 chars): {preview}"
                )
                logger.debug(f"Total tokens: {total_tokens}, Completion tokens: {completion_tokens}")

            logger.info(f"Chapter analysis completed successfully in {duration:.2f}s")

            return full_text

        except OpenAIError as e:
            error_msg = str(e)
            logger.error(
                f"OpenAI API error during chapter analysis: {error_msg}, "
                f"base_url: {self.base_url}, model: {model_name}"
            )
            # 如果是 405 错误，提供更详细的诊断信息
            if "405" in error_msg:
                logger.error(
                    f"405 错误诊断: base_url={self.base_url}, "
                    f"实际请求URL应该是: {self.base_url}/v1/chat/completions, "
                    f"请检查 base_url 配置是否正确（不应该包含 /v1）"
                )
            raise ValueError(f"AI服务调用失败: {error_msg}")

        except Exception as e:
            logger.error(f"Unexpected error during chapter analysis: {str(e)}")
            raise ValueError(f"服务器内部错误: {str(e)}")

    async def generate_content_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 8000,
    ) -> AsyncGenerator[str, None]:
        """
        流式生成内容（真正的流式响应）

        Args:
            prompt: 用户提示词
            system_prompt: 系统提示词（可选）
            model: AI模型名称
            temperature: 生成温度
            max_tokens: 最大token数

        Yields:
            内容块字符串
        """
        try:
            # 检查API密钥
            if not self.api_key:
                raise ValueError("未配置OPENAI_API_KEY，无法使用AI服务")

            # 如果没有显式传入模型，使用服务的默认模型
            model_name = model or self.default_model

            # 记录开始时间
            start_time = datetime.now(timezone.utc)

            # 获取系统提示词
            system_content = system_prompt or self.get_default_system_prompt()

            logger.info(
                f"Starting content generation with model: {model_name}, "
                f"temperature: {temperature}, max_tokens: {max_tokens}"
            )

            # 调用OpenAI/DeepSeek 兼容 API 进行流式生成
            stream = await self.client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": system_content,
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,  # 启用真正的流式响应
            )
            
            # 流式返回内容
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield delta.content

            # 计算耗时
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()
            logger.info(f"Content generation completed successfully in {duration:.2f}s")

        except OpenAIError as e:
            logger.error(f"OpenAI API error during content generation: {str(e)}")
            raise ValueError(f"AI服务调用失败: {str(e)}")

        except Exception as e:
            logger.error(f"Unexpected error during content generation: {str(e)}")
            raise ValueError(f"服务器内部错误: {str(e)}")


# 全局AI服务实例
_ai_service_instance: AIService | None = None


def get_ai_service() -> AIService:
    """获取AI服务实例（单例模式）"""
    global _ai_service_instance
    if _ai_service_instance is None:
        _ai_service_instance = AIService()
    return _ai_service_instance

