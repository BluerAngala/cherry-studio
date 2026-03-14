import { DraggableList } from '@renderer/components/DraggableList'
import type { Assistant } from '@renderer/types'
import type { FC } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import type { UnifiedItem } from '../hooks/useUnifiedItems'
import AgentItem from './AgentItem'
import AssistantItem from './AssistantItem'
import { TagGroup } from './TagGroup'

interface GroupedItems {
  tag: string
  items: UnifiedItem[]
}

interface UnifiedTagGroupsProps {
  groupedItems: GroupedItems[]
  activeAssistantId: string
  activeAgentId: string | null
  collapsedTags: Record<string, boolean>
  onGroupReorder: (tag: string, newList: UnifiedItem[]) => void
  onDragStart: () => void
  onDragEnd: () => void
  onToggleTagCollapse: (tag: string) => void
  onAssistantSwitch: (assistant: Assistant) => void
  onAssistantDelete: (assistant: Assistant) => void
  onAgentDelete: (agentId: string) => void
  onAgentPress: (agentId: string) => void
  addPreset: (assistant: Assistant) => void
  copyAssistant: (assistant: Assistant) => void
  onCreateDefaultAssistant: () => void
  sortByPinyinAsc: () => void
  sortByPinyinDesc: () => void
}

export const UnifiedTagGroups: FC<UnifiedTagGroupsProps> = (props) => {
  const {
    groupedItems,
    activeAssistantId,
    activeAgentId,
    collapsedTags,
    onGroupReorder,
    onDragStart,
    onDragEnd,
    onToggleTagCollapse,
    onAssistantSwitch,
    onAssistantDelete,
    onAgentDelete,
    onAgentPress,
    addPreset,
    copyAssistant,
    onCreateDefaultAssistant,
    sortByPinyinAsc,
    sortByPinyinDesc
  } = props

  const { t } = useTranslation()

  const renderUnifiedItem = useCallback(
    (item: UnifiedItem) => {
      if (item.type === 'agent') {
        return (
          <AgentItem
            key={`agent-${item.data.id}`}
            agent={item.data}
            isActive={item.data.id === activeAgentId}
            onDelete={() => onAgentDelete(item.data.id)}
            onPress={() => onAgentPress(item.data.id)}
          />
        )
      } else {
        return (
          <AssistantItem
            key={`assistant-${item.data.id}`}
            assistant={item.data}
            isActive={item.data.id === activeAssistantId}
            onSwitch={onAssistantSwitch}
            onDelete={onAssistantDelete}
            addPreset={addPreset}
            copyAssistant={copyAssistant}
            onCreateDefaultAssistant={onCreateDefaultAssistant}
            sortByPinyinAsc={sortByPinyinAsc}
            sortByPinyinDesc={sortByPinyinDesc}
          />
        )
      }
    },
    [
      activeAgentId,
      activeAssistantId,
      onAssistantSwitch,
      onAssistantDelete,
      onAgentDelete,
      onAgentPress,
      addPreset,
      copyAssistant,
      onCreateDefaultAssistant,
      sortByPinyinAsc,
      sortByPinyinDesc
    ]
  )

  return (
    <div>
      {groupedItems.map((group) => (
        <TagGroup
          key={group.tag}
          tag={group.tag}
          count={group.items.length}
          isCollapsed={collapsedTags[group.tag]}
          onToggle={onToggleTagCollapse}
          showTitle={groupedItems.length > 1 || group.tag !== t('assistants.tags.untagged')}>
          <DraggableList
            list={group.items}
            itemKey={(item) => `${item.type}-${item.data.id}`}
            onUpdate={(newList) => onGroupReorder(group.tag, newList)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}>
            {renderUnifiedItem}
          </DraggableList>
        </TagGroup>
      ))}
    </div>
  )
}
