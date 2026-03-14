import type { ToolActionKey, ToolRenderContext, ToolStateKey } from '@renderer/pages/home/Inputbar/types'
import type { Assistant } from '@renderer/types'
import type React from 'react'

import { useMentionModelsPanel } from './useMentionModelsPanel'

interface ManagerProps {
  context: ToolRenderContext<readonly ToolStateKey[], readonly ToolActionKey[]>
}

const MentionModelsQuickPanelManager = ({ context }: ManagerProps) => {
  const {
    quickPanel,
    quickPanelController,
    state: { mentionedAssistants },
    actions: { setMentionedAssistants, onTextChange }
  } = context

  useMentionModelsPanel(
    {
      quickPanel,
      quickPanelController,
      mentionedAssistants: mentionedAssistants as Assistant[],
      setMentionedAssistants: setMentionedAssistants as React.Dispatch<React.SetStateAction<Assistant[]>>,
      setText: onTextChange as React.Dispatch<React.SetStateAction<string>>
    },
    'manager'
  )

  return null
}

export default MentionModelsQuickPanelManager
