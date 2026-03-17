import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { fileStorage } from '@main/services/FileStorage'
import { tesseractService } from '@main/services/ocr/builtin/TesseractService'
import { preprocessImage } from '@main/utils/ocr'
import type { FileMetadata, PreprocessProvider } from '@types'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
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

      logger.info(`PDF appears to be scanned, starting seamless local OCR with Tesseract...`)

      try {
        const pdfDoc = await PDFDocument.load(pdfBuffer)
        const pages = pdfDoc.getPages()
        let fullText = ''

        // 为了保证速度，Auto 模式默认处理前 20 页，避免大文件卡顿
        const maxPages = Math.min(pages.length, 20)
        await this.sendPreprocessProgress(_sourceId, 10)

        for (let i = 0; i < maxPages; i++) {
          const page = pages[i]
          let pageText = ''

          // 尝试从 PDF 页面资源中直接提取图像对象
          const { Resources } = page.node as any
          if (Resources) {
            const XObject = Resources.get(PDFName.of('XObject'))
            if (XObject) {
              const xObjects = XObject.entries()
              for (const [, xObject] of xObjects) {
                if (xObject instanceof PDFRawStream) {
                  const subtype = xObject.dict.get(PDFName.of('Subtype'))
                  if (subtype === PDFName.of('Image')) {
                    try {
                      // 提取原始图像数据
                      const imgBuffer = Buffer.from(xObject.contents)
                      // 预处理图像（灰度、锐化等）以提高准确率
                      const processedImg = await preprocessImage(imgBuffer)
                      // 调用本地 Tesseract
                      const result = await tesseractService.recognizeBuffer(processedImg)
                      if (result.text) {
                        pageText += result.text + '\n'
                      }
                    } catch (e) {
                      logger.warn(`Failed to OCR image on page ${i + 1}: ${e}`)
                    }
                  }
                }
              }
            }
          }

          if (pageText) {
            fullText += `## Page ${i + 1}\n\n${pageText}\n\n`
          }

          // 进度反馈
          const progress = 10 + Math.round(((i + 1) / maxPages) * 80)
          await this.sendPreprocessProgress(_sourceId, progress)
        }

        if (fullText) {
          logger.info(`Local seamless OCR completed for first ${maxPages} pages.`)
          // 创建本地临时 Markdown 文件
          const outputPath = path.join(this.storageDir, file.id)
          if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true })
          }
          const finalName = file.origin_name.replace('.pdf', '.md')
          const finalPath = path.join(outputPath, finalName)
          fs.writeFileSync(finalPath, fullText)

          return {
            processedFile: {
              ...file,
              name: finalName,
              path: finalPath,
              ext: '.md',
              size: Buffer.byteLength(fullText),
              created_at: new Date().toISOString()
            }
          }
        }

        logger.warn(`No extractable images found in scanned PDF, falling back to original file.`)
        return {
          processedFile: file
        }
      } catch (ocrError) {
        logger.error(`Seamless local OCR failed: ${ocrError}`)
        return {
          processedFile: file
        }
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
      const pdfParser = typeof pdf === 'function' ? pdf : (pdf as any).default
      if (typeof pdfParser !== 'function') {
        throw new Error('pdf-parse is not a function')
      }
      const data = await pdfParser(buffer)
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

  public static async checkIfScanned(filePath: string): Promise<PdfAnalysisResult> {
    const buffer = await fs.promises.readFile(filePath)
    const instance = new AutoPreprocessProvider({ id: 'auto', name: 'Auto' } as any)
    return instance.analyzePdf(buffer)
  }
}
