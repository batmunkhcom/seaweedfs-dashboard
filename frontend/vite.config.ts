import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    host: '0.0.0.0',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/antd/')) return 'antd'
          if (id.includes('node_modules/recharts/')) return 'recharts'
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) return 'react-vendor'
          if (id.includes('node_modules/@ant-design/')) return 'antd-icons'
          if (id.includes('node_modules/')) return 'vendor'
          if (id.includes('/pages/')) {
            const match = id.match(/\/pages\/([^/]+)/)
            return match ? `page-${match[1].toLowerCase()}` : 'pages'
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
})
