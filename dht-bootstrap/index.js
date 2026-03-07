import { networkInterfaces } from 'node:os'
import DHT from 'hyperdht'

const PORT = Number.parseInt(process.env.DHT_PORT || '49737', 10)

// Get the first non-loopback IPv4 address (Docker assigns one on the bridge network)
function getContainerIP() {
  const interfaces = networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return '127.0.0.1'
}

const host = getContainerIP()
const bootstrap = DHT.bootstrapper(PORT, host)
await bootstrap.ready()
console.log(`[dht-bootstrap] ready on ${host}:${PORT}`)

process.on('SIGINT', () => {
  bootstrap.destroy()
  process.exit(0)
})
process.on('SIGTERM', () => {
  bootstrap.destroy()
  process.exit(0)
})
