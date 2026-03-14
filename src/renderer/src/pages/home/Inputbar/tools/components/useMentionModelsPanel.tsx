import type { QuickPanelListItem } from '@renderer/components/QuickPanel'
import { QuickPanelReservedSymbol } from '@renderer/components/QuickPanel'
import { useAssistants } from '@renderer/hooks/useAssistant'
import type { ToolQuickPanelApi, ToolQuickPanelController } from '@renderer/pages/home/Inputbar/types'
import type { Assistant } from '@renderer/types'
import { Avatar } from 'antd'
import { first, sortBy } from 'lodash'
import { AtSign, CircleX, Plus } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import styled from 'styled-components'

export type MentionTriggerInfo = {
  type: 'input' | 'button'
  position?: number
  originalText?: string
}

interface Params {
  quickPanel: ToolQuickPanelApi
  quickPanelController: ToolQuickPanelController
  mentionedAssistants: Assistant[]
  setMentionedAssistants: React.Dispatch<React.SetStateAction<Assistant[]>>
  setText: React.Dispatch<React.SetStateAction<string>>
}

export const useMentionModelsPanel = (params: Params, role: 'button' | 'manager' = 'button') => {
  const { quickPanel, quickPanelController, mentionedAssistants, setMentionedAssistants, setText } = params
  const { registerRootMenu, registerTrigger } = quickPanel
  const { open, updateList, isVisible, symbol } = quickPanelController
  const { assistants } = useAssistants()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const hasAssistantActionRef = useRef(false)
  const triggerInfoRef = useRef<MentionTriggerInfo | undefined>(undefined)

  const removeAtSymbolAndText = useCallback(
    (currentText: string, caretPosition: number, searchText?: string, fallbackPosition?: number) => {
      const safeCaret = Math.max(0, Math.min(caretPosition ?? 0, currentText.length))

      if (searchText !== undefined) {
        const pattern = '@' + searchText
        const fromIndex = Math.max(0, safeCaret - 1)
        const start = currentText.lastIndexOf(pattern, fromIndex)
        if (start !== -1) {
          const end = start + pattern.length
          return currentText.slice(0, start) + currentText.slice(end)
        }

        if (typeof fallbackPosition === 'number' && currentText[fallbackPosition] === '@') {
          const expected = pattern
          const actual = currentText.slice(fallbackPosition, fallbackPosition + expected.length)
          if (actual === expected) {
            return currentText.slice(0, fallbackPosition) + currentText.slice(fallbackPosition + expected.length)
          }
          return currentText.slice(0, fallbackPosition) + currentText.slice(fallbackPosition + 1)
        }

        return currentText
      }

      const fromIndex = Math.max(0, safeCaret - 1)
      const start = currentText.lastIndexOf('@', fromIndex)
      if (start === -1) {
        if (typeof fallbackPosition === 'number' && currentText[fallbackPosition] === '@') {
          let endPos = fallbackPosition + 1
          while (endPos < currentText.length && !/\s/.test(currentText[endPos])) {
            endPos++
          }
          return currentText.slice(0, fallbackPosition) + currentText.slice(endPos)
        }
        return currentText
      }

      let endPos = start + 1
      while (endPos < currentText.length && !/\s/.test(currentText[endPos])) {
        endPos++
      }
      return currentText.slice(0, start) + currentText.slice(endPos)
    },
    []
  )

  const onMentionAssistant = useCallback(
    (assistant: Assistant) => {
      setMentionedAssistants((prev) => {
        const exists = prev.some((a) => a.id === assistant.id)
        return exists ? prev.filter((a) => a.id !== assistant.id) : [...prev, assistant]
      })
      hasAssistantActionRef.current = true
    },
    [setMentionedAssistants]
  )

  const onClearMentionAssistants = useCallback(() => {
    setMentionedAssistants([])
  }, [setMentionedAssistants])

  // Create a stable key from assistants to avoid infinite loops
  const assistantsKey = useMemo(() => {
    if (!assistants || assistants.length === 0) return 'empty'
    return assistants.map((a) => a.id).join(',')
  }, [assistants])

  const assistantItems = useMemo(() => {
    const items: QuickPanelListItem[] = []

    if (assistants && assistants.length > 0) {
      const sortedAssistants = sortBy(assistants, ['name'])

      sortedAssistants.forEach((assistant) => {
        items.push({
          label: (
            <>
              <AssistantName>{assistant.name}</AssistantName>
              {assistant.description && (
                <span style={{ opacity: 0.6, fontSize: '12px', marginLeft: '8px' }}>| {assistant.description}</span>
              )}
            </>
          ),
          description: assistant.prompt ? (
            <span style={{ opacity: 0.7, fontSize: '11px' }}>{assistant.prompt.slice(0, 100)}...</span>
          ) : undefined,
          icon: (
            <Avatar size={24} style={{ backgroundColor: 'var(--color-primary)' }}>
              {assistant.emoji || first(assistant.name)}
            </Avatar>
          ),
          filterText: assistant.name + (assistant.description || ''),
          action: () => onMentionAssistant(assistant),
          isSelected: mentionedAssistants.some((selected) => selected.id === assistant.id)
        })
      })
    }

    items.push({
      label: t('assistants.add.title') + '...',
      icon: <Plus />,
      action: () => navigate('/assistants'),
      isSelected: false
    })

    if (mentionedAssistants.length > 0) {
      items.unshift({
        label: t('settings.input.clear.all'),
        description: t('assistants.mention.clear.assistants'),
        icon: <CircleX />,
        alwaysVisible: true,
        isSelected: false,
        action: ({ context }) => {
          onClearMentionAssistants()

          if (triggerInfoRef.current?.type === 'input') {
            setText((currentText) => {
              const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement | null
              const caret = textArea ? (textArea.selectionStart ?? currentText.length) : currentText.length
              return removeAtSymbolAndText(currentText, caret, undefined, triggerInfoRef.current?.position)
            })
          }

          context.close()
        }
      })
    }

    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assistantsKey,
    mentionedAssistants,
    navigate,
    onClearMentionAssistants,
    onMentionAssistant,
    removeAtSymbolAndText,
    setText,
    t
  ])

  const openQuickPanel = useCallback(
    (triggerInfo?: MentionTriggerInfo) => {
      hasAssistantActionRef.current = false
      triggerInfoRef.current = triggerInfo

      open({
        title: t('assistants.mention.select.title'),
        list: assistantItems,
        symbol: QuickPanelReservedSymbol.MentionAssistants,
        onClose: (context) => {
          if (triggerInfo?.type === 'input' && !hasAssistantActionRef.current) {
            const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement | null
            const caret = textArea ? (textArea.selectionStart ?? 0) : 0
            const newText = removeAtSymbolAndText(
              context.searchText || '',
              caret,
              context.searchText || '',
              triggerInfo.position
            )
            setText(newText)
          }
        }
      })
    },
    [assistantItems, open, removeAtSymbolAndText, setText, t]
  )

  const handleOpenQuickPanel = useCallback(() => {
    openQuickPanel({ type: 'button' })
  }, [openQuickPanel])

  // Update list when items change while panel is open
  useEffect(() => {
    if (isVisible && symbol === QuickPanelReservedSymbol.MentionAssistants) {
      updateList(assistantItems)
    }
  }, [isVisible, assistantItems, role, symbol, updateList])

  useEffect(() => {
    if (role !== 'manager') return
    const disposeRootMenu = registerRootMenu([
      {
        label: t('assistants.mention.select.title'),
        description: '',
        icon: React.createElement(AtSign),
        isMenu: true,
        action: () => openQuickPanel({ type: 'button' })
      }
    ])

    const disposeTrigger = registerTrigger(QuickPanelReservedSymbol.MentionAssistants, (payload) => {
      const trigger = (payload || {}) as MentionTriggerInfo
      openQuickPanel(trigger)
    })

    return () => {
      disposeRootMenu()
      disposeTrigger()
    }
  }, [openQuickPanel, registerRootMenu, registerTrigger, role, t])

  return {
    handleOpenQuickPanel
  }
}

const AssistantName = styled.span`
  font-weight: 500;
`
