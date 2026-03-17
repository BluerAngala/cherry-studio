/**
 * Cherry Studio AI Core - 核心入口
 * 基于 Vercel AI SDK v5 构建的统一模型抽象层
 */

import type { AiSdkModel } from '@cherrystudio/ai-core'
import { createExecutor } from '@cherrystudio/ai-core'
import { loggerService } from '@logger'
import { getEnableDeveloperMode } from '@renderer/hooks/useSettings'
import FileManager from '@renderer/services/FileManager'
import { normalizeGatewayModels, normalizeSdkModels } from '@renderer/services/models/ModelAdapter'
import { addSpan, endSpan } from '@renderer/services/SpanManagerService'
import type { StartSpanParams } from '@renderer/trace/types/ModelSpanEntity'
import { type Assistant, type GenerateImageParams, type Model, type Provider, SystemProviderIds } from '@renderer/types'
import type { StreamTextParams } from '@renderer/types/aiCoreTypes'
import { ChunkType } from '@renderer/types/chunk'
import { SUPPORTED_IMAGE_ENDPOINT_LIST } from '@renderer/utils'
import { findImageBlocks, getMainTextContent } from '@renderer/utils/messageUtils/find'
import { buildClaudeCodeSystemModelMessage } from '@shared/anthropic'
import { gateway, type LanguageModel, type Provider as AiSdkProvider } from 'ai'

import AiSdkToChunkAdapter from './chunk/AiSdkToChunkAdapter'
import type { CompletionsResult } from './legacy/middleware/schemas'
import { buildPlugins } from './plugins/PluginBuilder'
import { createAiSdkProvider } from './provider/factory'
import {
  adaptProvider,
  getActualProvider,
  isModernSdkSupported,
  prepareSpecialProviderConfig,
  providerToAiSdkConfig
} from './provider/providerConfig'
import type { AiSdkConfig } from './types'
import type { AiSdkMiddlewareConfig } from './types/middlewareConfig'

const logger = loggerService.withContext('ModernAiProvider')

export type ModernAiProviderConfig = AiSdkMiddlewareConfig & {
  assistant: Assistant
  // topicId for tracing
  topicId?: string
  callType: string
}

export default class ModernAiProvider {
  private config?: AiSdkConfig
  private actualProvider: Provider
  private model?: Model
  private localProvider: Awaited<AiSdkProvider> | null = null

  /**
   * Constructor for ModernAiProvider
   *
   * @param modelOrProvider - Model or Provider object
   * @param provider - Optional Provider object (only used when first param is Model)
   *
   * @remarks
   * **Important behavior notes**:
   *
   * 1. When called with `(model)`:
   *    - Calls `getActualProvider(model)` to retrieve and format the provider
   *    - URL will be automatically formatted via `formatProviderApiHost`, adding version suffixes like `/v1`
   *
   * 2. When called with `(model, provider)`:
   *    - The provided provider will be adapted via `adaptProvider`
   *    - URL formatting behavior depends on the adapted result
   *
   * 3. When called with `(provider)`:
   *    - The provider will be adapted via `adaptProvider`
   *    - Used for operations that don't need a model (e.g., fetchModels)
   *
   * @example
   * ```typescript
   * // Recommended: Auto-format URL
   * const ai = new ModernAiProvider(model)
   *
   * // Provider will be adapted
   * const ai = new ModernAiProvider(model, customProvider)
   *
   * // For operations that don't need a model
   * const ai = new ModernAiProvider(provider)
   * ```
   */
  constructor(model: Model, provider?: Provider)
  constructor(provider: Provider)
  constructor(modelOrProvider: Model | Provider, provider?: Provider)
  constructor(modelOrProvider: Model | Provider, provider?: Provider) {
    if (this.isModel(modelOrProvider)) {
      // 传入的是 Model
      this.model = modelOrProvider
      this.actualProvider = provider
        ? adaptProvider({ provider, model: modelOrProvider })
        : getActualProvider(modelOrProvider)
      // 只保存配置，不预先创建executor
      this.config = providerToAiSdkConfig(this.actualProvider, modelOrProvider)
    } else {
      // 传入的是 Provider
      this.actualProvider = adaptProvider({ provider: modelOrProvider })
      // model为可选，某些操作（如fetchModels）不需要model
    }
  }

