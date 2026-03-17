import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { fileStorage } from '@main/services/FileStorage'
import type { FileMetadata, PreprocessProvider } from '@types'
import { PDFDocument } from 'pdf-lib'
import pdf from 'pdf-parse'

import BasePreprocessProvider from './BasePreprocessProvider'

const logger = loggerService.withContext('AutoPreprocessProvider')

const MIN_TEXT_CHARS_PER_PAGE = 100

export type PdfAnalysisResult = {
  isScanned: boolean
  textLength: number
  pageCount: number
  avgCharsPerPage: number
}

export default class AutoPreprocessProvider extends BasePreprocessProvider {
  constructor(provider: PreprocessProvider, userId?: string) {
    super(provider, userId)
  }

  public async parseFile(_sourceId: string, file: FileMetadata): Promise<{ processedFile: FileMetadata }> {
    try {
      const filePath = fileStorage.getFilePathById(file)
      logger.info(`Auto preprocess processing started: ${filePath}`)

      const pdfBuffer = await fs.promises.readFile(filePath)
      const analysis = await this.analyzePdf(pdfBuffer)

      logger.info(
        `PDF analysis: ${analysis.pageCount} pages, ${analysis.textLength} chars, ` +
          `avg ${analysis.avgCharsPerPage.toFixed(1)} chars/page, ` +
          `isScanned: ${analysis.isScanned}`
      )

      if (!analysis.isScanned) {
        logger.info(`PDF is text-based, no OCR needed. Using built-in parser.`)
        return {
          processedFile: file
        }
      }

      logger.info(`PDF appears to be scanned, trying local OCR in auto mode.`)
      const ocrText = await this.extractScannedPdfTextLocally(pdfBuffer)

      if (ocrText.trim().length > 0) {
        const processedFile = await this.persistOcrTextAsMarkdown(file, ocrText)
        logger.info(`Local OCR succeeded for scanned PDF: ${filePath}`)
        return {
          processedFile
        }
      }

      logger.warn(`Scanned PDF detected but local OCR produced no text. Falling back to original PDF: ${filePath}`)

      return {
        processedFile: file
      }
    } catch (error: any) {
      logger.error(`Auto preprocess processing failed:`, error as Error)
      throw new Error(error.message)
    }
  }

  public async analyzePdf(buffer: Buffer): Promise<PdfAnalysisResult> {
    let pageCount = 0
    let textLength = 0

    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      pageCount = pdfDoc.getPageCount()
    } catch {
      logger.warn('Failed to get page count from pdf-lib, trying pdf-parse')
    }

    try {
      const data = await pdf(buffer)
      textLength = data.text.trim().length
      if (pageCount === 0 && data.numpages) {
        pageCount = data.numpages
      }
    } catch (error) {
      logger.warn(`Failed to extract text from PDF: ${error}`)
    }

    const avgCharsPerPage = pageCount > 0 ? textLength / pageCount : 0

    const isScanned = this.detectScannedDocument(textLength, avgCharsPerPage)

    return {
      isScanned,
      textLength,
      pageCount,
      avgCharsPerPage
    }
  }

  private detectScannedDocument(textLength: number, avgCharsPerPage: number): boolean {
    if (textLength === 0) {
      return true
    }

    if (avgCharsPerPage < MIN_TEXT_CHARS_PER_PAGE) {
      return true
    }

    return false
  }

  private async extractScannedPdfTextLocally(pdfBuffer: Buffer): Promise<string> {
    try {
      const { OcrAccuracy, recognize } = await import('@napi-rs/system-ocr')
      const langs = process.platform === 'win32' ? ['zh-cn', 'en-us'] : undefined
      const result = await recognize(pdfBuffer, OcrAccuracy.Accurate, langs)
      return result.text ?? ''
    } catch (error) {
      logger.warn(`Local OCR failed for scanned PDF: ${error}`)
      return ''
    }
  }

  private async persistOcrTextAsMarkdown(file: FileMetadata, text: string): Promise<FileMetadata> {
    const outputDir = path.join(this.storageDir, file.id)
    await fs.promises.mkdir(outputDir, { recursive: true })

    const markdownName = file.origin_name.replace(/\.pdf$/i, '.md')
    const outputPath = path.join(outputDir, markdownName)
    await fs.promises.writeFile(outputPath, text, 'utf-8')
    const stats = await fs.promises.stat(outputPath)

    return {
      ...file,
      name: file.name.replace(/\.pdf$/i, '.md'),
      path: outputPath,
      ext: '.md',
      size: stats.size,
      created_at: stats.birthtime.toISOString()
    }
  }

  public static async checkIfScanned(filePath: string): Promise<PdfAnalysisResult> {
    const buffer = await fs.promises.readFile(filePath)
    const instance = new AutoPreprocessProvider({ id: 'auto', name: 'Auto' } as any)
    return instance.analyzePdf(buffer)
  }
}
