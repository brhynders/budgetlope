import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, EyeOff, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useData } from '../store'
import { addMonths, computeBudget, fmtMonth, thisMonth, type CatMonth } from '../budgetMath'
import { centsToInput, fmtMoney, parseMoney } from '../money'
import { deleteCategory, renameCategory, setAssigned, setCategoryHidden } from '../actions'
import type { CategoryDoc } from '../types'
import Sheet from './ui/Sheet'
import SwipeRow from './ui/SwipeRow'
import { toast } from './ui/Toast'
import { confirmDialog } from './ui/Dialog'
import { Card, Divided, Pill, PrimaryButton, SectionLabel, inputCls } from './ui/controls'

export default function BudgetTab() {
  const data = useData()
  const [month, setMonth] = useState(thisMonth())
  const budget = useMemo(() => computeBudget(data, month), [data, month])

  const [editCat, setEditCat] = useState<CategoryDoc | null>(null)
  const [text, setText] = useState('')
  const editCm: CatMonth | undefined = editCat ? budget.cats[editCat._id] : undefined

  const [renameCat, setRenameCat] = useState<CategoryDoc | null>(null)
  const [renameText, setRenameText] = useState('')

  const commit = () => {
    if (editCat) {
      const cents = text.trim() === '' ? 0 : parseMoney(text)
      if (cents !== null) void setAssigned(month, editCat._id, cents)
    }
    setEditCat(null)
  }

  const commitRename = () => {
    const name = renameText.trim()
    if (renameCat && name) void renameCategory(renameCat._id, name)
    setRenameCat(null)
  }

  const positive = budget.rta >= 0

  return (
    <div>
      {/* Month stepper */}
      <div className="flex items-center justify-between px-2 pt-2">
        <button
          className="p-3 text-mute active:text-fg"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft size={22} />
        </button>
        <button className="text-[17px] font-bold" onClick={() => setMonth(thisMonth())}>
          {fmtMonth(month)}
        </button>
        <button
          className="p-3 text-mute active:text-fg"
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Ready-to-assign hero — the envelope */}
      <div
        className={`relative mx-4 mt-1 mb-1 overflow-hidden rounded-2xl p-4 ring-1 ${
          positive ? 'bg-mint-deep ring-mint/20' : 'bg-loss-deep ring-loss/20'
        }`}
      >
        {/* envelope flap seam */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-14 opacity-[0.07]"
          style={{
            background: positive ? '#35c39a' : '#f07a70',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
          }}
        />
        <div
          className={`tabular relative text-[34px] leading-tight font-extrabold ${positive ? 'text-mint' : 'text-loss'}`}
        >
          {fmtMoney(budget.rta)}
        </div>
        <div className="relative text-[12px] font-medium text-mute">
          {positive ? 'Ready to assign' : 'Overassigned — cover this'}
        </div>
      </div>

      {data.groups.map((g) => {
        const cats = (data.categoriesByGroup[g._id] ?? []).filter((c) => !c.hidden)
        if (cats.length === 0) return null
        const avail = cats.reduce((s, c) => s + (budget.cats[c._id]?.available ?? 0), 0)
        return (
          <section key={g._id}>
            <SectionLabel
              extra={<span className="tabular text-[12px] font-semibold text-mute">{fmtMoney(avail)}</span>}
            >
              {g.name}
            </SectionLabel>
            <Card>
              <Divided>
                {cats.map((c) => {
                  const cm = budget.cats[c._id] ?? { assigned: 0, activity: 0, available: 0 }
                  const isCC = !!c.ccAccountId
                  return (
                    <SwipeRow
                      key={c._id}
                      left={
                        isCC
                          ? []
                          : [
                              {
                                key: 'zero',
                                label: 'Zero',
                                icon: <RotateCcw size={17} />,
                                tone: 'neutral',
                                onPress: () => {
                                  void setAssigned(month, c._id, 0)
                                  toast(`Zeroed ${fmtMonth(month)} assignment`)
                                },
                              },
                            ]
                      }
                      right={
                        isCC
                          ? []
                          : [
                              {
                                key: 'rename',
                                label: 'Rename',
                                icon: <Pencil size={17} />,
                                tone: 'accent',
                                onPress: () => {
                                  setRenameText(c.name)
                                  setRenameCat(c)
                                },
                              },
                              {
                                key: 'hide',
                                label: 'Hide',
                                icon: <EyeOff size={17} />,
                                tone: 'warn',
                                onPress: () => {
                                  void setCategoryHidden(c._id, true)
                                  toast(`Hid "${c.name}"`)
                                },
                              },
                              {
                                key: 'delete',
                                label: 'Delete',
                                icon: <Trash2 size={17} />,
                                tone: 'danger',
                                onPress: () => {
                                  void confirmDialog({
                                    title: `Delete "${c.name}"?`,
                                    message: 'Its transactions become uncategorized.',
                                    confirmText: 'Delete',
                                    danger: true,
                                  }).then((ok) => {
                                    if (ok) void deleteCategory(c._id)
                                  })
                                },
                              },
                            ]
                      }
                      onTap={() => {
                        setText(centsToInput(cm.assigned))
                        setEditCat(c)
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-medium">{c.name}</div>
                          <div className="tabular text-[12px] text-faint">
                            Assigned {fmtMoney(cm.assigned)} · Spent {fmtMoney(cm.activity)}
                          </div>
                        </div>
                        <Pill cents={cm.available} />
                      </div>
                    </SwipeRow>
                  )
                })}
              </Divided>
            </Card>
          </section>
        )
      })}

      {/* Assign editor */}
      <Sheet open={!!editCat} onClose={commit} title={editCat?.name}>
        {editCat && (
          <div>
            <div className="tabular mb-4 text-[13px] text-mute">
              {fmtMonth(month)} · Spent {fmtMoney(editCm?.activity ?? 0)} · Available{' '}
              {fmtMoney(editCm?.available ?? 0)}
            </div>
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-raised px-3.5 py-1">
              <span className="shrink-0 text-[14px] text-mute">Assigned $</span>
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
                className="tabular w-full bg-transparent py-3 text-right text-[17px] font-semibold outline-none placeholder:text-faint"
              />
            </div>
            <PrimaryButton onClick={commit}>Save</PrimaryButton>
          </div>
        )}
      </Sheet>

      {/* Rename */}
      <Sheet open={!!renameCat} onClose={() => setRenameCat(null)} title="Rename category">
        {renameCat && (
          <div>
            <input
              autoFocus
              placeholder="Category name"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
              className={`${inputCls} mb-4`}
            />
            <PrimaryButton onClick={commitRename}>Save</PrimaryButton>
          </div>
        )}
      </Sheet>
    </div>
  )
}
