#!/usr/bin/env node
/**
 * OpenCode 包装脚本
 * 解决平台包名不匹配的问题
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 直接指向已安装的 Windows 二进制文件
const opencodePath = path.join(__dirname, '..', 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe')

const proc = spawn(opencodePath, process.argv.slice(2), {
  stdio: 'inherit',
  shell: false
})

proc.on('exit', (code) => {
  process.exit(code ?? 0)
})

proc.on('error', (err) => {
  console.error('Failed to start opencode:', err)
  process.exit(1)
})
