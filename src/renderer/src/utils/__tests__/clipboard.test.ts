import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => mockLogger
  }
}))

import { writeTextToClipboard } from '../clipboard'

const mockBrowserWriteText = vi.fn()
const mockElectronWriteText = vi.fn()

describe('clipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    Object.defineProperty(global.navigator, 'clipboard', {
      value: {
        writeText: mockBrowserWriteText
      },
      writable: true,
      configurable: true
    })

    Object.defineProperty(global.window, 'api', {
      value: {
        selection: {
          writeToClipboard: mockElectronWriteText
        }
      },
      writable: true,
      configurable: true
    })
  })

  it('should use browser clipboard when available', async () => {
    mockBrowserWriteText.mockResolvedValue(undefined)

    await writeTextToClipboard('browser copy')

    expect(mockBrowserWriteText).toHaveBeenCalledWith('browser copy')
    expect(mockElectronWriteText).not.toHaveBeenCalled()
  })

  it('should fall back to electron clipboard when browser clipboard fails', async () => {
    mockBrowserWriteText.mockRejectedValue(new Error('Browser clipboard failed'))
    mockElectronWriteText.mockResolvedValue(true)

    await writeTextToClipboard('fallback copy')

    expect(mockBrowserWriteText).toHaveBeenCalledWith('fallback copy')
    expect(mockElectronWriteText).toHaveBeenCalledWith('fallback copy')
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('should throw when browser clipboard fails and electron fallback returns false', async () => {
    mockBrowserWriteText.mockRejectedValue(new Error('Browser clipboard failed'))
    mockElectronWriteText.mockResolvedValue(false)

    await expect(writeTextToClipboard('failed copy')).rejects.toThrow('Browser clipboard failed')

    expect(mockElectronWriteText).toHaveBeenCalledWith('failed copy')
  })
})
