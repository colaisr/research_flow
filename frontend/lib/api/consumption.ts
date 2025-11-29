/**
 * API client functions for consumption endpoints.
 */
import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'

export interface ConsumptionStats {
  total_tokens: number
  total_cost_rub: number
  total_price_rub: number
  consumption_count: number
  period_start: string
  period_end: string
  by_model: Record<string, {
    tokens: number
    cost: number
    price: number
    count: number
  }>
  by_provider: Record<string, {
    tokens: number
    cost: number
    price: number
    count: number
  }>
}

export interface ConsumptionHistoryItem {
  id: number
  consumed_at: string
  model_name: string
  provider: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_rub: number
  price_rub: number
  source_type: string
  run_id: number | null
  step_id: number | null
  source_name: string | null
}

export interface ConsumptionHistory {
  items: ConsumptionHistoryItem[]
  total: number
  limit: number
  offset: number
}

export interface ChartDataPoint {
  date: string
  tokens: number
  cost_rub: number
  price_rub: number
}

export interface ChartData {
  data: ChartDataPoint[]
  group_by: string
}

export async function fetchConsumptionStats(
  startDate?: string,
  endDate?: string
): Promise<ConsumptionStats> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  
  const { data } = await axios.get<ConsumptionStats>(
    `${API_BASE_URL}/api/consumption/stats?${params.toString()}`,
    { withCredentials: true }
  )
  return data
}

export async function fetchConsumptionHistory(
  startDate?: string,
  endDate?: string,
  modelName?: string,
  provider?: string,
  limit: number = 100,
  offset: number = 0
): Promise<ConsumptionHistory> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (modelName) params.append('model_name', modelName)
  if (provider) params.append('provider', provider)
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())
  
  const { data } = await axios.get<ConsumptionHistory>(
    `${API_BASE_URL}/api/consumption/history?${params.toString()}`,
    { withCredentials: true }
  )
  return data
}

export async function fetchConsumptionChart(
  startDate: string,
  endDate: string,
  groupBy: 'day' | 'week' | 'month' = 'day'
): Promise<ChartData> {
  const params = new URLSearchParams()
  params.append('start_date', startDate)
  params.append('end_date', endDate)
  params.append('group_by', groupBy)
  
  const { data } = await axios.get<ChartData>(
    `${API_BASE_URL}/api/consumption/chart?${params.toString()}`,
    { withCredentials: true }
  )
  return data
}

