/**
 * Yjs API client for triggering synchronization and other Yjs-related tasks.
 */
import { BaseApiClient } from './baseApiClient';

export interface YjsSyncResponse {
  success: boolean;
  room: string;
}

class YjsApiClient extends BaseApiClient {
  // forceSync 接口已废弃，改用 WebSocket 消息 MSG_SAVE (2) 触发同步
}

export const yjsApi = new YjsApiClient();
