import { useMemo, useState } from 'react'
import { Button, Collapse, Dialog, Input, List, Popup, SwipeAction, Tag, Toast } from 'antd-mobile'
import { LeftOutline, RightOutline } from 'antd-mobile-icons'
import { useData } from '../store'
import { addMonths, computeBudget, fmtMonth, thisMonth, type CatMonth } from '../budgetMath'
import { centsToInput, fmtMoney, parseMoney } from '../money'
import { deleteCategory, renameCategory, setAssigned, setCategoryHidden } from '../actions'
import type { CategoryDoc } from '../types'

function AvailableTag({ cents }: { cents: number }) {
  const color = cents > 0 ? 'success' : cents < 0 ? 'danger' : '#b8bfc6'
  return (
    <Tag color={color} style={{ fontSize: 14, padding: '3px 8px' }} round>
      {fmtMoney(cents)}
    </Tag>
  )
}

const sheetBody: React.CSSProperties = {
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  padding: 20,
}

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

  const onSwipeAction = (key: string, c: CategoryDoc) => {
    if (key === 'rename') {
      setRenameText(c.name)
      setRenameCat(c)
    } else if (key === 'hide') {
      void setCategoryHidden(c._id, true)
      Toast.show(`Hid "${c.name}"`)
    } else if (key === 'delete') {
      void Dialog.confirm({
        content: `Delete "${c.name}"? Its transactions become uncategorized.`,
        confirmText: 'Delete',
      }).then((ok) => {
        if (ok) void deleteCategory(c._id)
      })
    } else if (key === 'zero') {
      void setAssigned(month, c._id, 0)
      Toast.show(`Zeroed ${fmtMonth(month)} assignment`)
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px 4px',
        }}
      >
        <Button fill="none" onClick={() => setMonth(addMonths(month, -1))}>
          <LeftOutline />
        </Button>
        <span style={{ fontSize: 18, fontWeight: 700 }} onClick={() => setMonth(thisMonth())}>
          {fmtMonth(month)}
        </span>
        <Button fill="none" onClick={() => setMonth(addMonths(month, 1))}>
          <RightOutline />
        </Button>
      </div>

      <div
        style={{
          margin: '8px 16px 12px',
          borderRadius: 12,
          padding: '12px 16px',
          textAlign: 'center',
          background: budget.rta >= 0 ? '#e7f6f0' : '#ffece8',
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 800 }} className={budget.rta >= 0 ? 'pos' : 'neg'}>
          {fmtMoney(budget.rta)}
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          {budget.rta >= 0 ? 'Ready to Assign' : 'Overassigned'}
        </div>
      </div>

      <Collapse defaultActiveKey={data.groups.map((g) => g._id)}>
        {data.groups.map((g) => {
          const cats = (data.categoriesByGroup[g._id] ?? []).filter((c) => !c.hidden)
          if (cats.length === 0) return null
          const avail = cats.reduce((s, c) => s + (budget.cats[c._id]?.available ?? 0), 0)
          return (
            <Collapse.Panel
              key={g._id}
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: 600 }}>{g.name}</span>
                  <span className="m-amount" style={{ color: '#888' }}>
                    {fmtMoney(avail)}
                  </span>
                </div>
              }
            >
              <List>
                {cats.map((c) => {
                  const cm = budget.cats[c._id] ?? { assigned: 0, activity: 0, available: 0 }
                  const isCC = !!c.ccAccountId
                  return (
                    <SwipeAction
                      key={c._id}
                      leftActions={
                        isCC ? [] : [{ key: 'zero', text: 'Zero', color: 'light' }]
                      }
                      rightActions={
                        isCC
                          ? []
                          : [
                              { key: 'rename', text: 'Rename', color: 'primary' },
                              { key: 'hide', text: 'Hide', color: 'warning' },
                              { key: 'delete', text: 'Delete', color: 'danger' },
                            ]
                      }
                      onAction={(action) => onSwipeAction(String(action.key), c)}
                    >
                      <List.Item
                        clickable
                        arrowIcon={false}
                        extra={<AvailableTag cents={cm.available} />}
                        description={`Assigned ${fmtMoney(cm.assigned)} · Spent ${fmtMoney(cm.activity)}`}
                        onClick={() => {
                          setText(centsToInput(cm.assigned))
                          setEditCat(c)
                        }}
                      >
                        {c.name}
                      </List.Item>
                    </SwipeAction>
                  )
                })}
              </List>
            </Collapse.Panel>
          )
        })}
      </Collapse>

      <Popup
        visible={!!editCat}
        onMaskClick={() => setEditCat(null)}
        position="bottom"
        bodyStyle={sheetBody}
      >
        {editCat && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{editCat.name}</div>
            <div style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
              {fmtMonth(month)} · Spent {fmtMoney(editCm?.activity ?? 0)} · Available{' '}
              {fmtMoney(editCm?.available ?? 0)}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid #ddd',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 16,
              }}
            >
              <span style={{ color: '#888', flexShrink: 0 }}>Assigned $</span>
              <Input
                type="number"
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                value={text}
                onChange={setText}
                onEnterPress={commit}
                style={{ '--text-align': 'right', flex: 1 } as React.CSSProperties}
              />
            </div>
            <Button block color="primary" size="large" onClick={commit}>
              Save
            </Button>
          </div>
        )}
      </Popup>

      <Popup
        visible={!!renameCat}
        onMaskClick={() => setRenameCat(null)}
        position="bottom"
        bodyStyle={sheetBody}
      >
        {renameCat && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Rename Category</div>
            <div
              style={{
                border: '1px solid #ddd',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 16,
              }}
            >
              <Input
                autoFocus
                placeholder="Category name"
                value={renameText}
                onChange={setRenameText}
                onEnterPress={commitRename}
              />
            </div>
            <Button block color="primary" size="large" onClick={commitRename}>
              Save
            </Button>
          </div>
        )}
      </Popup>
    </div>
  )
}
