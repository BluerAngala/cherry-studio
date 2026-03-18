/**
 * OpenAI SDK 客户端创建工具
 * 用于创建 OpenAI SDK 客户端实例
 */

import OpenAI, { AzureOpenAI } from '@cherrystudio/openai'

export interface OpenAIClientOptions {
  apiKey: string
  baseURL: string
  defaultHeaders?: Record<string, string>
  timeout?: number
}

export interface AzureOpenAIClientOptions {
  apiKey: string
  endpoint: string
  apiVersion?: string
  defaultHeaders?: Record<string, string>
  timeout?: number
}

export function createOpenAIClient(options: OpenAIClientOptions): OpenAI {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    defaultHeaders: options.defaultHeaders,
    timeout: options.timeout
  })
}

export function createAzureOpenAIClient(options: AzureOpenAIClientOptions): AzureOpenAI {
  return new AzureOpenAI({
    apiKey: options.apiKey,
    endpoint: options.endpoint,
    apiVersion: options.apiVersion,
    defaultHeaders: options.defaultHeaders,
    timeout: options.timeout
  })
}

export { AzureOpenAI, OpenAI }
