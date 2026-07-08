'use client'

import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { UIMessage } from 'ai'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { ComponentProps, HTMLAttributes, ReactElement, ReactNode } from 'react'
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage['role']
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      'group flex w-full max-w-[95%] flex-col gap-2',
      from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant',
      className,
    )}
    {...props}
  />
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      'is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm',
      'group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground',
      'group-[.is-assistant]:text-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export type MessageActionsProps = ComponentProps<'div'>

export const MessageActions = ({ className, children, ...props }: MessageActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
)

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = 'ghost',
  size = 'icon-sm',
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return button
}

interface MessageBranchContextType {
  currentBranch: number
  totalBranches: number
  goToPrevious: () => void
  goToNext: () => void
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(null)

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext)

  if (!context) {
    throw new Error('MessageBranch components must be used within MessageBranch')
  }

  return context
}

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch)
      onBranchChange?.(newBranch)
    },
    [onBranchChange],
  )

  const goToPrevious = useCallback(() => {
    const newBranch = currentBranch > 0 ? currentBranch - 1 : branches.length - 1
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const goToNext = useCallback(() => {
    const newBranch = currentBranch < branches.length - 1 ? currentBranch + 1 : 0
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious],
  )

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div className={cn('grid w-full gap-2 [&>div]:pb-0', className)} {...props} />
    </MessageBranchContext.Provider>
  )
}

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>

export const MessageBranchContent = ({ children, ...props }: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch()
  const childrenArray = useMemo(() => (Array.isArray(children) ? children : [children]), [children])

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray)
    }
  }, [childrenArray, branches, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        'grid gap-2 overflow-hidden [&>div]:pb-0',
        index === currentBranch ? 'block' : 'hidden',
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ))
}

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>

export const MessageBranchSelector = ({ className, ...props }: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch()

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null
  }

  return (
    <ButtonGroup
      className={cn(
        '[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md',
        className,
      )}
      orientation="horizontal"
      {...props}
    />
  )
}

export type MessageBranchPreviousProps = ComponentProps<typeof Button>

export const MessageBranchPrevious = ({ children, ...props }: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export const MessageBranchNext = ({ children, ...props }: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  )
}

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>

export const MessageBranchPage = ({ className, ...props }: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch()

  return (
    <ButtonGroupText
      className={cn('border-none bg-transparent text-muted-foreground shadow-none', className)}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  )
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function normalizeSuggestionText(text: string) {
  return text
    .replace(/\*\*/g, '')
    .trim()
    .replace(/[？?。；;：:，,]\s*$/, '')
}

const dataImageUrlPattern = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g
const bareImageBase64Pattern =
  /(^|[^A-Za-z0-9+/=])((?:iVBORw0KGgo|\/9j\/|R0lGODlh|R0lGODdh|UklGR)[A-Za-z0-9+/=\r\n]{120,})/g

export function renderableImageMarkdown(markdown: string) {
  return markdown
    .replace(dataImageUrlPattern, (match, offset, source: string) => {
      const before = source.slice(Math.max(0, offset - 8), offset)
      if (before.endsWith('](') || before.endsWith('src="') || before.endsWith("src='")) {
        return match.replace(/\s+/g, '')
      }
      return `![图片预览](${match.replace(/\s+/g, '')})`
    })
    .replace(bareImageBase64Pattern, (_fullMatch, prefix: string, payload: string) => {
      const compactPayload = payload.replace(/\s+/g, '')
      const mediaType = compactPayload.startsWith('/9j/')
        ? 'image/jpeg'
        : compactPayload.startsWith('R0lG')
          ? 'image/gif'
          : compactPayload.startsWith('UklGR')
            ? 'image/webp'
            : 'image/png'
      return `${prefix}![图片预览](data:${mediaType};base64,${compactPayload})`
    })
}

function messageUrlTransform(url: string) {
  if (url.startsWith('data:image/') || url.startsWith('blob:')) return url
  return defaultUrlTransform(url)
}

export type MessageResponseProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: string
  clickableSuggestions?: string[]
  onSuggestionClick?: (suggestion: string) => void
  suggestionDisabled?: boolean
}

export const MessageResponse = memo(
  ({
    children,
    className,
    clickableSuggestions,
    onSuggestionClick,
    suggestionDisabled,
    ...props
  }: MessageResponseProps) => {
    const suggestionSet = new Set(clickableSuggestions?.map(normalizeSuggestionText) ?? [])
    const renderableChildren = renderableImageMarkdown(children)

    return (
      <div
        className={cn(
          'size-full min-w-0 max-w-none break-words leading-7',
          '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
          '[&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold',
          '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold',
          '[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold',
          '[&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
          '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
          className,
        )}
        {...props}
      >
        <ReactMarkdown
          components={{
            li({ children: listItemChildren, ...liProps }) {
              const suggestion = normalizeSuggestionText(nodeText(listItemChildren))
              if (!suggestionSet.has(suggestion) || !onSuggestionClick) {
                return <li {...liProps}>{listItemChildren}</li>
              }
              return (
                <li {...liProps}>
                  <button
                    type="button"
                    disabled={suggestionDisabled}
                    onClick={() => onSuggestionClick(suggestion)}
                    className="rounded-md px-1 text-left text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:bg-primary/10 hover:decoration-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {listItemChildren}
                  </button>
                </li>
              )
            },
            img({ src, alt }) {
              if (!src) return null
              const safeSrc = String(src)
              const isInlineImage = safeSrc.startsWith('data:image/') || safeSrc.startsWith('blob:')
              return (
                <a
                  href={safeSrc}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    'my-2 inline-block overflow-hidden rounded-lg border border-border bg-muted/40 p-1 no-underline',
                    !isInlineImage && 'bg-transparent',
                  )}
                  title="点击查看原图"
                >
                  <img
                    src={safeSrc}
                    alt={alt ?? '图片预览'}
                    className="max-h-80 max-w-full rounded-md object-contain"
                    loading="lazy"
                  />
                </a>
              )
            },
          }}
          remarkPlugins={[remarkGfm]}
          urlTransform={messageUrlTransform}
        >
          {renderableChildren}
        </ReactMarkdown>
      </div>
    )
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.clickableSuggestions === nextProps.clickableSuggestions &&
    prevProps.suggestionDisabled === nextProps.suggestionDisabled,
)

MessageResponse.displayName = 'MessageResponse'

export type MessageToolbarProps = ComponentProps<'div'>

export const MessageToolbar = ({ className, children, ...props }: MessageToolbarProps) => (
  <div className={cn('mt-4 flex w-full items-center justify-between gap-4', className)} {...props}>
    {children}
  </div>
)
