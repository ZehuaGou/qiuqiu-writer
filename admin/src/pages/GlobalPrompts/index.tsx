import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Input, Space, Tag, Modal, Form, Select,
  message, Popconfirm, Card, Switch, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, CheckCircleOutlined, StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

// ─── types ───────────────────────────────────────────────────────────────────

interface PromptTemplate {
  id: number;
  name: string;
  description?: string;
  template_type: string;
  prompt_content: string;
  version: string;
  is_default: boolean;
  is_active: boolean;
  component_id?: string;
  component_type?: string;
  prompt_category?: string;
  work_template_id?: number;
  usage_count: number;
  created_at?: string;
  updated_at?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  { label: '章节分析', value: 'chapter_analysis' },
  { label: '书本分析', value: 'book_analysis' },
  { label: '章节续写', value: 'continue_chapter' },
  { label: '角色提取', value: 'character_extraction' },
  { label: '角色生成', value: 'character_generation' },
  { label: '章节生成', value: 'chapter_generation' },
  { label: '章节摘要', value: 'chapter_summary' },
  { label: '大纲生成', value: 'outline_generation' },
  { label: '细纲生成', value: 'detailed_outline_generation' },
  { label: '组件生成', value: 'component_generate' },
  { label: '组件校验', value: 'component_validate' },
  { label: '组件分析', value: 'component_analysis' },
  { label: '其他', value: 'other' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TEMPLATE_TYPES.map(({ value, label }) => [value, label])
);

const TYPE_COLOR: Record<string, string> = {
  chapter_analysis: 'blue',
  book_analysis: 'purple',
  continue_chapter: 'cyan',
  character_extraction: 'orange',
  character_generation: 'orange',
  chapter_generation: 'geekblue',
  chapter_summary: 'teal',
  outline_generation: 'gold',
  detailed_outline_generation: 'gold',
  component_generate: 'green',
  component_validate: 'lime',
  component_analysis: 'magenta',
};

const CATEGORY_COLOR: Record<string, string> = {
  generate: 'green',
  validate: 'blue',
  analysis: 'purple',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
});

// ─── component ────────────────────────────────────────────────────────────────

