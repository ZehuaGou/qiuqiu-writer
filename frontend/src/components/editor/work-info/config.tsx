import React from 'react';
import { 
  Type, AlignLeft, Image, CheckSquare, Tag, List, FileText, 
  Table2, LayoutGrid, Users, TrendingUp, Building2, GitBranch, Clock,
  Map, Heart, Zap, Sparkles
} from 'lucide-react';
import type { ComponentConfig, ComponentType } from './types';

export interface ComponentDefinition {
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

export const IconMap: Record<string, React.ReactNode> = {
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

export const componentRegistry: ComponentDefinition[] = [
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
