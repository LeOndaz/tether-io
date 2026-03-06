import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import DHT from 'hyperdht'

const ROOT = resolve(import.meta.dirname, '..')
const DHT_PORT = 49737
const processes = []

function run(name, cmd, args, options = {}) {
  const proc = spawn(cmd, args, {
    cwd: options.cwd || ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  })

  const prefix = `[${name}]`
  proc.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.log(`${prefix} ${line}`)
    }
  })
  proc.stderr.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.error(`${prefix} ${line}`)
    }
  })
  proc.on('exit', (code) => {
    if (code !== null && code !== 0) console.log(`${prefix} exited with code ${code}`)
  })
  processes.push(proc)
  return proc
}

// Check Ollama
try {
  const res = await fetch('http://localhost:11434')
  if (!res.ok) throw new Error()
  console.log('[ollama] running')
} catch {
  console.error('[ollama] not running — start it with: ollama serve')
  process.exit(1)
}

// DHT bootstrap node (same role as the dht-bootstrap container)
const bootstrap = DHT.bootstrapper(DHT_PORT, '127.0.0.1')
await bootstrap.ready()
console.log(`[dht] bootstrap ready on 127.0.0.1:${DHT_PORT}`)

const sharedEnv = { DHT_BOOTSTRAP: `127.0.0.1:${DHT_PORT}` }

// Gateway
run('gateway', 'node', ['backend/src/server.js'], { env: sharedEnv })
await new Promise((r) => setTimeout(r, 3000))

// Workers
run('worker-1', 'node', ['worker/src/index.js'], {
  env: { ...sharedEnv, WORKER_ID: 'worker-1' },
})
run('worker-2', 'node', ['worker/src/index.js'], {
  env: { ...sharedEnv, WORKER_ID: 'worker-2' },
})

// Frontend
run('frontend', resolve(ROOT, 'frontend/node_modules/.bin/vite'), ['--host'], {
  cwd: resolve(ROOT, 'frontend'),
  env: { VITE_API_URL: 'http://localhost:3000' },
})

console.log('\n--- All services starting ---')
console.log('Gateway:  http://localhost:3000')
console.log('API Docs: http://localhost:3000/docs')
console.log('Frontend: http://localhost:5173')
console.log('Press Ctrl+C to stop all\n')

function shutdown() {
  console.log('\nShutting down...')
  for (const proc of processes) proc.kill('SIGTERM')
  bootstrap.destroy()
  setTimeout(() => process.exit(0), 2000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
