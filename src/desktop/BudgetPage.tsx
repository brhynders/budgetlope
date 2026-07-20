import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Dropdown,
  Input,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CaretDownOutlined,
  CaretRightOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  HolderOutlined,
  LeftOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useData } from '../store'
import { addMonths, computeBudget, fmtMonth, thisMonth } from '../budgetMath'
import { centsToInput, fmtMoney, parseMoney } from '../money'
import {
  createCategory,
  createGroup,
  deleteCategory,
  deleteGroup,
  renameCategory,
  renameGroup,
  reorderCategories,
  reorderGroups,
  setAssigned,
  setCategoryHidden,
} from '../actions'
import type { CatMonth } from '../budgetMath'
import type { CategoryDoc, GroupDoc } from '../types'
import MoneyText from '../components/MoneyText'
import NamePopover from '../components/NamePopover'

function AvailablePill({ cents }: { cents: number }) {
  const color = cents > 0 ? 'green' : cents < 0 ? 'red' : 'default'
  return (
    <Tag color={color} style={{ marginInlineEnd: 0, fontVariantNumeric: 'tabular-nums' }}>
      {fmtMoney(cents)}
    </Tag>
  )
}

function AssignedCell({
  value,
  onCommit,
}: {
  value: number
  onCommit: (cents: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  if (!editing) {
    return (
      <div
        className="assigned-cell num"
        onClick={() => {
          setText(centsToInput(value))
          setEditing(true)
        }}
      >
        {fmtMoney(value)}
      </div>
    )
  }
  const commit = () => {
    const cents = text.trim() === '' ? 0 : parseMoney(text)
    if (cents !== null && cents !== value) onCommit(cents)
    setEditing(false)
  }
  return (
    <Input
      size="small"
      autoFocus
      value={text}
      style={{ textAlign: 'right' }}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onPressEnter={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

function CategoryRow({
  cat,
  cm,
  month,
}: {
  cat: CategoryDoc
  cm: CatMonth
  month: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat._id,
  })
  const isCC = !!cat.ccAccountId
  return (
    <div
      ref={setNodeRef}
      className="budget-row"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <HolderOutlined className="drag-handle" {...attributes} {...listeners} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cat.name}
          {cat.hidden && (
            <Tag style={{ marginLeft: 8 }} color="default">
              hidden
            </Tag>
          )}
        </span>
      </span>
      <AssignedCell value={cm.assigned} onCommit={(cents) => void setAssigned(month, cat._id, cents)} />
      <div className="num" style={{ color: '#888' }}>
        {fmtMoney(cm.activity)}
      </div>
      <div className="num">
        <AvailablePill cents={cm.available} />
      </div>
      <span className="row-actions">
        {!isCC && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'rename', label: <RenameMenuItem cat={cat} /> },
                {
                  key: 'hide',
                  label: cat.hidden ? 'Unhide' : 'Hide',
                  onClick: () => void setCategoryHidden(cat._id, !cat.hidden),
                },
                {
                  key: 'delete',
                  danger: true,
                  label: (
                    <Popconfirm
                      title="Delete category?"
                      description="Its transactions become uncategorized."
                      onConfirm={() => void deleteCategory(cat._id)}
                    >
                      Delete
                    </Popconfirm>
                  ),
                },
              ],
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        )}
      </span>
    </div>
  )
}

function RenameMenuItem({ cat }: { cat: CategoryDoc }) {
  return (
    <NamePopover
      title="Category name"
      initial={cat.name}
      onSave={(name) => void renameCategory(cat._id, name)}
    >
      <span>Rename</span>
    </NamePopover>
  )
}

