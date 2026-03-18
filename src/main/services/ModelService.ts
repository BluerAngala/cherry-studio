import { AzureOpenAI, listModels, OpenAI } from '@cherrystudio/ai-core'
import { loggerService } from '@logger'
import type { Model, Provider } from '@types'

const logger = loggerService.withContext('ModelService')

export interface SdkModel {
  id: string
  object?: string
  owned_by?: string
  description?: string
}

function withoutTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function isOllamaProvider(provider: Provider): boolean {
  return provider.id === 'ollama' || provider.type === 'ollama'
}

function normalizeAzureOpenAIEndpoint(endpoint: string): string {
  return withoutTrailingSlash(endpoint)
}

export class ModelService {
  private static instance: ModelService

  private constructor() {}

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService()
    }
    return ModelService.instance
  }

  private createSdkInstance(provider: Provider): OpenAI | AzureOpenAI {
    const headers: Record<string, string> = {
      ...provider.extra_headers
    }

    if (provider.id === 'azure-openai' || provider.type === 'azure-openai') {
      return new AzureOpenAI({
        apiKey: provider.apiKey,
        apiVersion: provider.apiVersion,
        endpoint: normalizeAzureOpenAIEndpoint(provider.apiHost)
      })
    }

    return new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.apiHost,
      defaultHeaders: headers
    })
  }

  async listModels(provider: Provider): Promise<SdkModel[]> {
    try {
      const result = await listModels({
        providerId: provider.id,
        providerType: provider.type,
        apiKey: provider.apiKey,
        baseURL: provider.apiHost,
        headers: provider.extra_headers
      })

      if (result.error) {
        logger.error('Error listing models:', { error: result.error })
        return []
      }

      return result.models.map((model) => ({
        id: model.id.trim(),
        object: model.object,
        owned_by: model.owned_by,
        description: model.description
      }))
    } catch (error) {
      logger.error('Error listing models:', error as Error)
      return []
    }
  }

  async getEmbeddingDimensions(provider: Provider, model: Model): Promise<number> {
    let sdk = this.createSdkInstance(provider)

    if (isOllamaProvider(provider)) {
      const embedBaseUrl = `${provider.apiHost.replace(/(\/(api|v1))\/?$/, '')}/v1`
      sdk = (sdk as OpenAI).withOptions({ baseURL: embedBaseUrl })
    }

    const data = await sdk.embeddings.create({
      model: model.id,
      input: model?.provider === 'baidu-cloud' ? ['hi'] : 'hi',
      encoding_format: provider.id === 'voyageai' ? undefined : 'float'
    })
    return data.data[0].embedding.length
  }
}

export const modelService = ModelService.getInstance()
