# 拆书分析 API 接口规范

## 概述

本文档定义了拆书功能所需的后端 API 接口规范。这些接口将集成到 memos 后端，为前端提供 AI 章节分析服务。

## 基础信息

- **基础 URL**: `http://localhost:8001/api/ai`
- **认证方式**: 暂无（后续可添加 JWT 或 API Key）
- **内容类型**: `application/json`
- **响应格式**: JSON 或 Server-Sent Events (SSE)

## 接口列表

### 1. 章节分析接口

#### 基本信息
- **端点**: `POST /api/ai/analyze-chapter`
- **描述**: 对小说章节内容进行 AI 分析，返回结构化的章节分析结果
- **响应方式**: 流式响应（Server-Sent Events）

#### 请求参数

```json
{
  "content": "string (required)",
  "prompt": "string (optional)",
  "settings": {
    "model": "string (optional, default: 'gpt-3.5-turbo')",
    "temperature": "number (optional, default: 0.7)",
    "maxTokens": "number (optional, default: 4000)"
  }
}
```

**字段说明：**
- `content`: 要分析的章节内容（必填）
- `prompt`: 自定义分析提示词（可选，如果不提供则使用默认提示词）
- `settings.model`: AI 模型名称
- `settings.temperature`: 生成温度（0-1）
- `settings.maxTokens`: 最大 token 数

#### 请求示例

```bash
curl -X POST http://localhost:8001/api/ai/analyze-chapter \
  -H "Content-Type: application/json" \
  -d '{
    "content": "第一章 开始\n\n这是一个故事的开始...",
    "settings": {
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 4000
    }
  }'
```

#### 响应格式

**流式响应（SSE）：**

```
data: {"type": "start", "message": "开始分析"}

data: {"type": "chunk", "content": "| 章节号 |"}

data: {"type": "chunk", "content": " 章节标题 |"}

...

data: {"type": "done", "message": "分析完成"}
```

**字段说明：**
- `type`: 消息类型
  - `start`: 开始分析
  - `chunk`: 内容片段
  - `done`: 分析完成
  - `error`: 错误信息
- `content`: 内容片段（仅 chunk 类型）
- `message`: 状态消息

#### 错误响应

```json
{
  "code": 400,
  "message": "请求参数错误",
  "data": null
}
```

**错误码：**
- `400`: 请求参数错误
- `401`: 未授权
- `429`: 请求过于频繁
- `500`: 服务器内部错误
- `503`: AI 服务不可用

---

### 2. 健康检查接口

#### 基本信息
- **端点**: `GET /api/ai/health`
- **描述**: 检查 AI 服务是否可用
- **响应方式**: JSON

#### 请求参数
无

#### 请求示例

```bash
curl -X GET http://localhost:8001/api/ai/health
```

#### 响应示例

```json
{
  "code": 200,
  "message": "服务正常",
  "data": {
    "status": "healthy",
    "models": [
      "gpt-3.5-turbo",
      "gpt-4",
      "claude-3-sonnet"
    ],
    "timestamp": "2025-12-09T10:00:00Z"
  }
}
```

**字段说明：**
- `status`: 服务状态（`healthy` / `unhealthy`）
- `models`: 可用的 AI 模型列表
- `timestamp`: 检查时间

---

### 3. 获取默认提示词接口（可选）

#### 基本信息
- **端点**: `GET /api/ai/default-prompt`
- **描述**: 获取默认的章节分析提示词模板
- **响应方式**: JSON

#### 请求参数
无

#### 请求示例

```bash
curl -X GET http://localhost:8001/api/ai/default-prompt
```

#### 响应示例

```json
{
  "code": 200,
  "message": "成功",
  "data": {
    "prompt": "# 角色\n你是一位经验丰富的小说编辑...",
    "version": "1.0"
  }
}
```

---

## 实现建议

### 1. AI 模型集成

推荐使用 OpenAI API 兼容的接口，支持多种模型：

