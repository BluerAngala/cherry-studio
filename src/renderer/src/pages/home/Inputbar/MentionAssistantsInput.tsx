import HorizontalScrollContainer from '@renderer/components/HorizontalScrollContainer'
import CustomTag from '@renderer/components/Tags/CustomTag'
import type { Assistant } from '@renderer/types'
import { first } from 'lodash'
import type { FC } from 'react'
import styled from 'styled-components'

const MentionAssistantsInput: FC<{
  selectedAssistants: Assistant[]
  onRemoveAssistant: (assistant: Assistant) => void
}> = ({ selectedAssistants, onRemoveAssistant }) => {
  return (
    <Container>
      <HorizontalScrollContainer dependencies={[selectedAssistants]} expandable>
        {selectedAssistants.map((assistant) => (
          <CustomTag
            icon={<span style={{ marginRight: 4 }}>{assistant.emoji || first(assistant.name)}</span>}
            color="#1677ff"
            key={assistant.id}
            closable
            onClose={() => onRemoveAssistant(assistant)}>
            {assistant.name}
          </CustomTag>
        ))}
      </HorizontalScrollContainer>
    </Container>
  )
}

const Container = styled.div`
  width: 100%;
  padding: 5px 15px 5px 15px;
`

export default MentionAssistantsInput
