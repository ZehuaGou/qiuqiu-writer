import React, { useRef } from 'react';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import request from '@/utils/request';
import dayjs from 'dayjs';

interface AuditLog {
  id: number;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

const AuditLogs: React.FC = () => {
  const actionRef = useRef<ActionType>();

  const columns: ProColumns<AuditLog>[] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      search: false,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: 'User ID',
      dataIndex: 'user_id',
      width: 150,
      copyable: true,
      sorter: (a, b) => (a.user_id || '').localeCompare(b.user_id || ''),
      render: (_, record) => record.user_id ? <Tag>{record.user_id.substring(0, 8)}...</Tag> : '-',
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 120,
      sorter: (a, b) => a.action.localeCompare(b.action),
      render: (_, record) => {
        let color = 'blue';
        if (record.action === 'delete') color = 'red';
        if (record.action === 'create') color = 'green';
        if (record.action === 'login') color = 'cyan';
        return <Tag color={color}>{record.action.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Target Type',
      dataIndex: 'target_type',
      width: 120,
      search: false,
      sorter: (a, b) => (a.target_type || '').localeCompare(b.target_type || ''),
      render: (text) => text ? <Tag color="purple">{text}</Tag> : '-',
    },
    {
      title: 'Target ID',
      dataIndex: 'target_id',
      width: 120,
      search: false,
      ellipsis: true,
      sorter: (a, b) => (a.target_id || '').localeCompare(b.target_id || ''),
    },
    {
      title: 'Details',
      dataIndex: 'details',
      search: false,
      ellipsis: true,
      width: 300,
      render: (_, record) => (
        <pre style={{ margin: 0, maxHeight: 60, overflow: 'auto', fontSize: 11, color: '#666' }}>
          {JSON.stringify(record.details, null, 0)}
        </pre>
      ),
    },
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      width: 130,
      search: false,
      sorter: (a, b) => (a.ip_address || '').localeCompare(b.ip_address || ''),
    },
    {
      title: 'Time',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      width: 160,
      search: false,
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      render: (_, record) => dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss'),
    },
  ];

  return (
    <ProTable<AuditLog>
      headerTitle="Audit Logs"
      actionRef={actionRef}
      rowKey="id"
      search={{
        labelWidth: 'auto',
      }}
      request={async (params) => {
        const { current, pageSize, user_id, action } = params;
        const res: any = await request.get('/admin/audit-logs', {
          params: {
            page: current,
            size: pageSize,
            user_id: user_id,
            action: action,
          },
        });
        return {
          data: res.items,
          success: true,
          total: res.total,
        };
      }}
      columns={columns}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
      }}
      scroll={{ x: 1200 }}
    />
  );
};

export default AuditLogs;
