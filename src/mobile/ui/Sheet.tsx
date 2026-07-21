import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Bottom sheet: slides up from the bottom edge with a drag handle, dark
 * surface, and backdrop. Content is mounted only while open (or animating
 * out) so autoFocus inside works per-open.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** allow content up to 85vh with internal scroll */
  tall?: boolean
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; dy: number } | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // double rAF so the closed position paints before transitioning
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      setShown(false)
    }
  }, [open])

  if (!mounted) return null

  const settle = () => {
    if (!open) setMounted(false)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, dy: 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return
    const dy = Math.max(0, e.clientY - drag.current.startY)
    drag.current.dy = dy
    panel.current.style.transform = `translateY(${dy}px)`
    panel.current.style.transition = 'none'
  }
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return
    const { dy } = drag.current
    drag.current = null
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    if (dy > 90) onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        ref={panel}
        onTransitionEnd={settle}
        className={`relative rounded-t-3xl bg-surface text-fg shadow-2xl shadow-black/60 ring-1 ring-line transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
          shown ? 'translate-y-0' : 'translate-y-full'
        } ${tall ? 'max-h-[85vh] overflow-y-auto overscroll-contain' : ''}`}
      >
        <div
          className="sticky top-0 z-10 touch-none rounded-t-3xl bg-surface pt-2.5 pb-1"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto h-1 w-9 rounded-full bg-faint/50" />
          {title && <div className="px-5 pt-3 text-[17px] font-semibold">{title}</div>}
        </div>
        <div className="px-5 pt-2 pb-[calc(24px+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
