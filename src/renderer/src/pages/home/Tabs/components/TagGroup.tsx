import { DownOutlined, RightOutlined } from '@ant-design/icons'
import { cn } from '@renderer/utils'
import type { FC, ReactNode } from 'react'

interface TagGroupProps {
  tag: string
  isCollapsed: boolean
  onToggle: (tag: string) => void
  showTitle?: boolean
  children: ReactNode
  count?: number
}

export const TagGroup: FC<TagGroupProps> = ({ tag, isCollapsed, onToggle, showTitle = true, children, count }) => {
  return (
    <TagsContainer>
      {showTitle && (
        <GroupTitle onClick={() => onToggle(tag)}>
          <GroupTitleName>
            {isCollapsed ? (
              <RightOutlined style={{ fontSize: '10px', marginRight: '5px' }} />
            ) : (
              <DownOutlined style={{ fontSize: '10px', marginRight: '5px' }} />
            )}
            {tag}
            {count !== undefined && <GroupCount>({count})</GroupCount>}
          </GroupTitleName>
          <GroupTitleDivider />
        </GroupTitle>
      )}
      {!isCollapsed && <div>{children}</div>}
    </TagsContainer>
  )
}

const TagsContainer: FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div className={cn('flex flex-col gap-2')} {...props}>
    {children}
  </div>
)

const GroupTitle: FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div
    className={cn(
      'my-1 flex h-6 cursor-pointer flex-row items-center justify-between font-medium text-(--color-text-2) text-xs'
    )}
    {...props}>
    {children}
  </div>
)

const GroupTitleName: FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...props }) => (
  <div
    className={cn(
      'mr-1 box-border flex max-w-[50%] flex-row items-center truncate px-1 text-(--color-text) text-[13px] leading-6'
    )}
    {...props}>
    {children}
  </div>
)

const GroupCount: FC<React.HTMLAttributes<HTMLDivElement>> = (props) => (
  <div className={cn('ml-1 text-(--color-text-2) text-[11px]')} {...props} />
)

const GroupTitleDivider: FC<React.HTMLAttributes<HTMLDivElement>> = (props) => (
  <div className={cn('flex-1 border-(--color-border) border-t')} {...props} />
)
