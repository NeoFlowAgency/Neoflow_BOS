import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './ToastContext'

// Test component that uses the toast hook
function ToastTrigger({ type = 'info', message = 'Test message' }) {
  const toast = useToast()
  return (
    <button onClick={() => toast[type](message)}>
      Show toast
    </button>
  )
}

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('ToastProvider', () => {
  it('renders children without crashing', () => {
    renderWithToast(<div>Content</div>)
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('shows a success toast', async () => {
    const user = userEvent.setup()
    renderWithToast(<ToastTrigger type="success" message="Succès !" />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Succès !')).toBeInTheDocument()
  })

  it('shows an error toast', async () => {
    const user = userEvent.setup()
    renderWithToast(<ToastTrigger type="error" message="Erreur !" />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Erreur !')).toBeInTheDocument()
  })

  it('shows an info toast', async () => {
    const user = userEvent.setup()
    renderWithToast(<ToastTrigger type="info" message="Info !" />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Info !')).toBeInTheDocument()
  })

  it('removes toast when clicked', async () => {
    const user = userEvent.setup()
    renderWithToast(<ToastTrigger type="success" message="Click to dismiss" />)
    await user.click(screen.getByRole('button', { name: 'Show toast' }))
    expect(screen.getByText('Click to dismiss')).toBeInTheDocument()
    await user.click(screen.getByText('Click to dismiss'))
    expect(screen.queryByText('Click to dismiss')).not.toBeInTheDocument()
  })
})

describe('useToast', () => {
  it('throws when used outside ToastProvider', () => {
    // Suppress error boundary console.error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ToastTrigger />)).toThrow('ToastProvider')
    spy.mockRestore()
  })
})
