import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'

export interface UserSubscription {
  id: number
  user_id: number
  organization_id: number
  plan_id: number
  plan_name: string
  plan_display_name: string
  status: string
  started_at: string
  trial_ends_at: string | null
  tokens_allocated: number
  tokens_used_this_period: number
  tokens_remaining: number
  tokens_used_percent: number
  period_start_date: string
  period_end_date: string
  days_remaining_in_period: number
  is_trial: boolean
  trial_days_remaining: number | null
  cancelled_at: string | null
  cancelled_reason: string | null
  token_balance: number
}

export interface UpdateSubscriptionRequest {
  plan_id?: number
  add_tokens?: number
  set_tokens_used?: number
  set_token_balance?: number
  reset_period?: boolean
  extend_trial_days?: number
}

export async function fetchUserSubscription(
  userId: number,
  organizationId?: number
): Promise<UserSubscription> {
  const params = organizationId ? { organization_id: organizationId } : {}
  const { data } = await apiClient.get<UserSubscription>(
    `${API_BASE_URL}/api/admin/users/${userId}/subscription`,
    {
      params,
      withCredentials: true,
    }
  )
  return data
}

export async function updateUserSubscription(
  userId: number,
  updates: UpdateSubscriptionRequest,
  organizationId?: number
): Promise<UserSubscription> {
  const params = organizationId ? { organization_id: organizationId } : {}
  const { data } = await apiClient.put<UserSubscription>(
    `${API_BASE_URL}/api/admin/users/${userId}/subscription`,
    updates,
    {
      params,
      withCredentials: true,
    }
  )
  return data
}

export interface SubscriptionPlan {
  id: number
  name: string
  display_name: string
  description: string | null
  monthly_tokens: number
  price_monthly: number | null
  price_currency: string
  is_trial: boolean
  trial_duration_days: number | null
  included_features: string[]
  is_active: boolean
  is_visible: boolean
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data } = await apiClient.get<SubscriptionPlan[]>(
    `${API_BASE_URL}/api/admin/subscription-plans`,
    {
      withCredentials: true,
    }
  )
  return data
}

