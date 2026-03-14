import { ActionIconButton } from '@renderer/components/Buttons'
import type { ToolQuickPanelApi, ToolQuickPanelController } from '@renderer/pages/home/Inputbar/types'
import type { Assistant } from '@renderer/types'
import { Tooltip } from 'antd'
import { AtSign } from 'lucide-react'
import type { FC } from 'react'
import type React from 'react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { useMentionModelsPanel } from './useMentionModelsPanel'

interface Props {
  quickPanel: ToolQuickPanelApi
  quickPanelController: ToolQuickPanelController
  mentionedAssistants: Assistant[]
  setMentionedAssistants: React.Dispatch<React.SetStateAction<Assistant[]>>
  setText: React.Dispatch<React.SetStateAction<string>>
}

const MentionModelsButton: FC<Props> = ({
  quickPanel,
  quickPanelController,
  mentionedAssistants,
  setMentionedAssistants,
  setText
}) => {
  const { t } = useTranslation()

  const { handleOpenQuickPanel } = useMentionModelsPanel(
    {
      quickPanel,
      quickPanelController,
      mentionedAssistants,
      setMentionedAssistants,
      setText
    },
    'button'
  )

  return (
    <Tooltip placement="top" title={t('assistants.mention.select.title')} mouseLeaveDelay={0} arrow>
      <ActionIconButton
        onClick={handleOpenQuickPanel}
        active={mentionedAssistants.length > 0}
        aria-label={t('assistants.mention.select.title')}>
        <AtSign size={18} />
      </ActionIconButton>
    </Tooltip>
  )
}

export default memo(MentionModelsButton)
