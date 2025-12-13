# 断线重连后合并本地更改

## 问题描述

断线重连后，会将本地未上传的更改直接覆盖掉。需要实现：将本地缓存中的文本传递给后端，让后端合并后发送给多端。

## 解决方案

实现断线重连同步机制：
1. **断线时**：保存所有有本地缓存的文档状态
2. **重连时**：将本地缓存中的文本传递给后端，让后端合并
3. **后端合并**：根据 base_version 和 base_content 进行差异合并
4. **广播更新**：后端合并后，通过 WebSocket 广播给所有连接的客户端

## 实现细节

### 1. 断线时保存离线状态 ✅

**位置**: `frontend/src/utils/sharedbClient.ts` - `saveOfflineState` 方法

**功能**：
- 在 WebSocket 连接关闭时调用
- 遍历所有有本地缓存的文档
- 保存文档的内容、版本号和时间戳

**代码**:
```typescript
private saveOfflineState(): void {
  // 遍历所有有缓存的文档，保存其状态
  this.currentContent.forEach((content, documentId) => {
    const version = this.currentVersion.get(documentId) || 0;
    this.offlineDocuments.set(documentId, {
      content,
      version,
      timestamp: Date.now()
    });
  });
}
```

### 2. 重连时同步离线更改 ✅

**位置**: `frontend/src/utils/sharedbClient.ts` - `syncOfflineChanges` 方法

**功能**：
- 在 WebSocket 连接成功后调用
- 遍历所有离线文档
- 对每个文档调用 `syncOfflineDocument` 进行合并

**代码**:
```typescript
private async syncOfflineChanges(): Promise<void> {
  // 遍历所有离线文档，逐个同步
  for (const [documentId, offlineState] of this.offlineDocuments.entries()) {
    await this.syncOfflineDocument(documentId, offlineState);
  }
  // 清空离线状态记录
  this.offlineDocuments.clear();
}
```

### 3. 同步单个离线文档 ✅

**位置**: `frontend/src/utils/sharedbClient.ts` - `syncOfflineDocument` 方法

**功能**：
- 获取服务器最新版本
- 如果服务器版本更新，使用差异合并
- 将本地离线内容与服务器内容合并
- 更新本地缓存并通知编辑器

**工作流程**:
```
1. 获取服务器最新版本
2. 比较服务器版本和离线版本
3. 如果服务器版本更新：
   - 使用离线时的内容作为 base_content
   - 使用当前本地内容作为 content
   - 发送给后端进行合并
4. 后端合并后返回结果
5. 更新本地缓存
6. 通知编辑器更新
```

### 4. 使用 base_content 同步 ✅

**位置**: `frontend/src/utils/sharedbClient.ts` - `syncDocumentStateWithBase` 方法

**功能**：
- 专门用于离线重连的同步方法
- 明确指定 `base_version` 和 `base_content`
- 让后端知道用户基于哪个版本做的更改

**代码**:
```typescript
body: JSON.stringify({
  doc_id: documentId,
  version: currentVersion,
  content: contentStr,
  base_version: baseVersion,  // 明确指定基于哪个版本
  base_content: baseContent,  // 明确指定基础内容
  create_version: false
})
```

## 工作流程

### 场景：用户A断线编辑，用户B在线编辑

1. **初始状态**：
   - 服务器版本：2
   - 内容：`<p>Hello</p><p>World</p>`

2. **用户A断线**：
   - 保存离线状态：版本 2，内容 `<p>Hello</p><p>World</p>`
   - 用户A继续编辑：`<p>Hello</p><p>World</p><p>Offline</p>`

3. **用户B在线编辑**：
   - 用户B同步：`<p>Hello</p><p>World</p><p>Online</p>`
   - 服务器版本：3

4. **用户A重连**：
   - 检测到离线更改
   - 获取服务器最新版本：3
   - 发送同步请求：
     - `base_version`: 2（离线时的版本）
     - `base_content`: `<p>Hello</p><p>World</p>`（离线时的内容）
     - `content`: `<p>Hello</p><p>World</p><p>Offline</p>`（当前本地内容）

5. **后端合并**：
   - 计算差异：从 `<p>Hello</p><p>World</p>` 到 `<p>Hello</p><p>World</p><p>Offline</p>`
   - 差异：新增 `<p>Offline</p>`
   - 应用到服务器内容：`<p>Hello</p><p>World</p><p>Online</p>`
   - 合并结果：`<p>Hello</p><p>World</p><p>Online</p><p>Offline</p>`

6. **后端广播**：
   - 通过 WebSocket 广播合并后的内容给所有客户端
   - 用户A和用户B都收到更新

7. **前端更新**：
   - 用户A：更新本地缓存和编辑器
   - 用户B：更新本地缓存和编辑器

## 关键改进点

1. **断线时保存状态**：
   - 记录所有有本地缓存的文档
   - 保存内容、版本号和时间戳

2. **重连时自动同步**：
   - 连接成功后立即同步离线更改
   - 不等待用户操作

3. **使用差异合并**：
   - 明确指定 base_version 和 base_content
   - 让后端知道用户基于哪个版本做的更改

4. **后端广播更新**：
   - 合并后通过 WebSocket 广播
   - 所有客户端都能收到更新

## 测试验证

### 测试1：断线编辑后重连

1. 用户A正在编辑：`<p>Hello</p>`
2. 断开网络连接
3. 用户A继续编辑：`<p>Hello</p><p>Offline</p>`
4. 用户B在线编辑：`<p>Hello</p><p>Online</p>`
5. 用户A重连网络
6. **预期**：
   - 用户A的离线更改被保留
   - 用户B的在线更改也被保留
   - 最终内容：`<p>Hello</p><p>Online</p><p>Offline</p>`

### 测试2：多个文档离线编辑

1. 用户A打开多个章节
2. 断开网络连接
3. 用户A编辑多个章节
4. 用户A重连网络
5. **预期**：
   - 所有离线编辑的章节都被同步
   - 每个章节都正确合并

## 调试方法

### 查看前端日志

**断线时**:
```
⚠️ [ShareDB] 连接关闭，保存离线状态
💾 [ShareDB] 保存离线状态
💾 [ShareDB] 保存离线文档状态: { documentId, version, contentLength }
```

**重连时**:
```
✅ [ShareDB] 连接成功
🔄 [ShareDB] 开始同步离线更改，文档数量: X
🔄 [ShareDB] 同步离线文档: { documentId, offlineVersion, offlineContentLength }
📥 [ShareDB] 服务器文档状态: { serverVersion, serverContentLength }
⚠️ [ShareDB] 检测到服务器版本更新，需要合并离线更改
✅ [ShareDB] 离线文档同步成功: { documentId, mergedVersion, mergedContentLength }
✅ [ShareDB] 离线更改同步完成
```

### 查看后端日志

```
使用基于差异的合并: base版本=X, base长度=Y, client长度=Z, server版本=W, server长度=V
✅ 差异合并完成，新版本: N, 合并后长度: M
```

## 相关文件

- `frontend/src/utils/sharedbClient.ts` - ShareDB 客户端（已实现）
- `backend/src/memos/api/services/sharedb_service.py` - 后端合并逻辑（已支持）
- `backend/src/memos/api/routers/sharedb_router.py` - API 路由（已支持 base_version）

