/**
 * 模型列表获取功能
 * 支持从不同的 AI Provider 获取可用模型列表
 */

export interface ModelInfo {
  id: string
  name?: string
  description?: string
  owned_by?: string
  object?: string
}

export interface ModelListResult {
  models: ModelInfo[]
  error?: string
}

export interface ModelListOptions {
  providerId: string
  apiKey: string
  baseURL: string
  headers?: Record<string, string>
  providerType?: string
}

const UNSUPPORTED_MODEL_PATTERNS = [
  /whisper/i,
  /tts/i,
  /dall-e/i,
  /embedding/i,
  /realtime/i,
  /audio/i,
  /babbage/i,
  /davinci/i,
  /gpt-4-turbo-preview/i,
  /gpt-4-1106-preview/i,
  /gpt-4-vision-preview/i,
  /gpt-3.5-turbo-instruct/i,
  /gpt-3.5-turbo-16k/i,
  /gpt-4-32k/i,
  /text-/i,
  /moderation/i
]

function isSupportedModel(modelId: string): boolean {
  if (!modelId) return false
  return !UNSUPPORTED_MODEL_PATTERNS.some((pattern) => pattern.test(modelId))
}

function withoutTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/**
 * 从 OpenAI 兼容 API 获取模型列表
 */
async function listOpenAICompatibleModels(options: ModelListOptions): Promise<ModelListResult> {
  const { apiKey, baseURL, headers = {} } = options

  try {
    const url = `${withoutTrailingSlash(baseURL)}/models`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...headers
      }
    })

    if (!response.ok) {
      return {
        models: [],
        error: `API returned ${response.status} ${response.statusText}`
      }
    }

    const data = await response.json()
    const models = (data.data || data.models || []).filter((model: ModelInfo) => isSupportedModel(model.id))

    return { models }
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 从 Ollama 获取模型列表
 */
async function listOllamaModels(options: ModelListOptions): Promise<ModelListResult> {
  const { apiKey, baseURL, headers = {} } = options

  try {
    const normalizedUrl = withoutTrailingSlash(baseURL)
      .replace(/\/v1$/, '')
      .replace(/\/api$/, '')
    const url = `${normalizedUrl}/api/tags`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey ? `Bearer ${apiKey}` : '',
        ...headers
      }
    })

    if (!response.ok) {
      return {
        models: [],
        error: `Ollama server returned ${response.status} ${response.statusText}`
      }
    }

    const data = await response.json()

    if (!data?.models || !Array.isArray(data.models)) {
      return {
        models: [],
        error: 'Invalid response from Ollama API: missing models array'
      }
    }

    const models = data.models.map((model: any) => ({
      id: model.name,
      name: model.name,
      owned_by: 'ollama',
      object: 'model'
    }))

    return { models }
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 从 OpenRouter 获取模型列表
 */
async function listOpenRouterModels(options: ModelListOptions): Promise<ModelListResult> {
  const { apiKey, baseURL, headers = {} } = options

  try {
    const url = `${withoutTrailingSlash(baseURL)}/models`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...headers
      }
    })

    if (!response.ok) {
      return {
        models: [],
        error: `OpenRouter API returned ${response.status} ${response.statusText}`
      }
    }

    const data = await response.json()
    const models = (data.data || []).filter((model: ModelInfo) => isSupportedModel(model.id))

    return { models }
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 从 GitHub Models 获取模型列表
 */
async function listGithubModels(options: ModelListOptions): Promise<ModelListResult> {
  const { apiKey, headers = {} } = options

  try {
    const url = 'https://models.github.ai/catalog/'

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...headers
      }
    })

    if (!response.ok) {
      return {
        models: [],
        error: `GitHub Models API returned ${response.status} ${response.statusText}`
      }
    }

    const data = await response.json()

    const models = data
      .map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        description: model.summary,
        owned_by: model.publisher,
        object: 'model'
      }))
      .filter((model: ModelInfo) => isSupportedModel(model.id))

    return { models }
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 从 Together AI 获取模型列表
 */
async function listTogetherModels(options: ModelListOptions): Promise<ModelListResult> {
  const { apiKey, baseURL, headers = {} } = options

  try {
    const url = `${withoutTrailingSlash(baseURL)}/models`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...headers
      }
    })

    if (!response.ok) {
      return {
        models: [],
        error: `Together API returned ${response.status} ${response.statusText}`
      }
    }

    const data = await response.json()

    const models = (data || [])
      .map((model: any) => ({
        id: model.id,
        name: model.display_name || model.id,
        description: model.description,
        owned_by: model.organization || 'together',
        object: 'model'
      }))
      .filter((model: ModelInfo) => isSupportedModel(model.id))

    return { models }
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

const PROVIDER_MODEL_LIST_HANDLERS: Record<string, (options: ModelListOptions) => Promise<ModelListResult>> = {
  ollama: listOllamaModels,
  openrouter: listOpenRouterModels,
  github: listGithubModels,
  together: listTogetherModels
}

export async function listModels(options: ModelListOptions): Promise<ModelListResult> {
  const { providerId, providerType } = options

  const handler = PROVIDER_MODEL_LIST_HANDLERS[providerId] || PROVIDER_MODEL_LIST_HANDLERS[providerType || '']

  if (handler) {
    return handler(options)
  }

  return listOpenAICompatibleModels(options)
}

export { isSupportedModel }
