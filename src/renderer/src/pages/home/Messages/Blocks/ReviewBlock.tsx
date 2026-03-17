import {
  AuditOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  DownOutlined,
  EyeOutlined,
  LikeFilled,
  LikeOutlined,
  LoadingOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  UpOutlined
} from '@ant-design/icons'
import { loggerService } from '@logger'
import {
  getRegenerationHistory,
  incrementRegenerationCount,
  shouldAllowRegeneration
} from '@renderer/services/messageReview/RegenerateService'
import {
  removeReviewBlock,
  setReviewRegenerating,
  updateLikedSuggestions,
  updateReviewBlockFolded,
  updateReviewFeedback
} from '@renderer/services/messageReview/ReviewTriggerService'
import { buildRegenerationPrompt, compareReviewResults, getScoreLevel } from '@renderer/services/ResponseReviewService'
import store from '@renderer/store'
import type { Message, ReviewMessageBlock } from '@renderer/types/newMessage'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'
import { Alert, Button, Checkbox, Input, Progress, Spin, Tag, Tooltip } from 'antd'
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

const logger = loggerService.withContext('ReviewBlock')

interface ReviewBlockProps {
  block: ReviewMessageBlock
  message: Message
}

const ReviewBlock: React.FC<ReviewBlockProps> = ({ block, message }) => {
  const {
    reviewResult,
    userFeedback,
    isRegenerating,
    isFolded,
    likedSuggestions: savedLikedSuggestions,
    isReviewing
  } = block
  const [feedback, setFeedback] = useState(userFeedback || '')
  const [likedSuggestions, setLikedSuggestions] = useState<Set<number>>(new Set(savedLikedSuggestions || []))
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())
  const [isExpanded, setIsExpanded] = useState(!isFolded)
  const [regenerationCheck, setRegenerationCheck] = useState<{
    allowed: boolean
    reason?: string
  }>({ allowed: true })
  const [previousReview, setPreviousReview] = useState<typeof reviewResult | null>(null)

  // 检查重新生成限制和获取历史记录
  useEffect(() => {
    const check = shouldAllowRegeneration(message.id)
    setRegenerationCheck(check)

    // 获取之前的审查结果用于对比
    const history = getRegenerationHistory(message.id)
    if (history) {
      setPreviousReview(history)
    }
  }, [message.id])

  // 渲染审查等待状态
  if (isReviewing) {
    return (
      <ReviewingContainer>
        <ReviewingState>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
          <ReviewingText>
            <ReviewingTitle>正在审查回答质量...</ReviewingTitle>
            <ReviewingDesc>AI 正在分析回答的格式、完整性和逻辑性</ReviewingDesc>
          </ReviewingText>
        </ReviewingState>
      </ReviewingContainer>
    )
  }

  if (!reviewResult) {
    return null
  }

  const {
    overallScore,
    formatScore,
    completenessScore,
    coherenceScore,
    comment,
    passed,
    suggestions,
    reviewModel,
    reviewTime
  } = reviewResult

  const scoreLevel = getScoreLevel(overallScore)

  // 获取用户问题
  const getUserQuery = (): string => {
    const state = store.getState()
    const userMessageId = message.askId
    if (!userMessageId) return ''
    const userMessage = state.messages.entities[userMessageId]
    return userMessage ? getMainTextContent(userMessage) : ''
  }

  // 处理重新生成
  const handleRegenerate = async () => {
    // 检查是否允许重新生成
    const check = shouldAllowRegeneration(message.id)
    if (!check.allowed) {
      setRegenerationCheck(check)
      return
    }

    // 检查是否选中了建议
    if (selectedSuggestions.size === 0 && !feedback.trim()) {
      return
    }

    const userQuery = getUserQuery()
    if (!userQuery) {
      logger.warn('Cannot regenerate: user query not found')
      return
    }

    // 增加重新生成次数
    incrementRegenerationCount(message.id)

    // 更新反馈
    updateReviewFeedback(block.id, feedback)
    setReviewRegenerating(block.id)

    // 构建选中的建议列表
    const selectedSuggestionsList = suggestions.filter((_, index) => selectedSuggestions.has(index))

    // 构建重新生成的提示词
    const regenerationPrompt = buildRegenerationPrompt(
      userQuery,
      { ...reviewResult, suggestions: selectedSuggestionsList },
      feedback
    )

    // 触发重新生成事件
    window.dispatchEvent(
      new CustomEvent('cherry:regenerate-message', {
        detail: {
          messageId: message.id,
          topicId: message.topicId,
          assistantId: message.assistantId,
          regenerationPrompt,
          originalQuery: userQuery,
          feedback,
          reviewResult: {
            ...reviewResult,
            suggestions: selectedSuggestionsList
          }
        }
      })
    )

    logger.info('Regeneration triggered', {
      messageId: message.id,
      selectedSuggestions: selectedSuggestionsList
    })
  }

  // 切换建议选中状态
  const toggleSuggestionSelection = (index: number) => {
    setSelectedSuggestions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedSuggestions.size === suggestions.length) {
      setSelectedSuggestions(new Set())
    } else {
      setSelectedSuggestions(new Set(suggestions.map((_, i) => i)))
    }
  }

  // 关闭审查块
  const handleDismiss = () => {
    removeReviewBlock(message.id)
  }

  // 切换折叠状态
  const toggleFold = () => {
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    updateReviewBlockFolded(block.id, !newExpanded)
  }

  // 点赞/取消点赞建议
  const toggleLikeSuggestion = (index: number) => {
    setLikedSuggestions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      // 持久化到 store
      updateLikedSuggestions(block.id, Array.from(newSet))
      return newSet
    })
  }

  // 渲染质量对比信息
  const renderQualityComparison = () => {
    if (!previousReview) return null

    const comparison = compareReviewResults(previousReview, reviewResult)

    return (
      <ComparisonAlert
        $improved={comparison.improved}
        message={comparison.summary}
        description={`评分变化: ${comparison.scoreChange > 0 ? '+' : ''}${comparison.scoreChange} 分`}
        type={comparison.improved ? 'success' : comparison.scoreChange === 0 ? 'info' : 'warning'}
        showIcon
      />
    )
  }

  // 渲染折叠状态的内容
  const renderCollapsedContent = () => (
    <CollapsedContent onClick={toggleFold}>
      <ScoreSummary>
        <Progress
          type="circle"
          percent={overallScore}
          size={40}
          strokeColor={scoreLevel.color}
          format={(percent) => <CollapsedScore style={{ color: scoreLevel.color }}>{percent}</CollapsedScore>}
        />
        <ScoreTag color={scoreLevel.color} size="small">
          {scoreLevel.label}
        </ScoreTag>
        {passed ? (
          <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />
        ) : (
          <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 16 }} />
        )}
      </ScoreSummary>
      <ExpandHint>
        <EyeOutlined /> 查看详情
      </ExpandHint>
    </CollapsedContent>
  )

  // 渲染展开状态的内容
  const renderExpandedContent = () => (
    <>
      <ScoreSection>
        <OverallScore>
          <Progress
            type="circle"
            percent={overallScore}
            size={64}
            strokeColor={scoreLevel.color}
            format={(percent) => <span style={{ color: scoreLevel.color, fontWeight: 'bold' }}>{percent}</span>}
          />
          <ScoreLabel>综合评分</ScoreLabel>
        </OverallScore>

        <DetailScores>
          <ScoreItem>
            <ScoreLabel>
              <Tooltip title="回答是否符合助手系统提示词的角色设定和输出要求">符合提示词</Tooltip>
            </ScoreLabel>
            <Progress
              percent={coherenceScore}
              size="small"
              strokeColor={getScoreLevel(coherenceScore).color}
              showInfo={false}
            />
            <ScoreValue>{coherenceScore}</ScoreValue>
          </ScoreItem>
          <ScoreItem>
            <ScoreLabel>
              <Tooltip title="是否完整回答了问题，有无遗漏关键信息">内容完整性</Tooltip>
            </ScoreLabel>
            <Progress
              percent={completenessScore}
              size="small"
              strokeColor={getScoreLevel(completenessScore).color}
              showInfo={false}
            />
            <ScoreValue>{completenessScore}</ScoreValue>
          </ScoreItem>
          <ScoreItem>
            <ScoreLabel>
              <Tooltip title="格式是否规范，小错误不影响">格式规范</Tooltip>
            </ScoreLabel>
            <Progress
              percent={formatScore}
              size="small"
              strokeColor={getScoreLevel(formatScore).color}
              showInfo={false}
            />
            <ScoreValue>{formatScore}</ScoreValue>
          </ScoreItem>
        </DetailScores>
      </ScoreSection>

      <CommentSection>
        <CommentLabel>审查评语：</CommentLabel>
        <CommentText>{comment}</CommentText>
      </CommentSection>

      {suggestions.length > 0 && (
        <SuggestionsSection>
          <SuggestionsHeader>
            <SuggestionsLabel>改进建议：</SuggestionsLabel>
            <HeaderActions>
              <SelectAllButton onClick={toggleSelectAll}>
                {selectedSuggestions.size === suggestions.length ? '取消全选' : '全选'}
              </SelectAllButton>
              <RegenerateButton
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleRegenerate}
                size="small"
                disabled={selectedSuggestions.size === 0 && !feedback.trim()}>
                重新生成
              </RegenerateButton>
              <Tooltip
                title={
                  <div style={{ maxWidth: 300 }}>
                    <p>AI 将基于选中的改进建议重新生成回答</p>
                    <p>原回答仍保留在历史记录中，可随时对比查看</p>
                    <p>最多可重新生成 3 次</p>
                  </div>
                }>
                <QuestionCircleOutlined style={{ color: 'var(--color-text-3)', cursor: 'pointer' }} />
              </Tooltip>
            </HeaderActions>
          </SuggestionsHeader>
          <SuggestionsList>
            {suggestions.map((suggestion, index) => (
              <SuggestionItem key={index} $selected={selectedSuggestions.has(index)}>
                <SuggestionCheckbox
                  checked={selectedSuggestions.has(index)}
                  onChange={() => toggleSuggestionSelection(index)}
                />
                <SuggestionContent>{suggestion}</SuggestionContent>
                <SuggestionActions>
                  <Tooltip title={likedSuggestions.has(index) ? '已认可' : '认可此建议'}>
                    <LikeButton $liked={likedSuggestions.has(index)} onClick={() => toggleLikeSuggestion(index)}>
                      {likedSuggestions.has(index) ? <LikeFilled /> : <LikeOutlined />}
                    </LikeButton>
                  </Tooltip>
                </SuggestionActions>
              </SuggestionItem>
            ))}
            {/* 用户自定义输入项 */}
            <SuggestionItem $selected={!!feedback} style={{ borderStyle: 'dashed' }}>
              <SuggestionCheckbox checked={!!feedback} onChange={() => {}} disabled />
              <CustomInput
                placeholder="其他改进建议（可选）..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                size="small"
                bordered={false}
              />
            </SuggestionItem>
          </SuggestionsList>
        </SuggestionsSection>
      )}

      {/* 质量对比信息 */}
      {renderQualityComparison()}

      {/* 重新生成限制提示 */}
      {!regenerationCheck.allowed && (
        <Alert
          message="重新生成限制"
          description={regenerationCheck.reason}
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}

      {isRegenerating && (
        <RegeneratingIndicator>
          <ReloadOutlined spin /> 正在重新生成...
        </RegeneratingIndicator>
      )}

      <FoldHint onClick={toggleFold}>
        <UpOutlined /> 收起审查结果
      </FoldHint>
    </>
  )

  return (
    <ReviewContainer $passed={passed} $isFolded={!isExpanded}>
      <ReviewHeader>
        <ReviewTitle onClick={toggleFold} style={{ cursor: 'pointer' }}>
          <AuditOutlined style={{ color: scoreLevel.color }} />
          AI 质量审查
          {passed ? (
            <CheckCircleFilled style={{ color: '#52c41a', marginLeft: 8 }} />
          ) : (
            <CloseCircleFilled style={{ color: '#ff4d4f', marginLeft: 8 }} />
          )}
        </ReviewTitle>
        {!isExpanded && (
          <ScoreTag color={scoreLevel.color} size="small">
            {scoreLevel.label}
          </ScoreTag>
        )}
        {reviewModel && isExpanded && (
          <ModelInfo>
            由 {reviewModel} 审查 {reviewTime && `(${Math.round(reviewTime / 1000)}s)`}
          </ModelInfo>
        )}
        <HeaderActions>
          {isExpanded ? (
            <Tooltip title="收起">
              <FoldButton onClick={toggleFold} size="small" type="text" icon={<UpOutlined />} />
            </Tooltip>
          ) : (
            <Tooltip title="展开">
              <FoldButton onClick={toggleFold} size="small" type="text" icon={<DownOutlined />} />
            </Tooltip>
          )}
          <Tooltip title="关闭">
            <DismissButton onClick={handleDismiss} size="small" type="text" icon={<CloseCircleFilled />} />
          </Tooltip>
        </HeaderActions>
      </ReviewHeader>

      {isExpanded ? renderExpandedContent() : renderCollapsedContent()}
    </ReviewContainer>
  )
}

