# 基于版本的合并机制

## 架构改进

### 设计理念

1. **前端明确告诉后端**：用户基于哪个版本做的更改
2. **后端负责合并**：根据版本信息进行智能合并
3. **后端返回结果**：合并后的内容和版本号

### 工作流程

```
1. 前端记录上次同步的版本号 (baseVersion)
2. 用户编辑内容
3. 前端发送同步请求：
   - version: 客户端当前版本号
   - content: 用户当前编辑的内容
   - base_version: 用户基于哪个版本做的更改（关键）
   - base_content: 上次同步的内容（备用）
4. 后端处理：
   - 根据 base_version 获取对应版本的内容（如果存在）
   - 计算从 base 到 client 的差异
   - 将差异应用到服务器内容
   - 返回合并后的内容和版本
5. 前端更新：
   - 更新本地版本号和内容为服务器返回的值
```

## 实现细节

### 1. 前端：传递版本信息 ✅

**位置**: `frontend/src/utils/sharedbClient.ts`

**关键改进**:
- 记录 `baseVersion`（上次同步的版本号）
- 同步时传递 `base_version` 和 `base_content`
- 即使服务器版本更新，`baseVersion` 保持不变（因为用户是基于旧版本做的更改）

**代码**:
```typescript
let baseVersion = this.currentVersion.get(documentId) || 0;  // 记录上次同步的版本号

// 发送同步请求
body: JSON.stringify({
  doc_id: documentId,
  version: syncVersion,  // 客户端当前版本号
  content: contentStr,  // 客户端当前内容
  base_version: baseVersion,  // 基于哪个版本做的更改（关键）
  base_content: baseContent,  // 上次同步的内容（备用）
  create_version: false
})
```

### 2. 后端：根据版本合并 ✅

**位置**: `backend/src/memos/api/services/sharedb_service.py`

**关键改进**:
- 优先使用 `base_version` 从历史记录获取对应版本的内容
- 如果 `base_version` 等于服务器版本，使用服务器内容
- 如果无法获取，使用提供的 `base_content`
- 进行差异合并

**代码**:
```python
# 优先使用 base_version 获取 base_content
if base_version is not None and base_version > 0:
    # 尝试从数据库获取历史版本内容
    if db_session is not None:
        history_record = await get_history_by_version(document_id, base_version)
        if history_record and history_record.content:
            actual_base_content = history_record.content
    elif base_version == server_version:
        actual_base_content = server_content

# 使用差异合并
merged_content = await self._merge_with_diff(
    base_content=actual_base_content,
    client_content=content,
    server_content=server_content
)
```

### 3. 后端返回合并结果 ✅

**位置**: `backend/src/memos/api/services/sharedb_service.py`

**返回内容**:
```python
return {
    "success": True,
    "content": merged_content,  # 合并后的内容
    "version": new_version,  # 新的版本号
    "operations": []
}
```

## 场景示例

### 场景1：正常同步

1. **用户A**：
   - 上次同步版本：2
   - 当前编辑内容：`<p>Hello</p><p>New</p>`
   - 发送：`base_version=2, content=<p>Hello</p><p>New</p>`

2. **后端**：
   - 服务器版本：2
   - 服务器内容：`<p>Hello</p>`
   - 获取版本2的内容作为 base：`<p>Hello</p>`
   - 计算差异：新增 `<p>New</p>`
   - 合并结果：`<p>Hello</p><p>New</p>`
   - 返回：版本3，内容 `<p>Hello</p><p>New</p>`

### 场景2：服务器版本更新

1. **用户A**：
   - 上次同步版本：2
   - 当前编辑内容：`<p>Hello</p><p>Editing</p>`
   - 发送：`base_version=2, content=<p>Hello</p><p>Editing</p>`

2. **后端**：
   - 服务器版本：3（用户B已经同步）
   - 服务器内容：`<p>Hello</p><p>Server</p>`
   - 获取版本2的内容作为 base：`<p>Hello</p>`
   - 计算差异：从 `<p>Hello</p>` 到 `<p>Hello</p><p>Editing</p>`
   - 差异：新增 `<p>Editing</p>`
   - 应用到服务器内容：删除 `<p>Server</p>`，添加 `<p>Editing</p>`
   - 合并结果：`<p>Hello</p><p>Editing</p>`
   - 返回：版本4，内容 `<p>Hello</p><p>Editing</p>`

### 场景3：用户删除

1. **用户A**：
   - 上次同步版本：2
   - 当前编辑内容：`<p>Hello</p>`（删除了第二个段落）
   - 发送：`base_version=2, content=<p>Hello</p>`

2. **后端**：
   - 服务器版本：2
   - 服务器内容：`<p>Hello</p><p>World</p>`
   - 获取版本2的内容作为 base：`<p>Hello</p><p>World</p>`
   - 计算差异：从 `<p>Hello</p><p>World</p>` 到 `<p>Hello</p>`
   - 差异：删除 `<p>World</p>`
   - 应用到服务器内容：删除 `<p>World</p>`
   - 合并结果：`<p>Hello</p>`
   - 返回：版本3，内容 `<p>Hello</p>`

## 优势

1. **明确的版本控制**：
   - 前端明确告诉后端用户基于哪个版本
   - 后端可以根据版本信息进行精确合并

2. **后端负责合并**：
   - 所有合并逻辑在后端统一处理
   - 前端只需要传递版本信息和内容

3. **历史版本支持**：
   - 如果保存了历史版本，可以从历史记录获取
   - 如果没有历史版本，使用提供的 base_content

4. **更可靠的合并**：
   - 基于版本信息，可以更准确地判断冲突
   - 差异计算更准确

## 相关文件

- `backend/src/memos/api/routers/sharedb_router.py` - API 路由（已更新）
- `backend/src/memos/api/services/sharedb_service.py` - 后端合并逻辑（已更新）
- `frontend/src/utils/sharedbClient.ts` - 前端同步逻辑（已更新）

