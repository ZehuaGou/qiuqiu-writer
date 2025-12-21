import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, X, ChevronLeft, ChevronRight, ChevronDown, Trash2, 
  Settings, Tag, Users, Building2, Map, FileText,
  Image, List, LayoutGrid, Heart, Zap, Sparkles,
  LayoutTemplate, Check, GitBranch, Clock, Table2,
  CheckSquare, Type, AlignLeft, Save, TrendingUp
} from 'lucide-react';
import CharacterRelations from './CharacterRelations';
import type { CharacterRelationsData } from './CharacterRelations';
import { templatesApi } from '../../utils/templatesApi';
import { worksApi } from '../../utils/worksApi';
import './WorkInfoManager.css';

// 势力数据类型
interface FactionData {
  id: string;
  name: string;
  summary?: string;
  details?: string;
  levels: string[];
  parentId?: string;
  children?: FactionData[];
}

// ============ 组件类型定义 ============

// 基础组件类型
type ComponentType = 
  | 'text'           // 单行文本
  | 'textarea'       // 多行文本
  | 'image'          // 图片上传
  | 'select'         // 单选下拉
  | 'multiselect'    // 多选标签
  | 'list'           // 简单列表
  | 'keyvalue'       // 键值对列表
  | 'table'          // 表格
  | 'tabs'           // 分页标签（内嵌多个子组件）
  | 'relation-graph' // 关系图组件
  | 'timeline'       // 时间线组件
  | 'card-list'      // 卡片列表
  | 'character-card' // 角色卡片（预设字段）
  | 'rank-system'    // 等级体系
  | 'faction';       // 势力组件

// 组件配置接口
interface ComponentConfig {
  id: string;
  type: ComponentType;
  label: string;
  // 数据存储键（用于在 component_data 中存储数据）
  dataKey?: string;
  // 数据依赖（组件需要引用其他组件的数据，如时间线需要角色列表）
  dataDependencies?: string[]; // 依赖的其他组件的 dataKey 列表
  // 组件特定配置
  config: {
    placeholder?: string;
    options?: { label: string; value: string; color?: string }[];  // select/multiselect
    maxCount?: number;           // multiselect 最大选择数
    columns?: { key: string; label: string; width?: string }[];    // table 列配置
    tabs?: { id: string; label: string; components: ComponentConfig[] }[]; // tabs 子组件
    cardFields?: { key: string; label: string; type: 'text' | 'textarea' | 'image' }[]; // card-list
    nodeTypes?: { type: string; label: string; color: string }[];  // relation-graph 节点类型
    relationTypes?: { type: string; label: string; color: string }[]; // relation-graph 关系类型
  };
  // AI Prompt 配置
  generatePrompt?: string;   // 用于生成内容的提示词
  validatePrompt?: string;   // 用于检验内容的提示词
  // 组件数据
  value: any;
}

// 模块定义
interface ModuleConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  components: ComponentConfig[];
}

// 模板定义
interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  modules: ModuleConfig[];
}

// ============ 缓存管理 ============

// 获取基于 workId 的缓存键
const getCacheKey = (workId: string | null): string => {
  if (workId) {
    return `wawawriter_workinfo_cache_${workId}`;
  }
  // 如果没有 workId，使用旧的全局缓存键（向后兼容）
  return 'wawawriter_workinfo_cache';
};

interface CacheData {
  templateId: string;
  modules: ModuleConfig[];
  lastModified: number;
}

