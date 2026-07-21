import { useEffect, useState, type ReactNode } from 'react'

type Req = {
  title?: string
  message: ReactNode
  confirmText: string
  cancelText: string | null
  danger: boolean
  resolve: (ok: boolean) => void
}

let push: ((r: Req) => void) | null = null

export function confirmDialog(opts: {
  title?: string
  message: ReactNode
  confirmText?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    push?.({
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? 'OK',
      cancelText: 'Cancel',
      danger: opts.danger ?? false,
      resolve,
    })
  })
}

export function alertDialog(opts: {
  title?: string
  message: ReactNode
  confirmText?: string
}): Promise<void> {
  return new Promise((resolve) => {
    push?.({
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? 'Done',
      cancelText: null,
      danger: false,
      resolve: () => resolve(),
    })
  })
}

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    push = (r) => {
      setReq(r)
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }
    return () => {
      push = null
    }
  }, [])

  if (!req) return null

  const finish = (ok: boolean) => {
    setShown(false)
    req.resolve(ok)
    window.setTimeout(() => setReq(null), 180)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-8">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-150 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => req.cancelText !== null && finish(false)}
      />
      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-2xl bg-raised text-fg shadow-2xl shadow-black/50 ring-1 ring-line transition-all duration-150 ${
          shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="px-5 pt-5 pb-4 text-center">
          {req.title && <div className="mb-1.5 text-[16px] font-semibold">{req.title}</div>}
          <div className="text-[14px] leading-relaxed text-mute">{req.message}</div>
        </div>
        <div className="flex border-t border-line">
          {req.cancelText !== null && (
            <button
              className="flex-1 border-r border-line py-3 text-[15px] font-medium text-mute active:bg-surface"
              onClick={() => finish(false)}
            >
              {req.cancelText}
            </button>
          )}
          <button
            className={`flex-1 py-3 text-[15px] font-semibold active:bg-surface ${req.danger ? 'text-loss' : 'text-mint'}`}
            onClick={() => finish(true)}
          >
            {req.confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
