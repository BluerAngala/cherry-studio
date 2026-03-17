import ModernAiProvider from '@renderer/aiCore/index_new'
import type { Assistant, Model, Provider } from '@renderer/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockProvider: Provider = {
  id: 'openai',
  type: 'openai',
  name: 'OpenAI',
  apiKey: 'mock-api-key',
  apiHost: 'https://api.openai.com',
  models: []
}

const mockModel: Model = {
  id: 'gpt-4o',
  name: 'GPT-4o',
  provider: 'openai',
  supported_text_delta: true,
  group: 'openai'
}

const mockAssistant: Assistant = {
  id: 'test-assistant',
  name: 'Test Assistant',
  prompt: 'You are a helpful assistant.',
  model: mockModel,
  topics: [],
  type: 'assistant'
}

vi.mock('@renderer/aiCore/provider/factory', () => ({
  createAiSdkProvider: vi.fn().mockResolvedValue({
    languageModel: vi.fn((id) => ({ modelId: id })),
    imageModel: vi.fn((id) => ({ modelId: id }))
  })
}))

vi.mock('@cherrystudio/ai-core', () => ({
  createExecutor: vi.fn(() => ({
    streamText: vi.fn().mockResolvedValue({
      text: 'Hello, world!',
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: 'stop'
    }),
    generateImage: vi.fn().mockResolvedValue({
      images: [{ base64: 'mock-base64-image-data' }]
    })
  }))
}))

vi.mock('@renderer/aiCore/provider/providerConfig', () => ({
  adaptProvider: vi.fn((args) => args.provider || args),
  getActualProvider: vi.fn((_model) => ({
    ...mockProvider,
    models: [mockModel]
  })),
  isModernSdkSupported: vi.fn(() => true),
  prepareSpecialProviderConfig: vi.fn(),
  providerToAiSdkConfig: vi.fn(() => ({
    providerId: 'openai',
    options: {
      apiKey: 'mock-api-key',
      baseURL: 'https://api.openai.com/v1'
    }
  }))
}))

vi.mock('@renderer/aiCore/plugins/PluginBuilder', () => ({
  buildPlugins: vi.fn(() => [])
}))

vi.mock('@renderer/aiCore/chunk/AiSdkToChunkAdapter', () => {
  return class {
    async processStream() {
      return 'Hello, world!'
    }
  }
})

vi.mock('@renderer/hooks/useSettings', () => ({
  getEnableDeveloperMode: vi.fn(() => false)
}))

vi.mock('@renderer/services/SpanManagerService', () => ({
  addSpan: vi.fn(),
  endSpan: vi.fn()
}))

vi.mock('@renderer/services/FileManager', () => ({
  default: {
    readBinaryImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]))
  }
}))

vi.mock('@renderer/utils/messageUtils/find', () => ({
  findImageBlocks: vi.fn(() => []),
  getMainTextContent: vi.fn(() => 'Test prompt')
}))

vi.mock('@renderer/utils', () => ({
  SUPPORTED_IMAGE_ENDPOINT_LIST: []
}))

vi.mock('@shared/anthropic', () => ({
  buildClaudeCodeSystemModelMessage: vi.fn()
}))

const defaultConfig = {
  streamOutput: true,
  enableReasoning: false,
  isPromptToolUse: false,
  isSupportedToolUse: false,
  enableWebSearch: false,
  enableUrlContext: false,
  enableGenerateImage: false,
  isImageGenerationEndpoint: false
}

describe('ModernAiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create instance with Model', () => {
      const provider = new ModernAiProvider(mockModel)
      expect(provider).toBeDefined()
      expect(provider.getActualProvider()).toBeDefined()
    })

    it('should create instance with Provider', () => {
      const provider = new ModernAiProvider(mockProvider)
      expect(provider).toBeDefined()
      expect(provider.getActualProvider()).toBeDefined()
    })

    it('should create instance with Model and Provider', () => {
      const provider = new ModernAiProvider(mockModel, mockProvider)
      expect(provider).toBeDefined()
      expect(provider.getActualProvider()).toBeDefined()
    })
  })

  describe('getBaseURL', () => {
    it('should return apiHost', () => {
      const provider = new ModernAiProvider(mockModel, mockProvider)
      expect(provider.getBaseURL()).toBe('https://api.openai.com')
    })
  })

  describe('getApiKey', () => {
    it('should return apiKey', () => {
      const provider = new ModernAiProvider(mockModel, mockProvider)
      expect(provider.getApiKey()).toBe('mock-api-key')
    })
  })

  describe('models', () => {
    it('should return normalized models', async () => {
      const mockListModels = vi.fn().mockResolvedValue([
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
      ])

      vi.stubGlobal('window', {
        api: {
          model: {
            listModels: mockListModels,
            getEmbeddingDimensions: vi.fn().mockResolvedValue(1536)
          }
        }
      })

      const provider = new ModernAiProvider(mockModel, mockProvider)
      const models = await provider.models()
      expect(models).toBeDefined()
    })
  })

  describe('getEmbeddingDimensions', () => {
    it('should return embedding dimensions', async () => {
      const mockGetEmbeddingDimensions = vi.fn().mockResolvedValue(1536)

      vi.stubGlobal('window', {
        api: {
          model: {
            listModels: vi.fn().mockResolvedValue([]),
            getEmbeddingDimensions: mockGetEmbeddingDimensions
          }
        }
      })

      const provider = new ModernAiProvider(mockModel, mockProvider)
      const dimensions = await provider.getEmbeddingDimensions(mockModel)
      expect(dimensions).toBe(1536)
    })
  })

  describe('generateImage', () => {
    it('should generate images successfully', async () => {
      const provider = new ModernAiProvider(mockModel, mockProvider)

      const images = await provider.generateImage({
        model: mockModel.id,
        prompt: 'A beautiful sunset',
        batchSize: 1,
        imageSize: '1024x1024'
      })

      expect(images).toBeDefined()
      expect(Array.isArray(images)).toBe(true)
    })
  })

  describe('completions', () => {
    it('should throw error if model is not provided', async () => {
      const provider = new ModernAiProvider(mockProvider)

      await expect(
        provider.completions('gpt-4o', {} as any, {
          assistant: mockAssistant,
          callType: 'chat',
          ...defaultConfig
        })
      ).rejects.toThrow('Model is required for completions')
    })

    it('should handle stream completions', async () => {
      const collectedChunks: any[] = []
      const mockOnChunk = vi.fn((chunk) => {
        collectedChunks.push(chunk)
      })

      const provider = new ModernAiProvider(mockModel, mockProvider)

      const result = await provider.completions('gpt-4o', {} as any, {
        assistant: mockAssistant,
        callType: 'chat',
        onChunk: mockOnChunk,
        ...defaultConfig
      })

      expect(result).toBeDefined()
      expect(result.getText).toBeDefined()
    })
  })
})
