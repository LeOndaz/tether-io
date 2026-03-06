/**
 * ModelRuntime interface — all model runtimes must implement these methods.
 *
 * Implementations: OllamaRuntime, DockerModelRuntime, VllmRuntime, RemoteRuntime
 * Selected via MODEL_RUNTIME env var through the factory.
 */
export class ModelRuntime {
  /**
   * Pull/download a model.
   * @param {string} model - Model name (e.g., "llama3.2")
   * @param {(progress: object) => void} onProgress - Progress callback
   */
  async pull(model, onProgress) {
    throw new Error('not implemented')
  }

  /**
   * List available models.
   * @returns {Promise<Array<{name: string, size: number, modifiedAt: string}>>}
   */
  async list() {
    throw new Error('not implemented')
  }

  /**
   * Delete a model.
   * @param {string} model
   */
  async delete(model) {
    throw new Error('not implemented')
  }

  /**
   * Run chat inference.
   * @param {string} model
   * @param {Array<{role: string, content: string}>} messages
   * @param {{stream?: boolean, temperature?: number, max_tokens?: number}} options
   * @returns {Promise<object>} - Chat completion response
   */
  async chat(model, messages, options = {}) {
    throw new Error('not implemented')
  }

  /**
   * Get model metadata.
   * @param {string} model
   * @returns {Promise<object>}
   */
  async show(model) {
    throw new Error('not implemented')
  }

  /**
   * Check if the runtime is reachable and healthy.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    throw new Error('not implemented')
  }
}