export default ReviewBlock

const ReviewContainer = styled.div<{ $passed: boolean; $isFolded: boolean }>`
  margin: 12px 0;
  padding: ${(props) => (props.$isFolded ? '12px 16px' : '16px')};
  border-radius: 12px;
  background: ${(props) => (props.$passed ? 'rgba(82, 196, 26, 0.05)' : 'rgba(255, 77, 79, 0.05)')};
  border: 1px solid
    ${(props) => (props.$passed ? 'rgba(82, 196, 26, 0.2)' : 'rgba(255, 77, 79, 0.2)')};
  transition: all 0.3s ease;
`

const ReviewHeader = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
`

const ReviewTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
`

const FoldButton = styled(Button)`
  color: var(--color-text-3);
  &:hover {
    color: var(--color-text);
  }
`

const DismissButton = styled(Button)`
  color: var(--color-text-3);
  &:hover {
    color: #ff4d4f;
  }
`

const ScoreTag = styled(Tag)<{ size?: string }>`
  font-size: ${(props) => (props.size === 'small' ? '11px' : '12px')};
  font-weight: 500;
`

const ModelInfo = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
`

// 折叠状态样式
const CollapsedContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
`

const ScoreSummary = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const CollapsedScore = styled.span`
  font-size: 14px;
  font-weight: bold;
`

