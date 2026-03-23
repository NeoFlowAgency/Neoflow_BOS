import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentModal from './PaymentModal'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  orderTotal: 120,
  amountPaid: 0,
  loading: false,
}

describe('PaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen=false', () => {
    render(<PaymentModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Enregistrer un paiement')).not.toBeInTheDocument()
  })

  it('renders the modal when isOpen=true', () => {
    render(<PaymentModal {...defaultProps} />)
    expect(screen.getByText('Enregistrer un paiement')).toBeInTheDocument()
  })

  it('shows the remaining amount to pay', () => {
    render(<PaymentModal {...defaultProps} orderTotal={150} amountPaid={50} />)
    // remaining = 100
    expect(screen.getByText(/100\.00/)).toBeInTheDocument()
  })

  it('shows error when confirming with empty amount', async () => {
    const user = userEvent.setup()
    render(<PaymentModal {...defaultProps} />)
    // Amount input starts empty
    const amountInput = screen.getByPlaceholderText('120.00')
    expect(amountInput).toHaveValue(null)
    // Click confirm without filling amount
    await user.click(screen.getByText(/Confirmer|Valider/i))
    expect(screen.getByText(/montant valide/i)).toBeInTheDocument()
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })

  it('shows error when amount is zero', async () => {
    const user = userEvent.setup()
    render(<PaymentModal {...defaultProps} orderTotal={100} amountPaid={0} />)
    const amountInput = screen.getByPlaceholderText('100.00')
    fireEvent.change(amountInput, { target: { value: '0' } })
    await user.click(screen.getByText(/Confirmer|Valider/i))
    expect(screen.getByText(/montant valide/i)).toBeInTheDocument()
    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm with correct data on valid submission', async () => {
    const user = userEvent.setup()
    render(<PaymentModal {...defaultProps} orderTotal={100} amountPaid={0} />)
    const amountInput = screen.getByPlaceholderText('100.00')
    await user.type(amountInput, '100')
    await user.click(screen.getByText(/Confirmer|Valider/i))
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100,
      payment_type: 'full',
    }))
  })

  it('calls onClose when cancel button clicked', async () => {
    const user = userEvent.setup()
    render(<PaymentModal {...defaultProps} />)
    await user.click(screen.getByText('Annuler'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('fills amount with remaining when "Tout" button is clicked', async () => {
    const user = userEvent.setup()
    render(<PaymentModal {...defaultProps} orderTotal={80} amountPaid={20} />)
    // remaining = 60
    await user.click(screen.getByRole('button', { name: 'Tout' }))
    expect(screen.getByDisplayValue('60.00')).toBeInTheDocument()
  })

  it('fills amount when payment type "Paiement total" is clicked', async () => {
    const user = userEvent.setup()
    render(<PaymentModal {...defaultProps} orderTotal={90} amountPaid={10} />)
    // remaining = 80
    await user.click(screen.getByRole('button', { name: 'Paiement total' }))
    expect(screen.getByDisplayValue('80.00')).toBeInTheDocument()
  })

  it('shows all payment methods', () => {
    render(<PaymentModal {...defaultProps} />)
    expect(screen.getByText('Espèces')).toBeInTheDocument()
    expect(screen.getByText('Carte bancaire')).toBeInTheDocument()
    expect(screen.getByText('Virement')).toBeInTheDocument()
    expect(screen.getByText('Chèque')).toBeInTheDocument()
  })

  it('shows loading state when loading=true', () => {
    render(<PaymentModal {...defaultProps} loading={true} />)
    expect(screen.getByText('Enregistrement...')).toBeInTheDocument()
  })

  it('disables confirm button when loading', () => {
    render(<PaymentModal {...defaultProps} loading={true} />)
    // The confirm button text becomes "Enregistrement..."
    const buttons = screen.getAllByRole('button')
    const confirmBtn = buttons.find(b => b.disabled)
    expect(confirmBtn).toBeTruthy()
  })
})
