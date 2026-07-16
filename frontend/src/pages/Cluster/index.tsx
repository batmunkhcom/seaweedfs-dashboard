import { useState, useEffect } from 'react'
import { Card, Tag, Spin, Row, Col, Typography, Progress, Tooltip, InputNumber, Button, Space, message } from 'antd'
import {
  CloudServerOutlined,
  CheckCircleOutlined,
  HddOutlined,
  NodeIndexOutlined,
  ClusterOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { getTopology, getClusterHealth, updateNodeLimits } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography

const SEVER_COLORS = ['#a855f7', '#6366f1', '#8b5cf6', '#7c3aed', '#9333ea', '#4f46e5', '#6d28d9']

interface NodeLimitState {
  nodeUrl: string
  limit: number
  editing: boolean
}

export default function ClusterPage() {
  const [topology, setTopology] = useState<any>(null)
  const [nodes, setNodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingNodeId, setSavingNodeId] = useState<string | null>(null)
  const [limitStates, setLimitStates] = useState<Record<string, NodeLimitState>>({})
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'admin'

  useEffect(() => {
    Promise.all([getTopology(), getClusterHealth()])
       .then(([topo, health]) => {
         setTopology(topo)
         setNodes(health.nodes || [])
        })
       .catch(() => {})
       .finally(() => setLoading(false))
    }, [])

  const handleEditLimit = (nodeUrl: string, currentLimit: number) => {
    setLimitStates((prev) => ({
      ...prev,
      [nodeUrl]: { nodeUrl, limit: currentLimit, editing: true },
     }))
    }

  const handleCancelEdit = (nodeUrl: string) => {
    setLimitStates((prev) => {
      const next = { ...prev }
       delete next[nodeUrl]
      return next
     })
    }

  const handleSaveLimit = async (state: NodeLimitState) => {
    if (state.limit < 1 || state.limit > 99999) {
      message.error('Invalid limit value')
      return
     }
    setSavingNodeId(state.nodeUrl)
    try {
       // Fetch current limits first
      const resp = await fetch('/api/cluster/node-limits')
      const data = await resp.json()
      const currentLimits = data.limits || {}
      currentLimits[state.nodeUrl] = state.limit
      
      await updateNodeLimits(currentLimits)
      message.success(`Limit set to ${state.limit} for ${state.nodeUrl.replace(':8080', '')}`)
      
      // Refresh nodes
      const healthResp = await fetch('/api/cluster/health')
      const healthData = await healthResp.json()
      setNodes(healthData.nodes || [])
      
      handleCancelEdit(state.nodeUrl)
     } catch {
      message.error('Failed to save limit')
     } finally {
      setSavingNodeId(null)
     }
    }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  const totalFree = topology?.Free || 0
  const totalMax = topology?.Max || 0
  const totalPct = totalMax > 0 ? Math.round((totalFree / totalMax) * 100) : 0

  return (
     <div>
       <div style={{ marginBottom: 20 }}>
         <Title level={4} style={{ margin: 0 }}>
           <ClusterOutlined style={{ marginRight: 8, color: '#a855f7' }} />
          Cluster Topology
         </Title>
         <Text type="secondary" style={{ marginLeft: 32 }}>
          {nodes.length} nodes · {topology?.DataCenters?.length || 0} datacenter
          {topology?.DataCenters?.length !== 1 ? 's' : ''} · replication 001
         </Text>
       </div>

       {topology?.DataCenters?.map((dc: any) => (
         <Card
           key={dc.Id}
           title={
             <span>
               <NodeIndexOutlined style={{ marginRight: 6, color: '#6366f1' }} />
              Datacenter: <strong style={{ color: '#a5f3fc' }}>{dc.Id}</strong>
               <Tag color="purple" style={{ marginLeft: 8 }}>{dc.Racks?.length || 0} racks</Tag>
             </span>
            }
           style={{ marginBottom: 16, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.12)' }}
          >
            {dc.Racks?.map((rack: any) => {
              const rackVolumes = rack.DataNodes?.reduce((s: number, n: any) => s + (n.Volumes || 0), 0) || 0
              const rackMax = rack.DataNodes?.reduce((s: number, n: any) => s + (n.Max || 0), 0) || 0

              return (
                 <Card
                  key={rack.Id}
                  type="inner"
                  title={
                    <span>
                      <CloudServerOutlined style={{ marginRight: 6, color: '#a855f7' }} />
                     Rack: <strong style={{ color: '#c4b5fd' }}>{rack.Id}</strong>
                      <Tag style={{ marginLeft: 8 }}>{rack.DataNodes?.length || 0} nodes</Tag>
                    </span>
                   }
                  extra={
                    <Tooltip title={`${rackVolumes} of ${rackMax} volumes used`}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {rackVolumes}/{rackMax} vol
                       </span>
                     </Tooltip>
                   }
                  style={{ marginBottom: 12, background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}
                 >
                   <Row gutter={[12, 12]}>
                     {rack.DataNodes?.map((node: any, ni: number) => {
                       const usedVols = node.Volumes || node.volumes || 0
                       const nativeMax = node.Max || node.max_native || 1
                       const configuredMax = node.max_configured || nativeMax
                       const effectiveMax = Math.min(nativeMax, configuredMax)
                       const usedPct = Math.round((usedVols / effectiveMax) * 100)
                       const barColor = usedPct > 80 ? '#ef4444' : usedPct > 50 ? '#f59e0b' : '#22c55e'
                       const freeVols = effectiveMax - usedVols
                       const nodeUrl = node.Url || node.url || ''
                       const limitState = limitStates[nodeUrl]
                       const isEditing = limitState?.editing

                      return (
                        <Col key={ni} xs={24} sm={12} md={8} lg={6} xl={Math.floor(24 / Math.min((rack.DataNodes?.length || 1), 4))}>
                          <div
                            style={{
                              background: 'rgba(15,23,42,0.8)',
                              border: `1px solid ${SEVER_COLORS[ni % SEVER_COLORS.length]}${isEditing ? '66' : '22'}`,
                              borderRadius: 8,
                              padding: '12px 14px',
                              transition: 'border-color 0.2s',
                             }}
                            onMouseEnter={(e) => { if (!isEditing) (e.currentTarget as HTMLElement).style.borderColor = SEVER_COLORS[ni % SEVER_COLORS.length] + '44' }}
                            onMouseLeave={(e) => { if (!isEditing) (e.currentTarget as HTMLElement).style.borderColor = SEVER_COLORS[ni % SEVER_COLORS.length] + '22' }}
                           >
                            {/* Header: IP + Status + Edit */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Tooltip title={nodeUrl}>
                                <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                  {nodeUrl.replace(':8080', '')}
                                 </span>
                               </Tooltip>
                              <Tag color="green" style={{ lineHeight: '16px', fontSize: 10, margin: 0 }}>
                                <CheckCircleOutlined style={{ fontSize: 10 }} /> healthy
                               </Tag>
                              {isAdmin && !isEditing && (
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<EditOutlined style={{ fontSize: 12, color: '#94a3b8' }} />}
                                  onClick={() => handleEditLimit(nodeUrl, configuredMax)}
                                  title="Edit volume limit"
                                  style={{ padding: '0 4px', margin: '0 -4px' }}
                                 />
                                )}
                             </div>

                            {/* Edit Mode */}
                            {isEditing && (
                              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Text style={{ fontSize: 10, color: '#94a3b8' }}>Limit:</Text>
                                <InputNumber
                                  min={usedVols}
                                  max={nativeMax * 2}
                                  value={limitState.limit}
                                  onChange={(val) => setLimitStates((prev) => ({
                                    ...prev,
                                     [nodeUrl]: { ...prev[nodeUrl], limit: val || usedVols },
                                   }))}
                                  size="small"
                                  style={{ width: 80 }}
                                 />
                                <Text type="secondary" style={{ fontSize: 10 }}>/ {nativeMax}</Text>
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<SaveOutlined style={{ color: '#22c55e' }} />}
                                  onClick={() => handleSaveLimit(limitState)}
                                  loading={savingNodeId === nodeUrl}
                                  disabled={savingNodeId === nodeUrl}
                                  style={{ padding: '0 4px', marginLeft: 2 }}
                                 />
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CloseOutlined style={{ color: '#94a3b8' }} />}
                                  onClick={() => handleCancelEdit(nodeUrl)}
                                  disabled={savingNodeId === nodeUrl}
                                  style={{ padding: '0 4px' }}
                                 />
                               </div>
                              )}

                            {/* Progress Bar */}
                            <Progress
                              percent={usedPct}
                              size="small"
                              strokeColor={barColor}
                              trailColor="rgba(255,255,255,0.05)"
                              format={() => `${usedPct}%`}
                              style={{ marginBottom: 6 }}
                             />

                            {/* Stats */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                              <Tooltip title={`Native Max: ${nativeMax} | Configured Limit: ${configuredMax}`}>
                                <span style={{ color: '#cbd5e1' }}>
                                  <HddOutlined style={{ marginRight: 3, color: '#64748b' }} />
                                  {usedVols}/{effectiveMax} vol
                                 </span>
                               </Tooltip>
                              <Tooltip title={`${freeVols} free (~${freeVols * 30} GB available)`}>
                                <span style={{ color: usedVols < effectiveMax ? '#22c55e' : '#64748b' }}>
                                  {freeVols >= 0 ? `${freeVols} free` : 'FULL'}
                                 </span>
                               </Tooltip>
                             </div>

                            {/* Limit indicator */}
                            {configuredMax < nativeMax && !isEditing && (
                              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
                                Limit: {configuredMax} (system: {nativeMax})
                               </Text>
                              )}
                           </div>
                         </Col>
                       )
                      })}
                    </Row>
                  </Card>
                )
               })}

              <div style={{ padding: '8px 16px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <Tag color="purple">{totalFree} free volumes</Tag>
                <Tag color="blue">{totalMax} max volumes</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {totalPct}% capacity remaining
                 </Text>
               </div>
             </Card>
           ))}
        </div>
      )
     }
