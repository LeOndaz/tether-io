# AI PaaS - GPU Cloud Service Platform

A simplified GPU cloud service platform providing API key management, model deployment, and inference capabilities. Built as a mini AI PaaS with distributed architecture.

## Architecture Overview

```
                        ┌──────────────┐
                        │  React App   │
                        │  (Zustand)   │
                        └──────┬───────┘
                               │ REST + SSE
                        ┌──────▼───────┐
                        │   Fastify    │
                        │   Gateway    │
                        │              │
                        │ - Auth       │
                        │ - Rate Limit │
                        │ - OpenAI API │
                        │ - SSE streams│
                        └──────┬───────┘
                               │ Hyperswarm RPC
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐ ┌──────▼──────┐  ┌──────▼──────┐
       │  Worker 1   │ │  Worker 2   │  │  Worker N   │
       │  (RPC Srv)  │ │  (RPC Srv)  │  │  (RPC Srv)  │
       └──────┬──────┘ └──────┬──────┘  └──────┬──────┘
              │                │                │
              └────────────────┼────────────────┘
                               │ HTTP
                        ┌──────▼───────┐
                        │   Ollama     │
                        │  (Inference) │
                        └──────────────┘

Data Layer: HyperDB (distributed, replicated across all nodes)
Discovery: Hyperswarm (automatic peer discovery by topic)
```

### Component Responsibilities

- **Gateway (Fastify)**: HTTP API, authentication, rate limiting, request routing, SSE streaming, OpenAPI docs
- **Workers (Hyperswarm RPC Servers)**: Receive inference/deployment jobs, communicate with Ollama, report health/capacity
- **HyperDB**: Distributed state — API keys, deployments, job records, usage telemetry
- **Model Runtime (Ollama)**: Inference backend behind a **ModelRuntime adapter interface**. Ollama is the current implementation. The adapter is swappable — can be replaced with Docker Model Runner, vLLM, TGI, or any remote provider without changing worker logic.
- **React Frontend**: Dashboard for API key management, deployments CRUD, usage monitoring, real-time logs

### Request Flow

```
Inference:  Client → Gateway (auth + rate limit) → RPC dispatch → Worker → Ollama → stream back
Deploy:     Client → Gateway → RPC model.pull → Worker → Ollama pull → SSE progress back
Logs:       Client ← SSE ← Gateway ← RPC events ← Worker
Cancel:     Client → Gateway DELETE /api/deployments/:id/cancel → RPC cancel → Worker
```

### Scaling Axes

| Axis | Bottleneck | Scale Mechanism | Failure Mode |
|------|-----------|----------------|--------------|
| Compute (Workers) | GPU memory, inference throughput | Add nodes — auto-discovered via Hyperswarm | Circuit breaker at gateway, 503 + Retry-After |
| Routing (Gateway) | Connection pool, rate limit state | Horizontal instances behind LB | Bounded job queue, admission control |
| Data (HyperDB) | Write throughput (single-writer core) | Per-node cores, fan-out writes / fan-in reads | Retention policy, windowed usage data |

### Load Balancing Strategies (swappable)

- **RoundRobin** — Simple rotation
- **LeastConnections** — Fewest active jobs
- **WeightedCapacity** — GPU mem + active jobs + queue depth
- **ModelAffinity** — Prefer worker with model already loaded (avoids cold-start)

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js | Task requirement |
| HTTP Framework | Fastify | High-perf, plugin ecosystem |
| Worker Comms | @hyperswarm/rpc | P2P RPC over DHT |
| Peer Discovery | hyperswarm | Topic-based peer finding |
| Data Store | hyperdb + hyperbee + hypercore | Distributed state |
| Core Management | corestore | Multi-core factory |
| Model Runtime | Ollama | Local LLM inference |
| Frontend | React + Vite | Dashboard SPA |
| State (client) | Zustand | Lightweight, no boilerplate |
| Server State | @tanstack/react-query | Cache, refetch, SSE integration |
| Charts | recharts | Usage/metrics visualization |
| API Docs | @fastify/swagger + @fastify/swagger-ui | OpenAPI spec |
| WebSocket | @fastify/websocket | Real-time (if needed beyond SSE) |
| Linter/Formatter | Biome | Single tool, fast. No eslint, no prettier |
| Package Manager | pnpm | Strict, fast, disk-efficient |
| Containers | Docker Compose | Local dev environment |