function GroupSection({
  group,
  cats,
  catMonths,
  month,
  showHidden,
}: {
  group: GroupDoc
  cats: CategoryDoc[]
  catMonths: Record<string, CatMonth>
  month: string
  showHidden: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group._id,
  })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const visible = cats.filter((c) => showHidden || !c.hidden)
  const totals = visible.reduce(
    (acc, c) => {
      const cm = catMonths[c._id]
      if (cm) {
        acc.assigned += cm.assigned
        acc.activity += cm.activity
        acc.available += cm.available
      }
      return acc
    },
    { assigned: 0, activity: 0, available: 0 },
  )

  const onCatDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = visible.map((c) => c._id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    void reorderCategories(group._id, next)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        position: 'relative',
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <div className="budget-row group-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <HolderOutlined className="drag-handle" {...attributes} {...listeners} />
          <span
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
            {group.name}
          </span>
          <span className="row-actions" style={{ display: 'inline-flex', gap: 2 }}>
            <NamePopover
              title="New category"
              initial=""
              onSave={(name) => void createCategory(group._id, name)}
            >
              <Tooltip title="Add category">
                <Button type="text" size="small" icon={<PlusOutlined />} />
              </Tooltip>
            </NamePopover>
            <NamePopover
              title="Group name"
              initial={group.name}
              onSave={(name) => void renameGroup(group._id, name)}
            >
              <Button type="text" size="small">
                Rename
              </Button>
            </NamePopover>
            {cats.length === 0 && (
              <Popconfirm title="Delete empty group?" onConfirm={() => void deleteGroup(group._id)}>
                <Button type="text" size="small" danger>
                  Delete
                </Button>
              </Popconfirm>
            )}
          </span>
        </span>
        <div className="num">{fmtMoney(totals.assigned)}</div>
        <div className="num" style={{ color: '#888' }}>
          {fmtMoney(totals.activity)}
        </div>
        <div className="num">{fmtMoney(totals.available)}</div>
        <span />
      </div>
      {!collapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCatDragEnd}>
          <SortableContext items={visible.map((c) => c._id)} strategy={verticalListSortingStrategy}>
            {visible.map((c) => (
              <CategoryRow
                key={c._id}
                cat={c}
                cm={catMonths[c._id] ?? { assigned: 0, activity: 0, available: 0 }}
                month={month}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

export default function BudgetPage() {
  const data = useData()
  const { message } = App.useApp()
  const [month, setMonth] = useState(thisMonth())
  const [showHidden, setShowHidden] = useState(false)
  const budget = useMemo(() => computeBudget(data, month), [data, month])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onGroupDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = data.groups.map((g) => g._id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    void reorderGroups(next)
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Space>
          <Button icon={<LeftOutlined />} onClick={() => setMonth(addMonths(month, -1))} />
          <Typography.Title level={3} style={{ margin: 0, width: 150, textAlign: 'center' }}>
            {fmtMonth(month)}
          </Typography.Title>
          <Button icon={<RightOutlined />} onClick={() => setMonth(addMonths(month, 1))} />
          {month !== thisMonth() && (
            <Button type="link" onClick={() => setMonth(thisMonth())}>
              Today
            </Button>
          )}
        </Space>
        <div
          style={{
            marginLeft: 'auto',
            background: budget.rta >= 0 ? '#e7f6f0' : '#fff1f0',
            border: `1px solid ${budget.rta >= 0 ? '#a8dbc9' : '#ffa39e'}`,
            borderRadius: 12,
            padding: '8px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            <MoneyText cents={budget.rta} />
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {budget.rta >= 0 ? 'Ready to Assign' : 'Overassigned'}
          </div>
        </div>
      </div>

      <Space style={{ marginBottom: 12 }}>
        <NamePopover
          title="New group"
          initial=""
          onSave={(name) => {
            void createGroup(name).then(() => message.success(`Added group "${name}"`))
          }}
        >
          <Button icon={<PlusOutlined />}>Category Group</Button>
        </NamePopover>
        <Button
          icon={showHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          onClick={() => setShowHidden(!showHidden)}
        >
          {showHidden ? 'Showing hidden' : 'Hidden categories'}
        </Button>
      </Space>

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        <div className="budget-row group-header" style={{ background: '#f2f2f2', fontSize: 12 }}>
          <span style={{ paddingLeft: 20 }}>CATEGORY</span>
          <span className="num">ASSIGNED</span>
          <span className="num">ACTIVITY</span>
          <span className="num">AVAILABLE</span>
          <span />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onGroupDragEnd}>
          <SortableContext
            items={data.groups.map((g) => g._id)}
            strategy={verticalListSortingStrategy}
          >
            {data.groups.map((g) => (
              <GroupSection
                key={g._id}
                group={g}
                cats={data.categoriesByGroup[g._id] ?? []}
                catMonths={budget.cats}
                month={month}
                showHidden={showHidden}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
