import React, { useRef } from 'react';
import { Button, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import request from '@/utils/request';

interface InvitationCodeItem {
  id: number;
  code: string;
  used: number; // 0 or 1
  used_by_user_id: string | null;
  used_at: string | null;
  created_at: string | null;
}

const InvitationCodes: React.FC = () => {
  const actionRef = useRef<ActionType>();

  const handleGenerate = async () => {
    try {
      const res: any = await request.post('/admin/invitation-codes/generate', {}, {
        params: { count: 100 },
      });
      message.success(res.message || `Generated ${res.count} codes`);
      actionRef.current?.reload();
    } catch (error) {
      /* handled */
    }
  };

  const columns: ProColumns<InvitationCodeItem>[] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      search: false,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: 'Code',
      dataIndex: 'code',
      copyable: true,
      render: (_, record) => <code style={{ fontFamily: 'monospace' }}>{record.code}</code>,
      search: false, 
      sorter: (a, b) => a.code.localeCompare(b.code),
    },
    {
      title: 'Status',
      dataIndex: 'used',
      valueType: 'select',
      valueEnum: {
        0: { text: 'Unused', status: 'Success' },
        1: { text: 'Used', status: 'Warning' },
      },
      width: 100,
      sorter: (a, b) => a.used - b.used,
      render: (_, record) => (
        <Tag color={record.used ? 'orange' : 'green'}>
          {record.used ? 'Used' : 'Unused'}
        </Tag>
      ),
    },
    {
      title: 'Used By User ID',
      dataIndex: 'used_by_user_id',
      copyable: true,
      search: false,
      width: 200,
      render: (v) => v || '-',
    },
    {
      title: 'Used At',
      dataIndex: 'used_at',
      valueType: 'dateTime',
      search: false,
      width: 160,
      sorter: (a, b) => new Date(a.used_at || 0).getTime() - new Date(b.used_at || 0).getTime(),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      search: false,
      width: 160,
      sorter: (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    },
  ];

  return (
    <ProTable<InvitationCodeItem>
      headerTitle="Invitation Codes"
      actionRef={actionRef}
      rowKey="id"
      search={{
        labelWidth: 'auto',
      }}
      toolBarRender={() => [
        <Button key="generate" type="primary" icon={<PlusOutlined />} onClick={handleGenerate}>
          Generate 100 Codes
        </Button>,
      ]}
      request={async (params) => {
        const { current, pageSize, used } = params;
        const queryParams: any = {
          page: current,
          size: pageSize,
        };
        
        if (used !== undefined) {
          queryParams.used = used;
        }
        
        const res: any = await request.get('/admin/invitation-codes', {
          params: queryParams,
        });
        
        return {
          data: res.items,
          success: true,
          total: res.total,
        };
      }}
      columns={columns}
      pagination={{
        pageSize: 50,
      }}
    />
  );
};

export default InvitationCodes;
