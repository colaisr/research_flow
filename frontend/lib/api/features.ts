/**
 * API client functions for user features.
 */
import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'

export interface EffectiveFeatures {
  [featureName: string]: boolean
}

export async function fetchEffectiveFeatures(): Promise<EffectiveFeatures> {
  const { data } = await axios.get<EffectiveFeatures>(
    `${API_BASE_URL}/api/user-settings/features`,
    { withCredentials: true }
  )
  return data
}

