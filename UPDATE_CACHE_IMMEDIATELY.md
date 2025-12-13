# 拉取更新后立即更新前端缓存

## 问题描述

在拉取更新后，需要立即更新前端的缓存信息（`currentVersion` 和 `currentContent`），确保后续操作基于最新的数据。

## 已修复的问题

### 1. 同步时立即更新缓存 ✅

**位置**: `frontend/src/utils/sharedbClient.ts` - `syncDocumentState` 方法

**修复**：
- 当检测到服务器版本更新时，立即更新 `currentVersion` 和 `currentContent`
- 当检测到并发修改时，也立即更新缓存

**代码**:
```typescript
if (serverVersion > currentVersion) {
  // 关键修复：立即更新前端缓存信息
  this.currentVersion.set(documentId, serverVersion);
  this.currentContent.set(documentId, serverContent);
  console.log('✅ [同步] 已更新前端缓存:', {
    version: serverVersion,
    contentLength: serverContent.length
  });
  
  // 使用服务器内容作为baseContent
  baseContent = serverContent;
}
```

### 2. 轮询时立即更新缓存 ✅

**位置**: `frontend/src/utils/intelligentSync.ts` - `pollForUpdates` 方法

**修复**：
- 当轮询检测到新版本时，立即更新 `sharedbClient` 的缓存
- 确保后续操作基于最新的数据

**代码**:
```typescript
if (serverVersion > currentVersion) {
  const serverContent = typeof serverDoc.content === 'string' 
    ? serverDoc.content 
    : JSON.stringify(serverDoc.content);
  
  // 关键修复：立即更新 sharedbClient 的缓存
  sharedbClient.currentVersion.set(documentId, serverVersion);
  sharedbClient.currentContent.set(documentId, serverContent);
  console.log('✅ [IntelligentSync] 已更新 sharedbClient 缓存:', {
    version: serverVersion,
    contentLength: serverContent.length
  });
}
```

### 3. WebSocket 更新时立即更新缓存 ✅

**位置**: `frontend/src/utils/sharedbClient.ts` - `handleMessage` 方法

**状态**：
- 已经实现：当收到 `document_synced` 消息时，立即更新缓存
- 代码已经正确更新 `currentVersion` 和 `currentContent`

**代码**:
```typescript
case 'document_synced':
  if (content !== undefined) {
    // 使用完整内容更新
    this.currentVersion.set(docId, version);
    this.currentContent.set(docId, content);
    // 通知回调...
  }
```

### 4. 公开缓存属性 ✅

**位置**: `frontend/src/utils/sharedbClient.ts`

**修复**：
- 将 `currentVersion` 和 `currentContent` 改为 `public`
- 允许外部直接访问和更新缓存

**代码**:
```typescript
// 公开缓存，允许外部访问和更新
public currentVersion: Map<string, number> = new Map();
public currentContent: Map<string, string> = new Map();
```

## 更新缓存的时机

### 1. 同步前拉取更新时

- **时机**：在 `syncDocumentState` 中，获取服务器文档后
- **条件**：`serverVersion > currentVersion`
- **操作**：立即更新 `currentVersion` 和 `currentContent`

### 2. 轮询检测到更新时

- **时机**：在 `pollForUpdates` 中，检测到新版本后
- **条件**：`serverVersion > currentVersion`
- **操作**：立即更新 `sharedbClient.currentVersion` 和 `sharedbClient.currentContent`

### 3. WebSocket 收到更新时

- **时机**：在 `handleMessage` 中，收到 `document_synced` 消息后
- **条件**：有 `content` 数据
- **操作**：立即更新 `currentVersion` 和 `currentContent`

### 4. 同步成功后

- **时机**：在 `syncDocumentState` 中，收到服务器响应后
- **条件**：`response.success === true`
- **操作**：更新为服务器返回的合并后的版本和内容

## 工作流程

```
1. 拉取更新（getDocument / fetchFromServer）
   ↓
2. 检测到服务器版本更新
   ↓
3. 立即更新缓存（currentVersion, currentContent）
   ↓
4. 使用更新后的缓存进行后续操作
   ↓
5. 同步时使用最新的 baseContent
```

## 关键改进点

1. **立即更新**：拉取更新后立即更新缓存，不等待同步完成
2. **多处更新**：在所有拉取更新的地方都更新缓存
3. **公开访问**：缓存属性改为 public，允许外部访问
4. **日志记录**：添加日志，便于调试

## 测试验证

### 测试1：同步前拉取更新

1. 用户A正在编辑
2. 用户B同步，服务器版本变成 3
3. 用户A同步时：
   - 拉取更新，检测到版本 3
   - **预期**：立即更新缓存为版本 3
   - **验证**：查看日志 "✅ [同步] 已更新前端缓存"

### 测试2：轮询检测到更新

1. 用户A正在编辑
2. 用户B同步，服务器版本变成 3
3. 用户A的轮询检测到更新：
   - **预期**：立即更新 `sharedbClient` 缓存
   - **验证**：查看日志 "✅ [IntelligentSync] 已更新 sharedbClient 缓存"

### 测试3：WebSocket 收到更新

1. 用户A正在编辑
2. 用户B同步，服务器广播更新
3. 用户A收到 WebSocket 消息：
   - **预期**：立即更新缓存
   - **验证**：查看日志 "🔄 [ShareDB] 收到文档更新"

## 相关文件

- `frontend/src/utils/sharedbClient.ts` - ShareDB 客户端（已修复）
- `frontend/src/utils/intelligentSync.ts` - 智能同步 Hook（已修复）

