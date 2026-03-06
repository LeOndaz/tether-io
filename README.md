# AI PaaS — GPU Cloud Service Platform

A simplified GPU cloud service platform providing API key management, model deployment, and OpenAI-compatible inference. Built with a distributed P2P architecture using Hyperswarm and HyperDB.

## Architecture

```
Client → Fastify Gateway → Hyperswarm RPC → Worker Nodes → Ollama
                ↕                                    ↕
             HyperDB (distributed state)        ModelRuntime adapter
```

- **Gateway**: HTTP API, auth, rate limiting, request routing, SSE streaming
- **Workers**: Receive jobs via Hyperswarm RPC, run inference through swappable ModelRuntime adapter
- **HyperDB**: Distributed state for API keys, deployments, usage records
- **Frontend**: React dashboard with real-time updates

## Prerequisites

- Node.js 22+
- pnpm 9+
- [Ollama](https://ollama.ai) installed and running
- Docker & Docker Compose (optional, for containerized setup)

## Quick Start

```bash
# Install dependencies
pnpm install

# Build HyperDB schema (first time only)
pnpm --filter backend build:schema

# Start Ollama (separate terminal)
ollama serve

# Start the gateway (terminal 1)
pnpm --filter backend dev

# Start a worker (terminal 2)
pnpm --filter worker dev

# Start another worker (terminal 3)
WORKER_ID=worker-2 pnpm --filter worker dev

# Start the frontend (terminal 4)
pnpm --filter frontend dev
```

Gateway: http://localhost:3000
Frontend: http://localhost:5173
API Docs: http://localhost:3000/docs

## Docker Compose

```bash
docker compose up
```

Starts Ollama, gateway, two workers, and the frontend.

## API Usage

### Create an API Key

```bash
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "my-key"}'
```

Save the returned `key` value — it's shown only once.

### Deploy a Model

```bash
curl -X POST http://localhost:3000/api/deployments \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.2:1b"}'
```

### Run Inference (OpenAI-compatible)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "llama3.2:1b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

Works with any OpenAI SDK by changing the `baseURL`:

```js
import OpenAI from 'openai'
const client = new OpenAI({ apiKey: 'sk-...', baseURL: 'http://localhost:3000/v1' })
```

## Project Structure

```
ai-paas/
├── backend/          Fastify gateway API
│   ├── src/
│   │   ├── server.js         Entry point
│   │   ├── config/           Environment config
│   │   ├── db/               HyperDB initialization
│   │   ├── errors.js         Typed error classes
│   │   ├── middleware/       Auth middleware
│   │   ├── plugins/          Fastify plugins (CORS, Swagger, errors)
│   │   ├── rate-limit/       Rate limiter + strategies
│   │   ├── routes/           API routes
│   │   ├── rpc/              RPC dispatcher + LB strategies
│   │   └── services/         Business logic
│   ├── spec/                 HyperDB schema definitions
│   └── test/                 Tests
├── worker/           Hyperswarm RPC worker
│   └── src/
│       ├── index.js          Entry point
│       ├── rpc-server.js     RPC method handlers
│       └── runtime/          Swappable model runtime adapter
├── frontend/         React dashboard
│   └── src/
│       ├── api/              API client
│       ├── components/       Pages (keys, deployments, playground, metrics)
│       ├── hooks/            Custom hooks (useSSE)
│       └── stores/           Zustand stores
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Key Design Decisions

- **No shared singletons** — all services instantiated via factory functions, passed explicitly
- **Swappable model runtime** — Ollama behind adapter interface, can swap to vLLM/TGI/Docker Model Runner
- **Swappable rate limiting** — Strategy pattern with FixedWindow, SlidingWindow, TokenBucket
- **Swappable load balancing** — RoundRobin, LeastConnections, ModelAffinity strategies
- **API key security** — SHA-256 hashed, view-once display, prefix-only in listings
- **SSE streaming** — Matches OpenAI's streaming protocol for inference; deployment logs also via SSE

## Testing

```bash
pnpm --filter backend test
```

## Linting

```bash
pnpm biome check .       # check
pnpm biome check --write . # auto-fix
```

## Environment Variables

See [.env.example](.env.example) for all configuration options.

## License

MIT
