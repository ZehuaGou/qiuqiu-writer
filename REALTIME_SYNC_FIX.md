# 实时同步修复说明

## 问题描述

两个浏览器无法实时同步文档内容。

## 问题原因

1. **前端未订阅文档**：虽然连接了 WebSocket，但没有发送订阅消息
2. **后端 WebSocket 未实现文档订阅**：WebSocket 端点只是简单的 echo 服务器
3. **前端未处理 WebSocket 更新消息**：收到更新消息后没有应用到编辑器

## 修复内容

### 1. 后端 WebSocket 端点增强

**文件**: `backend/src/memos/api/ai_api.py`

**改动**:
- 实现文档订阅功能
- 调用 `sharedb_service.join_collaboration()` 加入协作会话
- 支持 `subscribe` 和 `unsubscribe` 消息类型

**关键代码**:
```python
elif message_type == "subscribe":
    document_id = message.get("document_id")
    user_id = message.get("user_id")
    await sharedb_service.join_collaboration(
        websocket=websocket,
        document_id=document_id,
        user_id=user_id or 0
    )
```

### 2. 前端 ShareDBClient 增强

**文件**: `frontend/src/utils/sharedbClient.ts`

**新增功能**:
- `subscribe(documentId, userId)` - 订阅文档更新
- `unsubscribe()` - 取消订阅
- `onDocumentUpdate(documentId, callback)` - 监听文档更新
- 改进 `handleMessage()` - 处理文档更新消息

**关键代码**:
```typescript
subscribe(documentId: string, userId?: number): void {
  this.ws.send(JSON.stringify({
    type: 'subscribe',
    document_id: documentId,
    user_id: userId
  }));
}
```

### 3. 智能同步 Hook 增强

**文件**: `frontend/src/utils/intelligentSync.ts`

**改动**:
- 自动订阅文档的 WebSocket 更新
- 处理 WebSocket 收到的文档更新消息
- 在用户未编辑时自动应用更新
- 轮询作为备用方案（间隔加倍）

**关键代码**:
```typescript
// 订阅文档的 WebSocket 更新
useEffect(() => {
  sharedbClient.subscribe(documentId);
  const unsubscribe = sharedbClient.onDocumentUpdate(documentId, (content, version) => {
    // 处理更新...
  });
  return () => unsubscribe();
}, [documentId]);
```

## 工作流程

### 实时同步流程

1. **用户A编辑文档**
   - 内容保存到本地缓存
   - 调用 `/v1/sharedb/documents/sync` API
   - 后端更新 Redis 中的文档
   - 后端广播更新给所有订阅该文档的 WebSocket 客户端

2. **用户B收到更新**
   - WebSocket 收到 `document_synced` 消息
   - 检查用户是否正在编辑
   - 如果未编辑，立即应用更新
   - 如果正在编辑，标记有协作更新

### WebSocket 消息类型

**客户端 → 服务器**:
- `subscribe` - 订阅文档
- `unsubscribe` - 取消订阅
- `ping` - 心跳检测

**服务器 → 客户端**:
- `connected` - 连接成功
- `subscribed` - 订阅成功
- `document_synced` - 文档已同步（实时更新）
- `document_updated` - 文档已更新
- `pong` - 心跳响应

## 测试方法

### 1. 打开两个浏览器窗口

- 窗口A: `http://localhost:5173/novel-editor?workId=4`
- 窗口B: `http://localhost:5173/novel-editor?workId=4`

### 2. 选择同一个章节

两个窗口都选择同一个章节（例如：章节6）

### 3. 在窗口A中编辑

在窗口A中输入内容，应该看到：
- 控制台输出：`[ShareDB] 已订阅文档: work_4_chapter_6`
- 控制台输出：`[IntelligentSync] 同步成功`

### 4. 检查窗口B

在窗口B中应该看到：
- 控制台输出：`[ShareDB] 收到消息: document_synced`
- 控制台输出：`[IntelligentSync] 收到 WebSocket 文档更新`
- 编辑器内容自动更新（如果用户B未在编辑）

### 5. 验证实时性

- 在窗口A中输入内容
- 窗口B应该在 1-2 秒内看到更新（无需等待轮询）

## 调试技巧

### 检查 WebSocket 连接

打开浏览器控制台，查看：
```
✅ ShareDB 连接成功
📡 [ShareDB] 已订阅文档: work_4_chapter_6
```

### 检查消息接收

查看控制台输出：
```
📨 [ShareDB] 收到消息: document_synced
🔄 [ShareDB] 收到文档更新: { docId: 'work_4_chapter_6', version: 4 }
```

### 检查后端日志

查看后端日志：
```
WebSocket 连接已建立
客户端订阅文档: work_4_chapter_6
文档 work_4_chapter_6 已同步，版本: 4
```

## 故障排查

### 问题1: WebSocket 未连接

**症状**: 控制台没有 "ShareDB 连接成功" 消息

**解决**:
1. 检查后端服务是否运行
2. 检查 WebSocket URL 是否正确（默认: `ws://localhost:8001/ws`）
3. 检查防火墙/代理设置

### 问题2: 未订阅文档

**症状**: 控制台没有 "已订阅文档" 消息

**解决**:
1. 检查 `documentId` 是否正确
2. 检查 WebSocket 连接状态
3. 手动调用 `sharedbClient.subscribe(documentId)`

### 问题3: 收到更新但未应用

**症状**: 控制台显示收到更新，但编辑器未更新

**解决**:
1. 检查 `updateContent` 函数是否正确实现
2. 检查用户是否正在编辑（编辑时会延迟应用）
3. 检查编辑器实例是否正确

### 问题4: 两个浏览器不同步

**症状**: 一个浏览器编辑，另一个看不到

**解决**:
1. 确认两个浏览器都订阅了同一个文档ID
2. 检查后端日志，确认广播是否发送
3. 检查 WebSocket 连接是否都正常
4. 检查版本号是否正确递增

## 性能优化

### 当前实现

- **WebSocket**: 主要同步方式，实时更新
- **轮询**: 备用方案，每 20 秒检查一次（间隔加倍）

### 建议优化

1. **减少轮询频率**: 如果 WebSocket 正常，可以完全禁用轮询
2. **增量更新**: 对于大文档，只传输变更部分
3. **批量更新**: 合并短时间内的多个更新

## 相关文件

- `backend/src/memos/api/ai_api.py` - WebSocket 端点
- `backend/src/memos/api/services/sharedb_service.py` - ShareDB 服务
- `frontend/src/utils/sharedbClient.ts` - ShareDB 客户端
- `frontend/src/utils/intelligentSync.ts` - 智能同步 Hook
- `frontend/src/pages/NovelEditorPage.tsx` - 编辑器页面

## 注意事项

1. **用户编辑检测**: 如果用户正在编辑（5秒内有输入），更新会延迟应用
2. **版本冲突**: 版本号始终递增，避免冲突
3. **网络断开**: WebSocket 断开后会自动重连
4. **多文档**: 每个文档需要单独订阅

## 下一步

1. ✅ WebSocket 实时同步 - 已完成
2. ⏳ 操作级同步（增量更新）- 待实现
3. ⏳ 冲突解决 UI - 待实现
4. ⏳ 用户在线状态显示 - 待实现

