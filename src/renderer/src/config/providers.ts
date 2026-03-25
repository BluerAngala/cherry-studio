import AnthropicProviderLogo from '@renderer/assets/images/providers/anthropic.png'
import OpenAiProviderLogo from '@renderer/assets/images/providers/openai.png'
import SiliconFlowProviderLogo from '@renderer/assets/images/providers/silicon.png'
import type { SystemProvider, SystemProviderId } from '@renderer/types'
import { OpenAIServiceTiers } from '@renderer/types'

import { SYSTEM_MODELS } from './models'

export const SYSTEM_PROVIDERS_CONFIG: Partial<Record<SystemProviderId, SystemProvider>> = {
  silicon: {
    id: 'silicon',
    name: 'Silicon',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.siliconflow.cn',
    anthropicApiHost: 'https://api.siliconflow.cn',
    models: SYSTEM_MODELS.silicon,
    isSystem: true,
    enabled: true
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: '',
    apiHost: 'https://api.anthropic.com',
    models: SYSTEM_MODELS.anthropic,
    isSystem: true,
    enabled: false
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.openai.com',
    models: SYSTEM_MODELS.openai,
    isSystem: true,
    enabled: false,
    serviceTier: OpenAIServiceTiers.auto
  }
} as const

export const SYSTEM_PROVIDERS: SystemProvider[] = Object.values(SYSTEM_PROVIDERS_CONFIG) as SystemProvider[]

export const PROVIDER_LOGO_MAP: Partial<Record<SystemProviderId, string>> = {
  silicon: SiliconFlowProviderLogo,
  anthropic: AnthropicProviderLogo,
  openai: OpenAiProviderLogo
} as const

export function getProviderLogo(providerId: string) {
  return PROVIDER_LOGO_MAP[providerId as keyof typeof PROVIDER_LOGO_MAP]
}

// export const SUPPORTED_REANK_PROVIDERS = ['silicon', 'jina', 'voyageai', 'dashscope', 'aihubmix']
export const NOT_SUPPORTED_RERANK_PROVIDERS = ['ollama', 'lmstudio'] as const satisfies SystemProviderId[]
export const ONLY_SUPPORTED_DIMENSION_PROVIDERS = ['ollama', 'infini'] as const satisfies SystemProviderId[]

type ProviderUrls = {
  api: {
    url: string
  }
  websites?: {
    official: string
    apiKey?: string
    docs: string
    models?: string
  }
}

export const PROVIDER_URLS: Partial<Record<SystemProviderId, ProviderUrls>> = {
  silicon: {
    api: {
      url: 'https://api.siliconflow.cn'
    },
    websites: {
      official: 'https://siliconflow.cn/zh-cn/siliconcloud',
      apiKey: 'https://cloud.siliconflow.cn/account/ak',
      docs: 'https://docs.siliconflow.cn/',
      models: 'https://docs.siliconflow.cn/cn/models/list'
    }
  },
  anthropic: {
    api: {
      url: 'https://api.anthropic.com'
    },
    websites: {
      official: 'https://anthropic.com/',
      apiKey: 'https://console.anthropic.com/settings/keys',
      docs: 'https://docs.anthropic.com/en/docs',
      models: 'https://docs.anthropic.com/en/docs/about-claude/models'
    }
  },
  openai: {
    api: {
      url: 'https://api.openai.com'
    },
    websites: {
      official: 'https://openai.com/',
      apiKey: 'https://platform.openai.com/api-keys',
      docs: 'https://platform.openai.com/docs',
      models: 'https://platform.openai.com/docs/models'
    }
  }
}
