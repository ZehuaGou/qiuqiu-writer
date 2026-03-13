import React, { useRef } from 'react';
import { Button, Tag, Space, Modal, message } from 'antd';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { ExclamationCircleOutlined, SearchOutlined } from '@ant-design/icons';
import request from '@/utils/request';

const { confirm } = Modal;

const Works: React.FC = () => {
  const actionRef = useRef<ActionType>();

  const handleStatusChange = (record: any, newStatus: string) => {
    confirm({
      title: `Are you sure you want to change status to ${newStatus}?`,
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        try {
          await request.put(`/admin/works/${record.id}/status`, { status: newStatus });
          message.success('Status updated successfully');
          actionRef.current?.reload();
        } catch (error) {
          /* handled by interceptor */
        }
      },
    });
  };

  const columns: ProColumns<any>[] = [
    {
      title: 'Search',
      dataIndex: 'keyword',
      hideInTable: true,
      tooltip: 'Search title/desc',
      fieldProps: {
        prefix: <SearchOutlined />,
        placeholder: 'Search title/desc',
      },
    },
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      search: false,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      copyable: true,
      search: false,
      sorter: (a, b) => a.title.localeCompare(b.title),
    },
    {
      title: 'Type',
      dataIndex: 'work_type',
      width: 100,
      search: false,
      sorter: (a, b) => a.work_type.localeCompare(b.work_type),
      render: (_, record) => <Tag color="blue">{record.work_type}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      search: false,
      valueEnum: {
        published: { text: 'Published', status: 'Success' },
        draft: { text: 'Draft', status: 'Warning' },
        hidden: { text: 'Hidden', status: 'Error' },
      },
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (_, record) => {
        let color = 'default';
        if (record.status === 'published') color = 'green';
        if (record.status === 'draft') color = 'orange';
        if (record.status === 'hidden') color = 'red';
        return <Tag color={color}>{record.status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Public',
      dataIndex: 'is_public',
      width: 80,
      search: false,
      sorter: (a, b) => (a.is_public === b.is_public ? 0 : a.is_public ? -1 : 1),
      render: (_, record) => (record.is_public ? 'Yes' : 'No'),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      width: 160,
      search: false,
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: 'Action',
      key: 'action',
      width: 120,
      search: false,
      fixed: 'right',
      render: (_, record) => (
        <Space size="middle">
          {record.status !== 'hidden' ? (
             <Button danger size="small" onClick={() => handleStatusChange(record, 'hidden')}>
               Hide
             </Button>
          ) : (
            <Button type="primary" size="small" onClick={() => handleStatusChange(record, 'published')}>
              Publish
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <ProTable<any>
      headerTitle="Works Management"
      actionRef={actionRef}
      rowKey="id"
      search={{
        labelWidth: 'auto',
      }}
      request={async (params) => {
        const { current, pageSize, keyword } = params;
        const res: any = await request.get('/admin/works', {
          params: {
            page: current,
            size: pageSize,
            keyword: keyword,
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
    />
  );
};

export default Works;
