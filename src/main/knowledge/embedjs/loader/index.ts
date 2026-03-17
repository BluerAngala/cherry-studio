import type { RAGApplication } from '@cherrystudio/embedjs'
import { JsonLoader, LocalPathLoader } from '@cherrystudio/embedjs'
import type { AddLoaderReturn } from '@cherrystudio/embedjs-interfaces'
import { WebLoader } from '@cherrystudio/embedjs-loader-web'
import { loggerService } from '@logger'
import { readTextFileWithAutoEncoding } from '@main/utils/file'
import type { LoaderReturn } from '@shared/config/types'
import type { FileMetadata, KnowledgeBaseParams } from '@types'

import { DraftsExportLoader } from './draftsExportLoader'
import { EpubLoader } from './epubLoader'
import { MarkdownLegalLoader } from './markdownLegalLoader'
import { NoteLoader } from './noteLoader'
import { OdLoader, OdType } from './odLoader'
import { OfficeLegalLoader } from './officeLegalLoader'
import { PdfLegalLoader } from './pdfLegalLoader'

const logger = loggerService.withContext('KnowledgeLoader')

// 文件扩展名到加载器类型的映射
const FILE_LOADER_MAP: Record<string, string> = {
  // 内置类型
  '.pdf': 'pdf_legal',
  '.csv': 'common',
  '.doc': 'office_legal',
  '.docx': 'office_legal',
  '.pptx': 'office_legal',
  '.xlsx': 'office_legal',
  '.md': 'markdown_legal',
  // OD类型
  '.odt': 'od',
  '.ods': 'od',
  '.odp': 'od',
  // epub类型
  '.epub': 'epub',
  // Drafts类型
  '.draftsexport': 'drafts',
  // HTML类型
  '.html': 'html',
  '.htm': 'html',
  // JSON类型
  '.json': 'json'
  // 其他类型默认为文本类型
}

export async function addOdLoader(
  ragApplication: RAGApplication,
  file: FileMetadata,
  base: KnowledgeBaseParams,
  forceReload: boolean
): Promise<AddLoaderReturn> {
  const loaderMap: Record<string, OdType> = {
    '.odt': OdType.OdtLoader,
    '.ods': OdType.OdsLoader,
    '.odp': OdType.OdpLoader
  }
  const odType = loaderMap[file.ext]
  if (!odType) {
    throw new Error('Unknown odType')
  }
  return ragApplication.addLoader(
    new OdLoader({
      odType,
      filePath: file.path,
      chunkSize: base.chunkSize,
      chunkOverlap: base.chunkOverlap
    }) as any,
    forceReload
  )
}

export async function addFileLoader(
  ragApplication: RAGApplication,
  file: FileMetadata,
  base: KnowledgeBaseParams,
  forceReload: boolean
): Promise<LoaderReturn> {
  // 获取文件类型，如果没有匹配则默认为文本类型
  const loaderType = FILE_LOADER_MAP[file.ext.toLowerCase()] || 'text'
  let loaderReturn: AddLoaderReturn
  // 使用文件的实际路径
  const filePath = file.path

  // JSON类型处理
  let jsonObject = {}
  let jsonParsed = true
  logger.info(`[KnowledgeBase] processing file ${filePath} as ${loaderType} type`)
  switch (loaderType) {
    case 'common':
      // 内置类型处理
      loaderReturn = await ragApplication.addLoader(
        new LocalPathLoader({
          path: filePath,
          chunkSize: base.chunkSize,
          chunkOverlap: base.chunkOverlap
        }) as any,
        forceReload
      )
      break

    case 'od':
      // OD类型处理
      loaderReturn = await addOdLoader(ragApplication, file, base, forceReload)
      break

    case 'pdf_legal':
      // 法律优化 PDF 处理
      loaderReturn = await ragApplication.addLoader(
        new PdfLegalLoader({
          filePath: filePath,
          chunkSize: base.chunkSize,
          chunkOverlap: base.chunkOverlap
        }) as any,
        forceReload
      )
      break

    case 'office_legal':
      // 法律优化 Office 处理
      loaderReturn = await ragApplication.addLoader(
        new OfficeLegalLoader({
          filePath: filePath,
          chunkSize: base.chunkSize,
          chunkOverlap: base.chunkOverlap
        }) as any,
        forceReload
      )
      break

    case 'markdown_legal':
      // 法律优化 Markdown 处理
      loaderReturn = await ragApplication.addLoader(
        new MarkdownLegalLoader({
          text: await readTextFileWithAutoEncoding(filePath),
          filePath: filePath,
          chunkSize: base.chunkSize,
          chunkOverlap: base.chunkOverlap
        }) as any,
        forceReload
      )
      break
    case 'epub':
      // epub类型处理
      loaderReturn = await ragApplication.addLoader(
        new EpubLoader({
          filePath: filePath,
          chunkSize: base.chunkSize ?? 1000,
          chunkOverlap: base.chunkOverlap ?? 200
        }) as any,
        forceReload
      )
      break

    case 'drafts':
      // Drafts类型处理
      loaderReturn = await ragApplication.addLoader(new DraftsExportLoader(filePath), forceReload)
      break

    case 'html':
      // HTML类型处理
      loaderReturn = await ragApplication.addLoader(
        new WebLoader({
          urlOrContent: await readTextFileWithAutoEncoding(filePath),
          chunkSize: base.chunkSize,
          chunkOverlap: base.chunkOverlap
        }) as any,
        forceReload
      )
      break

    case 'json':
      try {
        jsonObject = JSON.parse(await readTextFileWithAutoEncoding(filePath))
      } catch (error) {
        jsonParsed = false
        logger.warn(
          `[KnowledgeBase] failed parsing json file, falling back to text processing: ${filePath}`,
          error as Error
        )
      }

      if (jsonParsed) {
        loaderReturn = await ragApplication.addLoader(new JsonLoader({ object: jsonObject }), forceReload)
      }
    // fallthrough - JSON 解析失败时作为文本处理
    // oxlint-disable-next-line no-fallthrough 利用switch特性，刻意不break
    default:
      // 文本类型处理（默认）
      // 使用 NoteLoader 替代 TextLoader，因为 NoteLoader 已集成 LegalRecursiveCharacterTextSplitter 和文本清理逻辑
      loaderReturn = await ragApplication.addLoader(
        new NoteLoader({
          text: await readTextFileWithAutoEncoding(filePath),
          sourceUrl: filePath,
          chunkSize: base.chunkSize,
          chunkOverlap: base.chunkOverlap
        }) as any,
        forceReload
      )
      break
  }

  return {
    entriesAdded: loaderReturn.entriesAdded,
    uniqueId: loaderReturn.uniqueId,
    uniqueIds: [loaderReturn.uniqueId],
    loaderType: loaderReturn.loaderType
  } as LoaderReturn
}