  /**
   * 类型守卫函数：通过 provider 属性区分 Model 和 Provider
   */
  private isModel(obj: Model | Provider): obj is Model {
    return 'provider' in obj && typeof obj.provider === 'string'
  }

  public getActualProvider() {
    return this.actualProvider
  }

  public async completions(modelId: string, params: StreamTextParams, providerConfig: ModernAiProviderConfig) {
    // 检查model是否存在
    if (!this.model) {
      throw new Error('Model is required for completions. Please use constructor with model parameter.')
    }

    // Config is now set in constructor, ApiService handles key rotation before passing provider
    if (!this.config) {
      // If config wasn't set in constructor (when provider only), generate it now
      this.config = providerToAiSdkConfig(this.actualProvider, this.model!)
    }
    logger.debug('Using provider config for completions', this.config)

    // 检查 config 是否存在
    if (!this.config) {
      throw new Error('Provider config is undefined; cannot proceed with completions')
    }
    if (SUPPORTED_IMAGE_ENDPOINT_LIST.includes(this.config.options.endpoint)) {
      providerConfig.isImageGenerationEndpoint = true
    }
    // 准备特殊配置
    await prepareSpecialProviderConfig(this.actualProvider, this.config)

    // 提前创建本地 provider 实例
    if (!this.localProvider) {
      this.localProvider = await createAiSdkProvider(this.config)
    }

    if (!this.localProvider) {
      throw new Error('Local provider not created')
    }

    // 根据endpoint类型创建对应的模型
    let model: AiSdkModel | undefined
    if (providerConfig.isImageGenerationEndpoint) {
      model = this.localProvider.imageModel(modelId)
    } else {
      model = this.localProvider.languageModel(modelId)
    }

    if (this.actualProvider.id === 'anthropic' && this.actualProvider.authType === 'oauth') {
      // 类型守卫：确保 system 是 string、Array 或 undefined
      const system = params.system
      let systemParam: string | Array<any> | undefined
      if (typeof system === 'string' || Array.isArray(system) || system === undefined) {
        systemParam = system
      } else {
        // SystemModelMessage 类型，转换为 string
        systemParam = undefined
      }

      const claudeCodeSystemMessage = buildClaudeCodeSystemModelMessage(systemParam)
      params.system = undefined // 清除原有system，避免重复
      params.messages = [...claudeCodeSystemMessage, ...(params.messages || [])]
    }

    if (providerConfig.topicId && getEnableDeveloperMode()) {
      // TypeScript类型窄化：确保topicId是string类型
      const traceConfig = {
        ...providerConfig,
        topicId: providerConfig.topicId
      }
      return await this._completionsForTrace(model, params, traceConfig)
    } else {
      return await this._completionsOrImageGeneration(model, params, providerConfig)
    }
  }

  private async _completionsOrImageGeneration(
    model: AiSdkModel,
    params: StreamTextParams,
    config: ModernAiProviderConfig
  ): Promise<CompletionsResult> {
    if (config.isImageGenerationEndpoint && this.getActualProvider().id !== SystemProviderIds.gateway) {
      if (!config.uiMessages) {
        throw new Error('uiMessages is required for image generation endpoint')
      }
      if (!this.model) {
        throw new Error('Model is required for image generation endpoint')
      }
      return await this.modernImageGeneration(model, params, config)
    }

    return await this.modernCompletions(model as LanguageModel, params, config)
  }

