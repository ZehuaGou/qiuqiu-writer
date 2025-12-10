/**
 * 同步管理器
 * 处理离线/在线状态、同步队列、冲突解决
 */

import { localCacheManager } from './localCacheManager';
import { sharedbClient } from './sharedbClient';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
  error: string | null;
}

export interface SyncOptions {
  retryAttempts?: number;
  retryDelay?: number;
  batchSize?: number;
}

const DEFAULT_OPTIONS: Required<SyncOptions> = {
  retryAttempts: 3,
  retryDelay: 1000,
  batchSize: 10,
};

class SyncManager {
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private statusCallbacks: Set<(status: SyncStatus) => void> = new Set();
  private lastSyncTime: number | null = null;
  private error: string | null = null;
  private options: Required<SyncOptions>;

  constructor(options: SyncOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.setupNetworkListeners();
    this.startSyncTimer();
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: localCacheManager.getPendingSyncKeys().length,
      lastSyncTime: this.lastSyncTime,
      error: this.error,
    };
  }

  /**
   * 监听状态变化
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * 手动触发同步
   */
  async sync(force: boolean = false): Promise<void> {
    if (this.isSyncing && !force) {
      return;
    }

    if (!this.isOnline) {
      this.error = '网络未连接';
      this.notifyStatusChange();
      return;
    }

    this.isSyncing = true;
    this.error = null;
    this.notifyStatusChange();

    try {
      const pendingKeys = localCacheManager.getPendingSyncKeys();
      
      if (pendingKeys.length === 0) {
        this.isSyncing = false;
        this.notifyStatusChange();
        return;
      }

      // 批量同步
      await this.syncBatch(pendingKeys.slice(0, this.options.batchSize));

      this.lastSyncTime = Date.now();
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : '同步失败';
      console.error('同步失败:', error);
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
  }

  /**
   * 同步单个文档
   */
  async syncDocument(documentId: string): Promise<void> {
    if (!this.isOnline) {
      return;
    }

    try {
      const cached = await localCacheManager.get(documentId);
      if (!cached || !cached.pendingChanges) {
        return;
      }

      // 根据文档类型选择同步方式
      if (documentId.startsWith('chapter_')) {
        await this.syncChapterDocument(documentId, cached);
      } else {
        await this.syncGenericDocument(documentId, cached);
      }

      localCacheManager.markAsSynced(documentId);
    } catch (error) {
      console.error(`同步文档 ${documentId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 解决冲突（使用最后写入获胜策略）
   */
  async resolveConflict(
    documentId: string,
    localVersion: number,
    remoteVersion: number
  ): Promise<void> {
    // 获取本地和远程文档
    const localDoc = await localCacheManager.get(documentId);
    
    // 如果远程版本更新，使用远程版本
    if (remoteVersion > localVersion) {
      // 从服务器获取最新版本
      const remoteDoc = await sharedbClient.getDocument(documentId);
      if (remoteDoc) {
        await localCacheManager.set(documentId, remoteDoc, remoteDoc.version || remoteVersion);
      }
    } else {
      // 本地版本更新，同步到服务器
      await this.syncDocument(documentId);
    }
  }

  /**
   * 预加载文档（智能预测）
   */
  async preloadDocuments(documentIds: string[]): Promise<void> {
    // 预加载到内存缓存
    await localCacheManager.preload(documentIds);

    // 如果在线，预取可能访问的文档
    if (this.isOnline) {
      for (const docId of documentIds) {
        try {
          await sharedbClient.getDocument(docId);
        } catch (error) {
          console.error(`预加载文档 ${docId} 失败:`, error);
        }
      }
    }
  }

  /**
   * 清理同步队列
   */
  clearSyncQueue(): void {
    // 这里可以添加清理逻辑
  }

  /**
   * 销毁同步管理器
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  // ========== 私有方法 ==========

  private setupNetworkListeners(): void {
    this.handleOnline = () => {
      this.isOnline = true;
      this.error = null;
      this.notifyStatusChange();
      // 网络恢复后立即同步
      this.sync().catch(console.error);
    };

    this.handleOffline = () => {
      this.isOnline = false;
      this.error = '网络已断开';
      this.notifyStatusChange();
    };

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private handleOnline = () => {};
  private handleOffline = () => {};

  private startSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // 每 5 秒检查一次待同步项
    this.syncTimer = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.sync().catch(console.error);
      }
    }, 5000);
  }

  private async syncBatch(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(
      keys.map(key => this.syncDocument(key))
    );

    // 检查是否有失败
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`${failures.length} 个文档同步失败`);
    }
  }

  private async syncChapterDocument(
    documentId: string,
    cached: any
  ): Promise<void> {
    const content = cached.data?.content || cached.content;
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    // 使用新的同步方法（借鉴 nexcode_web 的实现）
    // 这会自动处理版本控制和冲突解决
    await sharedbClient.syncDocumentState(documentId, contentStr);
  }

  private async syncGenericDocument(
    documentId: string,
    cached: any
  ): Promise<void> {
    const content = cached.data || cached;
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    // 使用新的同步方法
    await sharedbClient.syncDocumentState(documentId, contentStr);
  }

  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusCallbacks.forEach(callback => callback(status));
  }
}

// 导出单例
export const syncManager = new SyncManager();