// 从 localStorage 读取缓存（基于 workId 和可选的 templateId）
const loadFromCache = (workId: string | null, templateId?: string): CacheData | null => {
  // 如果有 templateId，优先从模板特定的缓存加载
  if (templateId) {
    const templateKey = workId ? `wawawriter_workinfo_cache_${workId}_${templateId}` : `wawawriter_workinfo_cache_${templateId}`;
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

// 保存到 localStorage 缓存（基于 workId 和可选的 templateId）
const saveToCache = (data: CacheData, workId: string | null, templateId?: string) => {
  // 如果有 templateId，保存到模板特定的缓存
  if (templateId) {
    const templateKey = workId ? `wawawriter_workinfo_cache_${workId}_${templateId}` : `wawawriter_workinfo_cache_${templateId}`;
    try {
      localStorage.setItem(templateKey, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save template-specific cache:', e);
    }
  }
  
  // 同时保存到通用缓存（向后兼容）
  try {
    const CACHE_KEY = getCacheKey(workId);
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save cache:', e);
  }
};

// ============ 组件注册表 ============

interface ComponentDefinition {
  type: ComponentType;
  name: string;
  icon: React.ReactNode;
  category: 'basic' | 'advanced' | 'interactive';
  description: string;
  defaultConfig: Partial<ComponentConfig['config']>;
  configFields?: {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'options' | 'columns' | 'nodeTypes';
    required?: boolean;
  }[];
}

const componentRegistry: ComponentDefinition[] = [
  // 基础组件
  {
    type: 'text',
    name: '单行文本',
    icon: <Type size={16} />,
    category: 'basic',
    description: '简短的文本输入，适合名称、标题',
    defaultConfig: { placeholder: '请输入...' },
  },
  {
    type: 'textarea',
    name: '多行文本',
    icon: <AlignLeft size={16} />,
    category: 'basic',
    description: '长段落输入，适合描述、背景',
    defaultConfig: { placeholder: '请输入详细内容...' },
  },
  {
    type: 'image',
    name: '图片',
    icon: <Image size={16} />,
    category: 'basic',
    description: '上传图片，适合封面、地图',
    defaultConfig: {},
  },
  {
    type: 'select',
    name: '单选',
    icon: <CheckSquare size={16} />,
    category: 'basic',
    description: '从选项中选择一个',
    defaultConfig: { options: [] },
    configFields: [
      { key: 'options', label: '选项列表', type: 'options', required: true },
    ],
  },
  {
    type: 'multiselect',
    name: '多选标签',
    icon: <Tag size={16} />,
    category: 'basic',
    description: '从标签中选择多个',
    defaultConfig: { options: [], maxCount: 5 },
    configFields: [
      { key: 'options', label: '标签选项', type: 'options', required: true },
      { key: 'maxCount', label: '最大选择数', type: 'text' },
    ],
  },
  // 高级组件
  {
    type: 'list',
    name: '列表',
    icon: <List size={16} />,
    category: 'advanced',
    description: '有序的项目列表',
    defaultConfig: {},
  },
  {
    type: 'keyvalue',
    name: '键值对',
    icon: <FileText size={16} />,
    category: 'advanced',
    description: '标题+描述的列表',
    defaultConfig: {},
  },
  {
    type: 'table',
    name: '表格',
    icon: <Table2 size={16} />,
    category: 'advanced',
    description: '多列数据表格',
    defaultConfig: { columns: [] },
    configFields: [
      { key: 'columns', label: '列配置', type: 'columns', required: true },
    ],
  },
  {
    type: 'card-list',
    name: '卡片列表',
    icon: <LayoutGrid size={16} />,
    category: 'advanced',
    description: '卡片式的项目列表',
    defaultConfig: { cardFields: [] },
    configFields: [
      { key: 'cardFields', label: '卡片字段', type: 'columns' },
    ],
  },
  {
    type: 'character-card',
    name: '角色卡片',
    icon: <Users size={16} />,
    category: 'advanced',
    description: '预设的角色信息卡片（与角色列表样式一致）',
    defaultConfig: {}, // 使用专用渲染，无需cardFields配置
    configFields: [], // 预设字段，无需配置
  },
  {
    type: 'rank-system',
    name: '等级体系',
    icon: <TrendingUp size={16} />,
    category: 'advanced',
    description: '设定世界观的等级/境界体系',
    defaultConfig: {},
    configFields: [],
  },
  {
    type: 'faction',
    name: '势力',
    icon: <Building2 size={16} />,
    category: 'advanced',
    description: '管理势力/组织，支持层级结构',
    defaultConfig: {},
    configFields: [],
  },
  // 交互组件
  {
    type: 'tabs',
    name: '分页标签',
    icon: <LayoutGrid size={16} />,
    category: 'interactive',
    description: '多个标签页，每页可放置不同组件',
    defaultConfig: { tabs: [] },
  },
  {
    type: 'relation-graph',
    name: '关系图',
    icon: <GitBranch size={16} />,
    category: 'interactive',
    description: '节点和关系的可视化图谱',
    defaultConfig: { nodeTypes: [], relationTypes: [] },
    configFields: [
      { key: 'nodeTypes', label: '节点类型', type: 'nodeTypes' },
      { key: 'relationTypes', label: '关系类型', type: 'nodeTypes' },
    ],
  },
  {
    type: 'timeline',
    name: '时间线',
    icon: <Clock size={16} />,
    category: 'interactive',
    description: '按时间顺序的事件列表',
    defaultConfig: {},
  },
];

// ============ 预设模板 ============

const presetTemplates: TemplateConfig[] = [
  {
    id: 'novel-standard',
    name: '小说标准模板',
    description: '通用小说创作模板',
    modules: [
      {
        id: 'basic-info',
        name: '基本信息',
        icon: 'FileText',
        color: '#3b82f6',
        components: [
          { id: 'genre', type: 'multiselect', label: '题材类型', config: { 
            options: [
              { label: '言情', value: 'romance', color: '#ec4899' },
              { label: '悬疑', value: 'mystery', color: '#8b5cf6' },
              { label: '科幻', value: 'scifi', color: '#06b6d4' },
              { label: '玄幻', value: 'fantasy', color: '#f59e0b' },
              { label: '都市', value: 'urban', color: '#10b981' },
            ],
            maxCount: 3
          }, value: [] },
          { id: 'summary', type: 'textarea', label: '作品简介', config: { placeholder: '输入作品简介...' }, value: '' },
          { id: 'cover', type: 'image', label: '封面图', config: {}, value: '' },
        ]
      },
      {
        id: 'characters',
        name: '角色设定',
        icon: 'Users',
        color: '#8b5cf6',
        components: [
          { id: 'char-tabs', type: 'tabs', label: '角色管理', config: {
            tabs: [
              { id: 'list', label: '角色列表', components: [
                { 
                  id: 'char-cards', 
                  type: 'character-card', 
                  label: '角色卡片', 
                  dataKey: 'characters', // 数据存储键
                  config: {}, 
                  value: [] 
                }
              ]},
              { id: 'relations', label: '关系图谱', components: [
                { 
                  id: 'char-relations', 
                  type: 'relation-graph', 
                  label: '人物关系', 
                  dataKey: 'character_relations', // 数据存储键
                  dataDependencies: ['characters'], // 依赖角色列表数据
                  config: {
                    nodeTypes: [
                      { type: 'protagonist', label: '主角', color: '#ef4444' },
                      { type: 'supporting', label: '配角', color: '#3b82f6' },
                      { type: 'antagonist', label: '反派', color: '#6b7280' },
                    ],
                    relationTypes: [
                      { type: 'family', label: '亲属', color: '#ec4899' },
                      { type: 'friend', label: '朋友', color: '#10b981' },
                      { type: 'enemy', label: '敌对', color: '#ef4444' },
                      { type: 'lover', label: '恋人', color: '#f472b6' },
                    ]
                  }, 
                  value: { characters: [], relations: [] } 
                }
              ]},
              { id: 'timeline', label: '时间线', components: [
                { 
                  id: 'char-timeline', 
                  type: 'timeline', 
                  label: '角色时间线', 
                  dataKey: 'character_timeline', // 数据存储键
                  dataDependencies: ['characters'], // 依赖角色列表数据
                  config: {}, 
                  value: [] 
                }
              ]},
            ]
          }, value: null },
        ]
      },
      {
        id: 'world',
        name: '世界设定',
        icon: 'Map',
        color: '#10b981',
        components: [
          { id: 'era', type: 'select', label: '时代背景', config: {
            options: [
              { label: '古代', value: 'ancient' },
              { label: '现代', value: 'modern' },
              { label: '未来', value: 'future' },
              { label: '架空', value: 'fictional' },
            ]
          }, value: '' },
          { id: 'world-desc', type: 'textarea', label: '世界描述', config: { placeholder: '描述故事发生的世界...' }, value: '' },
          { id: 'rules', type: 'keyvalue', label: '世界规则', config: {}, value: [] },
          { id: 'factions', type: 'faction', label: '势力设定', config: {}, value: [], generatePrompt: '根据世界观背景，生成故事中的主要势力、组织或阵营，包含势力名称、简介、内部等级体系' },
        ]
      },
      {
        id: 'plot',
        name: '剧情设计',
        icon: 'Zap',
        color: '#f59e0b',
        components: [
          { id: 'mainline', type: 'textarea', label: '主线剧情', config: { placeholder: '描述主要剧情线...' }, value: '' },
          { id: 'conflicts', type: 'keyvalue', label: '核心冲突', config: {}, value: [] },
          { id: 'turning-points', type: 'list', label: '关键转折', config: {}, value: [] },
        ]
      },
    ]
  },
  {
    id: 'novel-romance',
    name: '言情小说模板',
    description: '重点突出感情线和人物关系',
    modules: [
      {
        id: 'basic-info',
        name: '基本信息',
        icon: 'FileText',
        color: '#3b82f6',
        components: [
          { id: 'subgenre', type: 'multiselect', label: '感情类型', config: { 
            options: [
              { label: '甜宠', value: 'sweet', color: '#f472b6' },
              { label: '虐恋', value: 'angst', color: '#6b7280' },
              { label: '先婚后爱', value: 'marriage-first', color: '#ec4899' },
              { label: '破镜重圆', value: 'reunion', color: '#8b5cf6' },
              { label: '暗恋', value: 'secret-love', color: '#06b6d4' },
              { label: '双向奔赴', value: 'mutual', color: '#10b981' },
            ],
            maxCount: 3
          }, value: [] },
          { id: 'summary', type: 'textarea', label: '作品简介', config: {}, value: '' },
        ]
      },
      {
        id: 'main-cp',
        name: '主CP设定',
        icon: 'Heart',
        color: '#ec4899',
        components: [
          { id: 'cp-tabs', type: 'tabs', label: 'CP管理', config: {
            tabs: [
              { id: 'profiles', label: '人物档案', components: [
                { id: 'female-lead', type: 'keyvalue', label: '女主角', config: {}, value: [] },
                { id: 'male-lead', type: 'keyvalue', label: '男主角', config: {}, value: [] },
              ]},
              { id: 'love-line', label: '感情线', components: [
                { id: 'stages', type: 'timeline', label: '感情发展', config: {}, value: [] },
              ]},
              { id: 'relations', label: '关系图', components: [
                { id: 'cp-relations', type: 'relation-graph', label: 'CP关系', config: {
                  nodeTypes: [
                    { type: 'female', label: '女性', color: '#ec4899' },
                    { type: 'male', label: '男性', color: '#3b82f6' },
                  ],
                  relationTypes: [
                    { type: 'lover', label: '恋人', color: '#ef4444' },
                    { type: 'rival', label: '情敌', color: '#f59e0b' },
                    { type: 'friend', label: '闺蜜/兄弟', color: '#10b981' },
                  ]
                }, value: { characters: [], relations: [] } }
              ]},
            ]
          }, value: null },
        ]
      },
      {
        id: 'sweet-points',
        name: '甜蜜设计',
        icon: 'Sparkles',
        color: '#f472b6',
        components: [
          { id: 'sweet-moments', type: 'keyvalue', label: '甜蜜高光', config: {}, value: [] },
          { id: 'conflicts', type: 'keyvalue', label: '感情冲突', config: {}, value: [] },
        ]
      },
    ]
  },
];

// ============ 图标映射 ============

const IconMap: Record<string, React.ReactNode> = {
  'FileText': <FileText size={18} />,
  'Map': <Map size={18} />,
  'Users': <Users size={18} />,
  'Building2': <Building2 size={18} />,
  'Heart': <Heart size={18} />,
  'Zap': <Zap size={18} />,
  'Sparkles': <Sparkles size={18} />,
  'List': <List size={18} />,
  'Tag': <Tag size={18} />,
  'LayoutGrid': <LayoutGrid size={18} />,
  'GitBranch': <GitBranch size={18} />,
  'Clock': <Clock size={18} />,
};

// ============ 分页标签子组件 ============

interface TabsComponentProps {
  tabs: { id: string; label: string; components: ComponentConfig[] }[];
  moduleId: string;
  tabsComponentId: string;  // tabs组件的ID
  renderComponent: (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => React.ReactNode;
  onUpdateTabs?: (tabs: { id: string; label: string; components: ComponentConfig[] }[]) => void;
  onAddComponentToTab?: (tabId: string) => void;
  onEditComponentInTab?: (comp: ComponentConfig, tabId: string) => void;
  isEditMode?: boolean;  // 是否处于编辑模式
}

function TabsComponent({ tabs, moduleId, tabsComponentId, renderComponent, onUpdateTabs, onAddComponentToTab, onEditComponentInTab, isEditMode = false }: TabsComponentProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '');

  if (tabs.length === 0) {
    return <div className="comp-empty">暂无标签页</div>;
  }

  const activeTabData = tabs.find(t => t.id === activeTab);
  const activeTabIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="comp-tabs">
      <div className="tabs-header">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tabs-content">
        {activeTabData && (
          <>
            {activeTabData.components.map(subComp => {
              const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system'].includes(subComp.type);
              return (
                <div key={subComp.id} className="comp-wrapper">
                  <div className="comp-header">
                    <label className="comp-label">{subComp.label}</label>
                    <div className="comp-header-actions">
                      {showGenerateBtn && (
                        <button 
                          className="comp-generate-btn" 
                          onClick={() => {
                            
                          }}
                          title={subComp.generatePrompt || '生成内容'}
                        >
                          <Sparkles size={14} />
                          <span>生成</span>
                        </button>
                      )}
                      {isEditMode && (
                        <>
                          <button
                            className="comp-edit-btn"
                            onClick={() => {
                              if (onEditComponentInTab) {
                                onEditComponentInTab(subComp, activeTab);
                              }
                            }}
                            title="编辑组件"
                          >
                            <Settings size={14} />
                          </button>
                          <button
                            className="comp-delete-btn"
                            onClick={() => {
                              if (onUpdateTabs && activeTabData) {
                                const newTabs = [...tabs];
                                newTabs[activeTabIndex] = {
                                  ...activeTabData,
                                  components: activeTabData.components.filter(c => c.id !== subComp.id)
                                };
                                onUpdateTabs(newTabs);
                              }
                            }}
                            title="删除组件"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {renderComponent(subComp, moduleId, tabsComponentId, activeTab)}
                </div>
              );
            })}
            {isEditMode && onAddComponentToTab && (
              <div className="tabs-add-component">
                <button
                  className="tabs-add-component-btn"
                  onClick={() => onAddComponentToTab(activeTab)}
                  title="在此分页中添加组件"
                >
                  <Plus size={16} />
                  <span>添加组件</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============ 数据依赖选择器组件 ============

interface DataDependenciesSelectorProps {
  value: string[];
  onChange: (deps: string[]) => void;
  template: TemplateConfig;
  currentComponentId?: string;
}

function DataDependenciesSelector({ value, onChange, template, currentComponentId }: DataDependenciesSelectorProps) {
  // 收集所有组件的 dataKey（排除当前组件）
  const availableDataKeys = useCallback(() => {
    const keys: { key: string; label: string; componentId: string }[] = [];
    
    const collectFromComponents = (components: ComponentConfig[], moduleName: string) => {
      for (const comp of components) {
        if (comp.dataKey && comp.id !== currentComponentId) {
          keys.push({
            key: comp.dataKey,
            label: `${moduleName} - ${comp.label} (${comp.dataKey})`,
            componentId: comp.id
          });
        }
        
        // 递归处理 tabs 中的组件
        if (comp.type === 'tabs' && comp.config?.tabs) {
          for (const tab of comp.config.tabs) {
            if (tab.components) {
              collectFromComponents(tab.components, `${moduleName} > ${tab.label}`);
            }
          }
        }
      }
    };
    
    for (const module of template.modules) {
      collectFromComponents(module.components, module.name);
    }
    
    return keys;
  }, [template, currentComponentId]);
  
  const dataKeys = availableDataKeys();
  const [newDepKey, setNewDepKey] = useState('');
  
  const handleAddDep = () => {
    if (newDepKey.trim() && !value.includes(newDepKey.trim())) {
      onChange([...value, newDepKey.trim()]);
      setNewDepKey('');
    }
  };
  
  const handleRemoveDep = (key: string) => {
    onChange(value.filter(k => k !== key));
  };
  
  return (
    <div className="data-dependencies-selector">
      <div className="deps-list">
        {value.map((key) => {
          const keyInfo = dataKeys.find(k => k.key === key);
          return (
            <div key={key} className="dep-tag">
              <span className="dep-key">{key}</span>
              {keyInfo && <span className="dep-label">{keyInfo.label}</span>}
              <button
                className="dep-remove"
                onClick={() => handleRemoveDep(key)}
                title="移除依赖"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      
      <div className="deps-add-row">
        {dataKeys.length > 0 ? (
          <select
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            className="deps-select"
          >
            <option value="">选择数据键...</option>
            {dataKeys
              .filter(k => !value.includes(k.key))
              .map(k => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
          </select>
        ) : (
          <input
            type="text"
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            placeholder="手动输入 dataKey"
            className="deps-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDepKey.trim() && !value.includes(newDepKey.trim())) {
                handleAddDep();
              }
            }}
          />
        )}
        {dataKeys.length > 0 && (
          <span className="deps-separator">或</span>
        )}
        {dataKeys.length > 0 && (
          <input
            type="text"
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            placeholder="手动输入 dataKey"
            className="deps-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDepKey.trim() && !value.includes(newDepKey.trim())) {
                handleAddDep();
              }
            }}
          />
        )}
        <button
          className="deps-add-btn"
          onClick={handleAddDep}
          disabled={!newDepKey.trim() || value.includes(newDepKey.trim())}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      
      {dataKeys.length === 0 && (
        <div className="deps-hint">暂无其他组件定义了 dataKey</div>
      )}
    </div>
  );
}

// ============ 主组件 ============

interface WorkInfoManagerProps {
  workId?: string | null;
}

export default function WorkInfoManager({ workId }: WorkInfoManagerProps = {}) {
  // 初始化时尝试从缓存加载（基于 workId）
  const [template, setTemplate] = useState<TemplateConfig>(() => {
    const cached = loadFromCache(workId || null);
    if (cached) {
      // 找到对应的模板并用缓存数据覆盖
      const baseTemplate = presetTemplates.find(t => t.id === cached.templateId) || presetTemplates[0];
      return {
        ...baseTemplate,
        modules: cached.modules
      };
    }
    return JSON.parse(JSON.stringify(presetTemplates[0]));
  });
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [createTemplateForm, setCreateTemplateForm] = useState({
    name: '',
    description: '',
    work_type: 'novel',
    category: '',
    is_public: false
  });
  const [userTemplates, setUserTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [addingToTab, setAddingToTab] = useState<{ tabId: string; componentId: string } | null>(null);
  // 跟踪每个时间线组件中正在编辑的事件ID：key 是组件ID，value 是正在编辑的事件ID
  const [editingTimelineEvents, setEditingTimelineEvents] = useState<{ [componentId: string]: string | null }>({});
  // 跟踪每个时间线事件的编辑表单数据：key 是 "组件ID-事件ID"，value 是编辑表单数据
  const [timelineEditForms, setTimelineEditForms] = useState<{ [key: string]: any }>({});
  const [newModuleForm, setNewModuleForm] = useState({ name: '', icon: 'LayoutGrid', color: '#64748b' });
  const [newComponentForm, setNewComponentForm] = useState<{
    type: ComponentType;
    label: string;
    config: any;
    generatePrompt: string;
    validatePrompt: string;
    tabsConfig: { id: string; label: string }[];
    cardFields: { key: string; label: string; type: 'text' | 'textarea' | 'image' }[];
    dataKey: string;
    dataDependencies: string[];
  }>({ type: 'text', label: '', config: {}, generatePrompt: '', validatePrompt: '', tabsConfig: [], cardFields: [], dataKey: '', dataDependencies: [] });
  const [addComponentStep, setAddComponentStep] = useState<'type' | 'config'>('type');
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editingComponentContext, setEditingComponentContext] = useState<{
    tabsComponentId?: string;
    tabId?: string;
  } | null>(null);
  const [newTabName, setNewTabName] = useState('');
  const [newCardFieldForm, setNewCardFieldForm] = useState({ label: '', type: 'text' as 'text' | 'textarea' | 'image' });
  const [newTagOption, setNewTagOption] = useState({ label: '', color: '#64748b' });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // 角色编辑弹窗状态
  const [characterModal, setCharacterModal] = useState<{
    isOpen: boolean;
    compId: string;
    moduleId: string;
    editIndex: number | null;
    form: { name: string; gender: string; type: string; description: string };
    tabsComponentId?: string;  // 如果组件在分页中，保存分页组件的ID
    tabId?: string;  // 如果组件在分页中，保存分页ID
  }>({
    isOpen: false,
    compId: '',
    moduleId: '',
    editIndex: null,
    form: { name: '', gender: '男', type: '主要角色', description: '' }
  });
  
  // 势力编辑弹窗状态
  const [factionModal, setFactionModal] = useState<{
    isOpen: boolean;
    compId: string;
    moduleId: string;
    editId: string | null; // null表示新建
    parentId: string | null; // 父级势力ID
    form: { name: string; summary: string; details: string; levels: string[] };
    newLevel: string;
  }>({
    isOpen: false,
    compId: '',
    moduleId: '',
    editId: null,
    parentId: null,
    form: { name: '', summary: '', details: '', levels: [] },
    newLevel: ''
  });
  
  // 势力展开状态
  const [expandedFactions, setExpandedFactions] = useState<Record<string, boolean>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);

  const activeModule = template.modules[activeModuleIndex];

  // 当 workId 变化时，从数据库加载模板配置
  useEffect(() => {
    const loadTemplate = async () => {
      if (!workId) {
        // 如果没有 workId，从本地缓存加载
        const cached = loadFromCache(null);
        if (cached) {
          const baseTemplate = presetTemplates.find(t => t.id === cached.templateId) || presetTemplates[0];
          setTemplate({
            ...baseTemplate,
            modules: cached.modules
          });
        } else {
          setTemplate(JSON.parse(JSON.stringify(presetTemplates[0])));
        }
        return;
      }

      try {
        // 从作品的 metadata 字段加载模板配置
        const workData = await worksApi.getWork(Number(workId));
        const templateConfig = workData.metadata?.template_config;
        const componentData = workData.metadata?.component_data || {};
        const charactersFromMetadata = workData.metadata?.characters || []; // 向后兼容
        
        if (templateConfig && 
            templateConfig.templateId && 
            templateConfig.modules &&
            Array.isArray(templateConfig.modules)) {
          // 从作品 metadata 加载成功
          
          
          
          
          // 尝试找到对应的预设模板或数据库模板
          let baseTemplate = presetTemplates.find(t => t.id === templateConfig.templateId);
          
          // 如果不是预设模板，尝试从数据库模板列表中找到（需要等待 userTemplates 加载）
          if (!baseTemplate && templateConfig.templateId.startsWith('db-')) {
            // 延迟加载，等待 userTemplates 加载完成
            const dataToMerge = { ...componentData }; // 保存到局部变量
            // 向后兼容：如果有 characters 字段，也添加到 component_data（使用 dataKey 'characters'）
            if (charactersFromMetadata.length > 0 && !dataToMerge['characters']) {
              dataToMerge['characters'] = charactersFromMetadata;
            }
            setTimeout(() => {
              const dbTemplateId = parseInt(templateConfig.templateId.replace('db-', ''));
              const dbTemplate = userTemplates.find(t => t.id === dbTemplateId);
              if (dbTemplate) {
                let modules = templateConfig.modules;
                // 将组件数据写入模板格式
                if (Object.keys(dataToMerge).length > 0) {
                  modules = writeComponentDataToTemplate(modules, dataToMerge);
                }
                setTemplate({
                  id: `db-${dbTemplate.id}`,
                  name: dbTemplate.name,
                  description: dbTemplate.description || '',
                  modules: modules
                });
              }
            }, 500);
            // 先使用默认模板结构
            baseTemplate = presetTemplates[0];
          }
          
          // 如果还是找不到，使用默认模板
          if (!baseTemplate) {
            baseTemplate = presetTemplates[0];
          }
          
          // 合并组件数据：优先使用 component_data，如果没有则使用 characters（向后兼容）
          const dataToWrite = { ...componentData };
          if (charactersFromMetadata.length > 0 && !dataToWrite['characters']) {
            dataToWrite['characters'] = charactersFromMetadata;
          }
          
          // 将简化格式的组件数据写入模板格式
          let modules = templateConfig.modules;
          
          // 如果从数据库加载的模板缺少 dataKey 和 dataDependencies，从预设模板中补充
          const mergePresetTemplateConfig = (dbModules: ModuleConfig[], presetModules: ModuleConfig[]): ModuleConfig[] => {
            return dbModules.map(dbModule => {
              const presetModule = presetModules.find(pm => pm.id === dbModule.id);
              if (!presetModule) return dbModule;
              
              const mergeComponents = (dbComps: ComponentConfig[], presetComps: ComponentConfig[]): ComponentConfig[] => {
                return dbComps.map(dbComp => {
                  const presetComp = presetComps.find(pc => pc.id === dbComp.id);
                  if (!presetComp) {
                    // 如果是 tabs，递归处理子组件
                    if (dbComp.type === 'tabs' && dbComp.config?.tabs) {
                      const presetTabsComp = presetComps.find(pc => pc.id === dbComp.id && pc.type === 'tabs');
                      if (presetTabsComp && presetTabsComp.config && presetTabsComp.config.tabs) {
                        const mergedTabs = dbComp.config.tabs.map((dbTab: any) => {
                          const presetTab = presetTabsComp.config!.tabs!.find((pt: any) => pt.id === dbTab.id);
                          if (presetTab && presetTab.components) {
                            return {
                              ...dbTab,
                              components: mergeComponents(dbTab.components || [], presetTab.components)
                            };
                          }
                          return dbTab;
                        });
                        return {
                          ...dbComp,
                          config: { ...dbComp.config, tabs: mergedTabs }
                        };
                      }
                    }
                    return dbComp;
                  }
                  
                  // 合并配置：保留数据库中的 value，但补充缺失的 dataKey 和 dataDependencies
                  return {
                    ...dbComp,
                    dataKey: dbComp.dataKey || presetComp.dataKey,
                    dataDependencies: dbComp.dataDependencies || presetComp.dataDependencies,
                    // 如果是 tabs，递归处理子组件
                    ...(dbComp.type === 'tabs' && dbComp.config?.tabs && presetComp.config && presetComp.config.tabs ? {
                      config: {
                        ...dbComp.config,
                        tabs: dbComp.config.tabs.map((dbTab: any) => {
                          const presetTab = presetComp.config!.tabs!.find((pt: any) => pt.id === dbTab.id);
                          if (presetTab && presetTab.components) {
                            return {
                              ...dbTab,
                              components: mergeComponents(dbTab.components || [], presetTab.components)
                            };
                          }
                          return dbTab;
                        })
                      }
                    } : {})
                  };
                });
              };
              
              return {
                ...dbModule,
                components: mergeComponents(dbModule.components, presetModule.components)
              };
            });
          };
          
          // 如果是从数据库模板加载，尝试从预设模板补充缺失的配置
          if (templateConfig.templateId && templateConfig.templateId.startsWith('db-')) {
            // 对于数据库模板，暂时不补充（因为数据库模板应该已经有完整的配置）
            // 如果数据库模板缺少配置，需要重新运行初始化脚本
          } else {
            // 如果是预设模板，直接使用预设模板补充
            const presetTemplate = presetTemplates.find(t => t.id === templateConfig.templateId);
            if (presetTemplate) {
              modules = mergePresetTemplateConfig(modules, presetTemplate.modules);
              console.log('✅ 从预设模板补充了缺失的 dataKey 和 dataDependencies');
            }
          }
          
          // 验证加载的模块配置中是否包含 dataKey 和 dataDependencies
          const validateLoadedModules = (components: ComponentConfig[], path: string = ''): void => {
            for (const comp of components) {
              const currentPath = path ? `${path} > ${comp.label || comp.id}` : comp.label || comp.id;
              if (comp.dataKey) {
                console.log(`✅ 加载 - 组件 "${currentPath}": dataKey="${comp.dataKey}", dataDependencies=${JSON.stringify(comp.dataDependencies || [])}`);
              }
              // 递归检查 tabs 中的组件
              if (comp.type === 'tabs' && comp.config?.tabs) {
                for (const tab of comp.config.tabs) {
                  if (tab.components) {
                    validateLoadedModules(tab.components, `${currentPath} > ${tab.label || tab.id}`);
                  }
                }
              }
            }
          };
          
          console.log('🔍 验证从数据库加载的模板配置中的 dataKey 和 dataDependencies:');
          for (const module of modules) {
            validateLoadedModules(module.components, module.name);
          }
          
          if (Object.keys(dataToWrite).length > 0) {
            modules = writeComponentDataToTemplate(modules, dataToWrite);
            console.log('✅ 从 metadata 将', Object.keys(dataToWrite).length, '个组件的数据写入模板格式');
            
            // 再次验证写入后的模块配置
            console.log('🔍 验证写入数据后的模板配置中的 dataKey 和 dataDependencies:');
            for (const module of modules) {
              validateLoadedModules(module.components, module.name);
            }
          }
          
          setTemplate({
            ...baseTemplate,
            modules: modules
          });
          
          // 同时更新本地缓存（使用模板ID作为key的一部分）
          saveToCache({
            templateId: templateConfig.templateId,
            modules: modules,
            lastModified: Date.now()
          }, workId, templateConfig.templateId);
        } else {
          
          // 数据库中没有，尝试从本地缓存加载（尝试加载最近使用的模板）
          // 先尝试从通用缓存加载
          const cached = loadFromCache(workId);
          if (cached) {
            const baseTemplate = presetTemplates.find(t => t.id === cached.templateId) || presetTemplates[0];
            setTemplate({
              ...baseTemplate,
              modules: cached.modules
            });
            // 同时保存到模板特定缓存
            saveToCache(cached, workId, cached.templateId);
          } else {
            setTemplate(JSON.parse(JSON.stringify(presetTemplates[0])));
          }
        }
      } catch (error) {
        // 静默处理模板配置加载失败，回退到本地缓存
        // 只在开发模式下输出详细错误信息
        if (import.meta.env.DEV) {
          console.warn('加载模板配置失败（使用本地缓存）:', error instanceof Error ? error.message : error);
        }
        // 加载失败，从本地缓存加载
        const cached = loadFromCache(workId);
        if (cached) {
          const baseTemplate = presetTemplates.find(t => t.id === cached.templateId) || presetTemplates[0];
          setTemplate({
            ...baseTemplate,
            modules: cached.modules
          });
        } else {
          setTemplate(JSON.parse(JSON.stringify(presetTemplates[0])));
        }
      }
    };

    loadTemplate();
  }, [workId]);

  // 从模板格式中提取所有组件数据（简化格式，按 dataKey 组织）
  const extractComponentDataFromTemplate = useCallback((modules: ModuleConfig[]): { [dataKey: string]: any } => {
    const componentData: { [dataKey: string]: any } = {};
    
    // 递归提取组件数据
    const extractFromComponents = (components: ComponentConfig[]) => {
      for (const comp of components) {
        // 如果组件有 dataKey，使用 dataKey 作为存储键
        // 注意：即使 value 是空数组或空对象，也应该保存 dataKey（因为 dataKey 是组件配置的一部分）
        if (comp.dataKey) {
          // 根据组件类型提取数据
          if (comp.type === 'character-card' && Array.isArray(comp.value)) {
            componentData[comp.dataKey] = comp.value;
          } else if (comp.type === 'relation-graph' && typeof comp.value === 'object') {
            // 关系图组件：只保存关系，角色来自角色列表（不保存）
            const relationValue = comp.value as { characters?: any[]; relations?: any[] } || {};
            
            // 确保保存的数据格式正确：只保存 relations，characters 始终为空
            componentData[comp.dataKey] = {
              characters: [], // 角色来自依赖的角色列表，不保存
              relations: Array.isArray(relationValue.relations) ? relationValue.relations : []  // 只保存关系
            };
            
            console.log(`💾 提取关系图谱数据 "${comp.dataKey}": 0 个角色（来自角色列表）, ${componentData[comp.dataKey].relations.length} 个关系`);
          } else if (comp.type === 'timeline') {
            // 时间线组件：如果是新格式（包含 events），只提取 events；否则提取整个 value
            if (comp.value && typeof comp.value === 'object' && 'events' in comp.value) {
              componentData[comp.dataKey] = comp.value.events;
            } else if (Array.isArray(comp.value)) {
              componentData[comp.dataKey] = comp.value;
            } else {
              // 即使 value 为空，也保存 dataKey（值为空数组）
              componentData[comp.dataKey] = [];
            }
          } else {
            // 其他类型：即使 value 为空，也保存 dataKey
            if (comp.value !== undefined && comp.value !== null && comp.value !== '') {
              componentData[comp.dataKey] = comp.value;
            } else {
              // 根据组件类型设置默认值
              if (comp.type === 'multiselect' || comp.type === 'list' || comp.type === 'keyvalue' || comp.type === 'table' || comp.type === 'card-list') {
                componentData[comp.dataKey] = [];
              } else if (comp.type === 'text' || comp.type === 'textarea') {
                componentData[comp.dataKey] = '';
              } else {
                componentData[comp.dataKey] = comp.value; // 保存原始值（可能是 null 或 undefined）
              }
            }
          }
        }
        
        // 递归处理 tabs 中的组件
        if (comp.type === 'tabs' && comp.config?.tabs) {
          for (const tab of comp.config.tabs) {
            if (tab.components) {
              extractFromComponents(tab.components);
            }
          }
        }
      }
    };
    
    // 遍历所有模块
    for (const module of modules) {
      extractFromComponents(module.components);
    }
    
    return componentData;
  }, []);

  // 将简化格式的组件数据写入模板格式（按 dataKey 匹配，并注入依赖数据）
  // 清理模板结构，移除所有组件的 value，只保留结构（包括 dataKey 和 dataDependencies）
  const cleanTemplateStructure = useCallback((modules: ModuleConfig[]): ModuleConfig[] => {
    const cleanComponents = (components: ComponentConfig[]): ComponentConfig[] => {
      return components.map(comp => {
        if (comp.type === 'tabs' && comp.config?.tabs) {
          return {
            ...comp,
            config: {
              ...comp.config,
              tabs: comp.config.tabs.map(tab => ({
                ...tab,
                components: tab.components ? cleanComponents(tab.components) : []
              }))
            },
            value: undefined // 清理 value
          };
        } else {
          // 保留所有结构信息（id, type, label, config, dataKey, dataDependencies 等），但清理 value
          return {
            ...comp,
            value: undefined // 清理 value，只保留结构
          };
        }
      });
    };
    
    return modules.map(module => ({
      ...module,
      components: cleanComponents(module.components)
    }));
  }, []);

  const writeComponentDataToTemplate = useCallback((modules: ModuleConfig[], componentData: { [dataKey: string]: any }): ModuleConfig[] => {
    if (!componentData || Object.keys(componentData).length === 0) return modules;
    
    // 递归写入组件数据
    const writeToComponents = (components: ComponentConfig[]): ComponentConfig[] => {
      return components.map(comp => {
        if (comp.type === 'tabs' && comp.config?.tabs) {
          return {
            ...comp,  // 保留所有属性，包括 dataKey 和 dataDependencies（虽然 tabs 组件通常不需要）
            config: {
              ...comp.config,
              tabs: comp.config.tabs.map(tab => {
                if (tab.components) {
                  return {
                    ...tab,
                    components: writeToComponents(tab.components)
                  };
                }
                return tab;
              })
            }
          };
        } else if (comp.dataKey) {
          // 如果组件有 dataKey，从 componentData 中获取数据
          // 重要：必须保留 comp 的所有属性，包括 dataKey 和 dataDependencies
          let value = comp.value;
          
          if (componentData[comp.dataKey] !== undefined) {
            // 根据组件类型合并数据
            if (comp.type === 'character-card' && Array.isArray(componentData[comp.dataKey])) {
              // 角色卡片：合并数组
              const existing = comp.value && Array.isArray(comp.value) ? comp.value : [];
              const newData = componentData[comp.dataKey];
              const charMap: { [key: string]: any } = {};
              
              existing.forEach((char: any) => {
                const key = char.name || char.id;
                if (key) charMap[key] = char;
              });
              
              newData.forEach((char: any) => {
                const key = char.name || char.id;
                if (key) {
                  if (charMap[key]) {
                    charMap[key] = { ...charMap[key], ...char };
                  } else {
                    charMap[key] = char;
                  }
                }
              });
              
              value = Object.values(charMap);
            } else if (comp.type === 'relation-graph' && typeof componentData[comp.dataKey] === 'object') {
              // 关系图：合并对象，确保正确处理 characters 和 relations 两个字段
              const existing = comp.value && typeof comp.value === 'object' ? comp.value : { characters: [], relations: [] };
              const newData = componentData[comp.dataKey];
              
              // 确保 newData 是对象格式，并且包含 characters 和 relations 两个字段
              if (newData && typeof newData === 'object') {
                // 优先使用 newData 中的数据（即使为空数组也要使用，因为可能是用户清空了数据）
                const restoredValue = {
                  characters: Array.isArray(newData.characters) ? newData.characters : (Array.isArray(existing.characters) ? existing.characters : []),
                  relations: Array.isArray(newData.relations) ? newData.relations : (Array.isArray(existing.relations) ? existing.relations : [])
                };
                
                console.log(`📥 恢复关系图谱数据 "${comp.dataKey}": ${restoredValue.characters.length} 个角色, ${restoredValue.relations.length} 个关系`);
                value = restoredValue;
              } else {
                // 如果 newData 格式不正确，使用现有数据
                console.log(`⚠️ 关系图谱数据格式不正确 "${comp.dataKey}", 使用现有数据`);
                value = {
                  characters: Array.isArray(existing.characters) ? existing.characters : [],
                  relations: Array.isArray(existing.relations) ? existing.relations : []
                };
              }
            } else {
              // 其他类型：直接使用新数据
              value = componentData[comp.dataKey];
            }
          }
          
          // 注入依赖数据（如果组件有 dataDependencies）
          if (comp.dataDependencies && comp.dataDependencies.length > 0) {
            const dependencies: { [key: string]: any } = {};
            comp.dataDependencies.forEach(depKey => {
              if (componentData[depKey] !== undefined) {
                dependencies[depKey] = componentData[depKey];
              }
            });
            
            // 将依赖数据注入到组件的 value 中（根据组件类型决定注入方式）
            if (comp.type === 'timeline' && Array.isArray(value)) {
              // 时间线组件：将依赖的角色数据作为元数据注入，供组件使用
              // 注意：这里不修改 value 数组本身，而是将依赖数据存储在组件的 _dependencies 属性中
              // 但为了保持数据结构的一致性，我们将依赖数据存储在 value 的顶层
              value = {
                events: value,
                _dependencies: dependencies // 将依赖数据作为元数据注入
              };
            } else if (comp.type === 'relation-graph' && typeof value === 'object') {
              // 关系图组件：只保存关系，角色来自角色列表（不保存）
              // 确保 value 是对象格式，包含 characters 和 relations
              const currentValue = value && typeof value === 'object' ? value : { characters: [], relations: [] };
              
              value = {
                characters: [], // 角色来自依赖的角色列表，不保存
                relations: Array.isArray(currentValue.relations) ? currentValue.relations : []  // 只保存关系
              };
              
              console.log(`💾 写入关系图谱数据到模板 "${comp.dataKey}": 0 个角色（来自角色列表）, ${value.relations.length} 个关系`);
              // 注意：角色数据会在渲染时（renderComponent）从依赖的角色列表中动态获取
            }
          }
          
          // 重要：使用展开运算符保留所有原始属性（包括 dataKey 和 dataDependencies），只更新 value
          return { 
            ...comp,  // 保留所有原始属性：id, type, label, config, dataKey, dataDependencies, generatePrompt, validatePrompt 等
            value     // 只更新 value
          };
        }
        // 对于没有 dataKey 的组件，直接返回（保留所有属性）
        return comp;
      });
    };
    
    // 遍历所有模块并写入数据
    return modules.map(module => ({
      ...module,
      components: writeToComponents(module.components)
    }));
  }, []);

  // 从模板中提取角色信息（用于保存到 characters 字段）
  const extractCharactersFromTemplate = useCallback((template: TemplateConfig): any[] => {
    const characters: any[] = [];
    
    // 查找角色模块
    const characterModule = template.modules.find(m => m.id === 'characters');
    if (!characterModule) return characters;

    // 查找角色卡片组件
    const findCharacterCards = (components: ComponentConfig[]): any[] => {
      const chars: any[] = [];
      for (const comp of components) {
        if (comp.type === 'character-card' && comp.value && Array.isArray(comp.value)) {
          chars.push(...comp.value);
        } else if (comp.type === 'tabs') {
          // tabs 组件的结构：config.tabs 包含标签页配置，每个 tab 的 components 包含实际组件
          if (comp.config && comp.config.tabs && Array.isArray(comp.config.tabs)) {
            for (const tab of comp.config.tabs) {
              if (tab.components && Array.isArray(tab.components)) {
                chars.push(...findCharacterCards(tab.components));
              }
            }
          }
          // 也检查 value 中是否有 tabs（向后兼容）
          if (comp.value && typeof comp.value === 'object' && 'tabs' in comp.value) {
            const tabsValue = comp.value as any;
            if (tabsValue.tabs && Array.isArray(tabsValue.tabs)) {
              for (const tab of tabsValue.tabs) {
                if (tab.components && Array.isArray(tab.components)) {
                  chars.push(...findCharacterCards(tab.components));
                }
              }
            }
          }
        }
      }
      return chars;
    };

    return findCharacterCards(characterModule.components);
  }, []);

  // 保存作品信息到 metadata（包括模板配置和所有组件数据）
  const saveWorkInfoToMetadata = useCallback(async (template: TemplateConfig) => {
    if (!workId) {
      return;
    }

    try {
      // 先从数据库获取当前的组件数据（可能包含从AI分析提取的数据）
      let existingComponentData: { [componentId: string]: any } = {};
      let charactersFromMetadata: any[] = []; // 保留用于向后兼容
      try {
        const workData = await worksApi.getWork(Number(workId));
        existingComponentData = workData.metadata?.component_data || {};
        charactersFromMetadata = workData.metadata?.characters || [];
        console.log('📥 从数据库获取到组件数据:', Object.keys(existingComponentData).length, '个组件');
      } catch (error) {
        console.warn('获取当前组件数据失败，继续使用模板中的数据:', error);
      }
      
      // 从模板格式中提取所有组件数据（简化格式）
      const componentDataFromTemplate = extractComponentDataFromTemplate(template.modules);
      console.log('📥 从模板中提取到组件数据:', Object.keys(componentDataFromTemplate).length, '个组件');
      
      // 合并组件数据：模板中的数据优先（最新），metadata 中的数据作为补充（用于向后兼容）
      const mergedComponentData: { [componentId: string]: any } = { ...componentDataFromTemplate };
      
      // 用 metadata 中的组件数据补充（只添加模板中没有的组件数据）
      for (const [componentId, data] of Object.entries(existingComponentData)) {
        if (!mergedComponentData[componentId]) {
          // 如果模板中没有这个组件的数据，使用 metadata 中的数据
          mergedComponentData[componentId] = data;
        } else {
          // 如果模板中已有数据，优先使用模板中的数据（因为这是最新的）
          // 但对于关系图，需要确保 relations 数组被正确保留
          if (typeof mergedComponentData[componentId] === 'object' && typeof data === 'object') {
            // 对于关系图，确保 relations 数组被正确保留（使用模板中的数据）
            if (Array.isArray(mergedComponentData[componentId].relations)) {
              console.log(`✅ 使用模板中的关系图谱数据 "${componentId}": ${mergedComponentData[componentId].relations.length} 个关系`);
              // 模板中的数据已经是最新的，不需要合并
            }
          }
        }
      }
      
      // 向后兼容：如果有 characters 字段，也合并到对应的组件中（使用 dataKey 'characters'）
      if (charactersFromMetadata.length > 0) {
        const charactersDataKey = 'characters'; // 使用 dataKey
        if (mergedComponentData[charactersDataKey]) {
          // 合并角色数据
          const existingChars = Array.isArray(mergedComponentData[charactersDataKey]) ? mergedComponentData[charactersDataKey] : [];
          const charMap: { [key: string]: any } = {};
          existingChars.forEach((char: any) => {
            const key = char.name || char.id;
            if (key) charMap[key] = char;
          });
          charactersFromMetadata.forEach(char => {
            const key = char.name || char.id;
            if (key) {
              if (charMap[key]) {
                charMap[key] = { ...charMap[key], ...char };
              } else {
                charMap[key] = char;
              }
            }
          });
          mergedComponentData[charactersDataKey] = Object.values(charMap);
        } else {
          mergedComponentData[charactersDataKey] = charactersFromMetadata;
        }
      }
      
      console.log('✅ 合并后共有', Object.keys(mergedComponentData).length, '个组件的数据');
      
      // 将合并后的组件数据写回模板格式
      const modulesWithData = writeComponentDataToTemplate(template.modules, mergedComponentData);
      
      // 验证 dataKey 和 dataDependencies 是否被保留
      const validateComponentConfig = (components: ComponentConfig[]): void => {
        for (const comp of components) {
          if (comp.type === 'tabs' && comp.config?.tabs) {
            for (const tab of comp.config.tabs) {
              if (tab.components) {
                validateComponentConfig(tab.components);
              }
            }
          } else {
            // 检查有 dataKey 的组件是否保留了 dataKey 和 dataDependencies
            if (comp.dataKey) {
              console.log(`✅ 组件 "${comp.label}" (${comp.id}): dataKey="${comp.dataKey}", dataDependencies=${JSON.stringify(comp.dataDependencies || [])}`);
            }
          }
        }
      };
      
      // 验证所有模块的组件配置
      console.log('🔍 验证保存的模板配置中的 dataKey 和 dataDependencies:');
      for (const module of modulesWithData) {
        validateComponentConfig(module.components);
      }
      
      // 从合并后的数据中提取角色数据（用于向后兼容 characters 字段）
      const characters = mergedComponentData['characters'] || [];
      
      // 构建要更新的 metadata
      const metadataUpdate: any = {
        // 保存模板配置（只保存 templateId，指向 work_template 表）
        // modules 结构从 work_template 表获取，不在这里保存
        template_config: {
          templateId: template.id, // 指向 work_template 的 ID（如 db-1 表示 work_template 表中 id=1）
          lastModified: Date.now()
        },
        // 保存简化格式的组件数据（使用 dataKey 作为键）
        component_data: mergedComponentData,
        // 向后兼容：同时保存角色数据到 characters 字段
        characters: characters.map((char: any) => ({
          name: char.name || '',
          display_name: char.display_name || char.name || '',
          description: char.description || '',
          gender: char.gender || '',
          type: char.type || '',
          personality: char.personality || {},
          appearance: char.appearance || {},
          background: char.background || {},
          ...char
        }))
      };

      // 直接保存到数据库（PUT 请求会返回更新后的作品信息，后端会合并 metadata）
      await worksApi.updateWork(Number(workId), {
        metadata: metadataUpdate
      });

      console.log('✅ 作品信息已保存：模板结构（含 dataKey）保存在 template_config.modules，组件数据保存在 component_data');
    } catch (error) {
      console.error('❌ 保存作品信息到 metadata 失败:', error);
    }
  }, [workId, extractComponentDataFromTemplate, writeComponentDataToTemplate, cleanTemplateStructure]);

  // 自动保存到数据库和缓存（防抖，基于 workId）
  useEffect(() => {
    // 如果模板为空或没有模块，不保存
    if (!template || !template.modules || template.modules.length === 0) {
      return;
    }

    const timer = setTimeout(async () => {
      const templateData = {
        templateId: template.id,
        modules: template.modules,
        lastModified: Date.now()
      };

      
      // 保存到本地缓存（使用模板ID作为key的一部分）
      try {
        saveToCache(templateData, workId || null, template.id);
        
      } catch (error) {
        console.error('保存到本地缓存失败:', error);
      }

      // 如果有 workId，直接保存到作品的 metadata 字段
      if (workId) {
        try {
          // 使用统一的保存函数
          await saveWorkInfoToMetadata(template);
          setHasUnsavedChanges(false);
        } catch (error) {
          console.error('❌ 保存作品信息到 metadata 失败:', error);
          // 保存失败时保持未保存状态
          setHasUnsavedChanges(true);
          // 显示错误提示
          if (error instanceof Error) {
            console.error('错误详情:', error.message);
          }
        }
      } else {
        // 没有 workId 时，只保存到缓存
        setHasUnsavedChanges(false);
      }
    }, 2000); // 2秒后自动保存（防抖）

    setHasUnsavedChanges(true);
    return () => {
      clearTimeout(timer);
    };
  }, [template, workId, saveWorkInfoToMetadata, extractCharactersFromTemplate]);


  // 更新组件值
  const updateComponentValue = (moduleId: string, componentId: string, value: any, parentTabId?: string) => {
    setTemplate(prev => {
      const updated = {
        ...prev,
        modules: prev.modules.map(m => {
          if (m.id !== moduleId) return m;
          return {
            ...m,
            components: updateComponentInList(m.components, componentId, value, parentTabId)
          };
        })
      };
      // 如果是关系图谱组件，添加调试信息
      if (value && typeof value === 'object' && Array.isArray(value.relations)) {
        console.log(`✅ updateComponentValue: 更新关系图谱组件 ${componentId}，${value.relations.length} 个关系`, value);
      }
      return updated;
    });
  };

  const updateComponentInList = (components: ComponentConfig[], targetId: string, value: any, parentTabId?: string): ComponentConfig[] => {
    return components.map(comp => {
      if (comp.id === targetId) {
        return { ...comp, value };
      }
      // 递归处理 tabs 组件
      if (comp.type === 'tabs' && comp.config.tabs) {
        return {
          ...comp,
          config: {
            ...comp.config,
            tabs: comp.config.tabs.map(tab => ({
              ...tab,
              components: updateComponentInList(tab.components, targetId, value, parentTabId)
            }))
          }
        };
      }
      return comp;
    });
  };

  // 加载用户模板列表
  useEffect(() => {
    const loadUserTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const templates = await templatesApi.listTemplates({
          work_type: 'novel',
          include_fields: false
        });
        
        setUserTemplates(templates || []);
      } catch (error) {
        // 静默处理模板列表加载失败，不影响主要功能
        // 只在开发模式下输出详细错误信息
        if (import.meta.env.DEV) {
          console.warn('加载模板列表失败（不影响使用）:', error instanceof Error ? error.message : error);
        }
        setUserTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };
    
    loadUserTemplates();
  }, []);

  // 当 userTemplates 加载完成后，重新加载模板配置（以便匹配数据库模板）
  useEffect(() => {
    if (workId && userTemplates.length > 0) {
      const reloadTemplate = async () => {
        try {
          // 从作品的 metadata 字段加载模板配置
          const workData = await worksApi.getWork(Number(workId));
          const templateConfig = workData.metadata?.template_config;
          
          if (templateConfig && 
              templateConfig.templateId && 
              templateConfig.modules &&
              Array.isArray(templateConfig.modules)) {
            // 检查是否是数据库模板
            if (templateConfig.templateId.startsWith('db-')) {
              const dbTemplateId = parseInt(templateConfig.templateId.replace('db-', ''));
              const dbTemplate = userTemplates.find(t => t.id === dbTemplateId);
              if (dbTemplate) {
                
                setTemplate({
                  id: `db-${dbTemplate.id}`,
                  name: dbTemplate.name,
                  description: dbTemplate.description || '',
                  modules: templateConfig.modules
                });
              }
            }
          }
        } catch (error) {
          console.error('重新加载模板配置失败:', error);
        }
      };
      reloadTemplate();
    }
  }, [workId, userTemplates.length]);

  // 应用模板
  const applyTemplate = async (t: TemplateConfig) => {
    
    
    // 如果有 workId，先保存当前编辑的内容
    if (workId && template && template.modules) {
      try {
        // 直接保存到作品的 metadata 字段
        await saveWorkInfoToMetadata(template);
        
      } catch (error) {
        console.error('切换模板前保存失败:', error);
        // 即使保存失败，也继续切换模板
      }
    }
    
    const newTemplate = JSON.parse(JSON.stringify(t));
    
    
    // 确保 modules 是数组
    if (!Array.isArray(newTemplate.modules)) {
      console.warn('模板 modules 不是数组，设置为空数组');
      newTemplate.modules = [];
    }
    
    // 如果有 workId，尝试加载该作品保存的模板配置
    if (workId) {
      try {
        // 从作品的 metadata 字段加载模板配置
        const workData = await worksApi.getWork(Number(workId));
        const templateConfig = workData.metadata?.template_config;
        const componentData = workData.metadata?.component_data || {};
        const charactersFromMetadata = workData.metadata?.characters || []; // 向后兼容
        
        if (templateConfig && templateConfig.templateId === newTemplate.id) {
          // 从 work_template 获取结构（modules 应该只包含结构，不包含数据）
          // 如果 newTemplate.id 是 db-1 格式，从 work_template 表获取
          let modules = newTemplate.modules; // 从 work_template 获取结构
          
          // 向后兼容：如果 template_config 中有 modules，使用它（但应该从 work_template 获取）
          if (templateConfig.modules && Array.isArray(templateConfig.modules) && templateConfig.modules.length > 0) {
            // 向后兼容：使用保存的 modules（但未来应该从 work_template 获取）
            modules = templateConfig.modules;
          }
          
          // 合并组件数据：优先使用 component_data，如果没有则使用 characters（向后兼容）
          const dataToWrite = { ...componentData };
          if (charactersFromMetadata.length > 0 && !dataToWrite['characters']) {
            dataToWrite['characters'] = charactersFromMetadata;
          }
          
          // 从 work_template 获取结构（modules 应该只包含结构，不包含数据）
          // 从 work 的 component_data 获取数据，然后合并到结构中
          if (Object.keys(dataToWrite).length > 0) {
            modules = writeComponentDataToTemplate(modules, dataToWrite);
            console.log('✅ 从 work 的 component_data 将', Object.keys(dataToWrite).length, '个组件的数据写入模板结构');
          }
          
          newTemplate.modules = modules;
        }
      } catch (error) {
        console.error('加载保存的模板内容失败:', error);
        // 加载失败，使用模板默认内容
      }
    }
    
    setTemplate(newTemplate);
    setActiveModuleIndex(0);
    setShowTemplateSelector(false);
    
    
  };

  // 应用数据库模板
  const applyDatabaseTemplate = async (dbTemplate: any) => {
    try {
      
      
      // 如果有 workId，先保存当前编辑的内容
      if (workId && template && template.modules) {
        try {
          const currentTemplateData = {
            templateId: template.id,
            modules: template.modules,
            lastModified: Date.now()
          };
          await templatesApi.saveWorkTemplateConfig(Number(workId), currentTemplateData);
          
        } catch (error) {
          console.error('切换模板前保存失败:', error);
          // 即使保存失败，也继续切换模板
        }
      }
      
      // 从数据库模板的 template_config 中提取配置
      const templateConfig = dbTemplate.template_config || {};
      
      
      // 确保 modules 存在且是数组
      let modules = [];
      if (templateConfig.modules && Array.isArray(templateConfig.modules)) {
        modules = templateConfig.modules;
      } else if (Array.isArray(templateConfig)) {
        // 如果 template_config 本身就是 modules 数组
        modules = templateConfig;
      } else {
        console.warn('模板配置中没有找到有效的 modules，使用空数组');
        modules = [];
      }
      
      
      
      const newTemplate: TemplateConfig = {
        id: `db-${dbTemplate.id}`,
        name: dbTemplate.name || '未命名模板',
        description: dbTemplate.description || '',
        modules: modules
      };
      
      
      
      // 如果有 workId，尝试从本地缓存加载该模板的保存内容
      if (workId) {
        try {
          // 优先从本地缓存加载（每个模板独立保存）
          const cached = loadFromCache(workId, newTemplate.id);
          if (cached && cached.modules && Array.isArray(cached.modules) && cached.modules.length > 0) {
            
            newTemplate.modules = cached.modules;
          } else {
            // 如果本地缓存没有，尝试从数据库加载
            const response = await templatesApi.getWorkTemplateConfig(Number(workId));
            
            
            
            
            // 从 work 的 metadata 加载数据
            const workData = await worksApi.getWork(Number(workId));
            const componentData = workData.metadata?.component_data || {};
            const charactersFromMetadata = workData.metadata?.characters || [];
            
            // 合并组件数据：优先使用 component_data，如果没有则使用 characters（向后兼容）
            const dataToWrite = { ...componentData };
            if (charactersFromMetadata.length > 0 && !dataToWrite['characters']) {
              dataToWrite['characters'] = charactersFromMetadata;
            }
            
            // 从 work_template 获取结构（modules 应该只包含结构，不包含数据）
            let modules = newTemplate.modules; // 从模板获取结构
            
            // 如果有保存的 template_config，使用它（但应该只包含结构）
            if (response.template_config && 
                response.template_config.templateId === newTemplate.id &&
                response.template_config.modules &&
                Array.isArray(response.template_config.modules) &&
                response.template_config.modules.length > 0) {
              // 使用保存的结构（应该不包含数据）
              modules = response.template_config.modules;
            }
            
            // 从 work 的 component_data 获取数据，然后合并到结构中
            if (Object.keys(dataToWrite).length > 0) {
              modules = writeComponentDataToTemplate(modules, dataToWrite);
              console.log('✅ 从 work 的 component_data 将', Object.keys(dataToWrite).length, '个组件的数据写入模板结构');
            }
            
            newTemplate.modules = modules;
            
            // 同时保存到本地缓存
            saveToCache({
              templateId: newTemplate.id,
              modules: modules,
              lastModified: Date.now()
            }, workId, newTemplate.id);
          }
        } catch (error) {
          console.error('加载保存的模板内容失败:', error);
          // 加载失败，使用模板默认内容
        }
      }
      
      // 应用模板
      const copiedTemplate = JSON.parse(JSON.stringify(newTemplate));
      
      // 确保 modules 是数组
      if (!Array.isArray(copiedTemplate.modules)) {
        console.warn('模板 modules 不是数组，设置为空数组');
        copiedTemplate.modules = [];
      }
      
      setTemplate(copiedTemplate);
      setActiveModuleIndex(0);
      setShowTemplateSelector(false);
      
      
    } catch (error) {
      console.error('应用数据库模板失败:', error);
      alert('应用模板失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 创建新模板
  const handleCreateTemplate = async () => {
    if (!createTemplateForm.name.trim()) {
      alert('请输入模板名称');
      return;
    }

    try {
      // 验证模板配置中是否包含 dataKey 和 dataDependencies
      const validateTemplateConfig = (components: ComponentConfig[]): void => {
        for (const comp of components) {
          if (comp.type === 'tabs' && comp.config?.tabs) {
            for (const tab of comp.config.tabs) {
              if (tab.components) {
                validateTemplateConfig(tab.components);
              }
            }
          } else {
            if (comp.dataKey) {
              console.log(`✅ 创建模板 - 组件 "${comp.label}" (${comp.id}): dataKey="${comp.dataKey}", dataDependencies=${JSON.stringify(comp.dataDependencies || [])}`);
            }
          }
        }
      };
      
      console.log('🔍 验证创建模板时的 dataKey 和 dataDependencies:');
      for (const module of template.modules) {
        validateTemplateConfig(module.components);
      }
      
      // 清理模板结构，移除所有 value，只保留结构（包括 dataKey 和 dataDependencies）
      const cleanModules = cleanTemplateStructure(template.modules);
      
      const templateData = {
        name: createTemplateForm.name,
        description: createTemplateForm.description || undefined,
        work_type: createTemplateForm.work_type,
        category: createTemplateForm.category || undefined,
        is_public: createTemplateForm.is_public,
        template_config: {
          templateId: `custom-${Date.now()}`,
          modules: cleanModules  // 只保存结构（包括 dataKey 和 dataDependencies），不保存数据
        },
        settings: {},
        tags: []
      };

      console.log('📤 发送创建模板请求，template_config.modules 包含', template.modules.length, '个模块');
      const createdTemplate = await templatesApi.createTemplate(templateData);
      console.log('✅ 模板创建成功，ID:', createdTemplate.id);
      
      // 更新当前模板的 ID
      const newTemplate = {
        ...template,
        id: `db-${createdTemplate.id || Date.now()}`,
        name: createTemplateForm.name,
        description: createTemplateForm.description
      };
      setTemplate(newTemplate);
      
      // 重新加载模板列表
      try {
        const templates = await templatesApi.listTemplates({
          work_type: 'novel',
          include_fields: false
        });
        setUserTemplates(templates);
      } catch (error) {
        console.error('重新加载模板列表失败:', error);
      }
      
      // 关闭弹窗并重置表单
      setShowCreateTemplate(false);
      setShowTemplateSelector(false);
      setCreateTemplateForm({
        name: '',
        description: '',
        work_type: 'novel',
        category: '',
        is_public: false
      });
      
      alert('模板创建成功！');
    } catch (error) {
      console.error('创建模板失败:', error);
      alert('创建模板失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 添加模块
  const addModule = () => {
    if (!newModuleForm.name.trim()) return;
    const newModule: ModuleConfig = {
      id: `module-${Date.now()}`,
      name: newModuleForm.name.trim(),
      icon: newModuleForm.icon,
      color: newModuleForm.color,
      components: []
    };
    setTemplate(prev => ({ ...prev, modules: [...prev.modules, newModule] }));
    setActiveModuleIndex(template.modules.length);
    setShowAddModule(false);
    setNewModuleForm({ name: '', icon: 'LayoutGrid', color: '#64748b' });
  };

  // 删除模块
  const deleteModule = (index: number) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.filter((_, i) => i !== index)
    }));
    if (activeModuleIndex >= template.modules.length - 1) {
      setActiveModuleIndex(Math.max(0, activeModuleIndex - 1));
    }
  };

  // 添加组件到当前模块
  const addComponentToModule = () => {
    if (!newComponentForm.label.trim() || !activeModule) return;
    
    // 如果是 tabs 类型，必须至少有一个分页
    if (newComponentForm.type === 'tabs' && newComponentForm.tabsConfig.length === 0) {
      return;
    }
    
    // 如果是 card-list 类型，必须至少有一个字段
    if (newComponentForm.type === 'card-list' && newComponentForm.cardFields.length === 0) {
      return;
    }
    
    const compDef = componentRegistry.find(c => c.type === newComponentForm.type);
    
    // 构建配置
    let finalConfig = { ...compDef?.defaultConfig, ...newComponentForm.config };
    
    // 如果是 tabs 类型，转换 tabsConfig 为实际的 tabs 配置
    if (newComponentForm.type === 'tabs') {
      finalConfig.tabs = newComponentForm.tabsConfig.map(t => ({
        id: t.id,
        label: t.label,
        components: []
      }));
    }
    
    // 如果是 card-list 类型，设置 cardFields 配置
    if (newComponentForm.type === 'card-list') {
      finalConfig.cardFields = newComponentForm.cardFields.map(f => ({
        key: f.label.toLowerCase().replace(/\s+/g, '_'),
        label: f.label,
        type: f.type
      }));
    }
    
    const newComp: ComponentConfig = {
      id: `comp-${Date.now()}`,
      type: newComponentForm.type,
      label: newComponentForm.label.trim(),
      config: finalConfig,
      generatePrompt: newComponentForm.generatePrompt.trim() || undefined,
      validatePrompt: newComponentForm.validatePrompt.trim() || undefined,
      // tabs 组件不需要 dataKey 和 dataDependencies
      dataKey: newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataKey.trim() || undefined),
      dataDependencies: newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataDependencies.length > 0 ? newComponentForm.dataDependencies : undefined),
      value: getDefaultValue(newComponentForm.type),
    };
    
    // 如果是要添加到分页中
    if (addingToTab) {
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map(m => {
          return {
            ...m,
            components: m.components.map(comp => {
              if (comp.id === addingToTab.componentId && comp.type === 'tabs' && comp.config.tabs) {
                return {
                  ...comp,
                  config: {
                    ...comp.config,
                    tabs: comp.config.tabs.map(tab => {
                      if (tab.id === addingToTab.tabId) {
                        return {
                          ...tab,
                          components: [...tab.components, newComp]
                        };
                      }
                      return tab;
                    })
                  }
                };
              }
              return comp;
            })
          };
        })
      }));
      setAddingToTab(null);
    } else {
      // 添加到模块中
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map((m, i) => 
          i === activeModuleIndex 
            ? { ...m, components: [...m.components, newComp] }
            : m
        )
      }));
    }
    closeAddComponentModal();
  };

  // 关闭添加/编辑组件弹窗
  const closeAddComponentModal = () => {
    setShowAddComponent(false);
    setAddComponentStep('type');
    setEditingComponentId(null);
    setEditingComponentContext(null);
    setAddingToTab(null);
    setNewComponentForm({ type: 'text', label: '', config: {}, generatePrompt: '', validatePrompt: '', tabsConfig: [], cardFields: [], dataKey: '', dataDependencies: [] });
    setNewTabName('');
    setNewCardFieldForm({ label: '', type: 'text' });
    setNewTagOption({ label: '', color: '#64748b' });
  };

  // 关闭添加模块弹窗
  const closeAddModuleModal = () => {
    setShowAddModule(false);
    setNewModuleForm({ name: '', icon: 'LayoutGrid', color: '#64748b' });
  };

  // 选择组件类型后进入配置步骤
  const selectComponentType = (type: ComponentType) => {
    const compDef = componentRegistry.find(c => c.type === type);
    setNewComponentForm(prev => ({ 
      ...prev, 
      type, 
      config: { ...compDef?.defaultConfig } 
    }));
    setAddComponentStep('config');
  };

  // 开始编辑组件
  const startEditComponent = (comp: ComponentConfig, tabsComponentId?: string, tabId?: string) => {
    setEditingComponentId(comp.id);
    setEditingComponentContext(tabsComponentId && tabId ? { tabsComponentId, tabId } : null);
    
    // 如果是 tabs 类型，提取 tabsConfig
    const tabsConfig = comp.type === 'tabs' && comp.config.tabs
      ? comp.config.tabs.map((t: any) => ({ id: t.id, label: t.label }))
      : [];
    
    // 如果是 card-list 类型，提取 cardFields
    const cardFields = comp.type === 'card-list' && comp.config.cardFields
      ? comp.config.cardFields.map((f: any) => ({ key: f.key, label: f.label, type: f.type }))
      : [];
    
    setNewComponentForm({
      type: comp.type,
      label: comp.label,
      config: { ...comp.config },
      generatePrompt: comp.generatePrompt || '',
      validatePrompt: comp.validatePrompt || '',
      tabsConfig,
      cardFields,
      dataKey: comp.dataKey || '',
      dataDependencies: comp.dataDependencies || [],
    });
    setAddComponentStep('config');
    setShowAddComponent(true);
  };

  // 保存编辑的组件
  const saveEditedComponent = () => {
    if (!editingComponentId || !newComponentForm.label.trim() || !activeModule) return;
    
    // 如果是 tabs 类型，必须至少有一个分页
    if (newComponentForm.type === 'tabs' && newComponentForm.tabsConfig.length === 0) {
      return;
    }
    
    // 如果是 card-list 类型，必须至少有一个字段
    if (newComponentForm.type === 'card-list' && newComponentForm.cardFields.length === 0) {
      return;
    }
    
    // 如果是在 tabs 中的组件
    if (editingComponentContext?.tabsComponentId && editingComponentContext?.tabId) {
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map((m, i) => 
          i === activeModuleIndex 
            ? { 
                ...m, 
                components: m.components.map(c => {
                  // 找到 tabs 组件
                  if (c.id === editingComponentContext.tabsComponentId && c.type === 'tabs') {
                    const updatedTabs = (c.config.tabs || []).map((tab: any) => {
                      if (tab.id === editingComponentContext.tabId) {
                        // 更新该 tab 中的组件
                        return {
                          ...tab,
                          components: tab.components.map((subComp: ComponentConfig) => {
                            if (subComp.id === editingComponentId) {
                              return {
                                ...subComp,
                                label: newComponentForm.label.trim(),
                                config: { ...newComponentForm.config },
                                generatePrompt: newComponentForm.generatePrompt.trim() || undefined,
                                validatePrompt: newComponentForm.validatePrompt.trim() || undefined,
                                // tabs 组件不需要 dataKey 和 dataDependencies
                                dataKey: newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataKey.trim() || undefined),
                                dataDependencies: newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataDependencies.length > 0 ? newComponentForm.dataDependencies : undefined),
                              };
                            }
                            return subComp;
                          })
                        };
                      }
                      return tab;
                    });
                    return {
                      ...c,
                      config: {
                        ...c.config,
                        tabs: updatedTabs
                      }
                    };
                  }
                  return c;
                })
              }
            : m
        )
      }));
    } else {
      // 普通组件
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map((m, i) => 
          i === activeModuleIndex 
            ? { 
                ...m, 
                components: m.components.map(c => {
                  if (c.id !== editingComponentId) return c;
                  
                  let newConfig = { ...newComponentForm.config };
                  
                  // 如果是 tabs 类型，更新 tabs 配置（保留已有的 components）
                  if (newComponentForm.type === 'tabs') {
                    const existingTabs = c.config.tabs || [];
                    newConfig.tabs = newComponentForm.tabsConfig.map(t => {
                      const existingTab = existingTabs.find((et: any) => et.id === t.id);
                      return {
                        id: t.id,
                        label: t.label,
                        components: existingTab?.components || []
                      };
                    });
                  }
                  
                  // 如果是 card-list 类型，更新 cardFields 配置
                  if (newComponentForm.type === 'card-list') {
                    newConfig.cardFields = newComponentForm.cardFields.map(f => ({
                      key: f.label.toLowerCase().replace(/\s+/g, '_'),
                      label: f.label,
                      type: f.type
                    }));
                  }
                  
                  return {
                    ...c,
                    label: newComponentForm.label.trim(),
                    config: newConfig,
                    generatePrompt: newComponentForm.generatePrompt.trim() || undefined,
                    validatePrompt: newComponentForm.validatePrompt.trim() || undefined,
                    dataKey: newComponentForm.dataKey.trim() || undefined,
                    dataDependencies: newComponentForm.dataDependencies.length > 0 ? newComponentForm.dataDependencies : undefined,
                  };
                })
              }
            : m
        )
      }));
    }
    closeAddComponentModal();
  };

  // 删除组件
  const deleteComponent = (componentId: string) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map((m, i) => 
        i === activeModuleIndex 
          ? { ...m, components: m.components.filter(c => c.id !== componentId) }
          : m
      )
    }));
  };

  // 获取默认值
  const getDefaultValue = (type: ComponentType): any => {
    switch (type) {
      case 'multiselect':
      case 'list':
      case 'keyvalue':
      case 'table':
      case 'timeline':
      case 'card-list':
      case 'character-card':
      case 'rank-system':
      case 'faction':
        return [];
      case 'relation-graph':
        return { characters: [], relations: [] };
      case 'tabs':
        return null;
      default:
        return '';
    }
  };

  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentImageId || !activeModule) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      updateComponentValue(activeModule.id, currentImageId, event.target?.result as string);
      setCurrentImageId(null);
    };
    reader.readAsDataURL(file);
  };

  // ============ 组件渲染器 ============
  
  const renderComponent = (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => {
    const updateValue = (value: any) => updateComponentValue(moduleId, comp.id, value);

    switch (comp.type) {
      case 'text':
        return (
          <div className="comp-input-wrapper">
          <input
            type="text"
            className="comp-input"
            value={comp.value || ''}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
          />
          </div>
        );

      case 'textarea':
        return (
          <div className="comp-textarea-wrapper">
          <textarea
            className="comp-textarea"
            value={comp.value || ''}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
            rows={4}
          />
          </div>
        );

      case 'image':
        return (
          <div className="comp-image">
            {comp.value ? (
              <div className="image-preview">
                <img src={comp.value} alt={comp.label} />
                <div className="image-overlay">
                  <button onClick={() => { setCurrentImageId(comp.id); fileInputRef.current?.click(); }}>更换</button>
                  <button onClick={() => updateValue('')}>删除</button>
                </div>
              </div>
            ) : (
              <button className="image-upload-btn" onClick={() => { setCurrentImageId(comp.id); fileInputRef.current?.click(); }}>
                <Image size={24} />
                <span>点击上传</span>
              </button>
            )}
          </div>
        );

      case 'select':
        return (
          <select
            className="comp-select"
            value={comp.value || ''}
            onChange={(e) => updateValue(e.target.value)}
          >
            <option value="">请选择...</option>
            {comp.config.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );

      case 'multiselect':
        const selected = (comp.value as string[]) || [];
        const maxCount = comp.config.maxCount || 5;
        return (
          <div className="comp-multiselect">
            <div className="selected-tags">
              {selected.map(val => {
                const opt = comp.config.options?.find(o => o.value === val);
                return (
                  <span key={val} className="tag-item" style={{ background: opt?.color || '#64748b' }}>
                    {opt?.label || val}
                    <button onClick={() => updateValue(selected.filter(v => v !== val))}><X size={12} /></button>
                  </span>
                );
              })}
              {selected.length === 0 && <span className="placeholder">点击下方标签选择</span>}
            </div>
            {selected.length < maxCount && (
              <div className="available-tags">
                {comp.config.options?.filter(o => !selected.includes(o.value)).map(opt => (
                  <button
                    key={opt.value}
                    className="tag-option"
                    style={{ borderColor: opt.color, color: opt.color }}
                    onClick={() => updateValue([...selected, opt.value])}
                  >
                    + {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case 'list':
        const listItems = (comp.value as string[]) || [];
        return (
          <div className="comp-list">
            {listItems.map((item, i) => (
              <div key={i} className="list-row">
                <span className="list-num">{i + 1}</span>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const newList = [...listItems];
                    newList[i] = e.target.value;
                    updateValue(newList);
                  }}
                  placeholder="输入内容..."
                />
                <button className="list-del" onClick={() => updateValue(listItems.filter((_, idx) => idx !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <button className="list-add" onClick={() => updateValue([...listItems, ''])}>
              <Plus size={14} /> 添加项目
            </button>
          </div>
        );

      case 'keyvalue':
        const kvItems = (comp.value as { key: string; value: string }[]) || [];
        return (
          <div className="comp-keyvalue">
            {kvItems.map((item, i) => (
              <div key={i} className="kv-card">
                <div className="kv-header">
                  <span className="kv-num">{i + 1}</span>
                  <input
                    type="text"
                    className="kv-key"
                    value={item.key}
                    onChange={(e) => {
                      const newItems = [...kvItems];
                      newItems[i] = { ...item, key: e.target.value };
                      updateValue(newItems);
                    }}
                    placeholder="标题"
                  />
                  <button onClick={() => updateValue(kvItems.filter((_, idx) => idx !== i))}><X size={14} /></button>
                </div>
                <textarea
                  className="kv-value"
                  value={item.value}
                  onChange={(e) => {
                    const newItems = [...kvItems];
                    newItems[i] = { ...item, value: e.target.value };
                    updateValue(newItems);
                  }}
                  placeholder="详细描述..."
                  rows={2}
                />
              </div>
            ))}
            <button className="list-add" onClick={() => updateValue([...kvItems, { key: '', value: '' }])}>
              <Plus size={14} /> 添加项目
            </button>
          </div>
        );

      case 'table':
        const tableData = (comp.value as Record<string, string>[]) || [];
        const columns = comp.config.columns || [];
        return (
          <div className="comp-table">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {columns.map(col => <th key={col.key} style={{ width: col.width }}>{col.label}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => (
                    <tr key={i}>
                      <td className="row-num">{i + 1}</td>
                      {columns.map(col => (
                        <td key={col.key}>
                          <input
                            type="text"
                            value={row[col.key] || ''}
                            onChange={(e) => {
                              const newData = [...tableData];
                              newData[i] = { ...row, [col.key]: e.target.value };
                              updateValue(newData);
                            }}
                          />
                        </td>
                      ))}
                      <td>
                        <button onClick={() => updateValue(tableData.filter((_, idx) => idx !== i))}><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="list-add" onClick={() => {
              const newRow: Record<string, string> = {};
              columns.forEach(c => newRow[c.key] = '');
              updateValue([...tableData, newRow]);
            }}>
              <Plus size={14} /> 添加行
            </button>
          </div>
        );

      case 'tabs':
        const tabs = comp.config.tabs || [];
        const handleUpdateTabs = (newTabs: { id: string; label: string; components: ComponentConfig[] }[]) => {
          const updatedConfig = {
            ...comp.config,
            tabs: newTabs
          };
          setTemplate(prev => ({
            ...prev,
            modules: prev.modules.map(m => {
              if (m.id !== moduleId) return m;
              return {
                ...m,
                components: m.components.map(c => {
                  if (c.id === comp.id) {
                    return { ...c, config: updatedConfig };
                  }
                  return c;
                })
              };
            })
          }));
        };
        const handleAddComponentToTab = (tabId: string) => {
          // 打开添加组件弹窗，并标记是要添加到分页中
          setAddingToTab({ tabId, componentId: comp.id });
          setShowAddComponent(true);
          setAddComponentStep('type');
        };
        const handleEditComponentInTab = (subComp: ComponentConfig, tabId: string) => {
          // 编辑 tabs 中的组件
          startEditComponent(subComp, comp.id, tabId);
        };
        return (
          <TabsComponent 
            tabs={tabs} 
            moduleId={moduleId}
            tabsComponentId={comp.id}
            renderComponent={renderComponent}
            onUpdateTabs={handleUpdateTabs}
            onAddComponentToTab={handleAddComponentToTab}
            onEditComponentInTab={handleEditComponentInTab}
            isEditMode={isEditMode}
          />
        );

      case 'relation-graph':
        // 转换数据格式
        // 确保 comp.value 是对象格式，包含 characters 和 relations 两个字段
        let relationData: { characters?: any[]; relations?: any[] } = {};
        if (comp.value && typeof comp.value === 'object') {
          relationData = {
            characters: Array.isArray(comp.value.characters) ? comp.value.characters : [],
            relations: Array.isArray(comp.value.relations) ? comp.value.relations : []
          };
        } else {
          // 如果 comp.value 不存在或格式不正确，初始化为空对象
          relationData = { characters: [], relations: [] };
        }
        
        // 如果组件有依赖，尝试从依赖中获取角色数据
        if (comp.dataDependencies && comp.dataDependencies.length > 0) {
          // 重要：如果关系图谱组件有依赖，角色数据应该完全来自依赖，而不是 comp.value.characters
          // 因为 comp.value.characters 在保存时被设置为空数组（避免数据翻倍）
          // 所以这里应该忽略 comp.value.characters，只从依赖中获取角色数据
          
          // 从模板中查找依赖的组件数据
          const findDependencyData = (depKey: string): any[] => {
            for (const module of template.modules) {
              const findInComponents = (components: ComponentConfig[], path: string = ''): any[] | null => {
                for (const compItem of components) {
                  // 检查当前组件是否匹配
                  if (compItem.dataKey === depKey) {
                    // 即使 value 是空数组，也应该返回（这样关系图谱至少能显示，只是没有角色）
                    if (compItem.value !== undefined && compItem.value !== null) {
                      if (Array.isArray(compItem.value)) {
                        return compItem.value; // 即使为空数组也返回
                      } else if (typeof compItem.value === 'object' && compItem.value !== null) {
                        // 如果是对象，尝试提取数组字段
                        const obj = compItem.value as any;
                        if (Array.isArray(obj.characters)) {
                          return obj.characters;
                        }
                      }
                    } else {
                      return []; // 返回空数组而不是 null
                    }
                  }
                  
                  // 递归查找 tabs 中的组件
                  if (compItem.type === 'tabs' && compItem.config?.tabs) {
                    for (const tab of compItem.config.tabs) {
                      if (tab.components) {
                        const found = findInComponents(tab.components, `${path} > ${tab.label || tab.id}`);
                        if (found) return found;
                      }
                    }
                  }
                }
                return null;
              };
              const found = findInComponents(module.components, module.name);
              if (found) {
                return found;
              }
            }
            return [];
          };
          
          // 重要：如果关系图谱组件有依赖，角色数据应该完全来自依赖
          // 初始值应该为空数组，而不是 relationData.characters（因为保存时被设置为空）
          let mergedCharacters: any[] = [];
          
          // 收集所有依赖的角色数据并去重
          const allDependencyCharacters: any[] = [];
          for (const depKey of comp.dataDependencies) {
            const depData = findDependencyData(depKey);
            if (depData && Array.isArray(depData) && depData.length > 0) {
              // 转换角色数据格式
              // 注意：保持角色ID稳定，如果角色没有ID，使用 name 作为稳定的标识
              const convertedCharacters = depData.map((char: any, index: number) => {
                if (char.id && char.name && (char.gender === '男' || char.gender === '女')) {
                  return {
                    id: char.id,
                    name: char.name,
                    gender: char.gender
                  };
                }
                // 如果没有ID，使用 name 作为ID（更稳定，不包含时间戳）
                const stableId = char.id || char.name || `char-${index}`;
                return {
                  id: stableId,
                  name: char.name || char.display_name || '',
                  gender: (char.gender === '男' || char.gender === '女') ? char.gender : '男'
                };
              });
              
              allDependencyCharacters.push(...convertedCharacters);
            }
          }
          
          // 去重：使用 id 或 name 作为唯一标识
          const charMap: { [key: string]: any } = {};
          allDependencyCharacters.forEach((char: any) => {
            const key = char.id || char.name;
            if (key && !charMap[key]) {
              charMap[key] = char;
            }
          });
          mergedCharacters = Object.values(charMap);
          
          relationData = {
            ...relationData,
            characters: mergedCharacters,  // 角色数据完全来自依赖的角色列表
            relations: relationData.relations || []  // 关系数据来自 comp.value
          };
        } else {
          // 如果没有依赖配置，仍然只使用关系数据，角色为空（因为角色应该来自角色列表）
          // 注意：关系图谱应该总是配置了依赖，如果没有配置，角色列表将为空
          relationData = {
            characters: [], // 即使没有依赖配置，也不使用 comp.value.characters（因为角色应该来自角色列表）
            relations: Array.isArray(relationData.relations) ? relationData.relations : []
          };
        }
        
        const graphData: CharacterRelationsData = {
          characters: relationData.characters || [],
          relations: relationData.relations || []
        };
        
        // 调试信息：检查关系数据
        if (graphData.relations.length > 0) {
          console.log(`🔗 关系图谱渲染: ${graphData.characters.length} 个角色, ${graphData.relations.length} 个关系`, graphData.relations);
        }
        
        return (
          <div className="comp-relation-graph" style={{ width: '100%', height: '600px', minHeight: '600px' }}>
            <CharacterRelations 
              key={`relation-graph-${comp.id}`}
              data={graphData}
              onChange={(newData) => {
                // 关系图谱只保存关系，角色始终从角色列表中获取（不保存）
                const valueToSave = {
                  characters: [], // 角色来自依赖的角色列表，不保存
                  relations: newData.relations || [] // 只保存关系
                };
                console.log(`💾 关系图谱 onChange 触发: 保存 ${valueToSave.relations.length} 个关系`, valueToSave.relations);
                updateValue(valueToSave);
              }}
            />
          </div>
        );

      case 'timeline':
        // 支持两种格式：数组格式（旧格式）和对象格式（新格式，包含依赖数据）
        let timelineData: any[] = [];
        let dependencies: { [key: string]: any } = {};
        
        if (Array.isArray(comp.value)) {
          // 旧格式：直接是数组
          timelineData = comp.value;
        } else if (comp.value && typeof comp.value === 'object' && 'events' in comp.value) {
          // 新格式：包含 events 和 _dependencies
          timelineData = comp.value.events || [];
          dependencies = comp.value._dependencies || {};
        } else {
          timelineData = [];
        }
        
        // 从依赖中获取角色列表
        let availableCharacters: any[] = [];
        if (comp.dataDependencies && comp.dataDependencies.length > 0) {
          const findDependencyData = (depKey: string): any[] => {
            for (const module of template.modules) {
              const findInComponents = (components: ComponentConfig[]): any[] | null => {
                for (const compItem of components) {
                  if (compItem.dataKey === depKey) {
                    if (compItem.value !== undefined && compItem.value !== null) {
                      if (Array.isArray(compItem.value)) {
                        return compItem.value;
                      } else if (typeof compItem.value === 'object' && compItem.value !== null) {
                        const obj = compItem.value as any;
                        if (Array.isArray(obj.characters)) {
                          return obj.characters;
                        }
                      }
                    }
                    return [];
                  }
                  if (compItem.type === 'tabs' && compItem.config?.tabs) {
                    for (const tab of compItem.config.tabs) {
                      if (tab.components) {
                        const found = findInComponents(tab.components);
                        if (found) return found;
                      }
                    }
                  }
                }
                return null;
              };
              const found = findInComponents(module.components);
              if (found) return found;
            }
            return [];
          };
          
          // 收集所有依赖的角色数据并去重
          const allDependencyCharacters: any[] = [];
          for (const depKey of comp.dataDependencies) {
            const depData = findDependencyData(depKey);
            if (depData && Array.isArray(depData) && depData.length > 0) {
              allDependencyCharacters.push(...depData);
            }
          }
          
          // 去重
          const charMap: { [key: string]: any } = {};
          allDependencyCharacters.forEach((char: any) => {
            const key = char.id || char.name;
            if (key && !charMap[key]) {
              charMap[key] = {
                id: char.id || key,
                name: char.name || char.display_name || '',
                gender: char.gender || '男'
              };
            }
          });
          availableCharacters = Object.values(charMap);
        }
        
        // 确保时间线数据格式正确
        const ensureEventFormat = (item: any) => {
          return {
            id: item.id || `event-${Date.now()}-${Math.random()}`,
            characterId: item.characterId || '',
            character: item.character || '',
            time: item.time || '',
            event: item.event || '',
            description: item.description || '',
            location: item.location || ''
          };
        };
        
        const normalizedTimelineData = timelineData.map(ensureEventFormat);
        
        return (
          <div className="comp-timeline">
            <div className="timeline-header-section">
              <h4 className="timeline-title">{comp.label || '时间线'}</h4>
              {availableCharacters.length > 0 && (
                <div className="timeline-filter">
                  <label>可用角色：</label>
                  <span className="character-count">{availableCharacters.length} 个角色</span>
                </div>
              )}
            </div>
            
            <div className="timeline-events-list">
              {normalizedTimelineData.map((item, i) => {
                const isEditing = editingTimelineEvents[comp.id] === item.id;
                const editFormKey = `${comp.id}-${item.id}`;
                const editForm = timelineEditForms[editFormKey] || {
                  characterId: item.characterId || '',
                  character: item.character || '',
                  time: item.time || '',
                  event: item.event || '',
                  description: item.description || '',
                  location: item.location || ''
                };

                return (
                  <div key={item.id || i} className="timeline-event-item">
                    <div className="timeline-marker" />
                    <div className="timeline-event-content">
                      {isEditing ? (
                        // 编辑模式
                        <>
                          <div className="timeline-event-header">
                            <div className="timeline-event-meta">
                              {availableCharacters.length > 0 && (
                                <select
                                  className="timeline-character-select"
                                  value={editForm.characterId}
                                  onChange={(e) => {
                                    const selectedChar = availableCharacters.find(c => c.id === e.target.value);
                                    setTimelineEditForms(prev => ({
                                      ...prev,
                                      [editFormKey]: {
                                        ...editForm,
                                        characterId: e.target.value,
                                        character: selectedChar?.name || ''
                                      }
                                    }));
                                  }}
                                >
                                  <option value="">选择角色</option>
                                  {availableCharacters.map(char => (
                                    <option key={char.id} value={char.id}>{char.name}</option>
                                  ))}
                                </select>
                              )}
                              <input
                                type="text"
                                className="timeline-time-input"
                                value={editForm.time}
                                onChange={(e) => setTimelineEditForms(prev => ({
                                  ...prev,
                                  [editFormKey]: { ...editForm, time: e.target.value }
                                }))}
                                placeholder="时间/章节（如：第一卷 第1章 或 2024年1月）"
                              />
                            </div>
                            <div className="timeline-event-actions">
                              <button
                                className="timeline-save-btn"
                                onClick={() => {
                                  const newData = [...normalizedTimelineData];
                                  newData[i] = {
                                    ...item,
                                    ...editForm
                                  };
                                  if (comp.value && typeof comp.value === 'object' && '_dependencies' in comp.value) {
                                    updateValue({ events: newData, _dependencies: dependencies });
                                  } else {
                                    updateValue(newData);
                                  }
                                  setEditingTimelineEvents(prev => ({ ...prev, [comp.id]: null }));
                                  // 清除编辑表单数据
                                  setTimelineEditForms(prev => {
                                    const newForms = { ...prev };
                                    delete newForms[editFormKey];
                                    return newForms;
                                  });
                                }}
                              >
                                保存
                              </button>
                              <button
                                className="timeline-cancel-btn"
                                onClick={() => {
                                  setEditingTimelineEvents(prev => ({ ...prev, [comp.id]: null }));
                                  // 清除编辑表单数据
                                  setTimelineEditForms(prev => {
                                    const newForms = { ...prev };
                                    delete newForms[editFormKey];
                                    return newForms;
                                  });
                                }}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                          <input
                            type="text"
                            className="timeline-event-title"
                            value={editForm.event}
                            onChange={(e) => setTimelineEditForms(prev => ({
                              ...prev,
                              [editFormKey]: { ...editForm, event: e.target.value }
                            }))}
                            placeholder="事件标题"
                          />
                          <textarea
                            className="timeline-event-description"
                            value={editForm.description}
                            onChange={(e) => setTimelineEditForms(prev => ({
                              ...prev,
                              [editFormKey]: { ...editForm, description: e.target.value }
                            }))}
                            placeholder="事件描述..."
                            rows={2}
                          />
                          <input
                            type="text"
                            className="timeline-location-input"
                            value={editForm.location}
                            onChange={(e) => setTimelineEditForms(prev => ({
                              ...prev,
                              [editFormKey]: { ...editForm, location: e.target.value }
                            }))}
                            placeholder="地点（可选）"
                          />
                        </>
                      ) : (
                        // 只读模式
                        <>
                          <div className="timeline-event-header">
                            <div className="timeline-event-meta">
                              {item.character && (
                                <span className="timeline-character-name">{item.character}</span>
                              )}
                              {item.time && (
                                <span className="timeline-time">{item.time}</span>
                              )}
                            </div>
                            <div className="timeline-event-actions">
                              <button
                                className="timeline-edit-btn"
                                onClick={() => {
                                  // 初始化编辑表单数据
                                  setTimelineEditForms(prev => ({
                                    ...prev,
                                    [editFormKey]: {
                                      characterId: item.characterId || '',
                                      character: item.character || '',
                                      time: item.time || '',
                                      event: item.event || '',
                                      description: item.description || '',
                                      location: item.location || ''
                                    }
                                  }));
                                  setEditingTimelineEvents(prev => ({ ...prev, [comp.id]: item.id }));
                                }}
                              >
                                编辑
                              </button>
                              <button
                                className="timeline-delete-btn"
                                onClick={() => {
                                  const newData = normalizedTimelineData.filter((_, idx) => idx !== i);
                                  if (comp.value && typeof comp.value === 'object' && '_dependencies' in comp.value) {
                                    updateValue({ events: newData, _dependencies: dependencies });
                                  } else {
                                    updateValue(newData);
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          {item.event && (
                            <div className="timeline-event-title-readonly">{item.event}</div>
                          )}
                          {item.description && (
                            <div className="timeline-event-description-readonly">{item.description}</div>
                          )}
                          {item.location && (
                            <div className="timeline-location-readonly">📍 {item.location}</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <button 
              className="timeline-add-btn"
              onClick={() => {
                const newEvent = {
                  id: `event-${Date.now()}-${Math.random()}`,
                  characterId: '',
                  character: '',
                  time: '',
                  event: '',
                  description: '',
                  location: ''
                };
                const newData = [...normalizedTimelineData, newEvent];
                if (comp.value && typeof comp.value === 'object' && '_dependencies' in comp.value) {
                  updateValue({ events: newData, _dependencies: dependencies });
                } else {
                  updateValue(newData);
                }
              }}
            >
              <Plus size={16} />
              <span>添加时间线事件</span>
            </button>
          </div>
        );

      case 'character-card':
        // 角色卡片 - 只读展示 + 弹窗编辑
        // 当前组件的数据（用于显示和编辑）
        const characterData = (comp.value as { name: string; gender: string; type: string; description: string }[]) || [];
        const mainChars = characterData.filter(c => c.type === '主要角色');
        const secondaryChars = characterData.filter(c => c.type === '次要角色');
        
        // 收集所有角色组件中的角色数据（包括当前组件和其他组件）
        interface MergedCharacter {
          name: string;
          gender: string;
          type: string;
          description: string;
          componentId: string;
          componentIndex: number;
        }
        
        const findAllCharactersInModule = (): MergedCharacter[] => {
          const allChars: MergedCharacter[] = [];
          
          // 查找当前模块中的所有character-card组件
          const findCharacterCards = (components: ComponentConfig[]): void => {
            for (const c of components) {
              if (c.type === 'character-card' && c.value) {
                const chars = (c.value as { name: string; gender: string; type: string; description: string }[]) || [];
                chars.forEach((char, idx) => {
                  allChars.push({
                    name: char.name || '',
                    gender: char.gender || '',
                    type: char.type || '',
                    description: char.description || '',
                    componentId: c.id,
                    componentIndex: idx
                  });
                });
              }
              // 递归查找tabs中的组件
              if (c.type === 'tabs' && c.config.tabs) {
                for (const tab of c.config.tabs) {
                  if (tab.components) {
                    findCharacterCards(tab.components);
                  }
                }
              }
            }
          };
          
          const module = template.modules.find(m => m.id === moduleId);
          if (module) {
            findCharacterCards(module.components);
          }
          
          return allChars;
        };
        
        // 获取所有角色并去重合并（以name为唯一标识）
        const allCharactersInModule = findAllCharactersInModule();
        const characterMapObj: Record<string, MergedCharacter> = {};
        
        for (const char of allCharactersInModule) {
          const existing = characterMapObj[char.name];
          if (!existing) {
            characterMapObj[char.name] = char;
          } else {
            // 合并数据，保留更完整的信息
            const merged: MergedCharacter = {
              name: char.name,
              gender: char.gender || existing.gender,
              description: char.description || existing.description,
              type: char.type || existing.type,
              // 保留第一个找到的组件ID和索引（用于编辑）
              componentId: existing.componentId,
              componentIndex: existing.componentIndex
            };
            characterMapObj[char.name] = merged;
          }
        }
        
        // 合并后的所有角色（去重）
        const mergedCharacters = Object.values(characterMapObj);
        const mergedMainChars = mergedCharacters.filter(c => c.type === '主要角色');
        const mergedSecondaryChars = mergedCharacters.filter(c => c.type === '次要角色');
        
        const openCharacterModal = (char: { name: string; gender: string; type: string; description: string } | null, idx: number | null) => {
          setCharacterModal({
            isOpen: true,
            compId: comp.id,
            moduleId: moduleId,
            editIndex: idx,
            form: char ? { ...char } : { name: '', gender: '男', type: '主要角色', description: '' },
            tabsComponentId: tabsComponentId,
            tabId: tabId
          });
        };
        
        // 打开合并视图的角色编辑（从合并列表中）
        const openMergedCharacterModal = (char: MergedCharacter) => {
          // 找到该角色在当前组件中的位置，如果存在
          const localIdx = characterData.findIndex(c => c.name === char.name);
          if (localIdx !== -1) {
            // 如果当前组件中有该角色，编辑当前组件的
            openCharacterModal(characterData[localIdx], localIdx);
          } else {
            // 如果当前组件中没有，创建一个新的
            openCharacterModal(null, null);
            // 设置表单数据为合并后的角色信息
            setTimeout(() => {
              setCharacterModal(prev => ({
                ...prev,
                form: { 
                  name: char.name,
                  gender: char.gender,
                  type: char.type,
                  description: char.description
                }
              }));
            }, 0);
          }
        };
        
        const renderCharCard = (char: typeof characterData[0], realIdx: number) => (
          <div 
            key={realIdx} 
            className="character-card-item clickable"
            onClick={() => openCharacterModal(char, realIdx)}
          >
            <div className="character-card-header">
              <div className="character-name-row">
                <span className="character-name-display">{char.name || '未命名角色'}</span>
                <span className="character-gender-tag">{char.gender}</span>
              </div>
              <button 
                className="character-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  updateValue(characterData.filter((_, i) => i !== realIdx));
                }}
                title="删除角色"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="character-desc-display">
              {char.description || '暂无简介'}
            </div>
          </div>
        );
        
        return (
          <div className="comp-character-cards">
            {mainChars.length > 0 && (
              <div className="character-section">
                <h4 className="character-section-title">主要角色</h4>
                <div className="character-grid">
                  {mainChars.map((char) => {
                    const realIdx = characterData.indexOf(char);
                    return renderCharCard(char, realIdx);
                  })}
                </div>
              </div>
            )}
            {secondaryChars.length > 0 && (
              <div className="character-section">
                <h4 className="character-section-title">次要角色</h4>
                <div className="character-grid">
                  {secondaryChars.map((char) => {
                    const realIdx = characterData.indexOf(char);
                    return renderCharCard(char, realIdx);
                  })}
                </div>
              </div>
            )}
            {characterData.length === 0 && (
              <div className="character-empty">
                <Users size={32} />
                <span>暂无角色，点击添加</span>
              </div>
            )}
            <button 
              className="character-add-btn"
              onClick={() => openCharacterModal(null, null)}
            >
              <Plus size={16} />
              <span>添加角色</span>
            </button>
            
            {/* 合并视图：显示所有角色组件中的角色（如果有多个组件） */}
            {mergedCharacters.length > 0 && mergedCharacters.length !== characterData.length && (
              <div className="character-merged-view">
                <div className="character-merged-header">
                  <h4 className="character-section-title">合并视图（所有角色组件）</h4>
                  <span className="character-merged-count">
                    {mergedCharacters.length} 个角色（来自 {new Set(mergedCharacters.map(c => c.componentId)).size} 个组件）
                  </span>
                </div>
                {mergedMainChars.length > 0 && (
                  <div className="character-section">
                    <h5 className="character-subsection-title">主要角色（合并）</h5>
                    <div className="character-grid">
                      {mergedMainChars.map((char) => (
                        <div
                          key={`merged-${char.name}`}
                          className="character-card-item clickable merged"
                          onClick={() => openMergedCharacterModal(char)}
                          title={`来自组件: ${char.componentId}`}
                        >
                          <div className="character-card-header">
                            <div className="character-name-row">
                              <span className="character-name-display">{char.name || '未命名角色'}</span>
                              <span className="character-gender-tag">{char.gender}</span>
                            </div>
                            {characterData.findIndex(c => c.name === char.name) === -1 && (
                              <span className="character-source-badge" title="来自其他组件">其他</span>
                            )}
                          </div>
                          <div className="character-desc-display">
                            {char.description || '暂无简介'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mergedSecondaryChars.length > 0 && (
                  <div className="character-section">
                    <h5 className="character-subsection-title">次要角色（合并）</h5>
                    <div className="character-grid">
                      {mergedSecondaryChars.map((char) => (
                        <div
                          key={`merged-${char.name}`}
                          className="character-card-item clickable merged"
                          onClick={() => openMergedCharacterModal(char)}
                          title={`来自组件: ${char.componentId}`}
                        >
                          <div className="character-card-header">
                            <div className="character-name-row">
                              <span className="character-name-display">{char.name || '未命名角色'}</span>
                              <span className="character-gender-tag">{char.gender}</span>
                            </div>
                            {characterData.findIndex(c => c.name === char.name) === -1 && (
                              <span className="character-source-badge" title="来自其他组件">其他</span>
                            )}
                          </div>
                          <div className="character-desc-display">
                            {char.description || '暂无简介'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'card-list':
        // 通用卡片列表
        const cardFields = comp.config.cardFields || [
          { key: 'name', label: '名称', type: 'text' },
          { key: 'description', label: '描述', type: 'textarea' },
        ];
        const cardData = (comp.value as Record<string, any>[]) || [];
        return (
          <div className="comp-card-list">
            <div className="card-grid">
              {cardData.map((card, cardIndex) => (
                <div key={cardIndex} className="card-item">
                  <div className="card-header">
                    <span className="card-number">#{cardIndex + 1}</span>
                    <button 
                      className="card-delete"
                      onClick={() => updateValue(cardData.filter((_, i) => i !== cardIndex))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="card-body">
                    {cardFields.map((field: { key: string; label: string; type: string }) => (
                      <div key={field.key} className="card-field">
                        <label className="card-field-label">{field.label}</label>
                        {field.type === 'image' ? (
                          <div className="card-field-image">
                            {card[field.key] ? (
                              <div className="card-image-preview">
                                <img src={card[field.key]} alt={field.label} />
                                <div className="card-image-overlay">
                                  <button onClick={() => {
                                    setCurrentImageId(`card-${cardIndex}-${field.key}`);
                                    fileInputRef.current?.click();
                                  }}>更换</button>
                                  <button onClick={() => {
                                    const newData = [...cardData];
                                    newData[cardIndex] = { ...card, [field.key]: '' };
                                    updateValue(newData);
                                  }}>删除</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="card-image-upload"
                                onClick={() => {
                                  setCurrentImageId(`card-${cardIndex}-${field.key}`);
                                  fileInputRef.current?.click();
                                }}
                              >
                                <Image size={20} />
                                <span>上传图片</span>
                              </button>
                            )}
                          </div>
                        ) : field.type === 'textarea' ? (
                          <textarea
                            className="card-field-textarea"
                            value={card[field.key] || ''}
                            onChange={(e) => {
                              const newData = [...cardData];
                              newData[cardIndex] = { ...card, [field.key]: e.target.value };
                              updateValue(newData);
                            }}
                            placeholder={`输入${field.label}...`}
                            rows={2}
                          />
                        ) : (
                          <input
                            type="text"
                            className="card-field-input"
                            value={card[field.key] || ''}
                            onChange={(e) => {
                              const newData = [...cardData];
                              newData[cardIndex] = { ...card, [field.key]: e.target.value };
                              updateValue(newData);
                            }}
                            placeholder={`输入${field.label}...`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button 
              className="card-add-btn"
              onClick={() => {
                const newCard: Record<string, any> = {};
                cardFields.forEach((f: { key: string }) => newCard[f.key] = '');
                updateValue([...cardData, newCard]);
              }}
            >
              <Plus size={16} />
              <span>添加卡片</span>
            </button>
          </div>
        );

      case 'rank-system':
        // 等级体系组件
        const rankData = (comp.value as { level: number; name: string; description: string }[]) || [];
        return (
          <div className="comp-rank-system">
            <div className="rank-list">
              {rankData.map((rank, idx) => (
                <div key={idx} className="rank-item">
                  <div className="rank-level">
                    <span className="level-badge">{rank.level || idx + 1}</span>
                  </div>
                  <div className="rank-content">
                    <input
                      type="text"
                      className="rank-name-input"
                      value={rank.name || ''}
                      onChange={(e) => {
                        const newData = [...rankData];
                        newData[idx] = { ...rank, name: e.target.value };
                        updateValue(newData);
                      }}
                      placeholder="等级名称（如：炼气期、筑基期）"
                    />
                    <textarea
                      className="rank-desc-input"
                      value={rank.description || ''}
                      onChange={(e) => {
                        const newData = [...rankData];
                        newData[idx] = { ...rank, description: e.target.value };
                        updateValue(newData);
                      }}
                      placeholder="等级描述、特征、能力..."
                      rows={2}
                    />
                  </div>
                  <button 
                    className="rank-delete-btn"
                    onClick={() => {
                      const newData = rankData.filter((_, i) => i !== idx);
                      // 重新计算等级序号
                      newData.forEach((r, i) => r.level = i + 1);
                      updateValue(newData);
                    }}
                    title="删除等级"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {rankData.length === 0 && (
              <div className="rank-empty">
                <TrendingUp size={32} />
                <span>暂无等级，点击添加</span>
              </div>
            )}
            <button 
              className="rank-add-btn"
              onClick={() => {
                updateValue([...rankData, { 
                  level: rankData.length + 1, 
                  name: '', 
                  description: '' 
                }]);
              }}
            >
              <Plus size={16} />
              <span>添加等级</span>
            </button>
          </div>
        );

      case 'faction':
        // 势力组件
        const factionData = (comp.value as FactionData[]) || [];
        
        // 切换势力展开状态
        const toggleFaction = (factionId: string) => {
          setExpandedFactions(prev => ({
            ...prev,
            [factionId]: !prev[factionId]
          }));
        };
        
        // 打开势力编辑弹窗
        const openFactionModal = (faction: FactionData | null, parentId: string | null = null) => {
          setFactionModal({
            isOpen: true,
            compId: comp.id,
            moduleId: moduleId,
            editId: faction?.id || null,
            parentId: parentId,
            form: faction 
              ? { name: faction.name, summary: faction.summary || '', details: faction.details || '', levels: [...faction.levels] }
              : { name: '', summary: '', details: '', levels: [] },
            newLevel: ''
          });
        };
        
        // 删除势力（递归）
        const deleteFaction = (factions: FactionData[], targetId: string): FactionData[] => {
          return factions
            .filter(f => f.id !== targetId)
            .map(f => ({
              ...f,
              children: f.children ? deleteFaction(f.children, targetId) : undefined
            }));
        };
        
        // 渲染势力树
        const renderFactionTree = (factions: FactionData[], level: number = 0): React.ReactNode => {
          return factions.map(faction => {
            const hasChildren = faction.children && faction.children.length > 0;
            const isExpanded = expandedFactions[faction.id];
            
            return (
              <div key={faction.id} className="faction-tree-item">
                <div className="faction-tree-row" style={{ paddingLeft: `${level * 24}px` }}>
                  {hasChildren ? (
                    <button
                      className="faction-toggle-btn"
                      onClick={() => toggleFaction(faction.id)}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  ) : (
                    <div className="faction-toggle-placeholder" />
                  )}
                  <div className="faction-tree-content">
                    <div className="faction-display">
                      <div className="faction-name-display">{faction.name}</div>
                      {faction.summary && (
                        <div className="faction-summary-display">
                          <span className="faction-info-label-text">简述</span>
                          <p className="faction-info-text">{faction.summary}</p>
                        </div>
                      )}
                      {faction.details && (
                        <div className="faction-details-display">
                          <span className="faction-info-label-text">详细信息</span>
                          <p className="faction-info-text">{faction.details}</p>
                        </div>
                      )}
                      {faction.levels.length > 0 && (
                        <div className="faction-levels-display">
                          {faction.levels.map((lvl, idx) => (
                            <div key={idx} className="level-badge">
                              <span className="level-order-small">{idx + 1}</span>
                              <span>{lvl}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="faction-actions-display">
                        <button
                          className="edit-faction-btn"
                          onClick={() => openFactionModal(faction)}
                          title="编辑"
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          className="add-child-btn"
                          onClick={() => openFactionModal(null, faction.id)}
                          title="添加子势力"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="delete-faction-btn"
                          onClick={() => {
                            if (confirm('确定要删除这个势力吗？删除后其子势力也会被删除。')) {
                              updateValue(deleteFaction(factionData, faction.id));
                            }
                          }}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {hasChildren && isExpanded && (
                  <div className="faction-children">
                    {renderFactionTree(faction.children!, level + 1)}
                  </div>
                )}
              </div>
            );
          });
        };
        
        return (
          <div className="comp-faction">
            {factionData.length === 0 ? (
              <div className="faction-empty">
                <Building2 size={32} />
                <span>暂无势力，点击添加</span>
              </div>
            ) : (
              <div className="faction-tree">
                {renderFactionTree(factionData)}
              </div>
            )}
            <button 
              className="faction-add-btn"
              onClick={() => openFactionModal(null)}
            >
              <Plus size={16} />
              <span>添加势力</span>
            </button>
          </div>
        );

      default:
        return <div className="comp-unsupported">不支持的组件类型: {comp.type}</div>;
    }
  };

  // ============ 渲染 ============

  return (
    <div className="work-info-manager">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      {/* 顶部工具栏 */}
      <div className="wim-toolbar">
        <div className="toolbar-left">
          <button className="template-btn" onClick={() => setShowTemplateSelector(!showTemplateSelector)}>
            <LayoutTemplate size={16} />
            <span>{template.name}</span>
            <ChevronRight size={14} className={showTemplateSelector ? 'rotated' : ''} />
          </button>
          <span className={`save-status ${hasUnsavedChanges ? 'unsaved' : 'saved'}`}>
            {hasUnsavedChanges ? '未保存' : '已保存'}
          </span>
        </div>
        <div className="toolbar-right">
          {workId && (
            <button 
              className="save-btn" 
              onClick={async () => {
                try {
                  
                  // 直接保存到作品的 metadata 字段
                  await saveWorkInfoToMetadata(template);
                  
                  setHasUnsavedChanges(false);
                  alert('保存成功！');
                } catch (error) {
                  console.error('手动保存失败:', error);
                  alert('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
                }
              }}
              title="保存"
            >
              <Save size={16} />
            </button>
          )}
          <button className={`edit-btn ${isEditMode ? 'active' : ''}`} onClick={() => setIsEditMode(!isEditMode)}>
            {isEditMode ? <Check size={16} /> : <Settings size={16} />}
          </button>
        </div>
      </div>

      {/* 模板选择器 */}
      {showTemplateSelector && (
        <div className="template-panel">
          <div className="panel-header">
            <h4>选择模板</h4>
            <button onClick={() => setShowTemplateSelector(false)}><X size={16} /></button>
          </div>
          <div className="template-grid">
            {/* 预设模板 */}
            {presetTemplates.map(t => (
              <button key={t.id} className={`template-card ${template.id === t.id ? 'active' : ''}`} onClick={() => applyTemplate(t)}>
                <div className="card-name">{t.name}</div>
                <div className="card-desc">{t.description}</div>
              </button>
            ))}
            
            {/* 用户创建的模板 */}
            {loadingTemplates ? (
              <div className="template-loading">加载中...</div>
            ) : userTemplates.length > 0 ? (
              userTemplates.map(dbTemplate => {
                
                return (
                  <button 
                    key={`db-${dbTemplate.id}`} 
                    className={`template-card ${template.id === `db-${dbTemplate.id}` ? 'active' : ''}`} 
                    onClick={() => applyDatabaseTemplate(dbTemplate)}
                  >
                    <div className="card-name">{dbTemplate.name || '未命名模板'}</div>
                    <div className="card-desc">{dbTemplate.description || '用户自定义模板'}</div>
                    {dbTemplate.is_public && <div className="card-badge">公开</div>}
                  </button>
                );
              })
            ) : (
              <div className="template-empty">暂无用户模板</div>
            )}
            
            {/* 创建新模板按钮 */}
            <button 
              className="template-card create-template-card" 
              onClick={() => {
                setShowTemplateSelector(false);
                setShowCreateTemplate(true);
              }}
            >
              <Plus size={24} />
              <div className="card-name">创建新模板</div>
              <div className="card-desc">基于当前配置创建新模板</div>
            </button>
          </div>
        </div>
      )}

      {/* 创建模板弹窗 */}
      {showCreateTemplate && (
        <div className="modal-overlay" onClick={() => setShowCreateTemplate(false)}>
          <div className="modal-content create-template-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建新模板</h3>
              <button className="modal-close" onClick={() => setShowCreateTemplate(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>模板名称 <span className="required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={createTemplateForm.name}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, name: e.target.value })}
                  placeholder="请输入模板名称"
                />
              </div>
              <div className="form-group">
                <label>模板描述</label>
                <textarea
                  className="form-input"
                  value={createTemplateForm.description}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, description: e.target.value })}
                  placeholder="请输入模板描述（可选）"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>作品类型</label>
                <select
                  className="form-input"
                  value={createTemplateForm.work_type}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, work_type: e.target.value })}
                >
                  <option value="novel">小说</option>
                  <option value="script">剧本</option>
                  <option value="short_story">短篇</option>
                  <option value="film_script">影视剧本</option>
                </select>
              </div>
              <div className="form-group">
                <label>分类</label>
                <input
                  type="text"
                  className="form-input"
                  value={createTemplateForm.category}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, category: e.target.value })}
                  placeholder="请输入分类（可选）"
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={createTemplateForm.is_public}
                    onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, is_public: e.target.checked })}
                  />
                  <span>公开模板（其他用户可以使用）</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateTemplate(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleCreateTemplate}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模块标签栏 */}
      <div className="module-tabs">
        {template.modules.map((m, i) => (
          <button
            key={m.id}
            className={`module-tab ${i === activeModuleIndex ? 'active' : ''}`}
            onClick={() => setActiveModuleIndex(i)}
            style={{ '--tab-color': m.color } as React.CSSProperties}
          >
            <span className="tab-icon" style={{ color: m.color }}>{IconMap[m.icon] || <LayoutGrid size={16} />}</span>
            <span>{m.name}</span>
            {isEditMode && template.modules.length > 1 && (
              <button className="tab-del" onClick={(e) => { e.stopPropagation(); deleteModule(i); }}><X size={12} /></button>
            )}
          </button>
        ))}
        {isEditMode && (
          <button className="module-tab add-tab" onClick={() => setShowAddModule(true)}>
            <Plus size={16} />
          </button>
        )}
      </div>


      {/* 模块内容 */}
      <div className="module-content">
        {template.modules.length === 0 ? (
          <div className="empty-state">
            <LayoutTemplate size={48} />
            <h3>暂无模块</h3>
            <p>点击"编辑"添加模块</p>
          </div>
        ) : activeModule ? (
          <div className="module-page">
            <div className="page-header">
              <div className="page-title">
                <div className="title-icon" style={{ background: activeModule.color }}>{IconMap[activeModule.icon] || <LayoutGrid size={20} />}</div>
                <h2>{activeModule.name}</h2>
              </div>
              <div className="page-nav">
                <button disabled={activeModuleIndex === 0} onClick={() => setActiveModuleIndex(activeModuleIndex - 1)}><ChevronLeft size={18} /></button>
                <span>{activeModuleIndex + 1}/{template.modules.length}</span>
                <button disabled={activeModuleIndex === template.modules.length - 1} onClick={() => setActiveModuleIndex(activeModuleIndex + 1)}><ChevronRight size={18} /></button>
              </div>
            </div>

            <div className="page-body">
              {activeModule.components.map(comp => {
                // 文本框、列表、角色卡片、等级体系显示生成按钮（固定选项的不需要）
                const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system'].includes(comp.type);
                return (
                  <div key={comp.id} className="comp-wrapper">
                    <div className="comp-header">
                      <label className="comp-label">{comp.label}</label>
                      <div className="comp-header-actions">
                        {showGenerateBtn && (
                          <button 
                            className="comp-generate-btn" 
                            onClick={() => {
                              // TODO: 调用 AI 生成
                              
                            }}
                            title={comp.generatePrompt || '生成内容'}
                          >
                            <Sparkles size={14} />
                            <span>生成</span>
                          </button>
                        )}
                        {isEditMode && (
                          <div className="comp-actions">
                            <button className="comp-edit" onClick={() => startEditComponent(comp)} title="编辑组件">
                              <Settings size={14} />
                            </button>
                            <button className="comp-del" onClick={() => deleteComponent(comp.id)} title="删除组件">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {renderComponent(comp, activeModule.id)}
                  </div>
                );
              })}

              {isEditMode && (
                <div className="add-comp-area">
                  <button className="add-comp-btn" onClick={() => setShowAddComponent(true)}>
                    <Plus size={16} />
                    <span>添加组件</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* 添加/编辑组件弹窗 */}
      {showAddComponent && (
        <div className="modal-overlay" onClick={closeAddComponentModal}>
          <div className="modal-content add-component-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingComponentId 
                  ? '编辑组件' 
                  : (addComponentStep === 'type' ? '选择组件类型' : '配置组件')
                }
              </h3>
              <button className="modal-close" onClick={closeAddComponentModal}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {addComponentStep === 'type' && !editingComponentId ? (
                // 第一步：选择组件类型（仅新增时显示）
                <div className="component-type-selector">
                  <div className="type-category">
                    <div className="category-label">基础组件</div>
                    <div className="type-grid">
                      {componentRegistry.filter(c => c.category === 'basic').map(c => (
                        <button
                          key={c.type}
                          className="type-card"
                          onClick={() => selectComponentType(c.type)}
                        >
                          <div className="type-icon">{c.icon}</div>
                          <div className="type-info">
                            <div className="type-name">{c.name}</div>
                            <div className="type-desc">{c.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="type-category">
                    <div className="category-label">高级组件</div>
                    <div className="type-grid">
                      {componentRegistry.filter(c => c.category === 'advanced').map(c => (
                        <button
                          key={c.type}
                          className="type-card"
                          onClick={() => selectComponentType(c.type)}
                        >
                          <div className="type-icon">{c.icon}</div>
                          <div className="type-info">
                            <div className="type-name">{c.name}</div>
                            <div className="type-desc">{c.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="type-category">
                    <div className="category-label">交互组件</div>
                    <div className="type-grid">
                      {componentRegistry.filter(c => c.category === 'interactive').map(c => (
                        <button
                          key={c.type}
                          className="type-card"
                          onClick={() => selectComponentType(c.type)}
                        >
                          <div className="type-icon">{c.icon}</div>
                          <div className="type-info">
                            <div className="type-name">{c.name}</div>
                            <div className="type-desc">{c.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // 第二步：配置组件详情
                <div className="component-config-form">
                  <div className="selected-type-info">
                    <span className="selected-type-icon">
                      {componentRegistry.find(c => c.type === newComponentForm.type)?.icon}
                    </span>
                    <span className="selected-type-name">
                      {componentRegistry.find(c => c.type === newComponentForm.type)?.name}
                    </span>
                    {!editingComponentId && (
                      <button 
                        className="change-type-btn"
                        onClick={() => setAddComponentStep('type')}
                      >
                        更换类型
                      </button>
                    )}
                  </div>

                  <div className="form-section">
                    <div className="section-title">基本信息</div>
                    <div className="form-group">
                      <label>组件名称 <span className="required">*</span></label>
                      <input 
                        type="text" 
                        value={newComponentForm.label} 
                        onChange={(e) => setNewComponentForm({ ...newComponentForm, label: e.target.value })} 
                        placeholder="例如：作品简介、角色列表..."
                        autoFocus
                      />
                    </div>

                    {/* 组件特定配置 */}
                    {newComponentForm.type === 'multiselect' && (
                      <>
                      <div className="form-group">
                        <label>标签选项 <span className="required">*</span></label>
                        <div className="tag-options-config">
                          {(newComponentForm.config.options || []).map((opt: { label: string; value: string; color: string }, index: number) => (
                            <div key={index} className="tag-option-item">
                              <span className="tag-preview" style={{ background: opt.color }}>{opt.label}</span>
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) => {
                                  const newOptions = [...(newComponentForm.config.options || [])];
                                  newOptions[index] = { ...opt, label: e.target.value, value: e.target.value.toLowerCase() };
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                }}
                                placeholder="标签名称"
                                className="tag-label-input"
                              />
                              <input
                                type="color"
                                className="tag-color-input"
                                value={opt.color}
                                onChange={(e) => {
                                  const newOptions = [...(newComponentForm.config.options || [])];
                                  newOptions[index] = { ...opt, color: e.target.value };
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                }}
                                title="选择颜色"
                              />
                              <button
                                className="tag-remove-btn"
                                onClick={() => {
                                  const newOptions = (newComponentForm.config.options || []).filter((_: any, i: number) => i !== index);
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="tag-add-row">
                            <input
                              type="text"
                              value={newTagOption.label}
                              onChange={(e) => setNewTagOption({ ...newTagOption, label: e.target.value })}
                              placeholder="新标签名称"
                              className="tag-label-input"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newTagOption.label.trim()) {
                                  const newOptions = [...(newComponentForm.config.options || []), {
                                    label: newTagOption.label.trim(),
                                    value: newTagOption.label.trim().toLowerCase(),
                                    color: newTagOption.color
                                  }];
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                  setNewTagOption({ label: '', color: '#64748b' });
                                }
                              }}
                            />
                            <input
                              type="color"
                              className="tag-color-input"
                              value={newTagOption.color}
                              onChange={(e) => setNewTagOption({ ...newTagOption, color: e.target.value })}
                              title="选择颜色"
                            />
                            <button
                              className="tag-add-btn"
                              onClick={() => {
                                if (newTagOption.label.trim()) {
                                  const newOptions = [...(newComponentForm.config.options || []), {
                                    label: newTagOption.label.trim(),
                                    value: newTagOption.label.trim().toLowerCase(),
                                    color: newTagOption.color
                                  }];
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                  setNewTagOption({ label: '', color: '#64748b' });
                                }
                              }}
                              disabled={!newTagOption.label.trim()}
                            >
                              <Plus size={14} />
                              添加
                            </button>
                          </div>
                        </div>
                        {(!newComponentForm.config.options || newComponentForm.config.options.length === 0) && (
                          <div className="tabs-hint">请至少添加一个标签选项</div>
                        )}
                      </div>
                      <div className="form-group">
                        <label>最大可选数量</label>
                        <div className="max-count-config">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            className="max-count-input"
                            value={newComponentForm.config.maxCount || 5}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 5;
                              setNewComponentForm({ 
                                ...newComponentForm, 
                                config: { ...newComponentForm.config, maxCount: Math.max(1, Math.min(20, val)) } 
                              });
                            }}
                          />
                          <span className="max-count-hint">用户最多可选择 {newComponentForm.config.maxCount || 5} 个标签</span>
                        </div>
                      </div>
                      </>
                    )}
                    
                    {newComponentForm.type === 'table' && (
                      <div className="form-group">
                        <label>表格列名</label>
                        <textarea
                          rows={4}
                          placeholder="每行一个列名&#10;例如：&#10;姓名&#10;身份&#10;简介"
                          defaultValue={
                            newComponentForm.config.columns
                              ?.map((c: any) => c.label)
                              .join('\n') || ''
                          }
                          onChange={(e) => {
                            const columns = e.target.value.split('\n').filter(Boolean).map(label => ({
                              key: label.trim().toLowerCase(),
                              label: label.trim()
                            }));
                            setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, columns } });
                          }}
                        />
                      </div>
                    )}
                    
                    {newComponentForm.type === 'tabs' && (
                      <div className="form-group">
                        <label>分页标签 <span className="required">*</span></label>
                        <div className="tabs-config-list">
                          {newComponentForm.tabsConfig.map((tab, index) => (
                            <div key={tab.id} className="tab-config-item">
                              <span className="tab-order">{index + 1}</span>
                              <input
                                type="text"
                                value={tab.label}
                                onChange={(e) => {
                                  const newTabs = [...newComponentForm.tabsConfig];
                                  newTabs[index] = { ...tab, label: e.target.value };
                                  setNewComponentForm({ ...newComponentForm, tabsConfig: newTabs });
                                }}
                                placeholder="分页名称"
                              />
                              <button
                                className="tab-remove-btn"
                                onClick={() => {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    tabsConfig: newComponentForm.tabsConfig.filter((_, i) => i !== index)
                                  });
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="tab-add-row">
                            <input
                              type="text"
                              value={newTabName}
                              onChange={(e) => setNewTabName(e.target.value)}
                              placeholder="输入新分页名称"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newTabName.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    tabsConfig: [...newComponentForm.tabsConfig, { id: `tab-${Date.now()}`, label: newTabName.trim() }]
                                  });
                                  setNewTabName('');
                                }
                              }}
                            />
                            <button
                              className="tab-add-btn"
                              onClick={() => {
                                if (newTabName.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    tabsConfig: [...newComponentForm.tabsConfig, { id: `tab-${Date.now()}`, label: newTabName.trim() }]
                                  });
                                  setNewTabName('');
                                }
                              }}
                              disabled={!newTabName.trim()}
                            >
                              <Plus size={14} />
                              添加
                            </button>
                          </div>
                        </div>
                        {newComponentForm.tabsConfig.length === 0 && (
                          <div className="tabs-hint">请至少添加一个分页</div>
                        )}
                      </div>
                    )}
                    
                    {newComponentForm.type === 'card-list' && (
                      <div className="form-group">
                        <label>卡片字段 <span className="required">*</span></label>
                        <p className="field-hint">定义每个卡片包含的字段，例如：头像、姓名、描述等</p>
                        <div className="card-fields-config">
                          {newComponentForm.cardFields.map((field, index) => (
                            <div key={index} className="card-field-config-item">
                              <span className="field-order">{index + 1}</span>
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => {
                                  const newFields = [...newComponentForm.cardFields];
                                  newFields[index] = { ...field, label: e.target.value };
                                  setNewComponentForm({ ...newComponentForm, cardFields: newFields });
                                }}
                                placeholder="字段名称"
                                className="field-label-input"
                              />
                              <select
                                value={field.type}
                                onChange={(e) => {
                                  const newFields = [...newComponentForm.cardFields];
                                  newFields[index] = { ...field, type: e.target.value as 'text' | 'textarea' | 'image' };
                                  setNewComponentForm({ ...newComponentForm, cardFields: newFields });
                                }}
                                className="field-type-select"
                              >
                                <option value="text">单行文本</option>
                                <option value="textarea">多行文本</option>
                                <option value="image">图片</option>
                              </select>
                              <button
                                className="field-remove-btn"
                                onClick={() => {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    cardFields: newComponentForm.cardFields.filter((_, i) => i !== index)
                                  });
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="card-field-add-row">
                            <input
                              type="text"
                              value={newCardFieldForm.label}
                              onChange={(e) => setNewCardFieldForm({ ...newCardFieldForm, label: e.target.value })}
                              placeholder="新字段名称"
                              className="field-label-input"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newCardFieldForm.label.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    cardFields: [...newComponentForm.cardFields, { 
                                      key: newCardFieldForm.label.toLowerCase().replace(/\s+/g, '_'),
                                      label: newCardFieldForm.label.trim(), 
                                      type: newCardFieldForm.type 
                                    }]
                                  });
                                  setNewCardFieldForm({ label: '', type: 'text' });
                                }
                              }}
                            />
                            <select
                              value={newCardFieldForm.type}
                              onChange={(e) => setNewCardFieldForm({ ...newCardFieldForm, type: e.target.value as 'text' | 'textarea' | 'image' })}
                              className="field-type-select"
                            >
                              <option value="text">单行文本</option>
                              <option value="textarea">多行文本</option>
                              <option value="image">图片</option>
                            </select>
                            <button
                              className="field-add-btn"
                              onClick={() => {
                                if (newCardFieldForm.label.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    cardFields: [...newComponentForm.cardFields, { 
                                      key: newCardFieldForm.label.toLowerCase().replace(/\s+/g, '_'),
                                      label: newCardFieldForm.label.trim(), 
                                      type: newCardFieldForm.type 
                                    }]
                                  });
                                  setNewCardFieldForm({ label: '', type: 'text' });
                                }
                              }}
                              disabled={!newCardFieldForm.label.trim()}
                            >
                              <Plus size={14} />
                              添加
                            </button>
                          </div>
                        </div>
                        {newComponentForm.cardFields.length === 0 && (
                          <div className="tabs-hint">请至少添加一个字段</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* tabs 组件不需要数据绑定配置 */}
                  {newComponentForm.type !== 'tabs' && (
                    <div className="form-section">
                      <div className="section-title">
                        数据绑定配置
                        <span className="section-hint">配置组件数据的存储键和依赖关系</span>
                      </div>
                      
                      <div className="form-group">
                        <label>
                          数据存储键 (dataKey)
                          <span className="label-hint">用于在 component_data 中存储和读取数据，建议使用小写字母和下划线，如：characters、character_timeline</span>
                        </label>
                        <input
                          type="text"
                          value={newComponentForm.dataKey}
                          onChange={(e) => setNewComponentForm({ ...newComponentForm, dataKey: e.target.value })}
                          placeholder="例如：characters、character_timeline、world_locations"
                          style={{ fontFamily: 'monospace' }}
                        />
                      </div>

                      <div className="form-group">
                        <label>
                          数据依赖 (dataDependencies)
                          <span className="label-hint">选择此组件需要依赖的其他组件数据键，例如时间线组件可以依赖角色列表的数据</span>
                        </label>
                        <DataDependenciesSelector
                          value={newComponentForm.dataDependencies}
                          onChange={(deps) => setNewComponentForm({ ...newComponentForm, dataDependencies: deps })}
                          template={template}
                          currentComponentId={editingComponentId || undefined}
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-section">
                    <div className="section-title">
                      AI 提示词配置
                      <span className="section-hint">用于 AI 辅助生成和校验内容</span>
                    </div>
                    
                    <div className="form-group">
                      <label>
                        生成 Prompt
                        <span className="label-hint">AI 根据此提示词生成内容</span>
                      </label>
                      <textarea
                        rows={3}
                        value={newComponentForm.generatePrompt}
                        onChange={(e) => setNewComponentForm({ ...newComponentForm, generatePrompt: e.target.value })}
                        placeholder="例如：请根据小说的题材和背景，生成一段吸引读者的作品简介，包含主要角色和核心冲突..."
                      />
                    </div>

                    <div className="form-group">
                      <label>
                        检验 Prompt
                        <span className="label-hint">AI 根据此提示词检查内容质量</span>
                      </label>
                      <textarea
                        rows={3}
                        value={newComponentForm.validatePrompt}
                        onChange={(e) => setNewComponentForm({ ...newComponentForm, validatePrompt: e.target.value })}
                        placeholder="例如：请检查这段简介是否：1. 吸引读者兴趣 2. 包含核心冲突 3. 不剧透关键情节..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {(addComponentStep === 'config' || editingComponentId) && (
              <div className="modal-footer">
                {!editingComponentId && (
                  <button
                    className="btn-secondary"
                    onClick={() => setAddComponentStep('type')}
                  >
                    上一步
                  </button>
                )}
                {editingComponentId && (
                  <button
                    className="btn-secondary"
                    onClick={closeAddComponentModal}
                  >
                    取消
                  </button>
                )}
                <div className="footer-spacer" />
                <button
                  className="btn-primary"
                  onClick={editingComponentId ? saveEditedComponent : addComponentToModule}
                  disabled={!newComponentForm.label.trim() || (newComponentForm.type === 'tabs' && newComponentForm.tabsConfig.length === 0) || (newComponentForm.type === 'card-list' && newComponentForm.cardFields.length === 0)}
                >
                  {editingComponentId ? '保存修改' : '添加组件'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 添加模块弹窗 */}
      {showAddModule && (
        <div className="modal-overlay" onClick={closeAddModuleModal}>
          <div className="modal-content add-module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加模块</h3>
              <button className="modal-close" onClick={closeAddModuleModal}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>模块名称 <span className="required">*</span></label>
                <input 
                  type="text" 
                  value={newModuleForm.name} 
                  onChange={(e) => setNewModuleForm({ ...newModuleForm, name: e.target.value })} 
                  placeholder="例如：角色设定、世界观、剧情线..."
                  autoFocus
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>选择图标</label>
                  <div className="icon-grid">
                    {Object.keys(IconMap).map(icon => (
                      <button 
                        key={icon} 
                        className={`icon-btn ${newModuleForm.icon === icon ? 'active' : ''}`} 
                        onClick={() => setNewModuleForm({ ...newModuleForm, icon })} 
                        style={{ color: newModuleForm.color }}
                      >
                        {IconMap[icon]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label>选择颜色</label>
                  <div className="color-grid">
                    {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#6366f1'].map(c => (
                      <button 
                        key={c} 
                        className={`color-btn ${newModuleForm.color === c ? 'active' : ''}`} 
                        style={{ background: c }} 
                        onClick={() => setNewModuleForm({ ...newModuleForm, color: c })} 
                      />
                    ))}
                  </div>
                </div>
              </div>
              
              {/* 预览 */}
              <div className="module-preview">
                <div className="preview-icon" style={{ background: newModuleForm.color }}>
                  {IconMap[newModuleForm.icon] || <LayoutGrid size={20} />}
                </div>
                <span className="preview-name">{newModuleForm.name || '模块名称'}</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeAddModuleModal}>
                取消
              </button>
              <div className="footer-spacer" />
              <button 
                className="btn-primary" 
                onClick={addModule} 
                disabled={!newModuleForm.name.trim()}
              >
                创建模块
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 角色编辑弹窗 */}
      {characterModal.isOpen && (
        <div className="modal-overlay" onClick={() => setCharacterModal({ ...characterModal, isOpen: false })}>
          <div className="modal-content character-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{characterModal.editIndex !== null ? '编辑角色' : '添加角色'}</h3>
              <button className="modal-close" onClick={() => setCharacterModal({ ...characterModal, isOpen: false })}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>角色名称 <span className="required">*</span></label>
                <input
                  type="text"
                  value={characterModal.form.name}
                  onChange={(e) => setCharacterModal({
                    ...characterModal,
                    form: { ...characterModal.form, name: e.target.value }
                  })}
                  placeholder="请输入角色名称"
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group half">
                  <label>性别</label>
                  <select
                    value={characterModal.form.gender}
                    onChange={(e) => setCharacterModal({
                      ...characterModal,
                      form: { ...characterModal.form, gender: e.target.value }
                    })}
                  >
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>
                <div className="form-group half">
                  <label>角色类型</label>
                  <select
                    value={characterModal.form.type}
                    onChange={(e) => setCharacterModal({
                      ...characterModal,
                      form: { ...characterModal.form, type: e.target.value }
                    })}
                  >
                    <option value="主要角色">主要角色</option>
                    <option value="次要角色">次要角色</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>角色简介</label>
                <textarea
                  value={characterModal.form.description}
                  onChange={(e) => setCharacterModal({
                    ...characterModal,
                    form: { ...characterModal.form, description: e.target.value }
                  })}
                  placeholder="请输入角色简介、性格特点、背景故事等..."
                  rows={5}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setCharacterModal({ ...characterModal, isOpen: false })}>
                取消
              </button>
              <div className="footer-spacer" />
              <button 
                className="btn-primary" 
                onClick={() => {
                  const module = template.modules.find(m => m.id === characterModal.moduleId);
                  if (!module) return;
                  
                  // 如果组件在分页中
                  if (characterModal.tabsComponentId && characterModal.tabId) {
                    const tabsComp = module.components.find(c => c.id === characterModal.tabsComponentId);
                    if (!tabsComp || tabsComp.type !== 'tabs' || !tabsComp.config.tabs) return;
                    
                    const tab = tabsComp.config.tabs.find(t => t.id === characterModal.tabId);
                    if (!tab) return;
                    
                    const subComp = tab.components.find(c => c.id === characterModal.compId);
                    if (!subComp) return;
                    
                    const currentData = (subComp.value as { name: string; gender: string; type: string; description: string }[]) || [];
                    let newData: typeof currentData;
                    
                    if (characterModal.editIndex !== null) {
                      // 编辑现有角色
                      newData = [...currentData];
                      newData[characterModal.editIndex] = { ...characterModal.form };
                    } else {
                      // 添加新角色
                      newData = [...currentData, { ...characterModal.form }];
                    }
                    
                    // 更新分页中的组件
                    const updatedTabs = tabsComp.config.tabs.map(t => {
                      if (t.id === characterModal.tabId) {
                        return {
                          ...t,
                          components: t.components.map(c => {
                            if (c.id === characterModal.compId) {
                              return { ...c, value: newData };
                            }
                            return c;
                          })
                        };
                      }
                      return t;
                    });
                    
                    const updatedTemplate = {
                      ...template,
                      modules: template.modules.map(m => {
                        if (m.id !== characterModal.moduleId) return m;
                        return {
                          ...m,
                          components: m.components.map(c => {
                            if (c.id === characterModal.tabsComponentId) {
                              return {
                                ...c,
                                config: {
                                  ...c.config,
                                  tabs: updatedTabs
                                }
                              };
                            }
                            return c;
                          })
                        };
                      })
                    };
                    
                    setTemplate(updatedTemplate);
                    
                    // 保存作品信息到 metadata
                    if (workId) {
                      saveWorkInfoToMetadata(updatedTemplate).catch(console.error);
                    }
                  } else {
                    // 组件不在分页中，直接更新
                    const comp = module.components.find(c => c.id === characterModal.compId);
                    if (!comp) return;
                    
                    const currentData = (comp.value as { name: string; gender: string; type: string; description: string }[]) || [];
                    let newData: typeof currentData;
                    
                    if (characterModal.editIndex !== null) {
                      // 编辑现有角色
                      newData = [...currentData];
                      newData[characterModal.editIndex] = { ...characterModal.form };
                    } else {
                      // 添加新角色
                      newData = [...currentData, { ...characterModal.form }];
                    }
                    
                    const updatedTemplate = {
                      ...template,
                      modules: template.modules.map(m => {
                        if (m.id === characterModal.moduleId) {
                          return {
                            ...m,
                            components: m.components.map(c => 
                              c.id === characterModal.compId ? { ...c, value: newData } : c
                            )
                          };
                        }
                        return m;
                      })
                    };
                    
                    updateComponentValue(characterModal.moduleId, characterModal.compId, newData);
                    
                    // 保存作品信息到 metadata
                    if (workId) {
                      saveWorkInfoToMetadata(updatedTemplate).catch(console.error);
                    }
                  }
                  
                  setCharacterModal({ ...characterModal, isOpen: false });
                }}
                disabled={!characterModal.form.name.trim()}
              >
                {characterModal.editIndex !== null ? '保存修改' : '添加角色'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 势力编辑弹窗 */}
      {factionModal.isOpen && (
        <div className="modal-overlay" onClick={() => setFactionModal({ ...factionModal, isOpen: false })}>
          <div className="modal-content faction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{factionModal.editId ? '编辑势力' : (factionModal.parentId ? '添加子势力' : '添加势力')}</h3>
              <button className="modal-close" onClick={() => setFactionModal({ ...factionModal, isOpen: false })}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>势力名称 <span className="required">*</span></label>
                <input
                  type="text"
                  value={factionModal.form.name}
                  onChange={(e) => setFactionModal({
                    ...factionModal,
                    form: { ...factionModal.form, name: e.target.value }
                  })}
                  placeholder="请输入势力名称"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>势力简述</label>
                <textarea
                  value={factionModal.form.summary}
                  onChange={(e) => setFactionModal({
                    ...factionModal,
                    form: { ...factionModal.form, summary: e.target.value }
                  })}
                  placeholder="请输入势力简述..."
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>详细信息</label>
                <textarea
                  value={factionModal.form.details}
                  onChange={(e) => setFactionModal({
                    ...factionModal,
                    form: { ...factionModal.form, details: e.target.value }
                  })}
                  placeholder="请输入详细信息、背景故事等..."
                  rows={6}
                />
              </div>

              <div className="form-group">
                <label>等级阶梯</label>
                <div className="faction-levels-section">
                  <div className="levels-list">
                    {factionModal.form.levels.map((level, index) => (
                      <div key={index} className="level-item">
                        <span className="level-order">{index + 1}</span>
                        <span className="level-name">{level}</span>
                        <button
                          className="remove-level-btn"
                          onClick={() => {
                            setFactionModal({
                              ...factionModal,
                              form: {
                                ...factionModal.form,
                                levels: factionModal.form.levels.filter((_, i) => i !== index)
                              }
                            });
                          }}
                          title="删除"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="add-level-row">
                    <input
                      type="text"
                      value={factionModal.newLevel}
                      onChange={(e) => setFactionModal({ ...factionModal, newLevel: e.target.value })}
                      placeholder="输入等级名称"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && factionModal.newLevel.trim()) {
                          setFactionModal({
                            ...factionModal,
                            form: {
                              ...factionModal.form,
                              levels: [...factionModal.form.levels, factionModal.newLevel.trim()]
                            },
                            newLevel: ''
                          });
                        }
                      }}
                    />
                    <button
                      className="add-level-btn"
                      onClick={() => {
                        if (factionModal.newLevel.trim()) {
                          setFactionModal({
                            ...factionModal,
                            form: {
                              ...factionModal.form,
                              levels: [...factionModal.form.levels, factionModal.newLevel.trim()]
                            },
                            newLevel: ''
                          });
                        }
                      }}
                      disabled={!factionModal.newLevel.trim()}
                    >
                      <Plus size={14} />
                      添加
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setFactionModal({ ...factionModal, isOpen: false })}>
                取消
              </button>
              <div className="footer-spacer" />
              <button 
                className="btn-primary" 
                onClick={() => {
                  const module = template.modules.find(m => m.id === factionModal.moduleId);
                  const comp = module?.components.find(c => c.id === factionModal.compId);
                  if (!comp) return;
                  
                  const currentData = (comp.value as FactionData[]) || [];
                  let newData: FactionData[];
                  
                  // 递归查找并添加/更新势力
                  const addOrUpdateFaction = (
                    factions: FactionData[], 
                    targetParentId: string | null, 
                    newFaction: FactionData,
                    editId: string | null
                  ): FactionData[] => {
                    if (editId) {
                      // 编辑现有势力
                      return factions.map(f => {
                        if (f.id === editId) {
                          return { ...f, ...newFaction, children: f.children };
                        }
                        if (f.children) {
                          return { ...f, children: addOrUpdateFaction(f.children, targetParentId, newFaction, editId) };
                        }
                        return f;
                      });
                    } else if (targetParentId) {
                      // 添加到父级势力
                      return factions.map(f => {
                        if (f.id === targetParentId) {
                          return { ...f, children: [...(f.children || []), newFaction] };
                        }
                        if (f.children) {
                          return { ...f, children: addOrUpdateFaction(f.children, targetParentId, newFaction, editId) };
                        }
                        return f;
                      });
                    }
                    return factions;
                  };
                  
                  const newFaction: FactionData = {
                    id: factionModal.editId || `faction-${Date.now()}`,
                    name: factionModal.form.name,
                    summary: factionModal.form.summary,
                    details: factionModal.form.details,
                    levels: factionModal.form.levels,
                    parentId: factionModal.parentId || undefined
                  };
                  
                  if (factionModal.editId) {
                    // 编辑现有势力
                    newData = addOrUpdateFaction(currentData, null, newFaction, factionModal.editId);
                  } else if (factionModal.parentId) {
                    // 添加子势力
                    newData = addOrUpdateFaction(currentData, factionModal.parentId, newFaction, null);
                  } else {
                    // 添加顶级势力
                    newData = [...currentData, newFaction];
                  }
                  
                  updateComponentValue(factionModal.moduleId, factionModal.compId, newData);
                  setFactionModal({ 
                    isOpen: false, 
                    compId: '', 
                    moduleId: '', 
                    editId: null, 
                    parentId: null,
                    form: { name: '', summary: '', details: '', levels: [] },
                    newLevel: ''
                  });
                }}
                disabled={!factionModal.form.name.trim()}
              >
                {factionModal.editId ? '保存修改' : '添加势力'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
