import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

/**
 * 专门为法律文档和中文文本优化的分块器
 * 增加了对中文标点符号和法律条文结构的识别，确保分块更具语义完整性
 */
export class LegalRecursiveCharacterTextSplitter extends RecursiveCharacterTextSplitter {
  constructor(fields?: any) {
    const defaultSeparators = [
      '\n\n', // 优先以双换行分段
      '\n', // 单换行
      '。', // 中文句号
      '！', // 中文感叹号
      '？', // 中文问号
      '；', // 中文分号
      '：\n', // 冒号后跟换行（通常是条款列表的开始）
      '. ', // 英文句号
      '! ', // 英文感叹号
      '? ', // 英文问号
      '; ', // 英文分号
      ' ', // 空格
      '' // 字符
    ]

    // 针对法律文档的条文标记，可以作为更高级别的分隔符
    // 增加更多的层级结构识别
    const legalSeparators = [
      '第一章',
      '第二章',
      '第三章',
      '第四章',
      '第五章',
      '第一节',
      '第二节',
      '第三节',
      '第四节',
      '第五节',
      '第一条',
      '第二条',
      '第三条',
      '第四条',
      '第五条',
      '第六条',
      '第七条',
      '第八条',
      '第九条',
      '第十条',
      '第十一条',
      '第十二条',
      '第十三条',
      '第十四条',
      '第十五条',
      '第十六条',
      '第十七条',
      '第十八条',
      '第十九条',
      '第二十条',
      'Article 1',
      'Article 2',
      'Article 3',
      'Article 4',
      'Article 5',
      'Section 1',
      'Section 2',
      'Section 3',
      'Section 4',
      'Section 5',
      'Chapter 1',
      'Chapter 2',
      'Chapter 3'
    ]

    super({
      ...fields,
      separators: fields?.separators || [...legalSeparators, ...defaultSeparators]
    })
  }
}
