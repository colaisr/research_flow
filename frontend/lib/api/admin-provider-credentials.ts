import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'

export interface ProviderCredential {
  id: number
  provider: string
  display_name: string
  api_key_encrypted: string | null // Masked for security
  base_url: string
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

export interface UpdateProviderCredentialRequest {
  api_key_encrypted?: string
  base_url?: string
  is_active?: boolean
}

export async function fetchProviderCredentials(): Promise<ProviderCredential[]> {
  const { data } = await apiClient.get<ProviderCredential[]>(
    `${API_BASE_URL}/api/admin/provider-credentials`,
    {
      withCredentials: true,
    }
  )
  return data
}

export async function fetchProviderCredential(
  provider: string
): Promise<ProviderCredential> {
  const { data } = await apiClient.get<ProviderCredential>(
    `${API_BASE_URL}/api/admin/provider-credentials/${provider}`,
    {
      withCredentials: true,
    }
  )
  return data
}

export async function updateProviderCredential(
  provider: string,
  updates: UpdateProviderCredentialRequest
): Promise<ProviderCredential> {
  const { data } = await apiClient.put<ProviderCredential>(
    `${API_BASE_URL}/api/admin/provider-credentials/${provider}`,
    updates,
    {
      withCredentials: true,
    }
  )
  return data
}

export async function getProviderApiKey(provider: string): Promise<{ provider: string; api_key: string | null }> {
  const { data } = await apiClient.get<{ provider: string; api_key: string | null }>(
    `${API_BASE_URL}/api/admin/provider-credentials/${provider}/api-key`,
    {
      withCredentials: true,
    }
  )
  return data
}

