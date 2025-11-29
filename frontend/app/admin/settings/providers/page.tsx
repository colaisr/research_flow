'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import {
  fetchProviderCredentials,
  updateProviderCredential,
  getProviderApiKey,
  ProviderCredential,
  UpdateProviderCredentialRequest,
} from '@/lib/api/admin-provider-credentials'
import { syncPricingFromProvider } from '@/lib/api/admin-pricing'

interface ProviderSectionProps {
  credential: ProviderCredential
  onUpdate: (updates: UpdateProviderCredentialRequest) => void
  onSync: () => void
  isUpdating: boolean
  isSyncing: boolean
}

function ProviderSection({
  credential,
  onUpdate,
  onSync,
  isUpdating,
  isSyncing,
}: ProviderSectionProps) {
  const [localState, setLocalState] = useState({
    apiKey: '', // Current API key (will be loaded)
    baseUrl: credential.base_url,
    isActive: credential.is_active,
    showApiKey: false,
    isLoadingApiKey: true, // Start loading the actual key
    originalApiKey: null as string | null, // Store original to detect changes
  })

  // Load actual API key on mount
  useEffect(() => {
    const loadApiKey = async () => {
      if (credential.api_key_encrypted) {
        try {
          const result = await getProviderApiKey(credential.provider)
          setLocalState((prev) => ({
            ...prev,
            apiKey: result.api_key || '',
            originalApiKey: result.api_key || null,
            isLoadingApiKey: false,
          }))
        } catch (error) {
          console.error('Failed to fetch API key:', error)
          setLocalState((prev) => ({ ...prev, isLoadingApiKey: false }))
        }
      } else {
        setLocalState((prev) => ({ ...prev, isLoadingApiKey: false }))
      }
    }
    loadApiKey()
  }, [credential.provider, credential.api_key_encrypted])

  const hasChanges =
    localState.apiKey !== localState.originalApiKey ||
    localState.baseUrl !== credential.base_url ||
    localState.isActive !== credential.is_active

  const handleSave = () => {
    const updates: UpdateProviderCredentialRequest = {}
    if (localState.apiKey !== localState.originalApiKey) {
      updates.api_key_encrypted = localState.apiKey || null
    }
    if (localState.baseUrl !== credential.base_url) {
      updates.base_url = localState.baseUrl
    }
    if (localState.isActive !== credential.is_active) {
      updates.is_active = localState.isActive
    }
    onUpdate(updates)
    // Update original after save
    setLocalState((prev) => ({ ...prev, originalApiKey: prev.apiKey }))
  }

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
            {credential.display_name}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Provider: {credential.provider}</p>
        </div>
        <span
          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(
            credential.is_active
          )}`}
        >
          {credential.is_active ? 'Активен' : 'Неактивен'}
        </span>
      </div>

      <div className="space-y-4">
        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API ключ
          </label>
          <div className="relative">
            <input
              type={localState.showApiKey ? 'text' : 'password'}
              value={localState.isLoadingApiKey ? 'Загрузка...' : localState.apiKey}
              onChange={(e) => setLocalState((prev) => ({ ...prev, apiKey: e.target.value }))}
              disabled={localState.isLoadingApiKey}
              placeholder="Введите API ключ"
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white disabled:opacity-50"
            />
            <button
              onClick={() => setLocalState((prev) => ({ ...prev, showApiKey: !prev.showApiKey }))}
              disabled={localState.isLoadingApiKey}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
              type="button"
            >
              {localState.showApiKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Base URL
          </label>
          <input
            type="text"
            value={localState.baseUrl}
            onChange={(e) => setLocalState((prev) => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="https://api.example.com"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Active Toggle */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={localState.isActive}
              onChange={(e) => setLocalState((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Провайдер активен
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdating ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          )}
          <button
            onClick={onSync}
            disabled={isSyncing || !credential.is_active}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Синхронизировать модели и цены с провайдера"
          >
            {isSyncing ? 'Синхронизация...' : 'Синхронизировать модели'}
          </button>
        </div>

        {/* Metadata */}
        {(credential.created_at || credential.updated_at) && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              {credential.created_at && (
                <div>Создано: {new Date(credential.created_at).toLocaleString('ru-RU')}</div>
              )}
              {credential.updated_at && (
                <div>Обновлено: {new Date(credential.updated_at).toLocaleString('ru-RU')}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProviderCredentialsPage() {
  const router = useRouter()
  const { isPlatformAdmin, isLoading: authUserLoading } = useAuth()
  useRequireAuth()
  const queryClient = useQueryClient()

  const [updatingProvider, setUpdatingProvider] = useState<string | null>(null)
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)

  const { data: credentials = [], isLoading: credentialsLoading } = useQuery({
    queryKey: ['admin', 'provider-credentials'],
    queryFn: fetchProviderCredentials,
  })

  const updateMutation = useMutation({
    mutationFn: ({
      provider,
      updates,
    }: {
      provider: string
      updates: UpdateProviderCredentialRequest
    }) => updateProviderCredential(provider, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'provider-credentials'] })
      setUpdatingProvider(null)
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при обновлении учетных данных')
      setUpdatingProvider(null)
    },
  })

  const syncMutation = useMutation({
    mutationFn: syncPricingFromProvider,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] })
      alert(data.message)
      setSyncingProvider(null)
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при синхронизации')
      setSyncingProvider(null)
    },
  })

  const handleUpdate = (provider: string, updates: UpdateProviderCredentialRequest) => {
    setUpdatingProvider(provider)
    updateMutation.mutate({ provider, updates })
  }

  const handleSync = (provider: string) => {
    if (
      confirm(
        `Синхронизировать модели и цены с ${provider}? Это обновит все модели этого провайдера.`
      )
    ) {
      setSyncingProvider(provider)
      syncMutation.mutate(provider as 'openrouter' | 'gemini')
    }
  }

  if (authUserLoading) {
    return (
      <div className="p-8">
        <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
      </div>
    )
  }

  if (!isPlatformAdmin) {
    return (
      <div className="p-8">
        <p className="text-gray-600 dark:text-gray-400">Доступ запрещен</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/admin/settings')}
            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mb-4"
          >
            ← Назад к настройкам
          </button>
          <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
            Управление учетными данными провайдеров
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Настройка API ключей и параметров подключения для провайдеров AI моделей
          </p>
        </div>

        {credentialsLoading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : credentials.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Провайдеры не найдены
          </div>
        ) : (
          <div>
            {credentials.map((credential) => (
              <ProviderSection
                key={credential.id}
                credential={credential}
                onUpdate={(updates) => handleUpdate(credential.provider, updates)}
                onSync={() => handleSync(credential.provider)}
                isUpdating={updatingProvider === credential.provider}
                isSyncing={syncingProvider === credential.provider}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

