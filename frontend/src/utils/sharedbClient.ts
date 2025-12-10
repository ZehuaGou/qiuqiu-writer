/**
 * ShareDB 客户端封装
 * 处理文档的实时同步和协作
 */

import { localCacheManager, type CacheItem } from './localCacheManager';
import { chaptersApi } from './chaptersApi';

export interface ShareDBDocument {
  document_id: string;
  content: any;
  version?: number;
  metadata?: {
    work_id?: number;
    chapter_id?: number;
    chapter_number?: number;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
  };
}

export interface ShareDBOperation {
  op: any[];
  v?: number;
  meta?: any;
}

class ShareDBClient {
  private ws: WebSocket | null = null;
  private connection: any = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private wsUrl: string;
  private connected: boolean = false;
  private connectionCallbacks: Set<(connected: boolean) => void> = new Set();

  constructor(wsUrl?: string) {
    // 从环境变量或配置获取 WebSocket URL
    this.wsUrl = wsUrl || import.meta.env.VITE_SHAREDB_WS_URL || 'ws://localhost:8001/ws';
  }

  /**
   * 连接 ShareDB
   */
  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // 这里应该使用 ShareDB 客户端库
        // 为了简化，我们使用 WebSocket 直接连接
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log('ShareDB 连接成功');
          this.notifyConnectionChange(true);
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('ShareDB 连接错误:', error);
          this.connected = false;
          this.notifyConnectionChange(false);
          reject(error);
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.notifyConnectionChange(false);
          console.log('ShareDB 连接关闭');
          
