/**
 * API client functions for subscription endpoints.
 */
import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'

export interface Subscription {
  id: number
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
  available_tokens: number
  token_balance: number  // purchased token packages balance
}

export interface SubscriptionHistoryItem {
  id: number
  plan_name: string
  plan_display_name: string
  status: string
  started_at: string
  trial_ends_at: string | null
  period_start_date: string
  period_end_date: string
  cancelled_at: string | null
  cancelled_reason: string | null
}

export interface SubscriptionHistory {
  subscriptions: SubscriptionHistoryItem[]
  total: number
}

export async function fetchCurrentSubscription(): Promise<Subscription> {
  const { data } = await axios.get<Subscription>(
    `${API_BASE_URL}/api/subscriptions/current`,
    { withCredentials: true }
  )
  return data
}

export async function fetchSubscriptionHistory(
  limit: number = 50,
  offset: number = 0
): Promise<SubscriptionHistory> {
  const { data } = await axios.get<SubscriptionHistory>(
    `${API_BASE_URL}/api/subscriptions/history?limit=${limit}&offset=${offset}`,
    { withCredentials: true }
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
}

export interface ChangePlanRequest {
  plan_id: number
}

export interface ChangePlanResponse {
  success: boolean
  message: string
  subscription: Subscription
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data } = await axios.get<SubscriptionPlan[]>(
    `${API_BASE_URL}/api/subscriptions/plans`,
    { withCredentials: true }
  )
  return data
}

export async function changeSubscriptionPlan(
  request: ChangePlanRequest
): Promise<ChangePlanResponse> {
  const { data } = await axios.post<ChangePlanResponse>(
    `${API_BASE_URL}/api/subscriptions/change-plan`,
    request,
    { withCredentials: true }
  )
  return data
}

