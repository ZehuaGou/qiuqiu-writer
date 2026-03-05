import React, { useState, useEffect } from 'react';
import {
  Table, Button, Input, Space, Tag, Modal, Form, Select,
  message, Popconfirm, Card, Switch,
} from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface WorkTemplate {
  id: number;
  name: string;
  description?: string;
  work_type: string;
  is_system?: boolean;
  is_public?: boolean;
  creator_id?: string;
  category?: string;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
});

const PromptTemplates: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<WorkTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async (keyword?: string) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/work-templates', {
        params: keyword ? { search: keyword } : {},
        headers: authHeaders(),
      });
      setData(Array.isArray(res.data) ? res.data : []);
    } catch {
      message.error('加载作品模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    fetchData(val);
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/api/v1/admin/work-templates/${id}`, { headers: authHeaders() });
      message.success('已删除');
      fetchData(search);
    } catch {
      message.error('删除失败');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await axios.post('/api/v1/admin/work-templates', values, { headers: authHeaders() });
      message.success('创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchData(search);
    } catch {
      message.error('创建失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<WorkTemplate> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '模板名称',
      dataIndex: 'name',
      render: (name, record) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 500 }}
          onClick={() => navigate(`/prompt-templates/${record.id}`)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: '作品类型',
      dataIndex: 'work_type',
      width: 100,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
      render: (v) => v || '-',
    },
    {
      title: '公开',
      dataIndex: 'is_public',
      width: 70,
      render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? '是' : '否'}</Tag>,
    },
    {
      title: '系统',
      dataIndex: 'is_system',
      width: 70,
      render: (v) => v ? <Tag color="blue">系统</Tag> : '-',
    },
    {
      title: '使用次数',
      dataIndex: 'usage_count',
      width: 90,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v) => v ? v.slice(0, 19).replace('T', ' ') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="default"
            icon={<RightOutlined />}
            size="small"
            onClick={() => navigate(`/prompt-templates/${record.id}`)}
          >
            详情
          </Button>
          <Popconfirm
            title="确认删除此作品模板？删除后关联的 Prompt 模板也将一并删除。"
            onConfirm={() => handleDelete(record.id)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="作品模板"
      extra={
        <Space>
          <Input.Search
            placeholder="搜索模板名称/描述"
            prefix={<SearchOutlined />}
            onSearch={handleSearch}
            onChange={(e) => !e.target.value && fetchData()}
            allowClear
            style={{ width: 240 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ work_type: 'novel', is_public: false, is_system: false });
              setModalOpen(true);
            }}
          >
            新建模板
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title="新建作品模板"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="创建"
        cancelText="取消"
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="如：网络小说标准模板" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="模板用途说明" />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="work_type" label="作品类型" rules={[{ required: true }]} style={{ width: 160 }}>
              <Select options={[
                { label: '小说', value: 'novel' },
                { label: '散文', value: 'essay' },
                { label: '剧本', value: 'script' },
                { label: '其他', value: 'other' },
              ]} />
            </Form.Item>

            <Form.Item name="category" label="分类" style={{ width: 160 }}>
              <Input placeholder="如：网络文学" />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} align="center">
            <Form.Item name="is_public" label="公开" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="is_system" label="系统模板" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
};

export default PromptTemplates;
