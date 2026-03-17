import { loggerService } from '@logger'
import type { Provider } from '@renderer/types'

import { AnthropicAPIClient } from './anthropic/AnthropicAPIClient'
import type { BaseApiClient } from './BaseApiClient'
import { CherryAiAPIClient } from './cherryai/CherryAiAPIClient'
import { OpenAIAPIClient } from './openai/OpenAIApiClient'
import { OpenAIResponseAPIClient } from './openai/OpenAIResponseAPIClient'

const logger = loggerService.withContext('ApiClientFactory')

/**
 * Factory for creating ApiClient instances based on provider configuration
 * 根据提供者配置创建ApiClient实例的工厂
 */
export class ApiClientFactory {
  /**
   * Create an ApiClient instance for the given provider
   * 为给定的提供者创建ApiClient实例
   */
  static create(provider: Provider): BaseApiClient {
    logger.debug(`Creating ApiClient for provider:`, {
      id: provider.id,
      type: provider.type
    })

    let instance: BaseApiClient

    // 首先检查特殊的 Provider ID
    if (provider.id === 'cherryai') {
      instance = new CherryAiAPIClient(provider) as BaseApiClient
      return instance
    }

    // 然后检查标准的 Provider Type
    switch (provider.type) {
      case 'openai':
        instance = new OpenAIAPIClient(provider) as BaseApiClient
        break
      case 'azure-openai':
      case 'openai-response':
        instance = new OpenAIResponseAPIClient(provider) as BaseApiClient
        break
      case 'anthropic':
        instance = new AnthropicAPIClient(provider) as BaseApiClient
        break
      default:
        logger.debug(`Using default OpenAIApiClient for provider: ${provider.id}`)
        instance = new OpenAIAPIClient(provider) as BaseApiClient
        break
    }

    return instance
  }
}
