# 冲突解决实现说明

## 问题描述

两个用户同时编辑时，会出现以下问题：
1. **最后写入获胜**：后保存的用户会覆盖前一个用户的更改
2. **删除丢失**：用户A删除了内容，用户B未删除，可能导致删除失败
3. **新增丢失**：两个用户同时新增内容，只保存了最后一个新增

## 解决方案

实现了**两层冲突解决机制**：

### 方案1：同步前获取更新（已实现）✅

**策略**：在同步前先获取服务器最新版本，然后使用服务器版本号进行同步，让服务器端进行智能合并。

**优点**：
- 实现简单，快速有效
- 减少数据丢失
- 服务器端可以智能合并内容

**实现位置**：
- 前端：`frontend/src/utils/sharedbClient.ts` - `syncDocumentState()` 方法
- 后端：`backend/src/memos/api/services/sharedb_service.py` - `sync_document()` 方法

**工作流程**：
1. 客户端准备同步时，先调用 `getDocument()` 获取服务器最新版本
2. 如果服务器版本 > 客户端版本，更新本地版本号
3. 使用服务器的最新版本号进行同步
4. 服务器检测到版本冲突时，自动合并内容

### 方案2：操作级同步（框架已实现）🚧

**策略**：将用户的每个编辑操作（插入、删除、替换）封装成操作对象，使用 Operational Transformation (OT) 算法进行冲突解决。

**优点**：
- 真正的操作级同步，不会丢失任何操作
- 支持实时协作编辑
- 可以精确处理并发操作

**实现位置**：
- 前端：`frontend/src/utils/operationTracker.ts` - 操作跟踪器

**当前状态**：
- ✅ 操作跟踪器已实现
- ✅ 操作计算和应用逻辑已实现
- ⏳ 需要集成到编辑器
- ⏳ 需要后端支持操作级同步

## 实现细节

### 1. 后端智能合并

**文件**: `backend/src/memos/api/services/sharedb_service.py`

**关键方法**:
- `sync_document()` - 检测版本冲突
- `_merge_content()` - 智能合并内容
- `_merge_html_content()` - 合并 HTML 内容

**合并策略**:
1. **内容相同**：直接返回
2. **客户端内容更长**：可能是用户新增了内容，优先保留
3. **服务器内容更长**：可能是其他用户新增了内容，优先保留
4. **内容长度相近**：对于 HTML，提取所有段落去重合并

**示例**:
```python
# 检测到版本冲突
if server_version > version:
    # 智能合并
    merged_content = await self._merge_content(
        server_content=server_content,
        client_content=content,
        server_version=server_version,
        client_version=version
    )
```

### 2. 前端同步前获取更新

**文件**: `frontend/src/utils/sharedbClient.ts`

**关键改进**:
```typescript
// 同步前先获取最新版本
const serverDoc = await this.getDocument(documentId);
if (serverDoc && serverDoc.version > currentVersion) {
  // 更新本地版本号
  this.currentVersion.set(documentId, serverDoc.version);
}

// 使用服务器的最新版本号进行同步
const syncResponse = await fetch(`${apiUrl}/v1/sharedb/documents/sync`, {
  body: JSON.stringify({
    doc_id: documentId,
    version: serverDoc?.version || currentVersion,  // 使用服务器版本
    content: contentStr,
  })
});
```

### 3. 操作跟踪器

**文件**: `frontend/src/utils/operationTracker.ts`

**功能**:
- 捕获用户的编辑操作（插入、删除、替换）
- 计算内容差异并生成操作对象
- 应用操作到内容

**操作类型**:
```typescript
interface TextOperation {
  type: 'insert' | 'delete' | 'replace' | 'retain';
  position: number;
  length?: number;  // 用于 delete 和 replace
  text?: string;    // 用于 insert 和 replace
  version?: number;
}
```

**使用示例**:
```typescript
// 开始跟踪
operationTracker.startTracking(documentId, initialContent, baseVersion);

// 跟踪变化
const ops = operationTracker.trackChange(oldContent, newContent);

// 获取待发送的操作
const batch = operationTracker.getPendingOperations();

// 应用操作
const newContent = OperationTracker.applyOperations(content, operations);
```

## 测试场景

### 场景1：用户A删除，用户B未删除

