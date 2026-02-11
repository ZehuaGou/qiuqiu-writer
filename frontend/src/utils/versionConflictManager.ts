/**
 * 版本冲突管理器
 * 处理本地版本和线上版本的冲突检测和解决
 */

import type { VersionConflictInfo, ConflictResolution } from '../components/editor/VersionConflictModal';

export type ConflictCallback = (conflictInfo: VersionConflictInfo) => Promise<ConflictResolution>;

class VersionConflictManager {
  private conflictCallbacks: Map<string, ConflictCallback> = new Map();
  private pendingConflicts: Map<string, Promise<ConflictResolution>> = new Map();

  /**
   * 注册冲突解决回调
   * @param documentId 文档ID
   * @param callback 冲突解决回调函数
   */
  registerConflictHandler(documentId: string, callback: ConflictCallback): void {
    this.conflictCallbacks.set(documentId, callback);
  }

  /**
   * 取消注册冲突解决回调
   * @param documentId 文档ID
   */
  unregisterConflictHandler(documentId: string): void {
    this.conflictCallbacks.delete(documentId);
    this.pendingConflicts.delete(documentId);
  }

  /**
   * 检测并解决冲突
   * @param conflictInfo 冲突信息
   * @returns 解决方式
   */
  async resolveConflict(conflictInfo: VersionConflictInfo): Promise<ConflictResolution> {
    const { documentId } = conflictInfo;

    // 如果已经有正在处理的冲突，等待它完成
    const pending = this.pendingConflicts.get(documentId);
    if (pending) {
      return pending;
    }

    // 创建新的冲突解决 Promise
    const resolutionPromise = (async (): Promise<ConflictResolution> => {
      try {
        const callback = this.conflictCallbacks.get(documentId);
        if (callback) {
          const resolution = await callback(conflictInfo);
          return resolution;
        } else {
          // 如果没有注册回调，默认使用自动合并
          console.warn(`[VersionConflictManager] 未找到冲突处理回调，使用默认合并策略: ${documentId}`);
          return 'merge';
        }
      } finally {
        // 解决完成后清除待处理的冲突
        this.pendingConflicts.delete(documentId);
      }
    })();

    this.pendingConflicts.set(documentId, resolutionPromise);
    return resolutionPromise;
  }

  /**
   * 检查是否有待处理的冲突
   */
  hasPendingConflict(documentId: string): boolean {
    return this.pendingConflicts.has(documentId);
  }

  /**
   * 清除所有冲突处理
   */
  clear(): void {
    this.conflictCallbacks.clear();
    this.pendingConflicts.clear();
  }
}

export const versionConflictManager = new VersionConflictManager();