          // 自动重连
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              this.connect().catch(console.error);
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.notifyConnectionChange(false);
  }

  /**
   * 获取文档（本地优先）
   */
  async getDocument(documentId: string): Promise<ShareDBDocument | null> {
    // 1. 先从本地缓存获取
    try {
      const cached = await localCacheManager.get<ShareDBDocument>(documentId);
      if (cached) {
        // 如果在线，异步检查更新
        if (this.connected) {
          this.syncDocument(documentId).catch(console.error);
        }
        
        // 处理不同的缓存格式
        let doc: ShareDBDocument | null = null;
        
        // 如果缓存项是 CacheItem 格式，提取 data
        if (cached && typeof cached === 'object') {
          if ('data' in cached && cached.data) {
            doc = cached.data as ShareDBDocument;
          } else if ('document_id' in cached) {
            // 如果直接是 ShareDBDocument
            doc = cached as ShareDBDocument;
          } else if ('content' in cached) {
            // 如果缓存的是内容对象
            doc = {
              document_id: documentId,
              content: (cached as any).content,
              version: (cached as any).version || 1,
              metadata: (cached as any).metadata,
            };
          }
        }
        
        if (doc) {
          return doc;
        }
      }
    } catch (error) {
      console.warn('从缓存获取文档失败:', error);
    }

    // 2. 从服务器获取（无论是否在线都尝试，因为可能只是 ShareDB 未连接）
    try {
      const doc = await this.fetchFromServer(documentId);
      if (doc) {
        // 保存到本地缓存（异步，不阻塞）
        localCacheManager.set(documentId, doc, doc.version).catch(console.error);
        return doc;
      }
    } catch (error) {
      console.error('从服务器获取文档失败:', error);
    }

    return null;
  }

  /**
   * 更新文档（本地优先）
   */
  async updateDocument(
    documentId: string,
    content: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    console.log('💾 [ShareDB] 更新文档:', {
      documentId,
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
      metadata,
    });
    
    // 1. 立即更新本地缓存
    const existing = await localCacheManager.get<ShareDBDocument>(documentId);
    const version = existing?.version || (existing && 'version' in existing ? existing.version : 0) || 0;
    
    console.log('📦 [ShareDB] 现有缓存:', {
      exists: !!existing,
      version,
      existingType: existing ? typeof existing : 'null',
    });
    
    const updated: ShareDBDocument = {
      document_id: documentId,
      content,
      version: version + 1,
      metadata: metadata || (existing && 'metadata' in existing ? existing.metadata : undefined),
    };

    console.log('💾 [ShareDB] 保存到缓存:', {
      documentId,
      version: updated.version,
      contentLength: typeof updated.content === 'string' ? updated.content.length : JSON.stringify(updated.content).length,
    });
    
    await localCacheManager.set(documentId, updated, updated.version);
    
    console.log('✅ [ShareDB] 已保存到缓存:', documentId);

    // 2. 如果在线，异步同步到服务器
    if (this.connected) {
      this.syncToServer(documentId, content, metadata).catch((error) => {
        console.error('同步到服务器失败:', error);
        // 失败时标记为待同步，稍后重试
      });
    }
  }

  /**
   * 创建文档
   */
  async createDocument(
    documentId: string,
    initialContent: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<ShareDBDocument> {
    const doc: ShareDBDocument = {
      document_id: documentId,
      content: initialContent,
      version: 1,
      metadata,
    };

    // 先保存到本地
    await localCacheManager.set(documentId, doc, doc.version);

    // 如果在线，同步到服务器
    if (this.connected) {
      try {
        await this.createOnServer(documentId, initialContent, metadata);
        localCacheManager.markAsSynced(documentId);
      } catch (error) {
        console.error('创建文档到服务器失败:', error);
      }
    }

    return doc;
  }

  /**
   * 删除文档
   */
  async deleteDocument(documentId: string): Promise<void> {
    // 从本地缓存删除
    await localCacheManager.delete(documentId);

    // 如果在线，从服务器删除
    if (this.connected) {
      try {
        await this.deleteOnServer(documentId);
      } catch (error) {
        console.error('从服务器删除文档失败:', error);
      }
    }
  }

  /**
   * 订阅文档变更
   */
  subscribe(
    documentId: string,
    callback: (doc: ShareDBDocument) => void
  ): () => void {
    // 实现文档变更订阅
    // 这里简化处理，实际应该使用 ShareDB 的订阅机制
    
    const unsubscribe = () => {
      // 取消订阅
    };

    return unsubscribe;
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 监听连接状态变化
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.add(callback);
    return () => {
      this.connectionCallbacks.delete(callback);
    };
  }

  // ========== 私有方法 ==========

  private async fetchFromServer(documentId: string): Promise<ShareDBDocument | null> {
    // 如果是章节文档，使用章节 API
    if (documentId.startsWith('chapter_')) {
      const chapterId = parseInt(documentId.replace('chapter_', ''));
      try {
        // 先尝试从章节 API 获取
        const chapter = await chaptersApi.getChapter(chapterId);
        if (chapter.content) {
          return {
            document_id: documentId,
            content: chapter.content,
            version: chapter.id, // 使用章节 ID 作为版本号
            metadata: {
              work_id: chapter.work_id,
              chapter_id: chapter.id,
              chapter_number: chapter.chapter_number,
            },
          };
        }
        
        // 如果章节 API 没有内容，尝试从 ShareDB 文档 API 获取
        const result = await chaptersApi.getChapterDocument(chapterId);
        let content: any = result.content;
        
        // 处理不同的内容格式
        if (typeof content === 'object' && content !== null) {
          if ('content' in content) {
            content = content.content;
          } else {
            content = JSON.stringify(content);
          }
        }
        
        return {
          document_id: documentId,
          content: content || '',
          version: result.chapter_info.id,
          metadata: {
            work_id: result.chapter_info.work_id,
            chapter_id: result.chapter_info.id,
            chapter_number: result.chapter_info.chapter_number,
          },
        };
      } catch (error) {
        console.error('获取章节文档失败:', error);
        return null;
      }
    }

    // 其他类型的文档可以通过通用 API 获取
    return null;
  }

  private async syncToServer(
    documentId: string,
    content: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    if (documentId.startsWith('chapter_')) {
      const chapterId = parseInt(documentId.replace('chapter_', ''));
      await chaptersApi.updateChapter(chapterId, {
        content: typeof content === 'string' ? content : JSON.stringify(content),
      });
      localCacheManager.markAsSynced(documentId);
    }
  }

  private async createOnServer(
    documentId: string,
    initialContent: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    // 创建文档到服务器
    // 这里应该调用后端 API
    if (documentId.startsWith('chapter_')) {
      // 章节文档的创建由章节创建流程处理
      return;
    }
  }

  private async deleteOnServer(documentId: string): Promise<void> {
    // 从服务器删除文档
    if (documentId.startsWith('chapter_')) {
      const chapterId = parseInt(documentId.replace('chapter_', ''));
      await chaptersApi.deleteChapter(chapterId);
    }
  }

  private async syncDocument(documentId: string): Promise<void> {
    // 从服务器同步文档更新
    const serverDoc = await this.fetchFromServer(documentId);
    if (serverDoc) {
      const localDoc = await localCacheManager.get<ShareDBDocument>(documentId);
      
      // 如果服务器版本更新，合并更新
      if (!localDoc || (serverDoc.version && serverDoc.version > localDoc.version)) {
        await localCacheManager.set(documentId, serverDoc, serverDoc.version);
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      // 处理 ShareDB 消息
      // 这里应该实现 ShareDB 协议的消息处理
    } catch (error) {
      console.error('处理 ShareDB 消息失败:', error);
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(callback => callback(connected));
  }
}

// 导出单例
export const sharedbClient = new ShareDBClient();