```python
# Python 示例
import openai

async def analyze_chapter(content: str, settings: dict):
    response = await openai.ChatCompletion.acreate(
        model=settings.get('model', 'gpt-3.5-turbo'),
        messages=[
            {"role": "user", "content": get_analysis_prompt(content)}
        ],
        temperature=settings.get('temperature', 0.7),
        max_tokens=settings.get('maxTokens', 4000),
        stream=True  # 启用流式响应
    )
    
    async for chunk in response:
        content = chunk.choices[0].delta.get('content', '')
        if content:
            yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
    
    yield f"data: {json.dumps({'type': 'done', 'message': '分析完成'})}\n\n"
```

### 2. 流式响应处理

使用 FastAPI 的 StreamingResponse：

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

@app.post("/api/ai/analyze-chapter")
async def analyze_chapter_endpoint(request: AnalysisRequest):
    return StreamingResponse(
        analyze_chapter(request.content, request.settings),
        media_type="text/event-stream"
    )
```

### 3. 错误处理

```python
try:
    # AI 调用逻辑
    pass
except openai.error.RateLimitError:
    return JSONResponse(
        status_code=429,
        content={"code": 429, "message": "请求过于频繁，请稍后重试"}
    )
except openai.error.APIError as e:
    return JSONResponse(
        status_code=503,
        content={"code": 503, "message": f"AI 服务不可用: {str(e)}"}
    )
```

### 4. 配置管理

建议使用环境变量管理 API 密钥和配置：

```python
import os

AI_CONFIG = {
    'api_key': os.getenv('OPENAI_API_KEY'),
    'base_url': os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    'default_model': os.getenv('DEFAULT_MODEL', 'gpt-3.5-turbo'),
    'max_tokens': int(os.getenv('MAX_TOKENS', '4000')),
    'temperature': float(os.getenv('TEMPERATURE', '0.7'))
}
```

### 5. 缓存优化

对于相同内容的分析请求，可以使用缓存减少 API 调用：

```python
import hashlib
from functools import lru_cache

def get_content_hash(content: str) -> str:
    return hashlib.md5(content.encode()).hexdigest()

# 使用 Redis 或内存缓存
cache = {}

async def analyze_with_cache(content: str, settings: dict):
    cache_key = f"{get_content_hash(content)}:{settings.get('model')}"
    
    if cache_key in cache:
        return cache[cache_key]
    
    result = await analyze_chapter(content, settings)
    cache[cache_key] = result
    
    return result
```

## 测试用例

### 测试 1: 正常分析请求

```bash
curl -X POST http://localhost:8001/api/ai/analyze-chapter \
  -H "Content-Type: application/json" \
  -d '{
    "content": "第一章 测试\n\n这是测试内容。",
    "settings": {
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "maxTokens": 2000
    }
  }'
```

**预期结果**: 返回流式响应，包含章节分析表格

### 测试 2: 健康检查

```bash
curl -X GET http://localhost:8001/api/ai/health
```

**预期结果**: 返回服务状态和可用模型列表

### 测试 3: 错误处理

```bash
curl -X POST http://localhost:8001/api/ai/analyze-chapter \
  -H "Content-Type: application/json" \
  -d '{}'
```

**预期结果**: 返回 400 错误，提示缺少必填参数

## 性能要求

- **响应时间**: 首个 chunk 应在 2 秒内返回
- **并发支持**: 至少支持 10 个并发请求
- **超时设置**: 单次分析超时时间 60 秒
- **限流**: 建议每个 IP 每分钟最多 20 次请求

## 安全建议

1. **API 密钥保护**: 不要在前端暴露 OpenAI API 密钥
2. **请求验证**: 验证请求内容长度，防止超大请求
3. **限流保护**: 实现请求频率限制
4. **日志记录**: 记录所有 API 调用和错误信息
5. **CORS 配置**: 正确配置跨域访问策略

## 部署清单

- [ ] 配置 AI 模型 API 密钥
- [ ] 实现章节分析接口
- [ ] 实现健康检查接口
- [ ] 添加错误处理和日志
- [ ] 配置 CORS
- [ ] 添加请求限流
- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 部署到测试环境
- [ ] 前端联调测试
- [ ] 部署到生产环境

## 相关资源

- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [Server-Sent Events 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [SmartReads 项目](https://github.com/Ggbond626/SmartReads)

