/**
 * 角色管理API客户端
 * 对接后端角色接口 /api/v1/characters
 */

import { BaseApiClient } from './baseApiClient';

export interface Character {
  id: number;
  work_id: number;
  name: string;
  display_name?: string;
  description?: string;
  avatar_url?: string;
  gender?: string;
  age?: number;
  personality?: Record<string, any>;
  appearance?: Record<string, any>;
  background?: Record<string, any>;
  relationships?: Record<string, any>;
  tags?: string[];
  is_main_character: boolean;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CharacterListResponse {
  characters: Character[];
  total: number;
}

class CharactersApiClient extends BaseApiClient {
  /**
   * 获取作品的角色列表
   */
  async listCharacters(workId: number): Promise<CharacterListResponse> {
    return this.get<CharacterListResponse>('/api/v1/characters/', { work_id: workId });
  }

  /**
   * 获取角色详情
   */
  async getCharacter(characterId: number): Promise<Character> {
    return this.get<Character>(`/api/v1/characters/${characterId}`);
  }
}

export const charactersApi = new CharactersApiClient();


