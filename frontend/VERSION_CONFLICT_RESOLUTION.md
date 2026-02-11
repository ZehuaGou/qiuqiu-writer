# 版本冲突解决功能

## 功能概述

当检测到本地版本和线上版本不一致时，系统会自动弹出冲突解决对话框，允许用户选择如何处理冲突。

## 功能特性

1. **自动冲突检测**：在同步文档时自动检测版本冲突
2. **可视化对比**：显示本地版本和线上版本的统计信息（字符数、词数、行数）
3. **内容预览**：可以预览两个版本的内容
4. **三种解决方式**：
   - **保留本地版本**：使用本地版本覆盖线上版本
   - **保留线上版本**：使用线上版本覆盖本地版本
   - **自动合并**：智能合并两个版本的内容

## 使用方法

### 1. 在编辑器页面中集成

```tsx
import React, { useEffect } from 'react';
import VersionConflictModal from './components/editor/VersionConflictModal';
import { versionConflictManager } from './utils/versionConflictManager';
import { useVersionConflictResolver } from './components/editor/VersionConflictIntegration.example';

function NovelEditorPage() {
  const documentId = 'work_xxx_chapter_yyy';
  
  // 使用 Hook 简化集成
  const conflictResolver = useVersionConflictResolver(documentId);
  
  return (
    <div>
      {/* 编辑器内容 */}
      
      {/* 冲突解决对话框 */}
      <VersionConflictModal
        isOpen={conflictResolver.isOpen}
        conflictInfo={conflictResolver.conflictInfo}
        onResolve={conflictResolver.onResolve}
        onClose={conflictResolver.onClose}
      />
    </div>
  );
}
```

### 2. 手动集成（不使用 Hook）

```tsx
import React, { useState, useEffect } from 'react';
import VersionConflictModal, { type VersionConflictInfo, type ConflictResolution } from './components/editor/VersionConflictModal';
import { versionConflictManager } from './utils/versionConflictManager';

function NovelEditorPage() {
  const [conflictInfo, setConflictInfo] = useState<VersionConflictInfo | null>(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const documentId = 'work_xxx_chapter_yyy';

  useEffect(() => {
    // 注册冲突处理回调
    const handler = async (info: VersionConflictInfo): Promise<ConflictResolution> => {
      return new Promise((resolve) => {
        setConflictInfo(info);
        setIsConflictModalOpen(true);
        
        // 存储 resolve 函数
        (window as any).__conflictResolver = resolve;
      });
    };

    versionConflictManager.registerConflictHandler(documentId, handler);

    return () => {
      // 清理：取消注册
      versionConflictManager.unregisterConflictHandler(documentId);
      delete (window as any).__conflictResolver;
    };
  }, [documentId]);

  const handleConflictResolve = (resolution: ConflictResolution) => {
    setIsConflictModalOpen(false);
    const resolver = (window as any).__conflictResolver;
    if (resolver) {
      resolver(resolution);
      delete (window as any).__conflictResolver;
    }
  };

  return (
    <div>
      {/* 编辑器内容 */}
      
      <VersionConflictModal
        isOpen={isConflictModalOpen}
        conflictInfo={conflictInfo}
        onResolve={handleConflictResolve}
        onClose={() => {
          setIsConflictModalOpen(false);
          const resolver = (window as any).__conflictResolver;
          if (resolver) {
            resolver('cancel');
            delete (window as any).__conflictResolver;
          }
        }}
      />
    </div>
  );
}
```

## 工作原理

### 冲突检测流程

1. **同步时检测**：在 `documentCache.syncDocumentState()` 中，当服务器返回成功但版本号或内容不一致时，触发冲突检测
2. **获取远程内容**：从服务器获取最新的文档内容
3. **创建冲突信息**：构建 `VersionConflictInfo` 对象，包含本地和远程版本的信息
4. **调用冲突管理器**：通过 `versionConflictManager.resolveConflict()` 触发用户交互
5. **用户选择**：用户通过对话框选择解决方式
6. **执行解决**：根据用户选择执行相应的操作

### 解决方式说明

#### 1. 保留本地版本 (`keep_local`)
- 使用本地内容覆盖服务器内容
- 重新发送同步请求，使用服务器版本号
- 如果后端支持 `force` 标志，会使用强制覆盖

#### 2. 保留线上版本 (`keep_remote`)
- 使用服务器内容覆盖本地内容
- 更新本地缓存为服务器版本
- 编辑器会自动更新显示

#### 3. 自动合并 (`merge`)
- 使用服务器返回的合并结果（后端已自动合并）
- 更新本地缓存为合并后的内容
- 这是默认的处理方式

#### 4. 取消 (`cancel`)
- 取消冲突解决
- 保持当前状态不变
- 可能需要用户手动处理

## 文件结构

```
frontend/src/
├── components/editor/
│   ├── VersionConflictModal.tsx          # 冲突解决对话框组件
│   ├── VersionConflictModal.css           # 样式文件
│   └── VersionConflictIntegration.example.tsx  # 集成示例
├── utils/
│   ├── versionConflictManager.ts         # 冲突管理器
│   └── documentCache.ts                  # 文档缓存（已集成冲突检测）
└── types/
    └── document.ts                        # 类型定义
```

## 注意事项

1. **确保注册和清理**：在组件挂载时注册冲突处理器，在卸载时清理
2. **文档ID一致性**：确保使用的 `documentId` 与同步时使用的 ID 一致
3. **异步处理**：冲突解决是异步的，需要等待用户选择
4. **错误处理**：如果冲突解决失败，会回退到使用服务器合并结果

## 未来改进

1. **差异高亮**：显示两个版本的具体差异
2. **合并预览**：在合并前预览合并结果
3. **冲突历史**：记录冲突解决历史
4. **自动合并策略**：更智能的自动合并算法
