import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Input, Tag, Popconfirm, message, Drawer, Form, Select, Space, Empty, Modal, List } from 'antd'
import { PlusOutlined, LikeOutlined, EyeOutlined } from '@ant-design/icons'
import { getFeatureRequests, createFeatureRequest, voteFeatureRequest, updateFeatureStatus, getFeatureRequest, addFeatureComment } from '../../services/api'
import type { FeatureRequest as FR } from '../../types'

const STATUS_COLS = [
  { key: 'under_review', title: 'Under Review', color: 'orange' },
  { key: 'planned', title: 'Planned', color: 'blue' },
  { key: 'in_progress', title: 'In Progress', color: 'purple' },
  { key: 'completed', title: 'Completed', color: 'green' },
]

export default function FeedbackPage() {
  const [requests, setRequests] = useState<FR[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState<FR | null>(null)
  const [comment, setComment] = useState('')
  const [form] = Form.useForm()

  const fetch = useCallback(async () => {
    try { setRequests(await getFeatureRequests()) } catch {}
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleCreate = async () => {
    const vals = await form.validateFields()
    try { await createFeatureRequest(vals.title, vals.description, vals.category); message.success('Submitted'); setDrawerOpen(false); fetch() }
    catch (e: any) { message.error('Failed') }
  }

  const handleVote = async (id: number) => { await voteFeatureRequest(id); fetch() }

  const handleStatus = async (id: number, status: string) => { await updateFeatureStatus(id, status); fetch() }

  const openDetail = async (id: number) => {
    try {
      const d = await getFeatureRequest(id)
      setDetail(d); setDetailModal(true)
    } catch {}
  }

  const handleComment = async () => {
    if (!detail || !comment) return
    try { await addFeatureComment(detail.id, comment); setComment(''); openDetail(detail.id); message.success('Comment added') }
    catch { message.error('Failed') }
  }

  return (
    <div>
      <Card title="Feature Request Board" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>New Request</Button>}>
        <div style={{ display: 'flex', gap: 12, overflow: 'auto' }}>
          {STATUS_COLS.map(col => (
            <Card key={col.key} title={<Tag color={col.color}>{col.title}</Tag>} style={{ flex: 1, minWidth: 240, background: 'rgba(15,23,42,0.6)' }}>
              {requests.filter(r => r.status === col.key).map(r => (
                <Card key={r.id} size="small" style={{ marginBottom: 8, background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.1)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{r.description.slice(0, 80)}{r.description.length > 80 ? '...' : ''}</div>
                  <Space size={4}>
                    <Tag style={{ fontSize: 10 }}>{r.category}</Tag>
                    <Button size="small" type="text" icon={<LikeOutlined />} onClick={() => handleVote(r.id)}>{r.votes}</Button>
                    <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openDetail(r.id)} />
                    {col.key !== 'under_review' && (
                      <Popconfirm title={`Move back?`} onConfirm={() => handleStatus(r.id, 'under_review')}>
                        <Tag style={{ cursor: 'pointer', fontSize: 10, opacity: 0.5 }}>↩</Tag>
                      </Popconfirm>
                    )}
                  </Space>
                  {col.key === 'under_review' && (
                    <Space size={2} style={{ marginTop: 4 }}>
                      {['planned', 'in_progress', 'completed'].map(s => (
                        <Tag key={s} color={STATUS_COLS.find(c => c.key === s)?.color} style={{ cursor: 'pointer', fontSize: 10 }}
                          onClick={() => handleStatus(r.id, s)}>{STATUS_COLS.find(c => c.key === s)?.title}</Tag>
                      ))}
                    </Space>
                  )}
                </Card>
              ))}
              {requests.filter(r => r.status === col.key).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="" />}
            </Card>
          ))}
        </div>
      </Card>

      <Drawer title="New Feature Request" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={420}
        extra={<Button type="primary" onClick={handleCreate}>Submit</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="category" label="Category" initialValue="feature">
            <Select options={['feature', 'bug', 'improvement', 'docs'].map(c => ({ value: c, label: c }))} />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal title={detail?.title} open={detailModal} onCancel={() => setDetailModal(false)} width={600} footer={null}>
        {detail && (
          <div>
            <Space style={{ marginBottom: 12 }}>
              <Tag color={STATUS_COLS.find(c => c.key === detail.status)?.color}>{detail.status}</Tag>
              <Tag>{detail.category}</Tag>
              <span style={{ color: '#64748b', fontSize: 12 }}>by {detail.created_by}</span>
            </Space>
            <p style={{ color: '#94a3b8' }}>{detail.description}</p>
            <List
              dataSource={detail.comments || []}
              renderItem={c => (
                <div style={{ marginBottom: 8, padding: 8, background: 'rgba(30,41,59,0.5)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#a855f7', fontSize: 12, fontWeight: 600 }}>{c.author}</span>
                    <span style={{ color: '#475569', fontSize: 11 }}>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>{c.body}</div>
                </div>
              )}
            />
            <Input.TextArea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Add comment..." style={{ marginTop: 8 }} />
            <Button type="primary" size="small" onClick={handleComment} disabled={!comment} style={{ marginTop: 8 }}>Comment</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