### Architecture Note: Runtime Choice

This project uses Node.js as required by the task specification. In a greenfield scenario, **Bun** would be the preferred runtime for its faster startup, native TypeScript support, and built-in bundler.

#### PENDING: Runtime Load Test

| Metric | Node.js | Bun | Status |
|--------|---------|-----|--------|
| Cold start time | — | — | PENDING |
| Requests/sec (inference proxy) | — | — | PENDING |
| Memory usage (idle) | — | — | PENDING |
| Memory usage (under load) | — | — | PENDING |
| SSE streaming latency (p50/p99) | — | — | PENDING |
| Hyperswarm RPC compat | — | — | PENDING |

### Swappable Model Runtime

Workers use a **ModelRuntime adapter interface** to decouple from any specific inference backend. All model operations (pull, list, delete, chat, generate) go through this interface.

```
Interface: ModelRuntime
├── pull(model, onProgress)     → stream pull progress
├── list()                      → available models
├── delete(model)               → remove model
├── chat(model, messages, opts) → inference (streaming or not)
├── show(model)                 → model metadata
└── isHealthy()                 → health check

Implementations:
├── OllamaRuntime       ← current (local, mature API, pull progress streaming)
├── DockerModelRuntime   ← alternative (Docker Model Runner, native Docker integration)
├── VllmRuntime          ← production (vLLM, continuous batching, PagedAttention)
├── TgiRuntime           ← production (HuggingFace TGI)
└── RemoteRuntime        ← any OpenAI-compatible remote API
```

The active runtime is selected via config (`MODEL_RUNTIME=ollama`). Workers instantiate the correct adapter at startup. No worker logic changes when swapping runtimes.

### Production Alternatives (not built, documented)

- **Ollama → vLLM / TGI**: Better batching, continuous batching, PagedAttention for higher throughput
- **Ollama → Docker Model Runner**: Native Docker integration, fewer moving parts
- **HyperDB → PostgreSQL + Redis**: Strong consistency for billing, Redis for rate limiting hot path
- **Single gateway → API Gateway cluster**: Behind nginx/envoy with health-check routing

## Project Structure

```
ai-paas/
├── backend/
│   ├── src/
│   │   ├── server.js              # Fastify app entry
│   │   ├── config/                # Environment, constants
│   │   ├── plugins/               # Fastify plugins (auth, rate-limit, swagger)
│   │   ├── routes/                # Route handlers
│   │   │   ├── keys.js            # API key CRUD
│   │   │   ├── deployments.js     # Model deployment CRUD
│   │   │   ├── inference.js       # /v1/chat/completions (OpenAI-compat)
│   │   │   ├── metrics.js         # Usage/telemetry endpoints
│   │   │   └── health.js          # Health check
│   │   ├── services/              # Business logic
│   │   │   ├── key-service.js     # Key generation, hashing, validation
│   │   │   ├── deployment-service.js
│   │   │   ├── inference-service.js
│   │   │   └── metrics-service.js
│   │   ├── rpc/                   # Hyperswarm RPC gateway-side client
│   │   │   ├── dispatcher.js      # Job dispatch + load balancing
│   │   │   └── strategies/        # LB strategy implementations
│   │   ├── db/                    # HyperDB setup, schemas, collections
│   │   ├── rate-limit/            # Rate limiting engine
│   │   │   ├── limiter.js         # Composite rate limiter
│   │   │   └── strategies/        # Algorithm implementations
│   │   └── middleware/            # Auth, validation, error handling
│   ├── test/                      # Tests (critical paths)
│   ├── package.json
│   └── biome.json
├── worker/
│   ├── src/
│   │   ├── index.js               # Worker entry
│   │   ├── rpc-server.js          # Hyperswarm RPC server (responds to gateway)
│   │   ├── runtime/               # Model runtime adapter layer
│   │   │   ├── interface.js       # ModelRuntime interface definition
│   │   │   ├── ollama.js          # Ollama implementation
│   │   │   └── factory.js         # Runtime factory (reads MODEL_RUNTIME env)
│   │   ├── health.js              # Health reporter (heartbeat, GPU status)
│   │   └── db/                    # HyperDB replica
│   ├── package.json
│   └── biome.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── stores/                # Zustand stores
│   │   ├── hooks/                 # Custom hooks (useSSE, useDeploymentLogs)
│   │   ├── components/            # UI components
│   │   │   ├── keys/              # API key management
│   │   │   ├── deployments/       # Model deployment CRUD + logs
│   │   │   ├── inference/         # Inference playground
│   │   │   └── metrics/           # Usage dashboard + charts
│   │   ├── api/                   # API client functions
│   │   └── lib/                   # Utilities
│   ├── package.json
│   └── biome.json
├── docker-compose.yml
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI
├── CLAUDE.md
├── TASK.md
└── README.md
```

