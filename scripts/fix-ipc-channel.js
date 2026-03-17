#!/usr/bin/env node

/**
 * 修复 IpcChannel.Setting_Get/Setting_Put 引用
 * 将它们替换为正确的 IpcChannel.Config_Get/Config_Set
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/renderer/src/pages/settings/MCPSettings/McpProviderSettings.tsx',
  'src/renderer/src/pages/translate/TranslateHistory.tsx',
  'src/renderer/src/pages/translate/TranslatePage.tsx',
  'src/renderer/src/pages/translate/TranslateSettings.tsx',
  'src/renderer/src/services/BackupService.ts',
  'src/renderer/src/services/ImageStorage.ts',
];

const rootDir = path.resolve(__dirname, '..');

filesToFix.forEach(filePath => {
  const fullPath = path.join(rootDir, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ 文件不存在: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const originalContent = content;

  // 检查是否已经导入了 IpcChannel
  const hasIpcChannelImport = content.includes('IpcChannel') && content.includes('@shared/IpcChannel');

  // 替换 Setting_Get -> Config_Get
  content = content.replace(/IpcChannel\.Setting_Get/g, 'IpcChannel.Config_Get');

  // 替换 Setting_Put -> Config_Set
  content = content.replace(/IpcChannel\.Setting_Put/g, 'IpcChannel.Config_Set');

  // 如果没有导入 IpcChannel，添加导入
  if (!hasIpcChannelImport && content.includes('IpcChannel.')) {
    // 在第一个 import 语句后添加导入
    const importRegex = /^(import .* from .*;?\n)/m;
    const importStatement = `import { IpcChannel } from '@shared/IpcChannel'\n`;

    // 找到最后一个 import 语句的位置
    const lines = content.split('\n');
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        lastImportIndex = i;
      }
    }

    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, importStatement);
      content = lines.join('\n');
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ 已修复: ${filePath}`);
  } else {
    console.log(`⏭️  无需修复: ${filePath}`);
  }
});

console.log('\n完成！');
