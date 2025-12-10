# ShareDB 同步 API 实现说明

## 概述

已成功实现 `/v1/sharedb/documents/sync` API 端点，用于文档同步功能。该实现借鉴了 `nexcode_server` 的设计，并适配到使用 Redis 的 backend 系统。

## 实现内容

### 1. ShareDBService 增强

**文件**: `backend/src/memos/api/services/sharedb_service.py`

**新增方法**: `sync_document()`

**功能**:
- 同步文档到 ShareDB (Redis)
- 版本号自动递增
- 支持文档创建和更新
- 广播更新给所有连接的客户端
- 记录操作历史

### 2. ShareDB 路由

**文件**: `backend/src/memos/api/routers/sharedb_router.py`

**端点**:
- `GET /v1/sharedb/ping` - 健康检查
- `GET /v1/sharedb/documents/{doc_id}` - 获取文档
- `POST /v1/sharedb/documents/sync` - 同步文档 ⭐
- `POST /v1/sharedb/documents/{doc_id}/operations` - 应用操作
- `GET /v1/sharedb/documents/{doc_id}/operations` - 获取操作历史

### 3. 路由注册

**文件**: `backend/src/memos/api/ai_api.py`

已注册 ShareDB 路由到 FastAPI 应用。

## API 使用示例

### 同步文档

```bash
curl -X POST 'http://localhost:8001/v1/sharedb/documents/sync' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{
    "doc_id": "work_4_chapter_6",
    "version": 3,
    "content": "<p>集成</p><p></p>",
    "create_version": false
  }'
```

### 响应格式

**成功响应**:
```json
{
  "success": true,
  "version": 4,
  "content": "<p>集成</p><p></p>",
  "operations": []
}
```

**失败响应**:
```json
{
  "success": false,
  "error": "错误信息",
  "content": "<p>集成</p><p></p>",
  "version": 3,
  "operations": []
}
```

## 请求参数

### DocumentSyncRequest

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| doc_id | string | 是 | 文档ID，格式如 `work_4_chapter_6` |
| version | integer | 是 | 当前客户端版本号 |
| content | string | 是 | 文档内容（HTML格式） |
| create_version | boolean | 否 | 是否创建版本快照（默认 false） |

## 版本控制逻辑

1. **版本递增**: ShareDB 版本号始终递增，即使客户端版本号较小
2. **冲突检测**: 通过版本号比较检测是否有其他用户更新
3. **自动合并**: 如果服务器版本更新，返回最新内容

## 认证

所有端点都需要认证，使用 Bearer Token：

```
Authorization: Bearer YOUR_TOKEN
```

用户ID会自动从 token 中提取。

## 技术细节

### 存储

- **Redis**: 文档内容存储在 Redis 中，TTL 为 24 小时
- **键格式**: `doc:{document_id}`
- **数据结构**: JSON 格式，包含 content、version、updated_at 等字段

### 并发控制

- 使用 `asyncio.Lock` 保证同一文档的同步操作是原子的
- 每个文档有独立的锁

### 实时更新

- 同步成功后，会广播更新给所有连接的 WebSocket 客户端
- 客户端可以实时收到其他用户的更新

## 与前端集成

前端代码已经实现了对该端点的调用：

**文件**: `frontend/src/utils/sharedbClient.ts`

```typescript
const syncResponse = await fetch(`${apiUrl}/v1/sharedb/documents/sync`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    doc_id: documentId,
    version: currentVersion,
    content: contentStr,
    create_version: false
  })
});
```

## 错误处理

- **404**: 文档不存在（在获取文档时）
- **500**: 服务器内部错误
- **认证失败**: 返回 401 未授权

所有错误都会在响应中返回 `success: false` 和 `error` 字段。

## 后续优化建议

1. **版本快照**: 实现 PostgreSQL 版本快照功能（`create_version: true`）
2. **操作历史**: 完善操作历史记录和查询功能
3. **冲突解决**: 实现更智能的冲突解决策略
4. **性能优化**: 对于大文档，考虑增量同步
5. **监控**: 添加同步操作的监控和日志

## 相关文件

- `backend/src/memos/api/routers/sharedb_router.py` - API 路由
- `backend/src/memos/api/services/sharedb_service.py` - ShareDB 服务
- `backend/src/memos/api/ai_api.py` - 路由注册
- `frontend/src/utils/sharedbClient.ts` - 前端客户端
- `frontend/src/utils/intelligentSync.ts` - 智能同步 Hook

## 测试

可以使用 curl 命令测试端点：

```bash
# 健康检查
curl http://localhost:8001/v1/sharedb/ping

# 同步文档
curl -X POST 'http://localhost:8001/v1/sharedb/documents/sync' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{"doc_id":"test_doc","version":1,"content":"test content"}'
```

## 参考

- `nexcode_server/app/api/v1/sharedb.py` - 原始实现参考
- `nexcode_server/app/services/sharedb_service.py` - 服务实现参考

