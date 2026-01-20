/**
 * Payment API client for T-Bank integration.
 */

export interface InitiatePaymentRequest {
  package_id: number
  success_url?: string
  fail_url?: string
}

export interface InitiatePaymentResponse {
  success: boolean
  payment_id: string
  payment_url: string
  purchase_id: number
  message: string
}

export interface PaymentStatusResponse {
  purchase_id: number
  payment_status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  payment_id: string | null
  payment_url: string | null
  paid_at: string | null
  payment_error: string | null
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

/**
 * Initiate a payment for a token package.
 */
export async function initiatePayment(
  request: InitiatePaymentRequest
): Promise<InitiatePaymentResponse> {
  const response = await fetch(`${API_BASE_URL}/api/payments/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to initiate payment' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Get payment status for a purchase.
 */
export async function getPaymentStatus(purchaseId: number): Promise<PaymentStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/payments/status/${purchaseId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get payment status' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}
