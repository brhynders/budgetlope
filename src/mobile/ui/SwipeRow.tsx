import { useEffect, useRef, useState, type ReactNode } from 'react'

export type SwipeActionDef = {
  key: string
  label: string
  icon?: ReactNode
  tone: 'accent' | 'danger' | 'warn' | 'neutral'
  onPress: () => void
}

const TONE: Record<SwipeActionDef['tone'], string> = {
  accent: 'bg-mint text-ink',
  danger: 'bg-loss text-ink',
  warn: 'bg-warn text-ink',
  neutral: 'bg-raised text-fg',
}

const ACTION_W = 72

// Only one row may be open at a time
let closeOpenRow: (() => void) | null = null

/**
 * Native-style swipe-to-reveal action row. Horizontal drags reveal the
 * action buttons; vertical scrolling stays native via touch-action: pan-y.
 */
export default function SwipeRow({
  left = [],
  right = [],
  onTap,
  children,
}: {
  left?: SwipeActionDef[]
  right?: SwipeActionDef[]
  onTap?: () => void
  children: ReactNode
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{
    startX: number
    startY: number
    base: number
    horizontal: boolean | null
  } | null>(null)
  const moved = useRef(false)

  const close = () => setOffset(0)

  useEffect(() => {
    return () => {
      if (closeOpenRow === close) closeOpenRow = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxLeft = left.length * ACTION_W
  const maxRight = right.length * ACTION_W

  const onPointerDown = (e: React.PointerEvent) => {
    if (closeOpenRow && closeOpenRow !== close) {
      closeOpenRow()
      closeOpenRow = null
    }
    gesture.current = { startX: e.clientX, startY: e.clientY, base: offset, horizontal: null }
    moved.current = false
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (g.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      g.horizontal = Math.abs(dx) > Math.abs(dy)
      if (g.horizontal) {
        setDragging(true)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }
    }
    if (!g.horizontal) return
    moved.current = true
    let next = g.base + dx
    // rubber-band past the action extents
    if (next > maxLeft) next = maxLeft + (next - maxLeft) * 0.2
    if (next < -maxRight) next = -maxRight + (next + maxRight) * 0.2
    setOffset(next)
  }

  const onPointerEnd = () => {
    const g = gesture.current
    gesture.current = null
    setDragging(false)
    if (!g || !g.horizontal) return
    // snap: open whichever side we're mostly toward
    setOffset((cur) => {
      let snapped = 0
      if (cur > maxLeft / 2 && maxLeft) snapped = maxLeft
      else if (cur < -maxRight / 2 && maxRight) snapped = -maxRight
      if (snapped !== 0) closeOpenRow = close
      else if (closeOpenRow === close) closeOpenRow = null
      return snapped
    })
  }

  const handleTap = () => {
    if (moved.current) return
    if (offset !== 0) {
      close()
      if (closeOpenRow === close) closeOpenRow = null
      return
    }
    onTap?.()
  }

  const renderActions = (defs: SwipeActionDef[], side: 'left' | 'right') => (
    <div className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} flex`}>
      {defs.map((a) => (
        <button
          key={a.key}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${TONE[a.tone]}`}
          style={{ width: ACTION_W }}
          onClick={() => {
            close()
            if (closeOpenRow === close) closeOpenRow = null
            a.onPress()
          }}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="relative overflow-hidden">
      {left.length > 0 && renderActions(left, 'left')}
      {right.length > 0 && renderActions(right, 'right')}
      <div
        className={`relative touch-pan-y select-none bg-surface ${dragging ? '' : 'transition-transform duration-200 ease-out'}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={handleTap}
      >
        {children}
      </div>
    </div>
  )
}
