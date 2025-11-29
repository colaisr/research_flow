/**
 * API client functions for token package endpoints.
 */
import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'

export interface TokenPackage {
  id: number
  name: string
  display_name: string
  description: string | null
  token_amount: number
  price_rub: number
  is_active: boolean
  is_visible: boolean
}

export interface PurchaseTokenPackageRequest {
  package_id: number
  reason?: string
}

export interface PurchaseTokenPackageResponse {
  success: boolean
  message: string
  package_id: number
  token_amount: number
  price_rub: number
  new_balance: number
}

export interface PurchaseHistoryItem {
  id: number
  package_id: number
  package_name: string
  package_display_name: string
  token_amount: number
  price_rub: number
  purchased_at: string
}

export interface PurchaseHistory {
  purchases: PurchaseHistoryItem[]
  total: number
}

export async function fetchTokenPackages(): Promise<TokenPackage[]> {
  const { data } = await axios.get<TokenPackage[]>(
    `${API_BASE_URL}/api/token-packages`,
    { withCredentials: true }
  )
  return data
}

export async function purchaseTokenPackage(
  packageId: number,
  request: PurchaseTokenPackageRequest
): Promise<PurchaseTokenPackageResponse> {
  const { data } = await axios.post<PurchaseTokenPackageResponse>(
    `${API_BASE_URL}/api/token-packages/${packageId}/purchase`,
    request,
    { withCredentials: true }
  )
  return data
}

export async function fetchPurchaseHistory(
  limit: number = 50,
  offset: number = 0
): Promise<PurchaseHistory> {
  const { data } = await axios.get<PurchaseHistory>(
    `${API_BASE_URL}/api/token-packages/purchases?limit=${limit}&offset=${offset}`,
    { withCredentials: true }
  )
  return data
}

