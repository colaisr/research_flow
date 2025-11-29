'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import {
  fetchPricing,
  updateModelPricing,
  syncPricingFromProvider,
  ModelPricing,
  UpdatePricingRequest,
} from '@/lib/api/admin-pricing'

const EXCHANGE_RATE_USD_TO_RUB = 90.0 // Default, should ideally come from backend

const PROVIDERS = ['openrouter', 'gemini'] as const
type Provider = typeof PROVIDERS[number]

function convertUsdToRub(usd: number): number {
  return usd * EXCHANGE_RATE_USD_TO_RUB
}

function convertRubToUsd(rub: number): number {
  return rub / EXCHANGE_RATE_USD_TO_RUB
}

function calculateAverageCost(inputCost: number, outputCost: number): number {
  return (inputCost + outputCost) / 2
}

function calculateUserPrice(
  avgCostUsd: number,
  platformFeePercent: number
): number {
  return avgCostUsd * (1 + platformFeePercent / 100)
}

interface PricingEditorProps {
  model: ModelPricing
  onUpdate: (updates: UpdatePricingRequest) => void
  isUpdating: boolean
}

function PricingEditor({ model, onUpdate, isUpdating }: PricingEditorProps) {
  const [localState, setLocalState] = useState({
    costInputRub: convertUsdToRub(model.cost_per_1k_input_usd).toFixed(6),
    costOutputRub: convertUsdToRub(model.cost_per_1k_output_usd).toFixed(6),
    platformFee: Number(model.platform_fee_percent).toFixed(2),
    priceRub: convertUsdToRub(model.price_per_1k_usd).toFixed(6),
    isActive: model.is_active,
    isVisible: model.is_visible,
  })

  const avgCostUsd = useMemo(() => {
    return calculateAverageCost(
      parseFloat(localState.costInputRub) / EXCHANGE_RATE_USD_TO_RUB,
      parseFloat(localState.costOutputRub) / EXCHANGE_RATE_USD_TO_RUB
    )
  }, [localState.costInputRub, localState.costOutputRub])

  const calculatedPriceUsd = useMemo(() => {
    return calculateUserPrice(avgCostUsd, parseFloat(localState.platformFee))
  }, [avgCostUsd, localState.platformFee])

  const handleSave = () => {
    const updates: UpdatePricingRequest = {
      cost_per_1k_input_usd: convertRubToUsd(parseFloat(localState.costInputRub)),
      cost_per_1k_output_usd: convertRubToUsd(parseFloat(localState.costOutputRub)),
      platform_fee_percent: parseFloat(localState.platformFee),
      price_per_1k_usd: calculatedPriceUsd,
      is_active: localState.isActive,
      is_visible: localState.isVisible,
    }
    onUpdate(updates)
  }

  const handleRecalculatePrice = () => {
    setLocalState((prev) => ({
      ...prev,
      priceRub: convertUsdToRub(calculatedPriceUsd).toFixed(6),
    }))
  }

  const hasChanges =
    Math.abs(parseFloat(localState.costInputRub) - convertUsdToRub(model.cost_per_1k_input_usd)) >
      0.000001 ||
    Math.abs(parseFloat(localState.costOutputRub) - convertUsdToRub(model.cost_per_1k_output_usd)) >
      0.000001 ||
    Math.abs(parseFloat(localState.platformFee) - Number(model.platform_fee_percent)) > 0.01 ||
    Math.abs(parseFloat(localState.priceRub) - convertUsdToRub(model.price_per_1k_usd)) >
      0.000001 ||
    localState.isActive !== model.is_active ||
    localState.isVisible !== model.is_visible

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{model.model_name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Provider: {model.provider}</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={localState.isActive}
              onChange={(e) =>
                setLocalState((prev) => ({ ...prev, isActive: e.target.checked }))
              }
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Активна</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={localState.isVisible}
              onChange={(e) =>
                setLocalState((prev) => ({ ...prev, isVisible: e.target.checked }))
              }
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Видима</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Стоимость ввода (₽ за 1K)
          </label>
          <input
            type="number"
            step="0.000001"
            value={localState.costInputRub}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, costInputRub: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Стоимость вывода (₽ за 1K)
          </label>
          <input
            type="number"
            step="0.000001"
            value={localState.costOutputRub}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, costOutputRub: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Средняя стоимость (₽ за 1K)
          </label>
          <input
            type="text"
            value={convertUsdToRub(avgCostUsd).toFixed(6)}
            readOnly
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white bg-gray-50 dark:bg-gray-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Комиссия платформы (%)
          </label>
          <input
            type="number"
            step="0.01"
            value={localState.platformFee}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, platformFee: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Цена для пользователя (₽ за 1K)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.000001"
              value={localState.priceRub}
              onChange={(e) =>
                setLocalState((prev) => ({ ...prev, priceRub: e.target.value }))
              }
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={handleRecalculatePrice}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
              title="Пересчитать на основе стоимости и комиссии"
            >
              ↻
            </button>
          </div>
        </div>
      </div>

      {hasChanges && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isUpdating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      )}
    </div>
  )
}

