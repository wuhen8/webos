import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react'

export interface FmEditApi {
  focus: () => void
  getElement: () => HTMLTextAreaElement | null
}

export interface FmEditProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  theme?: 'vs' | 'vs-dark'
  fontSize?: number
  wordWrap?: boolean
  readOnly?: boolean
  lineNumbers?: boolean
  className?: string
  style?: React.CSSProperties
  onSave?: () => void
  onBlur?: () => void
  onMount?: (api: FmEditApi) => void
}

const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace"

const FmEdit = forwardRef<FmEditApi, FmEditProps>(function FmEdit(
  {
    value,
    onChange,
    language,
    theme = 'vs',
    fontSize = 14,
    wordWrap = true,
    readOnly = false,
    lineNumbers = true,
    className,
    style,
    onSave,
    onBlur,
    onMount,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNoRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  const api: FmEditApi = {
    focus: () => textareaRef.current?.focus(),
    getElement: () => textareaRef.current,
  }

  useImperativeHandle(ref, () => api)

  useEffect(() => {
    onMount?.(api)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback(() => {
    if (lineNoRef.current && textareaRef.current) {
      lineNoRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  // Handle keydown for Ctrl+S and Tab
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        onSave?.()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const ta = e.currentTarget
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const val = ta.value
        const newVal = val.substring(0, start) + '  ' + val.substring(end)
        onChange?.(newVal)
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2
        })
      }
    },
    [onSave, onChange],
  )

  const isDark = theme === 'vs-dark'
  const lineCount = value.split('\n').length

  const bgColor = isDark ? '#1e1e1e' : '#ffffff'
  const textColor = isDark ? '#d4d4d4' : '#1e1e1e'
  const lineNoColor = isDark ? '#858585' : '#999999'
  const lineNoBg = isDark ? '#1e1e1e' : '#f8f8f8'
  const borderColor = isDark ? '#333333' : '#e2e8f0'
  const focusBorderColor = isDark ? '#007acc' : '#3b82f6'

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        position: 'relative',
        border: `1px solid ${isFocused ? focusBorderColor : borderColor}`,
        borderRadius: '4px',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        ...style,
      }}
    >
      {/* Line numbers */}
      {lineNumbers && (
        <div
          ref={lineNoRef}
          style={{
            width: `${Math.max(3, String(lineCount).length) * 0.6 + 1.2}em`,
            minWidth: '2.8em',
            backgroundColor: lineNoBg,
            color: lineNoColor,
            fontFamily: FONT_FAMILY,
            fontSize,
            lineHeight: '1.5',
            padding: '12px 0',
            textAlign: 'right',
            userSelect: 'none',
            overflow: 'hidden',
            flexShrink: 0,
            borderRight: `1px solid ${borderColor}`,
          }}
          aria-hidden="true"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ paddingRight: '8px', height: `${fontSize * 1.5}px` }}>
              {i + 1}
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false)
          onBlur?.()
        }}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        style={{
          flex: 1,
          backgroundColor: bgColor,
          color: textColor,
          fontFamily: FONT_FAMILY,
          fontSize,
          lineHeight: '1.5',
          padding: '12px',
          border: 'none',
          outline: 'none',
          resize: 'none',
          whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
          overflowWrap: wordWrap ? 'break-word' : undefined,
          overflowX: wordWrap ? 'hidden' : 'auto',
          overflowY: 'auto',
          tabSize: 2,
          caretColor: isDark ? '#aeafad' : '#000000',
        }}
      />
    </div>
  )
})

export default FmEdit
