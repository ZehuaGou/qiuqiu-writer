import React, { useRef } from 'react';
import { Tag, Button, Popconfirm, message } from 'antd';
import { ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import request from '@/utils/request';

const Cubes: React.FC = () => {
  const actionRef = useRef<ActionType>();

  const handleDelete = async (cubeId: string) => {
    try {
      await request.delete(`/admin/cubes/${cubeId}`);
      message.success('Cube deleted successfully');
      actionRef.current?.reload();
    } catch (error) {
      /* handled by interceptor */
    }
  };

  const columns: ProColumns<any>[] = [
    {
      title: 'Name',
      dataIndex: 'cube_name',
      copyable: true,
      sorter: (a, b) => a.cube_name.localeCompare(b.cube_name),
      search: false, // Assuming no search API for now based on original code
    },
    {
      title: 'Cube ID',
      dataIndex: 'cube_id',
      copyable: true,
      ellipsis: true,
      sorter: (a, b) => a.cube_id.localeCompare(b.cube_id),
      search: false,
    },
    {
      title: 'Owner ID',
      dataIndex: 'owner_id',
      copyable: true,
      ellipsis: true,
      sorter: (a, b) => a.owner_id.localeCompare(b.owner_id),
      search: false,
    },
    {
      title: 'Path',
      dataIndex: 'cube_path',
      ellipsis: true,
      search: false,
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      width: 100,
      search: false,
      valueEnum: {
        true: { text: 'Active', status: 'Success' },
        false: { text: 'Inactive', status: 'Error' },
      },
      sorter: (a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
      render: (_, record) => (
        <Tag color={record.is_active ? 'green' : 'red'}>
          {record.is_active ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      search: false,
      width: 160,
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title: 'Updated At',
      dataIndex: 'updated_at',
      valueType: 'dateTime',
      search: false,
      width: 160,
      sorter: (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
    },
    {
      title: 'Actions',
      valueType: 'option',
      width: 100,
      render: (_, record) => [
        <Popconfirm
          key="delete"
          title="Delete the cube"
          description="Are you sure to delete this cube?"
          onConfirm={() => handleDelete(record.cube_id)}
          okText="Yes"
          okButtonProps={{ danger: true }}
        >
          <Button danger size="small">Delete</Button>
        </Popconfirm>
      ],
    },
  ];

  return (
    <ProTable<any>
      headerTitle="Cubes Management"
      actionRef={actionRef}
      rowKey="cube_id"
      search={false} // No search in original, so disabling it
      request={async (params) => {
        const { current, pageSize } = params;
        const res: any = await request.get('/admin/cubes', {
          params: {
            page: current,
            size: pageSize,
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
      }}
    />
  );
};

export default Cubes;
