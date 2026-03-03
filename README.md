# 球球写作 (QiuQiu Writer)

一个全栈 AI 写作平台，支持小说、剧本等多种创作形式，具备协同编辑、AI 辅助、书籍分析等功能。

## 项目结构

```
qiuqiuwriter/
├── frontend/        # 用户端前端（React 19 + TypeScript + Vite，端口 5173）
├── admin/           # 管理后台（React 18 + Ant Design，独立 Vite 应用）
├── backend/         # API 服务器（FastAPI + Python 3.10+，端口 8001）
├── docker/          # Docker 基础设施配置
│   ├── docker-compose.infra.yml   # 基础服务（PostgreSQL、Redis、MongoDB）
│   ├── docker-compose.app.yml     # 应用服务（前后端容器）
│   └── docker-compose.prod.yml    # 生产环境配置
├── deploy/          # 部署相关脚本
├── start.sh         # 一键启动脚本
└── README.md
```

## 技术栈

### 前端（frontend/）
- React 19 + TypeScript + Vite
- TipTap 富文本编辑器
- Yjs CRDT 协同编辑（y-websocket、y-indexeddb、y-webrtc）
- React Router v7（懒加载路由）

### 管理后台（admin/）
- React 18 + Ant Design
- 独立 Vite 应用，与前端分离

### 后端（backend/）
- FastAPI + Python 3.10+
- Poetry 依赖管理
- SQLAlchemy ORM（PostgreSQL）
- Pydantic 请求/响应校验
- AI 集成：支持 OpenAI 兼容接口（默认 DeepSeek）、Ollama 等

### 数据库
| 服务 | 用途 | 必须 |
|------|------|------|
| PostgreSQL | 主数据库（用户、作品、章节） | 是 |
| Redis | 缓存与会话 | 是 |
| MongoDB | ShareDB 协同文档存储 | 是 |
| Qdrant | 向量数据库（语义搜索） | 否 |
| Neo4j | 图数据库（记忆功能） | 否 |

## 快速开始

### 前置条件

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose

### 1. 启动基础设施

```bash
cd docker
docker compose -f docker-compose.infra.yml up -d postgres redis mongodb
```

### 2. 配置后端环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env，填写 OPENAI_API_KEY 等配置
```

主要配置项：

```env
# AI 服务
OPENAI_API_KEY=your_key_here
OPENAI_API_BASE=https://api.deepseek.com/v1
DEFAULT_AI_MODEL=deepseek-chat

# 数据库（与 docker-compose.infra.yml 保持一致）
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=writerai

REDIS_HOST=localhost
REDIS_PORT=6379

MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DATABASE=writerai_sharedb
```

### 3. 启动后端

```bash
cd backend
make install          # 安装依赖（首次运行）
make serve            # 启动开发服务器（端口 8001）
```

或手动启动：

```bash
cd backend
source .venv/bin/activate
uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001 --reload
```

### 4. 启动前端

```bash
cd frontend
npm install           # 安装依赖（首次运行）
npm run dev           # 启动开发服务器（端口 5173）
```

### 5. 启动管理后台（可选）

```bash
cd admin
npm install
npm run dev
```

### 一键启动（推荐）

```bash
./start.sh
```

## 开发命令

### 前端

```bash
cd frontend
npm run dev       # 开发服务器（端口 5173）
npm run build     # 构建生产版本
npm run lint      # ESLint 检查
npm run preview   # 预览生产构建（端口 4173）
```

### 后端

```bash
cd backend
make install      # 安装依赖
make test         # 运行测试
make format       # 格式化代码（Ruff）
make serve        # 启动开发服务器

# 运行指定测试
poetry run pytest tests/test_specific.py -v
poetry run pytest tests/ -k "test_name" -v
```

## API 文档

后端启动后访问：
- Swagger UI：http://localhost:8001/docs
- ReDoc：http://localhost:8001/redoc

API 路由前缀：
- 主接口：`/api/v1/`
- AI 服务：`/v1/`

## 主要功能

- **富文本编辑**：基于 TipTap，支持小说编辑器、剧本编辑器等多种模式
- **协同编辑**：基于 Yjs CRDT + ShareDB，支持多人实时协同
- **AI 辅助写作**：接入大语言模型，辅助创作
- **书籍分析**：AI 驱动的书籍内容分析功能
- **用户系统**：注册/登录、个人作品管理
- **广场/社区**：UGC 内容展示（UGCPlaza）
- **深色/浅色主题**：CSS 变量实现的主题切换系统

## 生产部署

```bash
# 构建并启动全容器化环境
cd docker
docker compose -f docker-compose.prod.yml up -d
```

生产环境变量配置在 `docker/.env`（参考 `backend/.env.example`）。

## 许可证

MIT
