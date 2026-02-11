/**
 * 版本冲突解决集成示例
 * 展示如何在编辑器页面中集成版本冲突解决功能
 */

import React, { useState, useEffect } from 'react';
import VersionConflictModal, { type VersionConflictInfo, type ConflictResolution } from './VersionConflictModal';
import { versionConflictManager } from '../../utils/versionConflictManager';

/**
 * 在编辑器组件中使用示例：
 * 
 * function NovelEditorPage() {
 *   const [conflictInfo, setConflictInfo] = useState<VersionConflictInfo | null>(null);
 *   const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
 *   const documentId = 'work_xxx_chapter_yyy';
 * 
 *   useEffect(() => {
 *     // 注册冲突处理回调
 *     versionConflictManager.registerConflictHandler(documentId, async (info) => {
 *       return new Promise((resolve) => {
 *         setConflictInfo(info);
 *         setIsConflictModalOpen(true);
 *         
 *         // 存储 resolve 函数，供模态框回调使用
 *         (window as any).__conflictResolver = resolve;
 *       });
 *     });
 * 
 *     return () => {
 *       // 清理：取消注册
 *       versionConflictManager.unregisterConflictHandler(documentId);
 *       delete (window as any).__conflictResolver;
 *     };
 *   }, [documentId]);
 * 
 *   const handleConflictResolve = (resolution: ConflictResolution) => {
 *     setIsConflictModalOpen(false);
 *     const resolver = (window as any).__conflictResolver;
 *     if (resolver) {
 *       resolver(resolution);
 *       delete (window as any).__conflictResolver;
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       {/* 编辑器内容 */}
 *       <VersionConflictModal
 *         isOpen={isConflictModalOpen}
 *         conflictInfo={conflictInfo}
 *         onResolve={handleConflictResolve}
 *         onClose={() => {
 *           setIsConflictModalOpen(false);
 *           const resolver = (window as any).__conflictResolver;
 *           if (resolver) {
 *             resolver('cancel');
 *             delete (window as any).__conflictResolver;
 *           }
 *         }}
 *       />
 *     </div>
 *   );
 * }
 */

// 更优雅的实现方式：使用 React Hook
export function useVersionConflictResolver(documentId: string) {
  const [conflictInfo, setConflictInfo] = useState<VersionConflictInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [resolvePromise, setResolvePromise] = useState<((resolution: ConflictResolution) => void) | null>(null);

  useEffect(() => {
    const handler = async (info: VersionConflictInfo): Promise<ConflictResolution> => {
      return new Promise((resolve) => {
        setConflictInfo(info);
        setIsOpen(true);
        setResolvePromise(() => resolve);
      });
    };

    versionConflictManager.registerConflictHandler(documentId, handler);

    return () => {
      versionConflictManager.unregisterConflictHandler(documentId);
    };
  }, [documentId]);

  const handleResolve = (resolution: ConflictResolution) => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(resolution);
      setResolvePromise(null);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise('cancel');
      setResolvePromise(null);
    }
  };

  return {
    conflictInfo,
    isOpen,
    onResolve: handleResolve,
    onClose: handleClose,
  };
}
