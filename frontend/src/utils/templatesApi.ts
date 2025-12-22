/**
 * 模板管理API客户端
 * 对接后端模板接口 /api/v1/templates
 */

import { BaseApiClient } from './baseApiClient';

export interface TemplateConfig {
  templateId: string;
  modules: any[];
}

class TemplatesApiClient extends BaseApiClient {

  /**
   * 保存作品的模板配置到数据库
   */
  async saveWorkTemplateConfig(workId: number, templateConfig: TemplateConfig): Promise<{ message: string; work_id: number; template_config: TemplateConfig }> {
    return this.post<{ message: string; work_id: number; template_config: TemplateConfig }>(
      `/api/v1/templates/works/${workId}/template-config`,
      templateConfig
    );
  }

  /**
   * 获取作品的模板配置
   */
  async getWorkTemplateConfig(workId: number): Promise<{ work_id: number; template_config: TemplateConfig | null; message?: string }> {
    return this.get<{ work_id: number; template_config: TemplateConfig | null; message?: string }>(
      `/api/v1/templates/works/${workId}/template-config`
    );
  }

  /**
   * 创建新模板
   */
  async createTemplate(templateData: {
    name: string;
    description?: string;
    work_type: string;
    category?: string;
    template_config: TemplateConfig;
    is_public?: boolean;
    settings?: Record<string, any>;
    tags?: string[];
  }): Promise<any> {
    return this.post<any>('/api/v1/templates/', templateData);
  }

  /**
   * 更新模板
   */
  async updateTemplate(
    templateId: number,
    templateData: {
      name?: string;
      description?: string;
      template_config?: TemplateConfig;
      settings?: Record<string, any>;
      category?: string;
      is_public?: boolean;
      tags?: string[];
    }
  ): Promise<any> {
    return this.put<any>(`/api/v1/templates/${templateId}`, templateData);
  }

  /**
   * 获取模板列表
   */
  async listTemplates(params?: {
    page?: number;
    size?: number;
    work_type?: string;
    category?: string;
    is_public?: boolean;
    is_system?: boolean;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    include_fields?: boolean;
  }): Promise<any[]> {
    return this.get<any[]>('/api/v1/templates', params);
  }
}

export const templatesApi = new TemplatesApiClient();

