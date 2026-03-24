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
  sourceNovelId?: string;
  sourceNovelTitle?: string;
  [key: string]: unknown;
}
