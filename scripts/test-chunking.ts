import { MarkdownLegalLoader } from '../src/main/knowledge/embedjs/loader/markdownLegalLoader'
import { LegalRecursiveCharacterTextSplitter } from '../src/main/knowledge/embedjs/splitter/LegalRecursiveCharacterTextSplitter'
import { legalCleanString } from '../src/main/knowledge/utils/text'

// 测试文本：模拟复杂的法律文档结构
const testLegalText = `
中华人民共和国民法典

第一章 总则
第一条 为了保护民事主体的合法权益，调整民事关系，维护社会和经济秩序，适应中国特色社会主义发展要求，弘扬社会主义核心价值观，根据宪法，制定本法。
第二条 民法调整平等主体的自然人、法人和非法人组织之间的人身关系和财产关系。

第二章 民事权利
第一百零九条 自然人的人身自由、人格尊严受法律保护。
第一百一十条 自然人享有生命权、身体权、健康权、姓名权、肖像权、名誉权、荣誉权、隐私权、婚姻自主权等权利。

# 结构测试章节
## 子章节 A
这里有一些内容。
还要测试一下标点符号识别；比如这个分号；还有句号。
## 子章节 B
内容 B。
第一条 这里的条文不应该被切断。

# 鲁棒性测试
  第  一  章 空格测试章节
这里测试一下行中标题。第一条 这是一个在行中的条文。
  第二条 这是一个带前导空格的条文。
`

async function runTest() {
  console.log('=== Cherry Law 知识库分块效果测试 ===\n')

  // 1. 测试文本清理
  console.log('--- 1. 文本预处理测试 (legalCleanString) ---')
  const cleaned = legalCleanString(testLegalText)
  console.log('清理后的文本片段 (前100字):')
  console.log(cleaned.substring(0, 100) + '...')
  console.log('\n')

  // 2. 测试法律递归分块
  console.log('--- 2. 法律递归分块测试 (LegalRecursiveCharacterTextSplitter) ---')
  const splitter = new LegalRecursiveCharacterTextSplitter({
    chunkSize: 200,
    chunkOverlap: 20
  })
  const chunks = await splitter.splitText(cleaned)
  console.log(`总分块数: ${chunks.length}`)
  chunks.forEach((chunk, i) => {
    console.log(`[分块 ${i + 1}] (长度: ${chunk.length}):`)
    console.log(chunk)
    console.log('-'.repeat(20))
  })
  console.log('\n')

  // 3. 测试 Markdown 法律加载器 (结构化分块)
  console.log('--- 3. Markdown 结构化分块测试 (MarkdownLegalLoader) ---')
  const mdLoader = new MarkdownLegalLoader({
    text: testLegalText,
    filePath: 'test.md',
    chunkSize: 300,
    chunkOverlap: 50
  })

  const mdChunks: any[] = []
  for await (const chunk of mdLoader.getUnfilteredChunks()) {
    mdChunks.push(chunk)
  }

  console.log(`结构化总分块数: ${mdChunks.length}`)
  mdChunks.forEach((chunk, i) => {
    console.log(`[结构化分块 ${i + 1}] (标题: ${chunk.metadata.header}):`)
    console.log(chunk.pageContent)
    console.log('-'.repeat(20))
  })
}

runTest().catch(console.error)
