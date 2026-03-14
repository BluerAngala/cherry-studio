import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'
import type React from 'react'

import MentionModelsButton from './components/MentionModelsButton'
import MentionModelsQuickPanelManager from './components/MentionModelsQuickPanelManager'

/**
 * Mention Assistants Tool (formerly Mention Models Tool)
 *
 * Allows users to mention multiple AI assistants in their messages.
 * Uses @ trigger to open assistant selection panel.
 */
const mentionModelsTool = defineTool({
  key: 'mention_models',
  label: (t) => t('assistants.mention.select.title'),

  visibleInScopes: [TopicType.Chat, 'mini-window'],
  dependencies: {
    state: ['mentionedAssistants'] as const,
    actions: ['setMentionedAssistants', 'onTextChange'] as const
  },

  render: function MentionModelsToolRender(context) {
    const { state, actions, quickPanel, quickPanelController } = context
    const { mentionedAssistants } = state
    const { setMentionedAssistants, onTextChange } = actions

    return (
      <MentionModelsButton
        quickPanel={quickPanel}
        quickPanelController={quickPanelController}
        mentionedAssistants={mentionedAssistants}
        setMentionedAssistants={setMentionedAssistants}
        setText={onTextChange as React.Dispatch<React.SetStateAction<string>>}
      />
    )
  },
  quickPanelManager: MentionModelsQuickPanelManager
})

registerTool(mentionModelsTool)

export default mentionModelsTool
