/**
 * Token 配额 API 客户端及展示工具
 */

import { BaseApiClient } from './baseApiClient';

export interface TokenInfo {
  plan: string;
  token_remaining: number;
  token_total: number;
  token_reset_at: string | null;
  plan_expires_at?: string | null;
}

export interface PlanPricePoint {
  original: number;
  current: number;
}

export interface PlanPricing {
  monthly: PlanPricePoint;
  quarterly: PlanPricePoint;
  yearly: PlanPricePoint;
}

export interface PlanConfig {
  key: string;
  label: string;
  tokens: number;
  desc: string;
  highlight: boolean;
  badge: string | null;
  pricing: PlanPricing;
}

/** 将 token 数转换为"X万字"形式展示（1 汉字 ≈ 1.5 tokens） */
export function tokensToDisplay(tokens: number): string {
  const chars = Math.floor(tokens / 1.5);
  if (chars >= 10000) {
    return `${(chars / 10000).toFixed(1)}万字`;
  }
  return `${chars}字`;
}

class TokenApiClient extends BaseApiClient {
  getTokenInfo(): Promise<TokenInfo> {
    return this.get<TokenInfo>('/api/v1/users/me/token-info');
  }

  /** 返回有序套餐配置列表（公开接口，无需登录） */
  getPlanConfigs(): Promise<PlanConfig[]> {
    return this.get<PlanConfig[]>('/api/v1/users/plans');
  }
}

export const tokenApi = new TokenApiClient();

// ── 支付 API ──────────────────────────────────────────────────────────────────

export interface CreateOrderResponse {
  order_id: string;
  qr_url: string;
  is_mock: boolean;
}

export interface OrderStatusResponse {
  status: 'pending' | 'paid' | 'failed' | 'expired';
}

class PaymentApiClient extends BaseApiClient {
  createOrder(plan_key: string, cycle: string, method: string): Promise<CreateOrderResponse> {
    return this.post<CreateOrderResponse>('/api/v1/payment/create-order', { plan_key, cycle, method });
  }

  getOrderStatus(order_id: string): Promise<OrderStatusResponse> {
    return this.get<OrderStatusResponse>(`/api/v1/payment/order-status/${order_id}`);
  }
}

export const paymentApi = new PaymentApiClient();
