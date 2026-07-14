import { Card, Typography, Divider } from 'antd'

export default function SettingsPage() {
  return (
    <div>
      <Typography.Title level={4}>Settings</Typography.Title>

      <Card title="Alert Configuration" style={{ marginBottom: 16 }}>
        <p>Disk usage threshold: 90%</p>
        <p>Garbage ratio threshold: 0.5</p>
        <p>Max readonly volumes: 3</p>
        <p><em>Edit via <code>PUT /api/dashboard/alerts/config</code></em></p>
      </Card>

      <Card title="Disk Health" style={{ marginBottom: 16 }}>
        <p>Enabled: <code>DISK_HEALTH_ENABLED=false</code></p>
        <p>SSH User: root</p>
        <p>Scan interval: 24 hours</p>
        <p>Temp warning: 55°C | critical: 65°C</p>
      </Card>

      <Card title="Upload Limits" style={{ marginBottom: 16 }}>
        <p>Max file size: 500 MB</p>
        <p>Allowed extensions: .jpg, .png, .pdf, .zip, .gz</p>
        <p>Max files per upload: 10</p>
      </Card>

      <Divider />

      <Card title="Roadmap" size="small">
        <Typography.Text type="secondary">
          Phase 12: Prometheus · Phase 13: Webhooks · Phase 14: Loki · Phase 15: WebDAV · Phase 16: NFS · Phase 17: Lifecycle · Phase 18: ACL · Phase 19: Tiered · Phase 20: Hardening · Phase 21: Feature Board
        </Typography.Text>
      </Card>
    </div>
  )
}
