import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Card, Row, Col, Tag, Typography, Space, Button,
  Form, Select, InputNumber, message, Progress,
  DatePicker, Tabs,
} from 'antd';
import {
  EditOutlined, SaveOutlined, CloseOutlined,
  ThunderboltOutlined, SearchOutlined,
} from '@ant-design/icons';
import { ProTable, EditableProTable, ProColumns, ActionType, EditableFormInstance } from '@ant-design/pro-components';
import request from '@/utils/request';
import ResizableModal from '@/components/ResizableModal';

const { Title, Text } = Typography;
const { Option } = Select;

// ── 充值包配置 ────────────────────────────────────────────────────────────────

interface MediaCreditPack {
  pack_key: string;
  label: string;
  credits: number;
  price: number;
  badge: string | null;
  highlight: boolean;
}

const DEFAULT_PACK: Partial<MediaCreditPack> = {
  pack_key: '',
  label: '',
  credits: 100,
  price: 19,
  badge: null,
  highlight: false,
};

const PACK_COLUMNS: ProColumns<MediaCreditPack>[] = [
  {
    title: 'Pack Key',
    dataIndex: 'pack_key',
    width: 160,
    formItemProps: { rules: [{ required: true, message: '必填' }] },
    tooltip: '唯一标识符，如 image_pack_medium',
  },
  {
    title: '名称',
    dataIndex: 'label',
    width: 110,
    formItemProps: { rules: [{ required: true }] },
  },
  {
    title: 'Credits 数',
    dataIndex: 'credits',
    valueType: 'digit',
    width: 110,
    fieldProps: { precision: 0, min: 1 },
    formItemProps: { rules: [{ required: true }] },
    render: (_, record) => <Text strong>{record.credits}</Text>,
  },
  {
    title: '售价 (¥)',
    dataIndex: 'price',
    valueType: 'money',
    width: 110,
    formItemProps: { rules: [{ required: true }] },
    render: (_, record) => <Text strong style={{ color: '#d97706' }}>¥{record.price}</Text>,
  },
  {
    title: 'Badge',
    dataIndex: 'badge',
    width: 90,
    tooltip: '留空则不显示角标',
  },
  {
    title: '推荐',
    dataIndex: 'highlight',
    valueType: 'switch',
    width: 70,
    render: (_, record) => (
      <Tag color={record.highlight ? 'gold' : 'default'}>
        {record.highlight ? '推荐' : '-'}
      </Tag>
    ),
  },
  {
    title: '操作',
    valueType: 'option',
    width: 70,
    render: () => null,
  },
];

