# 智能同步功能集成说明

## 概述

已成功将 `nexcode_web` 项目中的智能同步功能集成到 `NovelEditorPage` 中，提供了更稳定、高效的文档同步机制。

## 主要改进

### 1. 新增智能同步 Hook (`useIntelligentSync`)

位置：`frontend/src/utils/intelligentSync.ts`

**核心功能：**
- ✅ **防抖同步**：避免频繁请求，默认 1 秒防抖延迟
- ✅ **轮询更新**：定期检查服务器更新（默认 10 秒间隔）
- ✅ **冲突检测**：检测用户是否在编辑（5 秒窗口）
- ✅ **版本控制**：跟踪文档版本，自动处理冲突
- ✅ **自动同步**：用户停止编辑 2 秒后自动同步

### 2. 集成到 NovelEditorPage

**改动位置：**
- `frontend/src/pages/NovelEditorPage.tsx`

**主要变更：**

1. **导入智能同步 Hook**
   ```typescript
   import { useIntelligentSync } from '../utils/intelligentSync';
   ```

2. **在组件中使用智能同步**
   - 自动检测章节切换
   - 只在有章节选中时启用
   - 自动处理内容同步和冲突

3. **更新手动保存功能**
   - 使用 `forceSync()` 强制同步
   - 保持向后兼容，降级到传统同步方式

4. **自动保存优化**
   - 保留本地缓存优先策略
   - 智能同步在后台自动处理服务器同步
   - 减少不必要的网络请求

## 使用方式

### 自动同步

智能同步会自动工作，无需额外配置：

1. **用户编辑时**：内容自动保存到本地缓存
2. **停止编辑 2 秒后**：自动触发同步检查
3. **每 10 秒**：轮询检查服务器更新
4. **检测到协作更新**：自动合并或提示用户

### 手动保存

点击保存按钮会：
1. 立即保存到本地缓存
2. 强制同步到服务器（使用 `forceSync()`）

## 配置选项

智能同步支持以下配置（在 `useIntelligentSync` 中）：

```typescript
{
  syncDebounceDelay: 1000,      // 同步防抖延迟（毫秒）
  pollInterval: 10000,          // 轮询间隔（毫秒）
  userInputWindow: 5000,        // 用户输入检测窗口（毫秒）
  syncCheckInterval: 3000,      // 同步检查间隔（毫秒）
  enablePolling: true,          // 是否启用轮询
  onSyncSuccess: (content, version) => {},  // 同步成功回调
  onSyncError: (error) => {},              // 同步失败回调
  onCollaborativeUpdate: (hasUpdates) => {}, // 协作更新回调
  onContentChange: (synced) => {},         // 内容变化回调
}
```

## 优势

### 相比原有实现

1. **更智能的同步策略**
   - 自动检测用户编辑状态
   - 避免在用户编辑时覆盖内容
   - 智能处理冲突

2. **更好的性能**
   - 防抖机制减少请求频率
   - 轮询间隔可配置
   - 减少不必要的同步操作

3. **更好的用户体验**
   - 自动同步，无需手动操作
   - 协作更新检测
   - 同步状态实时反馈

4. **向后兼容**
   - 保留原有的本地缓存机制
   - 降级到传统同步方式
   - 不影响现有功能

## 技术细节

### 同步流程

1. **用户编辑** → 内容保存到本地缓存
2. **停止编辑 2 秒** → 触发同步检查
3. **同步检查** → 比较本地和服务器版本
4. **需要同步** → 调用 `sharedbClient.syncDocumentState()`
5. **检测到更新** → 合并或提示用户

### 冲突处理

- **用户正在编辑**：延迟应用协作更新
- **用户未编辑**：立即应用协作更新
- **版本冲突**：使用服务器最新版本

## 调试

### 查看同步日志

控制台会输出详细的同步日志：

```
✅ [智能同步] 同步成功: { version: 1, contentLength: 1234 }
👥 [智能同步] 检测到协作更新
📝 [智能同步] 内容变化，已同步: true
```

### 检查同步状态

可以通过 `getSyncStatus()` 获取同步状态：

```typescript
const status = getSyncStatus();
console.log('同步状态:', {
  isSyncing: status.isSyncing,
  lastSyncTime: status.lastSyncTime,
  hasPendingChanges: status.hasPendingChanges,
});
```

## 注意事项

1. **章节切换**：智能同步会自动检测章节切换，停止旧章节的同步
2. **网络断开**：同步失败时会自动重试，网络恢复后继续同步
3. **性能影响**：轮询间隔默认 10 秒，可根据需要调整
4. **内存使用**：智能同步会缓存版本信息，内存占用很小

## 后续优化建议

1. **添加同步状态 UI 指示器**
   - 显示同步中/已同步/同步失败状态
   - 显示最后同步时间
   - 显示协作更新提示

2. **优化轮询策略**
   - 根据网络状态动态调整轮询间隔
   - 在用户活跃时增加轮询频率

3. **增强冲突处理**
   - 提供冲突解决 UI
   - 支持手动选择合并策略

## 相关文件

- `frontend/src/utils/intelligentSync.ts` - 智能同步 Hook
- `frontend/src/utils/sharedbClient.ts` - ShareDB 客户端（已更新）
- `frontend/src/utils/syncManager.ts` - 同步管理器（已更新）
- `frontend/src/pages/NovelEditorPage.tsx` - 编辑器页面（已集成）

## 参考

- `nexcode_web/src/components/CollaborativeLexicalEditor.tsx` - 原始实现参考