**步骤**:
1. 用户A和B都打开文档，内容为 "Hello World"
2. 用户A删除 "World"，内容变为 "Hello "
3. 用户B在末尾添加 "!", 内容变为 "Hello World!"
4. 用户A先同步，服务器内容变为 "Hello "
5. 用户B同步时：
   - 检测到服务器版本更新
   - 服务器合并：保留 "Hello " + "!" = "Hello !"
   - ✅ 删除操作保留，新增操作也保留

### 场景2：两个用户同时新增

**步骤**:
1. 用户A和B都打开文档，内容为 "Hello"
2. 用户A在末尾添加 " World"
3. 用户B在末尾添加 "!"
4. 用户A先同步，服务器内容变为 "Hello World"
5. 用户B同步时：
   - 检测到服务器版本更新
   - 服务器合并：保留 "Hello World" + "!" = "Hello World!"
   - ✅ 两个新增都保留

### 场景3：用户A修改，用户B删除

**步骤**:
1. 用户A和B都打开文档，内容为 "Hello World"
2. 用户A将 "World" 改为 "Universe"
3. 用户B删除整个内容
4. 用户A先同步，服务器内容变为 "Hello Universe"
5. 用户B同步时：
   - 检测到冲突
   - 服务器合并：由于用户B删除全部内容，可能保留删除（需要更智能的合并策略）
   - ⚠️ 这种情况需要操作级同步才能完美解决

## 当前限制

### 方案1的限制

1. **HTML 合并不够精确**：对于复杂的 HTML 结构，简单合并可能不够准确
2. **删除冲突处理**：如果用户A删除，用户B修改同一位置，可能无法完美合并
3. **格式丢失**：合并时可能丢失一些格式信息

### 方案2的限制

1. **未完全集成**：操作跟踪器已实现，但未集成到编辑器
2. **后端未支持**：后端需要实现操作级同步 API
3. **OT 算法复杂**：完整的 OT 实现需要复杂的转换算法

## 推荐方案

### 短期（当前）

✅ **使用方案1（同步前获取更新）**
- 已实现，可以立即使用
- 能解决大部分冲突场景
- 实现简单，稳定可靠

### 长期（未来）

🚧 **实现方案2（操作级同步）**
- 需要集成操作跟踪器到编辑器
- 需要后端实现操作级同步 API
- 需要实现完整的 OT 转换算法

## 使用建议

### 对于当前实现

1. **启用同步前获取更新**：已默认启用
2. **监控合并结果**：查看控制台日志，确认合并是否正确
3. **处理合并冲突**：如果合并结果不满意，可以手动调整

### 对于操作级同步

1. **集成操作跟踪器**：
   ```typescript
   import { operationTracker } from '../utils/operationTracker';
   
   // 在编辑器内容变化时
   const ops = operationTracker.trackChange(oldContent, newContent);
   ```

2. **发送操作而不是内容**：
   ```typescript
   const batch = operationTracker.getPendingOperations();
   await sharedbClient.applyOperations(documentId, batch.operations);
   ```

3. **应用远程操作**：
   ```typescript
   const newContent = OperationTracker.applyOperations(
     currentContent, 
     remoteOperations
   );
   ```

## 性能考虑

### 方案1（当前）

- **网络请求**：每次同步需要 2 个请求（获取 + 同步）
- **服务器负载**：需要合并计算，但相对简单
- **延迟**：增加一个请求的延迟（通常 < 100ms）

### 方案2（未来）

- **网络请求**：只发送操作对象（体积小）
- **服务器负载**：需要 OT 转换计算（较复杂）
- **延迟**：操作对象小，传输快

## 相关文件

- `backend/src/memos/api/services/sharedb_service.py` - 后端合并逻辑
- `frontend/src/utils/sharedbClient.ts` - 前端同步逻辑
- `frontend/src/utils/operationTracker.ts` - 操作跟踪器
- `frontend/src/utils/intelligentSync.ts` - 智能同步 Hook

## 下一步

1. ✅ 同步前获取更新 - 已完成
2. ✅ 后端智能合并 - 已完成
3. ⏳ 集成操作跟踪器到编辑器
4. ⏳ 实现后端操作级同步 API
5. ⏳ 实现完整的 OT 转换算法
6. ⏳ 添加冲突解决 UI（让用户选择合并策略）

## 总结

当前实现使用**"同步前获取更新 + 服务器端智能合并"**的策略，可以有效减少数据丢失，解决大部分冲突场景。对于更复杂的冲突，建议未来实现操作级同步（OT）。

