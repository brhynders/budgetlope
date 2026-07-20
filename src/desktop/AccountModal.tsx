import { App, Form, Input, Modal, Select } from 'antd'
import { useNavigate } from 'react-router-dom'
import { createAccount } from '../actions'
import { parseMoney } from '../money'
import { ACCOUNT_TYPE_LABELS, type AccountType } from '../types'

interface Values {
  name: string
  accountType: AccountType
  balance: string
}

export default function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>()
  const navigate = useNavigate()
  const { message } = App.useApp()

  const submit = async () => {
    const values = await form.validateFields()
    const cents = values.balance?.trim() ? parseMoney(values.balance) : 0
    if (cents === null) {
      message.error('Could not parse the balance amount')
      return
    }
    const id = await createAccount(values.name.trim(), values.accountType, cents)
    form.resetFields()
    onClose()
    navigate(`/account/${id.slice(5)}`)
  }

  return (
    <Modal
      title="Add Account"
      open={open}
      onOk={() => void submit()}
      onCancel={onClose}
      okText="Add Account"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ accountType: 'checking', balance: '' }}
        onFinish={() => void submit()}
      >
        <Form.Item name="name" label="Nickname" rules={[{ required: true, whitespace: true }]}>
          <Input placeholder="e.g. Chase Checking" autoFocus />
        </Form.Item>
        <Form.Item name="accountType" label="Account Type" rules={[{ required: true }]}>
          <Select
            options={Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="balance"
          label="Current Balance"
          extra="For credit cards, enter what you owe as a negative number, e.g. -450.21"
        >
          <Input prefix="$" placeholder="0.00" inputMode="decimal" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
