import { useState } from 'react'
import { Button, Input, Popover, Space } from 'antd'

export default function NamePopover({
  title,
  initial,
  onSave,
  children,
}: {
  title: string
  initial: string
  onSave: (name: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initial)
  const save = () => {
    const trimmed = name.trim()
    if (trimmed) onSave(trimmed)
    setOpen(false)
  }
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setName(initial)
      }}
      content={
        <Space.Compact>
          <Input
            size="small"
            autoFocus
            value={name}
            placeholder={title}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={save}
          />
          <Button size="small" type="primary" onClick={save}>
            Save
          </Button>
        </Space.Compact>
      }
    >
      {children}
    </Popover>
  )
}