## Coding Rules

### Absolute Rules

- **No shared singletons.** Every service, DB connection, RPC client is instantiated and passed explicitly. Factory functions or constructor injection. Global mutable state breaks async correctness.
- **Biome only.** No eslint, no prettier. Single config at each package root.
- **pnpm only.** No npm, no yarn.
- **One commit per feature.** Atomic, descriptive commits. No bulk commits.
- **No proprietary attribution in commits.** No "Co-Authored-By" lines. Clean commit messages only.
- **No unnecessary abstractions.** Three similar lines > premature helper function.
- **Read before edit.** Never modify a file without reading it first.

### Async Patterns

- All I/O is async/await. No callbacks except where library APIs require them.
- No fire-and-forget promises. Every promise is awaited or explicitly handled.
- Use `Promise.all` for independent parallel operations.
- Graceful shutdown: close RPC servers, drain connections, flush DB, then exit.

### Error Handling

- Fastify error handler plugin for consistent error responses.
- Typed error classes: `AuthError`, `RateLimitError`, `WorkerUnavailableError`, `DeploymentError`.
- Never swallow errors silently. Log and propagate.
- Workers: errors in RPC handlers are thrown back to the gateway as RPC errors.

### API Key Security

- Generate: `sk-` + base62(crypto.randomBytes(32))
- Store: SHA-256 hash only. Never store plaintext.
- View-once: full key returned exactly once at creation. Backend cannot reconstruct.
- Display: `sk-a8Kx9m••••••••` (prefix only) in UI after creation.
- Validate: hash incoming key → lookup hash in HyperDB.
- SHA-256 (not Argon2/bcrypt): API keys are 256-bit random tokens, not passwords. Dictionary attacks are irrelevant.

### Rate Limiting

- Strategy pattern: `check(identifier, cost) → { allowed, remaining, resetAt }`
- Composite limiter: request-based AND context-based (token count) — both must pass.
- State: in-memory Map (hot path), async flush to HyperDB (persistence).
- Algorithms (swappable): FixedWindow, SlidingWindowLog, TokenBucket.
- Config per API key tier from HyperDB.

### Streaming

- **Inference responses**: SSE (`text/event-stream`) — matches OpenAI streaming protocol exactly.
- **Deployment logs**: SSE — model pull progress, worker assignment, health checks.
- **Cancel actions**: Regular REST endpoints (not over SSE).

### OpenAI Compatibility

Single inference endpoint. Model specified in request body:
```
POST /v1/chat/completions
Authorization: Bearer sk-...
{ "model": "llama3.2", "messages": [...], "stream": true }
```

Gateway routes to appropriate worker via model affinity. Any OpenAI SDK client works by changing `baseURL`.

### Docker Compose Services

```
services:
  ollama       → Model runtime, GPU access
  gateway      → Fastify API (port 3000)
  worker-1     → Hyperswarm RPC worker
  worker-2     → Hyperswarm RPC worker
  frontend     → React dev server (port 5173)
```

### Environment Variables

All config via env vars. `.env.example` provided. No hardcoded values for:
- Ports, hosts
- Ollama URL
- Rate limit defaults
- Cluster topic (Hyperswarm)
- Log level

## Development Workflow

```bash
# Install
pnpm install

# Dev (each in separate terminal, or use docker-compose)
pnpm --filter backend dev
pnpm --filter worker dev        # start 2+ instances
pnpm --filter frontend dev

# Lint + Format
pnpm biome check --write .

# Test
pnpm --filter backend test
pnpm --filter worker test

# Docker
docker compose up
```

## Git Workflow

- Commit per feature. Atomic. Descriptive message.
- No "Co-Authored-By" or proprietary attribution.
- Branch strategy: TBD (user will provide repo details).
- CI runs: biome check + tests on every push.