function CreditPackSection() {
  const [data, setData] = useState<MediaCreditPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableKeys, setEditableKeys] = useState<React.Key[]>([]);
  const [draft, setDraft] = useState<MediaCreditPack[]>([]);
  const [saving, setSaving] = useState(false);
  const editableFormRef = useRef<EditableFormInstance<MediaCreditPack>>();

  const endpoint = `/admin/media/packs`;

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await request.get<MediaCreditPack[]>(endpoint);
      setData(res as unknown as MediaCreditPack[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = () => {
    const copy = JSON.parse(JSON.stringify(data));
    setDraft(copy);
    setEditableKeys(copy.map((p: MediaCreditPack) => p.pack_key));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft([]);
    setEditableKeys([]);
  };

  const handleSave = async () => {
    // Read latest in-cell edits from the form (onChange doesn't fire for field changes)
    const latestDraft = draft.map((p) => {
      const rowData = editableFormRef.current?.getRowData?.(p.pack_key);
      return rowData ? { ...p, ...rowData } : p;
    });
    const keys = latestDraft.map((p) => String(p.pack_key).trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length || keys.some((k) => !k)) {
      message.error('Pack Key 不能为空或重复');
      return;
    }
    setSaving(true);
    try {
      const body = { packs: latestDraft.map((p) => ({ ...p, pack_key: String(p.pack_key).trim() })) };
      await request.put(endpoint, body);
      await fetchData();
      setIsEditing(false);
      setEditableKeys([]);
      message.success('保存成功');
    } catch {
      /* handled */
    } finally {
      setSaving(false);
    }
  };

  const columns = PACK_COLUMNS.map((col) => {
    if (col.title === '操作') {
      return {
        ...col,
        render: (_: any, record: MediaCreditPack) =>
          isEditing ? (
            <a
              style={{ color: '#ff4d4f' }}
              onClick={() => setDraft(draft.filter((p) => p.pack_key !== record.pack_key))}
            >
              删除
            </a>
          ) : null,
      };
    }
    return col;
  });

  return (
    <Card
      title="媒体 Credits 充值包"
      loading={loading}
      style={{ marginBottom: 16 }}
      extra={
        isEditing ? (
          <Space>
            <Button icon={<CloseOutlined />} onClick={handleCancel}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存</Button>
          </Space>
        ) : (
          <Button icon={<EditOutlined />} onClick={handleEdit}>编辑</Button>
        )
      }
    >
      {isEditing ? (
        <EditableProTable<MediaCreditPack>
          rowKey="pack_key"
          editableFormRef={editableFormRef}
          maxLength={10}
          scroll={{ x: 750 }}
          recordCreatorProps={{
            position: 'bottom',
            record: () => ({ ...DEFAULT_PACK, pack_key: `media_pack_${Date.now()}` } as MediaCreditPack),
          }}
          columns={columns}
          value={draft}
          onChange={(val) => setDraft([...val])}
          editable={{
            type: 'multiple',
            editableKeys,
            onChange: setEditableKeys,
            actionRender: (_, __, dom) => [dom.delete],
          }}
        />
      ) : (
        <EditableProTable<MediaCreditPack>
          rowKey="pack_key"
          columns={columns}
          value={data}
          editable={{ editableKeys: [] }}
          recordCreatorProps={false}
          scroll={{ x: 750 }}
        />
      )}
    </Card>
  );
}

interface PlanPricePoint {
  original: number;
  current: number;
}

interface PlanPricing {
  monthly: PlanPricePoint;
  quarterly: PlanPricePoint;
  yearly: PlanPricePoint;
}

interface PlanConfig {
  key: string;
  label: string;
  tokens: number;
  desc: string;
  highlight: boolean;
  badge: string | null;
  pricing: PlanPricing;
}

const DEFAULT_PRICING: PlanPricing = {
  monthly:   { original: 0, current: 0 },
  quarterly: { original: 0, current: 0 },
  yearly:    { original: 0, current: 0 },
};

const DEFAULT_PLAN: Partial<PlanConfig> = {
  label: '',
  tokens: 100000,
  desc: '',
  highlight: false,
  badge: null,
  pricing: DEFAULT_PRICING,
};

function tokensToWanZi(tokens: number): string {
  const chars = Math.floor(tokens / 1.5);
  if (chars >= 10000) return `${(chars / 10000).toFixed(1)}万字`;
  return `${chars}字`;
}

const Plans: React.FC = () => {
  // ── Plan Config State ────────────────────────────────────────────────
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editableKeys, setEditableRowKeys] = useState<React.Key[]>([]);
  const [dataSource, setDataSource] = useState<PlanConfig[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  const planEditableFormRef = useRef<EditableFormInstance<PlanConfig>>();

  // ── User List State ──────────────────────────────────────────────────
  const actionRef = useRef<ActionType>();
  const [isPlanModalVisible, setIsPlanModalVisible] = useState(false);
  const [planUser, setPlanUser] = useState<any>(null);
  const [planForm] = Form.useForm();
  const [planLoading, setPlanLoading] = useState(false);

  const fetchPlanConfigs = async () => {
    setConfigLoading(true);
    try {
      const res = await request.get<PlanConfig[]>('/admin/plans/config');
      const configs = res as unknown as PlanConfig[];
      setPlanConfigs(configs);
      setDataSource(configs);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanConfigs();
  }, []);

  const handleStartEdit = () => {
    setIsEditing(true);
    // Deep copy to avoid mutating original state during edit
    const data = JSON.parse(JSON.stringify(planConfigs));
    setDataSource(data);
    setEditableRowKeys(data.map((p: any) => p.key));
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditableRowKeys([]);
    setDataSource(planConfigs); // Revert
  };

  const handleSaveConfig = async () => {
    const latestSource = dataSource.map((p) => {
      const rowData = planEditableFormRef.current?.getRowData?.(p.key);
      return rowData ? { ...p, ...rowData } : p;
    });
    const keys = latestSource.map((p) => p.key?.trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length || keys.some((k) => !k)) {
      message.error('Plan key cannot be empty or duplicate');
      return;
    }
    setSavingConfig(true);
    try {
      const body = { plans: latestSource.map((p) => ({ ...p, key: p.key.trim() })) };
      const res = await request.put<PlanConfig[]>('/admin/plans/config', body);
      setPlanConfigs(res as unknown as PlanConfig[]);
      setIsEditing(false);
      message.success('Configuration saved');
      actionRef.current?.reload();
    } catch {
      /* handled */
    } finally {
      setSavingConfig(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  const planLabelMap = useMemo(
    () => Object.fromEntries(planConfigs.map((p) => [p.key, p.label])), [planConfigs]);
  const planTokenMap = useMemo(
    () => Object.fromEntries(planConfigs.map((p) => [p.key, p.tokens])), [planConfigs]);

  const handleOpenPlan = (record: any) => {
    setPlanUser(record);
    planForm.setFieldsValue({ plan: record.plan || 'free', override_remaining: null, plan_expires_at: null });
    setIsPlanModalVisible(true);
  };

  const handleSetPlan = async () => {
    setPlanLoading(true);
    try {
      const values = await planForm.validateFields();
      const body: any = { plan: values.plan };
      if (values.override_remaining != null) body.override_remaining = values.override_remaining;
      if (values.plan_expires_at) body.plan_expires_at = values.plan_expires_at;
      await request.put(`/admin/users/${planUser.id}/plan`, body);
      message.success(`Plan updated`);
      setIsPlanModalVisible(false);
      actionRef.current?.reload();
    } catch { /* handled */ } finally { setPlanLoading(false); }
  };

  // ── Columns ──────────────────────────────────────────────────────────

  const planConfigColumns: ProColumns<PlanConfig>[] = [
    {
      title: 'Key',
      dataIndex: 'key',
      formItemProps: { rules: [{ required: true, message: 'Required' }] },
      width: 100,
      fixed: 'left',
      sorter: (a, b) => a.key.localeCompare(b.key),
    },
    {
      title: 'Label',
      dataIndex: 'label',
      formItemProps: { rules: [{ required: true }] },
      width: 100,
      fixed: 'left',
      sorter: (a, b) => a.label.localeCompare(b.label),
    },
    {
      title: 'Tokens',
      dataIndex: 'tokens',
      valueType: 'digit',
      width: 120,
      fieldProps: { precision: 0 },
      sorter: (a, b) => a.tokens - b.tokens,
    },
    {
      title: 'Description',
      dataIndex: 'desc',
      width: 150,
      sorter: (a, b) => (a.desc || '').localeCompare(b.desc || ''),
    },
    {
      title: 'Highlight',
      dataIndex: 'highlight',
      valueType: 'switch',
      width: 80,
      sorter: (a, b) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1),
    },
    {
      title: 'Badge',
      dataIndex: 'badge',
      width: 100,
      sorter: (a, b) => (a.badge || '').localeCompare(b.badge || ''),
    },
    {
      title: 'Monthly',
      children: [
        { title: 'Orig', dataIndex: ['pricing', 'monthly', 'original'], valueType: 'money', width: 90, sorter: (a, b) => (a.pricing?.monthly?.original || 0) - (b.pricing?.monthly?.original || 0) },
        { title: 'Curr', dataIndex: ['pricing', 'monthly', 'current'], valueType: 'money', width: 90, sorter: (a, b) => (a.pricing?.monthly?.current || 0) - (b.pricing?.monthly?.current || 0) },
      ]
    },
    {
      title: 'Quarterly',
      children: [
        { title: 'Orig', dataIndex: ['pricing', 'quarterly', 'original'], valueType: 'money', width: 90, sorter: (a, b) => (a.pricing?.quarterly?.original || 0) - (b.pricing?.quarterly?.original || 0) },
        { title: 'Curr', dataIndex: ['pricing', 'quarterly', 'current'], valueType: 'money', width: 90, sorter: (a, b) => (a.pricing?.quarterly?.current || 0) - (b.pricing?.quarterly?.current || 0) },
      ]
    },
    {
      title: 'Yearly',
      children: [
        { title: 'Orig', dataIndex: ['pricing', 'yearly', 'original'], valueType: 'money', width: 90, sorter: (a, b) => (a.pricing?.yearly?.original || 0) - (b.pricing?.yearly?.original || 0) },
        { title: 'Curr', dataIndex: ['pricing', 'yearly', 'current'], valueType: 'money', width: 90, sorter: (a, b) => (a.pricing?.yearly?.current || 0) - (b.pricing?.yearly?.current || 0) },
      ]
    },
    {
      title: 'Action',
      valueType: 'option',
      width: 80,
      fixed: 'right',
      render: (_, record) => [
        <a
          key="delete"
          onClick={() => {
            setDataSource(dataSource.filter((item) => item.key !== record.key));
          }}
        >
          Delete
        </a>,
      ],
    },
  ];

  const userColumns: ProColumns<any>[] = [
    {
      title: 'Search',
      dataIndex: 'keyword',
      hideInTable: true,
      tooltip: 'Search username or email',
      fieldProps: {
        prefix: <SearchOutlined />,
      },
    },
    {
      title: 'Plan Filter',
      dataIndex: 'plan',
      hideInTable: true,
      valueType: 'select',
      valueEnum: planLabelMap,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      search: false,
      copyable: true,
      width: 120,
      sorter: (a, b) => a.username.localeCompare(b.username),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      search: false,
      copyable: true,
      ellipsis: true,
      sorter: (a, b) => a.email.localeCompare(b.email),
    },
    {
      title: 'Plan',
      dataIndex: 'plan',
      search: false,
      width: 100,
      render: (_, record) => <Tag>{planLabelMap[record.plan] || record.plan}</Tag>,
      sorter: (a, b) => (a.plan || '').localeCompare(b.plan || ''),
    },
    {
      title: 'Token Usage',
      search: false,
      width: 200,
      sorter: (a, b) => (a.token_remaining || 0) - (b.token_remaining || 0),
      render: (_, record) => {
        const total = planTokenMap[record.plan] ?? 100_000;
        const remaining = record.token_remaining ?? 0;
        const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
        const strokeColor = pct < 10 ? '#ff4d4f' : pct < 30 ? '#faad14' : '#52c41a';
        return (
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>{tokensToWanZi(remaining)}</span>
              <span style={{ color: '#999' }}>/ {tokensToWanZi(total)}</span>
            </div>
            <Progress percent={pct} showInfo={false} strokeColor={strokeColor} size="small" />
          </div>
        );
      },
    },
    {
      title: 'Reset Date',
      dataIndex: 'token_reset_at',
      valueType: 'date',
      search: false,
      width: 120,
      sorter: (a, b) => new Date(a.token_reset_at || 0).getTime() - new Date(b.token_reset_at || 0).getTime(),
    },
    {
      title: 'Expires',
      dataIndex: 'plan_expires_at',
      valueType: 'date',
      search: false,
      width: 120,
      sorter: (a, b) => new Date(a.plan_expires_at || 0).getTime() - new Date(b.plan_expires_at || 0).getTime(),
      render: (_, record) => record.plan_expires_at ? new Date(record.plan_expires_at).toLocaleDateString() : 'Permanent',
    },
    {
      title: 'Action',
      valueType: 'option',
      width: 100,
      fixed: 'right',
      render: (_, record) => [
        <Button key="set" size="small" icon={<ThunderboltOutlined />} onClick={() => handleOpenPlan(record)}>
          Set Plan
        </Button>
      ],
    },
  ];

  function PriceTag({ plan }: { plan: PlanConfig }) {
    const m = plan.pricing?.monthly;
    if (!m || (m.original === 0 && m.current === 0)) return <Text type="secondary" style={{ fontSize: 12 }}>免费</Text>;
    return (
      <Text style={{ fontSize: 12 }}>
        月付 <Text strong>¥{m.current}</Text>
        {m.original > m.current && <Text type="secondary" style={{ textDecoration: 'line-through', marginLeft: 4, fontSize: 11 }}>¥{m.original}</Text>}
      </Text>
    );
  }

  const textPlansContent = (
    <>
      {/* ── Plan config editor ── */}
      <Card
        title="Plan Configuration"
        loading={configLoading}
        style={{ marginBottom: 24 }}
        extra={
          isEditing ? (
            <Space>
              <Button onClick={handleCancelEdit}>Cancel</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={savingConfig} onClick={handleSaveConfig}>Save Config</Button>
            </Space>
          ) : (
            <Button icon={<EditOutlined />} onClick={handleStartEdit}>Edit</Button>
          )
        }
      >
        {isEditing ? (
          <EditableProTable<PlanConfig>
            rowKey="key"
            editableFormRef={planEditableFormRef}
            headerTitle="Edit Plans"
            maxLength={10}
            scroll={{ x: 1200 }}
            recordCreatorProps={{
              position: 'bottom',
              record: () => ({ key: `new-${Date.now()}`, ...DEFAULT_PLAN } as PlanConfig),
            }}
            loading={false}
            columns={planConfigColumns}
            value={dataSource}
            onChange={(val) => setDataSource([...val])}
            editable={{
              type: 'multiple',
              editableKeys: editableKeys,
              onSave: async () => {
                // Not used in bulk save mode
              },
              onChange: setEditableRowKeys,
              actionRender: (_, __, defaultDom) => [
                defaultDom.delete,
              ],
            }}
          />
        ) : (
          <Row gutter={16}>
            {planConfigs.map((plan) => (
              <Col span={Math.max(6, Math.floor(24 / Math.max(planConfigs.length, 1)))} key={plan.key} style={{ minWidth: 200, marginBottom: 8 }}>
                <Card size="small" style={{ borderTop: `3px solid ${plan.highlight ? '#1677ff' : '#d9d9d9'}` }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                    {plan.label}
                    {plan.badge && <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>{plan.badge}</Tag>}
                  </div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>{plan.desc}</div>
                  <Space direction="vertical" size={2}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Monthly: <Text strong>{tokensToWanZi(plan.tokens)}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{' '}（{plan.tokens.toLocaleString()} tokens）</Text>
                    </Text>
                    <PriceTag plan={plan} />
                    <Text type="secondary" style={{ fontSize: 11 }}>key: {plan.key}</Text>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* ── User list ── */}
      <ProTable
        headerTitle="User List"
        actionRef={actionRef}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        request={async (params) => {
          const { current, pageSize, keyword, plan } = params;
          const res: any = await request.get('/admin/users', {
            params: {
              page: current,
              size: pageSize,
              keyword: keyword,
            },
          });
          let items = res.items || [];
          // Client-side filtering for plan if backend doesn't support it directly in this endpoint
          // But wait, the original code did filtering on the client side AFTER fetching?
          // "if (plan) items = items.filter((u: any) => (u.plan || 'free') === plan);"
          // Yes, original code fetched page then filtered. This is buggy if the user is on another page.
          // Ideally backend should support plan filter.
          // For now, I'll replicate the behavior but acknowledge it's limited.
          if (plan) {
             items = items.filter((u: any) => (u.plan || 'free') === plan);
          }
          return {
            data: items,
            success: true,
            total: res.total,
          };
        }}
        columns={userColumns}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1000 }}
      />

      <ResizableModal
        title="Set User Plan"
        open={isPlanModalVisible}
        onCancel={() => setIsPlanModalVisible(false)}
        onOk={handleSetPlan}
        confirmLoading={planLoading}
      >
        <Form form={planForm} layout="vertical">
          <Form.Item name="plan" label="Plan" rules={[{ required: true }]}>
            <Select>
              {planConfigs.map((p) => (
                <Option key={p.key} value={p.key}>{p.label} ({tokensToWanZi(p.tokens)})</Option>
              ))}
              <Option value="free">Free</Option>
            </Select>
          </Form.Item>
          <Form.Item name="override_remaining" label="Override Remaining Tokens (Optional)">
            <InputNumber style={{ width: '100%' }} placeholder="Leave empty to keep current" />
          </Form.Item>
          <Form.Item name="plan_expires_at" label="Plan Expires At">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </ResizableModal>
    </>
  );

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>Plan Management</Title>
      <Tabs
        items={[
          {
            key: 'text',
            label: '📝 文字套餐',
            children: textPlansContent,
          },
          {
            key: 'packs',
            label: '🎨 充值包管理',
            children: (
              <CreditPackSection />
            ),
          },
        ]}
      />
    </div>
  );
};

export default Plans;