  /**
   * 带 trace 支持的 completions 方法
   * 确保 AI SDK spans 在正确的 trace 上下文中
   */
  private async _completionsForTrace(
    model: AiSdkModel,
    params: StreamTextParams,
    config: ModernAiProviderConfig & { topicId: string }
  ): Promise<CompletionsResult> {
    const modelId = this.model!.id
    const traceName = `${this.actualProvider.name}.${modelId}.${config.callType}`
    const traceParams: StartSpanParams = {
      name: traceName,
      tag: 'LLM',
      topicId: config.topicId,
      modelName: config.assistant.model?.name, // 使用modelId而不是provider名称
      inputs: params
    }

    logger.info('Starting AI SDK trace span', {
      traceName,
      topicId: config.topicId,
      modelId,
      hasTools: !!params.tools && Object.keys(params.tools).length > 0,
      toolNames: params.tools ? Object.keys(params.tools) : [],
      isImageGeneration: config.isImageGenerationEndpoint
    })

    const span = addSpan(traceParams)
    if (!span) {
      logger.warn('Failed to create span, falling back to regular completions', {
        topicId: config.topicId,
        modelId,
        traceName
      })
      return await this._completionsOrImageGeneration(model, params, config)
    }

    try {
      logger.info('Created parent span, now calling completions', {
        spanId: span.spanContext().spanId,
        traceId: span.spanContext().traceId,
        topicId: config.topicId,
        modelId,
        parentSpanCreated: true
      })

      const result = await this._completionsOrImageGeneration(model, params, config)

      logger.info('Completions finished, ending parent span', {
        spanId: span.spanContext().spanId,
        traceId: span.spanContext().traceId,
        topicId: config.topicId,
        modelId,
        resultLength: result.getText().length
      })

      // 标记span完成
      endSpan({
        topicId: config.topicId,
        outputs: result,
        span,
        modelName: modelId // 使用modelId保持一致性
      })

      return result
    } catch (error) {
      logger.error('Error in completionsForTrace, ending parent span with error', error as Error, {
        spanId: span.spanContext().spanId,
        traceId: span.spanContext().traceId,
        topicId: config.topicId,
        modelId
      })

      // 标记span出错
      endSpan({
        topicId: config.topicId,
        error: error as Error,
        span,
        modelName: modelId // 使用modelId保持一致性
      })
      throw error
    }
  }

  /**
   * 使用现代化AI SDK的completions实现
   */
  private async modernCompletions(
    model: LanguageModel,
    params: StreamTextParams,
    config: ModernAiProviderConfig
  ): Promise<CompletionsResult> {
    // 根据条件构建插件数组
    const plugins = buildPlugins({
      provider: this.actualProvider,
      model: this.model!,
      config
    })

    // 用构建好的插件数组创建executor
    const executor = createExecutor(this.config!.providerId, this.config!.options, plugins)

    // 创建带有中间件的执行器
    if (config.onChunk) {
      // 除非模型明确不支持 delta，否则我们默认不累积（发送 delta 块）
      // onChunk 接收的是 delta 文本
      const accumulate = this.model!.supported_text_delta === false
      const adapter = new AiSdkToChunkAdapter(config.onChunk, config.mcpTools, accumulate, config.enableWebSearch)

      const streamResult = await executor.streamText({
        ...params,
        model,
        experimental_context: { onChunk: config.onChunk }
      })

      const finalText = await adapter.processStream(streamResult)

      return {
        getText: () => finalText
      }
    } else {
      const streamResult = await executor.streamText({
        ...params,
        model
      })

      // 强制消费流,不然await streamResult.text会阻塞
      await streamResult?.consumeStream()

      const finalText = await streamResult.text
      const usage = await streamResult.totalUsage

      return {
        getText: () => finalText,
        usage
      }
    }
  }

