import type { WorkerConfig } from '../config'
import type { ModelRuntime } from './interface'
import { OllamaRuntime } from './ollama'

type RuntimeConstructor = new (config: WorkerConfig) => ModelRuntime

const runtimes: Record<string, RuntimeConstructor> = {
  ollama: OllamaRuntime,
}

export function createRuntime(config: WorkerConfig): ModelRuntime {
  const RuntimeClass = runtimes[config.modelRuntime]
  if (!RuntimeClass) {
    throw new Error(
      `Unknown model runtime: "${config.modelRuntime}". Available: ${Object.keys(runtimes).join(', ')}`,
    )
  }
  return new RuntimeClass(config)
}
