/**
 * 媒体 Credits API 客户端
 * 图像生成 & 视频生成共享同一 media_credits 余额
 */

import { BaseApiClient } from './baseApiClient';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface MediaCreditBalance {
  media_credits: number;
}

export interface MediaModelConfig {
  model_id: string;
  label: string;
  description: string;
  credits_per_generation: number;
  enabled: boolean;
}

export interface MediaModelsResponse {
  image: MediaModelConfig[];
  video: MediaModelConfig[];
}

export interface MediaCreditPack {
  pack_key: string;
  label: string;
  credits: number;
  price: number;
  badge: string | null;
  highlight: boolean;
}


export interface CreateMediaOrderResponse {
  order_id: string;
  qr_url: string;
  is_mock: boolean;
}

export interface MediaOrderStatusResponse {
  status: 'pending' | 'paid' | 'failed' | 'expired';
}

// ── API 客户端 ────────────────────────────────────────────────────────────────

class MediaCreditApiClient extends BaseApiClient {
  /** 获取当前用户图像/视频 credits 余额（需登录） */
  getBalance(): Promise<MediaCreditBalance> {
    return this.get<MediaCreditBalance>('/api/v1/users/me/media-credits');
  }

  /** 获取所有模型定价配置（公开） */
  getMediaModels(): Promise<MediaModelsResponse> {
    return this.get<MediaModelsResponse>('/api/v1/users/media-models');
  }

  /** 获取统一媒体充值包配置（公开） */
  getMediaPacks(): Promise<MediaCreditPack[]> {
    return this.get<MediaCreditPack[]>('/api/v1/users/media-packs');
  }

  /** 创建充值订单 */
  createMediaOrder(
    pack_key: string,
    method: 'wechat' | 'alipay',
  ): Promise<CreateMediaOrderResponse> {
    return this.post<CreateMediaOrderResponse>('/api/v1/payment/create-media-order', {
      pack_key,
      method,
    });
  }

  /** 查询充值订单状态（前端轮询） */
  getMediaOrderStatus(order_id: string): Promise<MediaOrderStatusResponse> {
    return this.get<MediaOrderStatusResponse>(
      `/api/v1/payment/media-order-status/${order_id}`,
    );
  }
}

export const mediaCreditApi = new MediaCreditApiClient();
