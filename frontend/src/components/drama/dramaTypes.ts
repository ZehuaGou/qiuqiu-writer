// 剧本模块共享类型定义

export interface DramaCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  appearance: string;
  personality: string;
  imageUrl?: string;
}

export interface DramaScene {
  id: string;
  location: string;
  time: string;
  description: string;
  imageUrl?: string;
  episodeId?: string; // 全局场景库 — 记录来源集数
}

export interface DramaEpisode {
  id: string;
  number: number;
  title: string;
  synopsis: string;
  script: string;
  scenes: DramaScene[];
  videoUrl?: string;
  sourceChapterId?: number;
  sourceChapterTitle?: string;
}

export interface DramaMeta {
  genre: string;
  style: string;
  totalEpisodes: number;
  outline: string;
  characters: DramaCharacter[];
  episodes: DramaEpisode[];
  scenes?: DramaScene[]; // 全局场景库（跨集复用）
  sourceNovelId?: string;
  sourceNovelTitle?: string;
  [key: string]: unknown;
}

// ── 本地 Drama AI 任务（纯前端执行，不经过 WebSocket）──────────

export type LocalDramaTaskType = 'extract-characters' | 'extract-scenes' | 'gen-script';
export type LocalDramaTaskStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface LocalDramaTask {
  /** 前端生成的唯一 ID */
  local_id: string;
  type: LocalDramaTaskType;
  /** 面向用户的命令描述 */
  query: string;
  episode_id: string;
  episode_title: string;
  status: LocalDramaTaskStatus;
  /** 流式文本（gen-script 专用） */
  streamContent?: string;
  /** 结构化结果（extract 专用，用于显示数量） */
  result?: unknown[];
  error?: string;
  created_at: number;
  /** 用于中断 gen-script 流式请求 */
  abortController?: AbortController;
}
