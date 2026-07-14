import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card } from 'antd'

const COLORS = ['#52c41a', '#1890ff', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96']

interface Props {
  data: { name: string; value: number }[]
}

export default function DiskUsageChart({ data }: Props) {
  return (
    <Card title="Disk Usage by Server">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(val) => `${val}%`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  )
}
