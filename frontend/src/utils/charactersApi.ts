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
  personality?: Record<string, unknown>;
  appearance?: Record<string, unknown>;
  background?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  tags?: string[];
  is_main_character: boolean;
  is_active: boolean;
  metadata?: Record<string, unknown>;
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


