import { PdfLegalLoader } from '../src/main/knowledge/embedjs/loader/pdfLegalLoader'
import * as path from 'path'
import * as fs from 'fs'

async function testPdf() {
  const pdfPath = 'c:\\Users\\11071\\Documents\\trae_projects\\260313-cherry-studio\\tests\\001.pdf'
  
  if (!fs.existsSync(pdfPath)) {
    console.error(`错误: 文件不存在 -> ${pdfPath}`)
    return
  }

  console.log(`=== 开始测试 PDF 分块: ${path.basename(pdfPath)} ===\n`)

  const loader = new PdfLegalLoader({
    filePath: pdfPath,
    chunkSize: 500, // 设置一个合理的块大小
    chunkOverlap: 50
  })

  let count = 0
  try {
    for await (const chunk of loader.getUnfilteredChunks()) {
      count++
      console.log(`[分块 ${count}] (长度: ${chunk.pageContent.length}):`)
      console.log('--- 内容预览 ---')
      console.log(chunk.pageContent)
      console.log('--- 元数据 ---')
      console.log(JSON.stringify(chunk.metadata, null, 2))
      console.log('=' .repeat(40) + '\n')
      
      // 如果分块太多，只展示前 10 个
      if (count >= 10) {
        console.log('... 后面还有更多分块，已停止预览 ...')
        break
      }
    }
    console.log(`\n测试完成！总共生成了 ${count} 个预览分块。`)
  } catch (error) {
    console.error('解析 PDF 失败:', error)
  }
}

testPdf().catch(console.error)
