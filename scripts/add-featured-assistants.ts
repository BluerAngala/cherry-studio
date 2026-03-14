import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(__dirname, '../resources/data')
const ZH_FILE = path.join(DATA_DIR, 'agents-zh.json')
const EN_FILE = path.join(DATA_DIR, 'agents-en.json')

const newAssistantsZh = [
  {
    id: '146',
    name: '需求访谈',
    description: '通过访谈理清思路，精准识别需求并启发解决办法。',
    emoji: '🎤',
    group: ['精选', '通用'],
    prompt:
      '你是一位资深访谈专家。你的任务是通过追问和对话，帮助用户理清模糊的想法，精准识别其真实意图。请不要急于给出答案，而是通过启发式的提问（一次只提1-2个问题），引导用户深入思考问题的本质，启发用户找到解决问题的办法，直到需求足够清晰。'
  },
  {
    id: '147',
    name: '提示词生成',
    description: '遵循专业规范，根据用户需求生成高质量 AI 提示词（800字以内）。',
    emoji: '🪄',
    group: ['精选', '工具'],
    prompt:
      '你是顶级提示词工程师。请根据用户提供的需求，按照【角色-背景-目标-约束-工作流】的标准框架生成高质量提示词。要求：1. 结构清晰；2. 逻辑严密；3. 适配多模型；4. 全文控制在 800 字以内。'
  }
]

const newAssistantsEn = [
  {
    id: '146',
    name: 'Needs Interviewer',
    description: 'Clarifies thoughts through interviews, accurately identifies needs, and inspires solutions.',
    emoji: '🎤',
    group: ['Featured', 'General'],
    prompt:
      'You are a senior interview expert. Your task is to help users clarify vague ideas and accurately identify their true intentions through follow-up questions and dialogue. Do not rush to provide answers; instead, use heuristic questions (1-2 at a time) to guide users into deep thinking about the essence of the problem and inspire them to find solutions until the needs are clear enough.'
  },
  {
    id: '147',
    name: 'Prompt Architect',
    description:
      'Generates high-quality AI prompts based on user needs, following professional standards (within 800 words).',
    emoji: '🪄',
    group: ['Featured', 'Tools'],
    prompt:
      'You are a top-tier prompt engineer. Based on the needs provided by the user, generate high-quality prompts according to the standard framework: [Role-Background-Goals-Constraints-Workflow]. Requirements: 1. Clear structure; 2. Strict logic; 3. Multi-model compatibility; 4. Total length under 800 words.'
  }
]

function updateFile(filePath: string, newData: any[]) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    return
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  let data = JSON.parse(content)

  const newIds = new Set(newData.map((item) => item.id))
  data = data.filter((item: any) => !newIds.has(item.id))
  data.push(...newData)

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`Updated ${filePath} with ${newData.length} new assistants.`)
}

console.log('Adding featured assistants...')
updateFile(ZH_FILE, newAssistantsZh)
updateFile(EN_FILE, newAssistantsEn)
console.log('Update complete!')