  private async modernImageGeneration(
    _model: AiSdkModel,
    params: StreamTextParams,
    config: ModernAiProviderConfig
  ): Promise<CompletionsResult> {
    const { onChunk } = config
    const messages = config.uiMessages!

    try {
      const lastUserMessage = messages.findLast((m) => m.role === 'user')
      const lastAssistantMessage = messages.findLast((m) => m.role === 'assistant')

      if (!lastUserMessage) {
        throw new Error('No user message found for image generation.')
      }

      const prompt = getMainTextContent(lastUserMessage)
      const inputImages: Uint8Array[] = []

      const userImageBlocks = findImageBlocks(lastUserMessage)
      for (const block of userImageBlocks) {
        if (block.file) {
          const binaryData = await FileManager.readBinaryImage(block.file)
          inputImages.push(binaryData.slice())
        }
      }

      if (lastAssistantMessage) {
        const assistantImageBlocks = findImageBlocks(lastAssistantMessage)
        for (const block of assistantImageBlocks) {
          const b64 = block.url?.replace(/^data:image\/\w+;base64,/, '')
          if (b64) {
            const binary = atob(b64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            inputImages.push(bytes)
          }
        }
      }

      if (onChunk) {
        onChunk({ type: ChunkType.IMAGE_CREATED })
      }

      const startTime = Date.now()
      const executor = createExecutor(this.config!.providerId, this.config!.options, [])
      const modelId = this.model!.id

      let result
      if (inputImages.length > 0) {
        result = await executor.generateImage({
          model: modelId,
          prompt: {
            images: inputImages,
            text: prompt || ''
          },
          ...(params.abortSignal && { abortSignal: params.abortSignal })
        })
      } else {
        result = await executor.generateImage({
          model: modelId,
          prompt: prompt || '',
          n: 1,
          ...(params.abortSignal && { abortSignal: params.abortSignal })
        })
      }

      const images: string[] = []
      const imageType: 'url' | 'base64' = 'base64'

      if (result.images) {
        for (const image of result.images) {
          const base64 = image.base64
          if (base64) {
            images.push(`data:image/png;base64,${base64}`)
          }
        }
      }

      if (onChunk) {
        onChunk({
          type: ChunkType.IMAGE_COMPLETE,
          image: { type: imageType, images }
        })

        const usage = {
          prompt_tokens: prompt.length,
          completion_tokens: 0,
          total_tokens: prompt.length
        }

        onChunk({
          type: ChunkType.LLM_RESPONSE_COMPLETE,
          response: {
            usage,
            metrics: {
              completion_tokens: 0,
              time_first_token_millsec: 0,
              time_completion_millsec: Date.now() - startTime
            }
          }
        })
      }

      return {
        getText: () => ''
      }
    } catch (error) {
      if (onChunk) {
        onChunk({ type: ChunkType.ERROR, error: error as Error })
      }
      throw error
    }
  }

  public async models() {
    if (this.actualProvider.id === SystemProviderIds.gateway) {
      const gatewayModels = (await gateway.getAvailableModels()).models
      return normalizeGatewayModels(this.actualProvider, gatewayModels)
    }
    const sdkModels = await window.api.model.listModels(this.actualProvider)
    return normalizeSdkModels(this.actualProvider, sdkModels)
  }

  public async getEmbeddingDimensions(model: Model): Promise<number> {
    return window.api.model.getEmbeddingDimensions(this.actualProvider, model)
  }

  public async generateImage(params: GenerateImageParams): Promise<string[]> {
    if (!this.config) {
      throw new Error('Provider config is undefined; cannot proceed with generateImage')
    }

    if (!this.localProvider && this.config) {
      this.localProvider = await createAiSdkProvider(this.config)
      if (!this.localProvider) {
        throw new Error('Local provider not created')
      }
    }

    return await this.modernGenerateImage(params)
  }

  /**
   * 使用现代化 AI SDK 的图像生成实现
   */
  private async modernGenerateImage(params: GenerateImageParams): Promise<string[]> {
    const { model, prompt, imageSize, batchSize, signal } = params

    // 转换参数格式
    const aiSdkParams = {
      prompt,
      size: (imageSize || '1024x1024') as `${number}x${number}`,
      n: batchSize || 1,
      ...(signal && { abortSignal: signal })
    }

    const executor = createExecutor(this.config!.providerId, this.config!.options, [])
    const result = await executor.generateImage({
      model: model, // 直接使用 model ID 字符串，由 executor 内部解析
      ...aiSdkParams
    })

    // 转换结果格式
    const images: string[] = []
    if (result.images) {
      for (const image of result.images) {
        if ('base64' in image && image.base64) {
          images.push(`data:image/png;base64,${image.base64}`)
        }
      }
    }

    return images
  }

  public getBaseURL(): string {
    return this.actualProvider.apiHost || ''
  }

  public getApiKey(): string {
    return this.actualProvider.apiKey || ''
  }
}

// 为了方便调试，导出一些工具函数
export { isModernSdkSupported, providerToAiSdkConfig }
