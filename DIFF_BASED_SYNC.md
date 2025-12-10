# 基于差异的同步机制

## 问题描述

之前的同步机制是发送完整内容，导致删除操作无法正确处理：
- 如果用户A删除了内容，发送的是删除后的内容
- 如果用户B有新增内容，发送的是包含新增的完整内容
- 合并时，如果简单地合并，可能会忽略删除操作

## 解决方案

实现基于差异的同步机制：
1. **前端**：发送 `base_content`（上次同步的内容）和 `content`（当前内容）
2. **后端**：计算从 `base_content` 到 `content` 的差异（删除、新增）
3. **后端**：将差异应用到服务器内容，实现智能合并

## 实现细节

### 1. 前端：发送差异信息 ✅

**位置**: `frontend/src/utils/sharedbClient.ts`

**改进**:
- 在同步前保存 `base_content`（上次同步的内容）
- 发送时同时发送 `base_content` 和 `content`
- 同步成功后更新 `currentContent` 为合并后的内容

**关键代码**:
```typescript
// 在获取服务器文档之前，先保存 base_content
const baseContent = this.currentContent.get(documentId) || '';

// 发送同步请求
body: JSON.stringify({
  doc_id: documentId,
  version: syncVersion,
  content: contentStr,        // 当前内容
  base_content: baseContent,  // 上次同步的内容（用于计算差异）
  create_version: false
})

// 同步成功后，更新 base_content
this.currentContent.set(documentId, response.content);
```

### 2. 后端：接收差异信息 ✅

**位置**: `backend/src/memos/api/routers/sharedb_router.py`

**改进**:
- `DocumentSyncRequest` 添加 `base_content` 字段（可选）
- 将 `base_content` 传递给 `sync_document` 方法

**关键代码**:
```python
class DocumentSyncRequest(BaseModel):
    doc_id: str
    version: int
    content: str
    base_content: Optional[str] = None  # 上次同步的内容（用于计算差异）
    create_version: bool = False
```

### 3. 后端：基于差异的合并 ✅

**位置**: `backend/src/memos/api/services/sharedb_service.py`

**改进**:
- 新增 `_merge_with_diff` 方法，实现基于差异的合并
- 如果有 `base_content`，使用差异合并；否则使用原有的智能合并

**关键代码**:
```python
# 如果有 base_content，使用基于差异的合并
if base_content is not None and base_content != content:
    logger.info(f"使用基于差异的合并")
    merged_content = await self._merge_with_diff(
        base_content=base_content,
        client_content=content,
        server_content=server_content
    )
```

### 4. 差异合并策略 ✅

**HTML 内容合并** (`_merge_html_with_diff`):
1. 提取所有块级元素（段落、标题等）
2. 找出客户端删除的内容（在 base 中但不在 client 中）
3. 找出客户端新增的内容（在 client 中但不在 base 中）
4. 以服务器内容为基础：
   - 删除客户端删除的内容（如果服务器中有）
   - 添加客户端新增的内容

**文本内容合并** (`_merge_text_with_diff`):
1. 按行分割内容
2. 找出删除的行和新增的行
3. 以服务器内容为基础：
   - 删除客户端删除的行
   - 添加客户端新增的行

## 工作流程

### 场景1：用户A删除，用户B新增

1. **初始内容**：`<p>Hello</p><p>World</p>`
2. **用户A**：
   - base_content: `<p>Hello</p><p>World</p>`
   - content: `<p>Hello</p>`（删除了第二个段落）
   - 差异：删除 `<p>World</p>`
3. **用户B**：
   - base_content: `<p>Hello</p><p>World</p>`
   - content: `<p>Hello</p><p>World</p><p>New</p>`（新增了段落）
   - 差异：新增 `<p>New</p>`
4. **用户A先同步**：
   - 服务器内容：`<p>Hello</p>`
   - 版本：2
5. **用户B同步时**：
   - 服务器内容：`<p>Hello</p>`
   - 客户端差异：新增 `<p>New</p>`
   - 合并结果：`<p>Hello</p><p>New</p>`
   - ✅ 删除操作保留，新增也保留

### 场景2：用户A删除，用户B修改

1. **初始内容**：`<p>Hello</p><p>World</p>`
2. **用户A**：
   - base_content: `<p>Hello</p><p>World</p>`
   - content: `<p>Hello</p>`（删除了第二个段落）
   - 差异：删除 `<p>World</p>`
3. **用户B**：
   - base_content: `<p>Hello</p><p>World</p>`
   - content: `<p>Hello</p><p>Universe</p>`（修改了第二个段落）
   - 差异：修改 `<p>World</p>` → `<p>Universe</p>`
4. **用户A先同步**：
   - 服务器内容：`<p>Hello</p>`
   - 版本：2
5. **用户B同步时**：
   - 服务器内容：`<p>Hello</p>`
   - 客户端差异：修改（实际上是删除旧内容，添加新内容）
   - 合并结果：`<p>Hello</p><p>Universe</p>`
   - ✅ 删除操作保留，修改也保留

## 优势

1. **正确处理删除**：通过差异计算，可以准确识别删除操作
2. **智能合并**：将客户端的差异应用到服务器内容，而不是简单合并
3. **保留所有操作**：删除和新增操作都能正确保留
4. **向后兼容**：如果没有 `base_content`，仍然使用原有的智能合并

## 测试验证

### 测试1：基本删除

1. 打开编辑器，输入：`<p>Hello</p><p>World</p>`
2. 删除第二个段落
3. 等待同步
4. **预期**：第二个段落被删除，只保留 `<p>Hello</p>`

### 测试2：删除后其他用户新增

1. 用户A：删除 `<p>World</p>`
2. 用户B：添加 `<p>New</p>`
3. **预期**：最终内容为 `<p>Hello</p><p>New</p>`（删除保留，新增也保留）

### 测试3：删除后其他用户修改

1. 用户A：删除 `<p>World</p>`
2. 用户B：修改 `<p>World</p>` 为 `<p>Universe</p>`
3. **预期**：最终内容为 `<p>Hello</p><p>Universe</p>`（删除保留，修改也保留）

## 调试方法

### 查看后端日志

```bash
# 查看差异合并日志
grep "使用基于差异的合并\|差异合并\|客户端删除\|客户端新增" backend.log
```

**关键日志**:
```
使用基于差异的合并: base长度=X, client长度=Y, server长度=Z
差异合并：base N 个块，client M 个块，server K 个块
客户端删除: X 个块，新增: Y 个块
✅ 差异合并完成：合并后 L 个块，长度 M
```

### 查看前端控制台

**关键日志**:
```
📤 [同步] 发送差异同步: { baseLength: X, contentLength: Y, version: Z }
✅ [同步] 服务器已合并内容: { originalLength: X, mergedLength: Y, version: Z }
```

## 相关文件

- `backend/src/memos/api/services/sharedb_service.py` - 后端差异合并逻辑
- `backend/src/memos/api/routers/sharedb_router.py` - API 路由
- `frontend/src/utils/sharedbClient.ts` - 前端同步逻辑
- `frontend/src/utils/intelligentSync.ts` - 智能同步 Hook

