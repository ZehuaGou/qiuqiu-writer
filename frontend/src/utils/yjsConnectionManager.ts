/**
 * Yjs WebSocket 连接复用管理器
 * 
 * 优化：同一作品（work）下的所有章节共享一个 WebSocket 连接，
 * 使用 Y.XmlFragment 为每个章节创建独立的文档片段。
 * 
 * 优势：
 * - 减少 WebSocket 连接数（从每章节一个减少到每作品一个）
 * - 切换章节时无需重新连接，响应更快
 * - 降低服务器压力
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

interface WorkConnection {
  workId: string;
  ydoc: Y.Doc;
  wsProvider: WebsocketProvider;
  idbProvider: IndexeddbPersistence;
  chapterFragments: Map<string, Y.XmlFragment>;
  refCount: number; // 引用计数，当为 0 时延迟断开
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

class YjsConnectionManager {
  private connections: Map<string, WorkConnection> = new Map();
  private readonly DISCONNECT_DELAY = 30000; // 30 秒后断开未使用的连接

  /**
   * 获取或创建作品的 WebSocket 连接
   */
  getWorkConnection(workId: string, wsUrl: string): WorkConnection {
    const key = workId;
    
    let conn = this.connections.get(key);
    if (conn) {
      // 清除断开定时器（连接被重新使用）
      if (conn.disconnectTimer) {
        clearTimeout(conn.disconnectTimer);
        conn.disconnectTimer = undefined;
      }
      conn.refCount++;
      return conn;
    }

    // 创建新连接
    const ydoc = new Y.Doc();
    const wsProvider = new WebsocketProvider(wsUrl, `work_${workId}`, ydoc, { connect: true });
    const idbProvider = new IndexeddbPersistence(`work_${workId}`, ydoc);

    conn = {
      workId,
      ydoc,
      wsProvider,
      idbProvider,
      chapterFragments: new Map(),
      refCount: 1,
    };

    this.connections.set(key, conn);
    console.log(`🔌 [YjsConnectionManager] 创建作品连接: work_${workId}`);
    
    return conn;
  }

  /**
   * 获取章节的 Y.XmlFragment（如果不存在则创建）
   */
  getChapterFragment(workId: string, chapterId: string): Y.XmlFragment {
    const conn = this.connections.get(workId);
    if (!conn) {
      throw new Error(`作品连接不存在: ${workId}`);
    }

    let fragment = conn.chapterFragments.get(chapterId);
    if (!fragment) {
      fragment = conn.ydoc.getXmlFragment(`chapter_${chapterId}`);
      conn.chapterFragments.set(chapterId, fragment);
      console.log(`📄 [YjsConnectionManager] 创建章节片段: chapter_${chapterId}`);
    }

    return fragment;
  }

  /**
   * 释放连接引用（当不再使用时调用）
   */
  releaseConnection(workId: string): void {
    const conn = this.connections.get(workId);
    if (!conn) return;

    conn.refCount--;
    if (conn.refCount <= 0) {
      // 延迟断开，以便快速切换章节时可以复用
      conn.disconnectTimer = setTimeout(() => {
        console.log(`🔌 [YjsConnectionManager] 断开作品连接: work_${workId}`);
        conn.wsProvider.destroy();
        conn.idbProvider.destroy();
        conn.ydoc.destroy();
        this.connections.delete(workId);
      }, this.DISCONNECT_DELAY);
    }
  }

  /**
   * 立即断开连接（用于清理）
   */
  disconnect(workId: string): void {
    const conn = this.connections.get(workId);
    if (!conn) return;

    if (conn.disconnectTimer) {
      clearTimeout(conn.disconnectTimer);
    }
    conn.wsProvider.destroy();
    conn.idbProvider.destroy();
    conn.ydoc.destroy();
    this.connections.delete(workId);
    console.log(`🔌 [YjsConnectionManager] 立即断开连接: work_${workId}`);
  }

  /**
   * 断开所有连接
   */
  disconnectAll(): void {
    for (const [workId] of this.connections) {
      this.disconnect(workId);
    }
  }
}

// 单例
export const yjsConnectionManager = new YjsConnectionManager();
