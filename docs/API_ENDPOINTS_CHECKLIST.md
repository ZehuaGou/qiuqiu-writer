# API 请求接口对照表

## 本次修改

1. **templates 列表**：前端 `templatesApi.listTemplates()` 由 `/api/v1/templates` 改为 `/api/v1/templates/`（带尾斜杠），与后端 `GET /` 拼出路径 `/api/v1/templates/` 一致，避免 307 重定向导致请求跑到 8001。

## 后端路由前缀（backend）

| 路由文件 | prefix | 说明 |
|----------|--------|------|
| auth_router | `/api/v1/auth` | 登录、注册、me、refresh、logout |
| works_router | `/api/v1/works` | 作品 CRUD、list、public、recover 等 |
| chapters_router | `/api/v1/chapters` | 章节、文档、版本、yjs-snapshots |
| templates_router | `/api/v1/templates` | 模板列表、CRUD、works 绑定、ensure-default-novel |
| volumes_router | `/api/v1/volumes` | 卷 CRUD |
| prompt_template_router | `/api/v1/prompt-templates` | Prompt 模板 |
| product_router | `/api/v1/product` | 对话 chat、chat/complete 等 |
| yjs_router | `/api/v1/yjs` | Yjs WebSocket |
| admin_router | `/api/v1/admin` | 管理端 |
| sharedb_router | `/v1/sharedb` | ShareDB 文档同步（未放在 /api 下） |
| server_router | `/product` | Server API（独立 prefix） |
| ai_router | `/ai` | AI 分析 analyze-chapter、health 等 |

## 前端请求路径（frontend）

| 模块 | 路径 | 说明 |
|------|------|------|
| authApi | `/api/v1/auth/login`、`/register`、`/me`、`/logout`、`/refresh` | ✓ |
| worksApi | `/api/v1/works/`、`/api/v1/works/public`、`/api/v1/works/{id}` 等 | ✓ 列表已用尾斜杠 |
| chaptersApi | `/api/v1/chapters/`、`/api/v1/chapters/{id}` 等 | ✓ |
| templatesApi | `/api/v1/templates/`、`/api/v1/templates/ensure-default-novel` 等 | ✓ 列表已改为尾斜杠 |
| volumesApi | `/api/v1/volumes/`、`/api/v1/volumes/{id}` | ✓ |
| promptTemplateApi | `/api/v1/prompt-templates/` 等 | ✓ |
| chatApi | `/api/v1/product/chat`、`/api/v1/product/chat/complete` | ✓ |
| bookAnalysisApi | `/api/v1/prompt-templates/...`、`/ai/analyze-chapter`、`/ai/health` 等 | ✓ |
| documentCache / api | `/v1/sharedb/documents/sync` 等 | ✓ 与后端 /v1/sharedb 一致 |
| useYjsEditor | WebSocket `${getWsBaseUrl()}/api/v1/yjs` | ✓ |

## 开发环境代理（Vite）

- `/api` → `http://localhost:8001`（覆盖 /api/v1/*）
- `/ai` → `http://localhost:8001`
- `/v1` → `http://localhost:8001`（覆盖 /v1/sharedb）

因此所有 `/api/v1/*`、`/ai/*`、`/v1/*` 请求在浏览器中会先发到 5173，再被代理到 8001。

## 注意事项

- **尾斜杠**：后端列表多为 `@router.get("/")`，完整路径带尾斜杠（如 `/api/v1/templates/`）。前端列表请求建议统一带尾斜杠，避免 307 重定向。
- **charactersApi**：前端有 `/api/v1/characters` 调用，当前后端无独立 characters 路由，若 404 需后端补路由或改为其他接口。
- **server_router**：仍为 `/product`，若需与 product_router 统一可改为 `/api/v1/product-server` 或保留现状。