const ExpandHint = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
  display: flex;
  align-items: center;
  gap: 4px;
`

// 展开状态样式
const ScoreSection = styled.div`
  display: flex;
  gap: 24px;
  margin: 16px 0;
  align-items: center;

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const OverallScore = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`

const ScoreLabel = styled.span`
  font-size: 12px;
  color: var(--color-text-2);
`

const DetailScores = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 200px;
`

const ScoreItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  .ant-progress {
    flex: 1;
    margin: 0;
  }
`

const ScoreValue = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  min-width: 28px;
  text-align: right;
`

const CommentSection = styled.div`
  margin-bottom: 12px;
`

const CommentLabel = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-2);
  margin-bottom: 4px;
`

const CommentText = styled.div`
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;
`

const SuggestionsSection = styled.div`
  margin-bottom: 16px;
`

const SuggestionsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

const SuggestionsLabel = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-2);
`

const SelectAllButton = styled.button`
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(24, 144, 255, 0.1);
  }
`

const RegenerateButton = styled(Button)`
  margin: 0 8px;
`

const SuggestionsList = styled.ul`
  margin: 0;
  padding-left: 0;
  list-style: none;
`

const SuggestionItem = styled.li<{ $selected: boolean }>`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.6;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: ${(props) => (props.$selected ? 'rgba(24, 144, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)')};
  border-radius: 8px;
  border-left: 3px solid
    ${(props) => (props.$selected ? 'var(--color-primary)' : 'var(--color-warning, #faad14)')};
  transition: all 0.2s ease;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${(props) => (props.$selected ? 'rgba(24, 144, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)')};
  }
`

