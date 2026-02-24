import React, { useState, useEffect } from 'react';
import { Table, Button, Card, message, Tag, Space } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

interface InvitationCodeItem {
  id: number;
  code: string;
  used: number;
  used_by_user_id: string | null;
  used_at: string | null;
  created_at: string | null;
}

const InvitationCodes: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [data, setData] = useState<InvitationCodeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size] = useState(50);
  const [usedFilter, setUsedFilter] = useState<boolean | undefined>(undefined);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const params: Record<string, any> = { page, size };
      if (usedFilter !== undefined) {
        params.used = usedFilter;
      }
      const res = await axios.get('/api/v1/admin/invitation-codes', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setData(res.data.items);
      setTotal(res.data.total);
    } catch (error) {
      message.error('加载邀请码列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, usedFilter]);

  const handleGenerate = async () => {
    setGenerateLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.post(
        '/api/v1/admin/invitation-codes/generate',
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { count: 100 },
        }
      );
      message.success(res.data.message || `已生成 ${res.data.count} 个邀请码`);
      fetchData();
    } catch (error) {
      message.error('生成邀请码失败');
    } finally {
      setGenerateLoading(false);
    }
  };

  const columns: ColumnsType<InvitationCodeItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '邀请码',
      dataIndex: 'code',
      width: 140,
      render: (code) => <code style={{ fontFamily: 'monospace' }}>{code}</code>,
    },
    {
      title: '状态',
      dataIndex: 'used',
      width: 100,
      render: (used) =>
        used === 1 ? (
          <Tag color="orange">已使用</Tag>
        ) : (
          <Tag color="green">未使用</Tag>
        ),
    },
    {
      title: '使用用户 ID',
      dataIndex: 'used_by_user_id',
      width: 200,
      render: (v) => v || '-',
    },
    {
      title: '使用时间',
      dataIndex: 'used_at',
      width: 180,
      render: (v) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => (v ? new Date(v).toLocaleString() : '-'),
    },
  ];

  return (
    <div>
      <Card
        title="邀请码管理"
        extra={
          <Space>
            <Button
              type={usedFilter === undefined ? 'primary' : 'default'}
              size="small"
              onClick={() => setUsedFilter(undefined)}
            >
              全部
            </Button>
            <Button
              type={usedFilter === false ? 'primary' : 'default'}
              size="small"
              onClick={() => setUsedFilter(false)}
            >
              未使用
            </Button>
            <Button
              type={usedFilter === true ? 'primary' : 'default'}
              size="small"
              onClick={() => setUsedFilter(true)}
            >
              已使用
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={generateLoading}
              onClick={handleGenerate}
            >
              一键生成 100 个邀请码
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
            pageSize: size,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  );
};

export default InvitationCodes;
