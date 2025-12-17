/**
 * 章节管理API客户端
 * 对接后端章节接口 /api/v1/chapters
 */

import { BaseApiClient } from './baseApiClient';
import type { Work } from './worksApi';

export interface Chapter {
  outline: any;
  detailed_outline: any;
  id: number;
  work_id: number;
  title: string;
  chapter_number: number;
  volume_number: number;
  status: string;
  word_count: number;
  content?: string;
  metadata?: {
    outline?: string;
    detailed_outline?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface ChapterCreate {
  work_id: number;
  title: string;
  chapter_number?: number;  // 可选，如果未提供，后端自动计算
  volume_number?: number;
  content?: string;
}

export interface ChapterUpdate {
  title?: string;
  content?: string;
  status?: string;
  word_count?: number;
  chapter_metadata?: {
    outline?: string;
    detailed_outline?: string;
    [key: string]: any;
  };
}


export interface ChapterListResponse {
  chapters: Chapter[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface ChapterVersion {
  id: number;
  chapter_id: number;
  version_number: number;
  title: string;
  content: string;
  change_description?: string;
  created_at: string;
}

class ChaptersApiClient extends BaseApiClient {

  /**
   * 创建章节
   */
  async createChapter(chapterData: ChapterCreate): Promise<Chapter> {
    return this.post<Chapter>('/api/v1/chapters/', chapterData);
  }

  /**
   * 获取章节列表
   */
  async listChapters(params: {
    work_id: number;
    page?: number;
    size?: number;
    status?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<ChapterListResponse> {
    return this.get<ChapterListResponse>('/api/v1/chapters/', params);
  }

  /**
   * 获取章节详情
   */
  async getChapter(
    chapterId: number,
    include_versions?: boolean
  ): Promise<Chapter> {
    return this.get<Chapter>(`/api/v1/chapters/${chapterId}`, {
      include_versions,
    });
  }

  /**
   * 更新章节
   */
  async updateChapter(
    chapterId: number,
    updates: ChapterUpdate
  ): Promise<Chapter> {
    return this.put<Chapter>(`/api/v1/chapters/${chapterId}`, updates);
  }

  /**
   * 删除章节
   */
  async deleteChapter(chapterId: number): Promise<void> {
    await this.delete(`/api/v1/chapters/${chapterId}`);
  }

  /**
   * 获取章节版本历史
   */
  async getChapterVersions(
    chapterId: number,
    page?: number,
    size?: number
  ): Promise<ChapterVersion[]> {
    return this.get<ChapterVersion[]>(
      `/api/v1/chapters/${chapterId}/versions`,
      { page, size }
    );
  }

  /**
   * 创建章节版本快照
   */
  async createChapterVersion(
    chapterId: number,
    changeDescription?: string
  ): Promise<ChapterVersion> {
    return this.post<ChapterVersion>(
      `/api/v1/chapters/${chapterId}/versions`,
      { change_description: changeDescription }
    );
  }

  /**
   * 获取章节ShareDB文档内容
   */
  async getChapterDocument(chapterId: number): Promise<{
    document_id: string;
    content: any;
    chapter_info: Chapter;
  }> {
    return this.get(`/api/v1/chapters/${chapterId}/document`);
  }
}

export const chaptersApi = new ChaptersApiClient();

