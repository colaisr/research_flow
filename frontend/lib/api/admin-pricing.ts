import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'

export interface ModelPricing {
  id: number
  model_name: string
  provider: string
  cost_per_1k_input_usd: number
  cost_per_1k_output_usd: number
  platform_fee_percent: number
  price_per_1k_usd: number
  is_active: boolean
  is_visible: boolean
  created_at: string | null
  updated_at: string | null
  display_name?: string | null
}

export interface UpdatePricingRequest {
  cost_per_1k_input_usd?: number
  cost_per_1k_output_usd?: number
  platform_fee_percent?: number
  price_per_1k_usd?: number
  is_active?: boolean
  is_visible?: boolean
}

export interface PricingSyncResponse {
  success: boolean
  message: string
  models_synced: number
}

export async function fetchPricing(
  provider?: string,
  isActive?: boolean
): Promise<ModelPricing[]> {
  const params: any = {}
  if (provider) params.provider = provider
  if (isActive !== undefined) params.is_active = isActive

  const { data } = await apiClient.get<ModelPricing[]>(
    `${API_BASE_URL}/api/admin/pricing`,
    {
      params,
      withCredentials: true,
    }
  )
  return data
}

export async function updateModelPricing(
  modelId: number,
  updates: UpdatePricingRequest
): Promise<ModelPricing> {
  const { data } = await apiClient.put<ModelPricing>(
    `${API_BASE_URL}/api/admin/pricing/models/${modelId}`,
    updates,
    {
      withCredentials: true,
    }
  )
  return data
}

export async function syncPricingFromProvider(
  provider: 'openrouter' | 'gemini'
): Promise<PricingSyncResponse> {
  const endpoint =
    provider === 'openrouter'
      ? '/api/admin/pricing/sync-openrouter'
      : '/api/admin/pricing/sync-gemini'

  const { data } = await apiClient.post<PricingSyncResponse>(
    `${API_BASE_URL}${endpoint}`,
    {},
    {
      withCredentials: true,
    }
  )
  return data
}

