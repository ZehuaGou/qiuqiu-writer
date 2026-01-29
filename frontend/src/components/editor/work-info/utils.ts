
import type { ComponentConfig, ModuleConfig } from './types';

// 获取组件的默认数据键
const getDefaultDataKey = (comp: ComponentConfig): string | null => {
  if (comp.type === 'relation-graph') return 'character_relations';
  if (comp.type === 'timeline') return 'character_timeline';
  if (comp.type === 'character-card') return 'characters';
  return null;
};

// 从模板配置中提取模块
export const getModulesFromTemplateConfig = (templateConfig?: unknown): ModuleConfig[] => {
  if (!templateConfig) return [];
  if (Array.isArray(templateConfig)) return templateConfig as ModuleConfig[];
  if (typeof templateConfig === 'object' && templateConfig !== null) {
    const maybeModules = (templateConfig as { modules?: unknown }).modules;
    if (Array.isArray(maybeModules)) {
      return maybeModules as ModuleConfig[];
    }
  }
  return [];
};

// 从模板中提取组件数据
export const extractComponentDataFromTemplate = (modules: ModuleConfig[]): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  const collectFromComponents = (components: ComponentConfig[]) => {
    for (const comp of components) {
      if (comp.type === 'tabs' && comp.config?.tabs) {
        for (const tab of comp.config.tabs) {
          collectFromComponents(tab.components || []);
        }
        continue;
      }
      const storageKey = comp.dataKey || getDefaultDataKey(comp) || comp.id;
      if (comp.value !== undefined) {
        data[storageKey] = comp.value;
      }
    }
  };

  for (const module of modules) {
    collectFromComponents(module.components || []);
  }

  return data;
};

// 将组件数据写入模板
export const writeComponentDataToTemplate = (
  modules: ModuleConfig[],
  data: Record<string, unknown>
): ModuleConfig[] => {
  const applyDataToComponents = (components: ComponentConfig[]): ComponentConfig[] => {
    return components.map(comp => {
      if (comp.type === 'tabs' && comp.config?.tabs) {
        return {
          ...comp,
          config: {
            ...comp.config,
            tabs: comp.config.tabs.map(tab => ({
              ...tab,
              components: applyDataToComponents(tab.components || [])
            }))
          }
        };
      }
      const storageKey = comp.dataKey || getDefaultDataKey(comp) || comp.id;
      if (Object.prototype.hasOwnProperty.call(data, storageKey)) {
        return { ...comp, value: data[storageKey] };
      }
      return comp;
    });
  };

  return modules.map(module => ({
    ...module,
    components: applyDataToComponents(module.components || [])
  }));
};

// 清理模板结构（移除值）
export const cleanTemplateStructure = (modules: ModuleConfig[]): ModuleConfig[] => {
  const cleanComponents = (components: ComponentConfig[]): ComponentConfig[] => {
    return components.map(comp => {
      if (comp.type === 'tabs' && comp.config?.tabs) {
        return {
          ...comp,
          value: undefined,
          config: {
            ...comp.config,
            tabs: comp.config.tabs.map(tab => ({
              ...tab,
              components: cleanComponents(tab.components || [])
            }))
          }
        };
      }
      return { ...comp, value: undefined };
    });
  };

  return modules.map(module => ({
    ...module,
    components: cleanComponents(module.components || [])
  }));
};

// ============ 缓存管理 ============

// 获取基于 workId 的缓存键
export const getCacheKey = (workId: string | null): string => {
  if (workId) {
    return `planetwriter_workinfo_cache_${workId}`;
  }
  // 如果没有 workId，使用旧的全局缓存键（向后兼容）
  return 'planetwriter_workinfo_cache';
};

interface CacheData {
  templateId: string;
  modules: ModuleConfig[];
  lastModified: number;
}

// 从 localStorage 读取缓存（基于 workId 和可选的 templateId）
export const loadFromCache = (workId: string | null, templateId?: string): CacheData | null => {
  // 如果有 templateId，优先从模板特定的缓存加载
  if (templateId) {
    const templateKey = workId ? `planetwriter_workinfo_cache_${workId}_${templateId}` : `planetwriter_workinfo_cache_${templateId}`;
    try {
      const cached = localStorage.getItem(templateKey);
      if (cached) {
        const data = JSON.parse(cached);
        return data;
      }
    } catch (e) {
      console.warn('Failed to load template-specific cache:', e);
    }
  }
  
  // 回退到通用缓存
  try {
    const CACHE_KEY = getCacheKey(workId);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Failed to load cache:', e);
  }
  return null;
};

export const saveToCache = (data: CacheData, workId: string | null, templateId?: string) => {
  try {
    const CACHE_KEY = getCacheKey(workId);
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    
    // 如果有 templateId，也保存一份到特定模板的缓存
    if (templateId) {
      const templateKey = workId ? `planetwriter_workinfo_cache_${workId}_${templateId}` : `planetwriter_workinfo_cache_${templateId}`;
      localStorage.setItem(templateKey, JSON.stringify(data));
    }
  } catch (e) {
    console.warn('Failed to save to cache:', e);
  }
};