const SuggestionCheckbox = styled(Checkbox)`
  margin-top: 2px;
`

const SuggestionContent = styled.span`
  flex: 1;
`

const SuggestionActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const LikeButton = styled.button<{ $liked: boolean }>`
  background: none;
  border: none;
  color: ${(props) => (props.$liked ? '#1890ff' : 'var(--color-text-3)')};
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;

  &:hover {
    color: #1890ff;
    background: rgba(24, 144, 255, 0.1);
  }
`

const CustomInput = styled(Input)`
  flex: 1;
  background: transparent;
  padding: 0;

  &::placeholder {
    color: var(--color-text-3);
  }
`

const ComparisonAlert = styled(Alert)<{ $improved: boolean }>`
  margin-bottom: 12px;
  .ant-alert-message {
    font-weight: 500;
  }
`

const RegeneratingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(24, 144, 255, 0.05);
  border-radius: 8px;
  color: var(--color-primary);
  font-size: 14px;
`

const FoldHint = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-3);
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: var(--color-text);
  }
`

// 审查等待状态容器
const ReviewingContainer = styled.div`
  margin: 12px 0;
  padding: 16px;
  border-radius: 12px;
  background: rgba(24, 144, 255, 0.05);
  border: 1px solid rgba(24, 144, 255, 0.2);
`

// 审查等待状态样式
const ReviewingState = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: rgba(24, 144, 255, 0.03);
  border-radius: 12px;
  border: 1px dashed var(--color-border);
`

const ReviewingText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const ReviewingTitle = styled.div`
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
`

const ReviewingDesc = styled.div`
  font-size: 13px;
  color: var(--color-text-3);
`