interface ProviderPricingTabProps {
  provider: Provider
  models: ModelPricing[]
  onUpdateModel: (modelId: number, updates: UpdatePricingRequest) => void
  onSync: () => void
  isSyncing: boolean
}

function ProviderPricingTab({
  provider,
  models,
  onUpdateModel,
  onSync,
  isSyncing,
}: ProviderPricingTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showActiveOnly, setShowActiveOnly] = useState(false)

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      const matchesSearch = model.model_name
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
      const matchesActive = showActiveOnly ? model.is_active : true
      return matchesSearch && matchesActive
    })
  }, [models, searchQuery, showActiveOnly])

  const updatingModels = new Set<number>()

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-4 flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию модели..."
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
          <label className="flex items-center gap-2 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Только активные</span>
          </label>
        </div>
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isSyncing ? 'Синхронизация...' : `Синхронизировать с ${provider}`}
        </button>
      </div>

      <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Найдено моделей: {filteredModels.length} из {models.length}
      </div>

      {filteredModels.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Модели не найдены
        </div>
      ) : (
        <div>
          {filteredModels.map((model) => (
            <PricingEditor
              key={model.id}
              model={model}
              onUpdate={(updates) => onUpdateModel(model.id, updates)}
              isUpdating={updatingModels.has(model.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PricingManagementPage() {
  const router = useRouter()
  const { isPlatformAdmin, isLoading: authUserLoading } = useAuth()
  useRequireAuth()
  const queryClient = useQueryClient()

  const [activeProvider, setActiveProvider] = useState<Provider>('openrouter')
  const [syncingProvider, setSyncingProvider] = useState<Provider | null>(null)

  const { data: allPricing = [], isLoading: pricingLoading } = useQuery({
    queryKey: ['admin', 'pricing'],
    queryFn: () => fetchPricing(),
  })

  const pricingByProvider = useMemo(() => {
    const grouped: Record<Provider, ModelPricing[]> = {
      openrouter: [],
      gemini: [],
    }
    allPricing.forEach((model) => {
      const provider = model.provider.toLowerCase() as Provider
      if (PROVIDERS.includes(provider)) {
        grouped[provider].push(model)
      }
    })
    return grouped
  }, [allPricing])

  const updateModelMutation = useMutation({
    mutationFn: ({ modelId, updates }: { modelId: number; updates: UpdatePricingRequest }) =>
      updateModelPricing(modelId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] })
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при обновлении цены')
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

  const handleUpdateModel = (modelId: number, updates: UpdatePricingRequest) => {
    updateModelMutation.mutate({ modelId, updates })
  }

  const handleSync = (provider: Provider) => {
    if (confirm(`Синхронизировать цены с ${provider}? Это обновит все модели этого провайдера.`)) {
      setSyncingProvider(provider)
      syncMutation.mutate(provider)
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
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
            Управление ценами моделей
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Настройка цен для моделей AI по провайдерам
          </p>
        </div>

        {/* Provider Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="flex space-x-8 overflow-x-auto">
            {PROVIDERS.map((provider) => (
              <button
                key={provider}
                onClick={() => setActiveProvider(provider)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeProvider === provider
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {provider === 'openrouter' && 'OpenRouter'}
                {provider === 'gemini' && 'Gemini'}
                ({pricingByProvider[provider].length})
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {pricingLoading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : (
          <ProviderPricingTab
            provider={activeProvider}
            models={pricingByProvider[activeProvider]}
            onUpdateModel={handleUpdateModel}
            onSync={() => handleSync(activeProvider)}
            isSyncing={syncingProvider === activeProvider}
          />
        )}
      </div>
    </div>
  )
}

