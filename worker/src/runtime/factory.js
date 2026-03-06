import { OllamaRuntime } from './ollama.js'

const runtimes = {
  ollama: OllamaRuntime,
}

export function createRuntime(config) {
  const RuntimeClass = runtimes[config.modelRuntime]
  if (!RuntimeClass) {
    throw new Error(
      `Unknown model runtime: "${config.modelRuntime}". Available: ${Object.keys(runtimes).join(', ')}`,
    )
  }
  return new RuntimeClass(config)
}
