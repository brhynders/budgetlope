import { useEffect, useRef, useState } from 'react'

let listener: ((msg: string) => void) | null = null

export function toast(msg: string) {
  listener?.(msg)
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    listener = (m) => {
      setMsg(m)
      setShown(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setShown(false), 2200)
    }
    return () => {
      listener = null
      window.clearTimeout(timer.current)
    }
  }, [])

  if (msg === null) return null
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[70] flex justify-center transition-all duration-200 ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      onTransitionEnd={() => !shown && setMsg(null)}
    >
      <div className="max-w-[80vw] rounded-full bg-raised px-4 py-2.5 text-[13px] font-medium text-fg shadow-lg shadow-black/40 ring-1 ring-line">
        {msg}
      </div>
    </div>
  )
}