const GlobalPrompts: React.FC = () => {
  const [data, setData] = useState<PromptTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<string | undefined>();

  // ── edit / create modal ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // ── content preview modal ────────────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');

  // ─── data fetching ──────────────────────────────────────────────────────

  const fetchData = useCallback(async (p = page, size = pageSize, kw = keyword, type = filterType) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/prompt-templates', {
        headers: authHeaders(),
        params: {
          page: p,
          size,
          keyword: kw || undefined,
          template_type: type || undefined,
          global_only: true,
        },
      });
      setData(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, filterType]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── handlers ───────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true, is_default: false, version: '1.0' });
    setModalOpen(true);
  };

  const openEdit = (record: PromptTemplate) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      template_type: record.template_type,
      prompt_content: record.prompt_content,
      version: record.version,
      is_default: record.is_default,
      is_active: record.is_active,
      component_id: record.component_id,
      prompt_category: record.prompt_category,
    });
    setModalOpen(true);
  };

  const openPreview = (record: PromptTemplate) => {
    setPreviewTitle(record.name);
    setPreviewContent(record.prompt_content);
    setPreviewOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await axios.put(`/api/v1/admin/prompt-templates/${editing.id}`, values, { headers: authHeaders() });
        message.success('更新成功');
      } else {
        await axios.post('/api/v1/admin/prompt-templates', values, { headers: authHeaders() });
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchData(page, pageSize, keyword, filterType);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
      message.error(editing ? '更新失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/api/v1/admin/prompt-templates/${id}`, { headers: authHeaders() });
      message.success('已删除');
      fetchData(page, pageSize, keyword, filterType);
    } catch {
      message.error('删除失败');
    }
  };

  const handleToggleActive = async (record: PromptTemplate) => {
    try {
      await axios.put(
        `/api/v1/admin/prompt-templates/${record.id}`,
        { is_active: !record.is_active },
        { headers: authHeaders() },
      );
      message.success(record.is_active ? '已停用' : '已启用');
      fetchData(page, pageSize, keyword, filterType);
    } catch {
      message.error('操作失败');
    }
  };

  const handleToggleDefault = async (record: PromptTemplate) => {
    try {
      await axios.put(
        `/api/v1/admin/prompt-templates/${record.id}`,
        { is_default: !record.is_default },
        { headers: authHeaders() },
      );
      message.success(record.is_default ? '已取消默认' : '已设为默认');
      fetchData(page, pageSize, keyword, filterType);
    } catch {
      message.error('操作失败');
    }
  };

  // ─── columns ────────────────────────────────────────────────────────────

  const columns: ColumnsType<PromptTemplate> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (name, record) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => openPreview(record)}>
          {name}
        </Button>
      ),
    },
    {
      title: '类型',
      dataIndex: 'template_type',
      width: 120,
      render: (v) => (
        <Tag color={TYPE_COLOR[v] ?? 'default'}>{TYPE_LABEL[v] ?? v}</Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'prompt_category',
      width: 90,
      render: (v) => v ? <Tag color={CATEGORY_COLOR[v] ?? 'default'}>{v}</Tag> : '-',
    },
    {
      title: '组件',
      dataIndex: 'component_id',
      width: 100,
      render: (v) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 70,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={record.is_active ? '点击停用' : '点击启用'}>
            <Badge
              status={record.is_active ? 'success' : 'default'}
              text={
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, color: record.is_active ? '#52c41a' : '#bfbfbf' }}
                  onClick={() => handleToggleActive(record)}
                >
                  {record.is_active ? '启用' : '停用'}
                </Button>
              }
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '默认',
      key: 'is_default',
      width: 80,
      render: (_, record) => (
        <Tooltip title={record.is_default ? '取消默认' : '设为默认'}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            icon={record.is_default ? <CheckCircleOutlined style={{ color: '#1677ff' }} /> : <StopOutlined style={{ color: '#bfbfbf' }} />}
            onClick={() => handleToggleDefault(record)}
          />
        </Tooltip>
      ),
    },
    {
      title: '使用次数',
      dataIndex: 'usage_count',
      width: 80,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 150,
      render: (v) => v ? v.slice(0, 19).replace('T', ' ') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="预览内容">
            <Button icon={<EyeOutlined />} size="small" onClick={() => openPreview(record)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button icon={<EditOutlined />} size="small" type="primary" onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="确认删除此 Prompt？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ─── render ─────────────────────────────────────────────────────────────

  return (
    <>
      <Card
        title="全局 Prompt 管理"
        extra={
          <Space>
            <Select
              placeholder="按类型筛选"
              allowClear
              style={{ width: 140 }}
              options={TEMPLATE_TYPES}
              value={filterType}
              onChange={(v) => {
                setFilterType(v);
                setPage(1);
                fetchData(1, pageSize, keyword, v);
              }}
            />
            <Input.Search
              placeholder="搜索名称/描述"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 220 }}
              onSearch={(v) => {
                setKeyword(v);
                setPage(1);
                fetchData(1, pageSize, v, filterType);
              }}
              onChange={(e) => {
                if (!e.target.value) {
                  setKeyword('');
                  fetchData(1, pageSize, '', filterType);
                }
              }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建 Prompt
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, size) => {
              setPage(p);
              setPageSize(size);
              fetchData(p, size, keyword, filterType);
            },
          }}
          scroll={{ x: 960 }}
        />
      </Card>

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      <Modal
        title={editing ? `编辑 Prompt · ${editing.name}` : '新建全局 Prompt'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：章节人物提取" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="用途说明（可选）" />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item
              name="template_type"
              label="类型"
              rules={[{ required: true, message: '请选择类型' }]}
              style={{ width: 200 }}
            >
              <Select options={TEMPLATE_TYPES} placeholder="选择类型" />
            </Form.Item>

            <Form.Item name="prompt_category" label="分类" style={{ width: 140 }}>
              <Select
                allowClear
                placeholder="可选"
                options={[
                  { label: 'generate', value: 'generate' },
                  { label: 'validate', value: 'validate' },
                  { label: 'analysis', value: 'analysis' },
                ]}
              />
            </Form.Item>

            <Form.Item name="component_id" label="组件 ID" style={{ width: 160 }}>
              <Input placeholder="如：summary（可选）" />
            </Form.Item>

            <Form.Item name="version" label="版本" style={{ width: 80 }}>
              <Input placeholder="1.0" />
            </Form.Item>
          </Space>

          <Form.Item
            name="prompt_content"
            label="Prompt 内容"
            rules={[{ required: true, message: '请输入 Prompt 内容' }]}
          >
            <Input.TextArea
              rows={14}
              placeholder="输入 Prompt 内容，支持 @work.metadata.xxx / @chapter.content 等变量"
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </Form.Item>

          <Space size="large">
            <Form.Item name="is_active" label="启用" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="is_default" label="默认" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* ── Content Preview Modal ───────────────────────────────────────── */}
      <Modal
        title={previewTitle}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={<Button onClick={() => setPreviewOpen(false)}>关闭</Button>}
        width={760}
      >
        <pre
          style={{
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '60vh',
            overflowY: 'auto',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {previewContent}
        </pre>
      </Modal>
    </>
  );
};

export default GlobalPrompts;
