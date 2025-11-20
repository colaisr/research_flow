'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'

interface Model {
  id: number
  name: string
  display_name: string
  provider: string
  description: string | null
  max_tokens: number | null
  cost_per_1k_tokens: string | null
  is_enabled: boolean
  has_failures: boolean
}

interface DataSource {
  id: number
  name: string
  display_name: string
  description: string | null
  supports_crypto: boolean
  supports_stocks: boolean
  supports_forex: boolean
  is_enabled: boolean
}

interface Instrument {
  symbol: string
  type: string
  exchange: string | null
  display_name: string
  is_enabled: boolean
  id: number | null
}

async function fetchModels() {
  const { data } = await axios.get<Model[]>(`${API_BASE_URL}/api/settings/models`)
  return data
}

async function fetchDataSources() {
  const { data } = await axios.get<DataSource[]>(`${API_BASE_URL}/api/settings/data-sources`)
  return data
}

interface AnalysisType {
  id: number
  name: string
  display_name: string
  description: string | null
  version: string
  config: {
    steps: Array<{
      step_name: string
      step_type: string
      model: string
      system_prompt: string
      user_prompt_template: string
      temperature: number
      max_tokens: number
      data_sources: string[]
    }>
    default_instrument: string
    default_timeframe: string
    estimated_cost: number
    estimated_duration_seconds: number
  }
  is_active: number
  created_at: string
  updated_at: string
}

async function fetchAnalysisTypes() {
  // Only fetch system pipelines for settings page
  const { data } = await axios.get<AnalysisType[]>(`${API_BASE_URL}/api/analyses/system`, {
    withCredentials: true
  })
  return data
}

async function fetchTelegramSettings() {
  const { data } = await axios.get(`${API_BASE_URL}/api/settings/telegram`, {
    withCredentials: true
  })
  return data
}

async function fetchOpenRouterSettings() {
  const { data } = await axios.get(`${API_BASE_URL}/api/settings/openrouter`, {
    withCredentials: true
  })
  return data
}

async function updateModel(id: number, is_enabled: boolean) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/models/${id}`,
    { is_enabled },
    { withCredentials: true }
  )
  return data
}


async function updateTelegramSettings(bot_token: string | null) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/telegram`,
    { bot_token },
    { withCredentials: true }
  )
  return data
}

async function updateOpenRouterSettings(api_key: string | null) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/openrouter`,
    { api_key },
    { withCredentials: true }
  )
  return data
}

async function fetchTinkoffSettings() {
  const { data } = await axios.get(`${API_BASE_URL}/api/settings/tinkoff`, {
    withCredentials: true
  })
  return data
}

async function updateTinkoffSettings(api_token: string | null) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/tinkoff`,
    { api_token },
    { withCredentials: true }
  )
  return data
}

async function syncModelsFromOpenRouter() {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/settings/models/sync`,
    {},
    { withCredentials: true }
  )
  return data
}

async function fetchAllInstruments() {
  const { data } = await axios.get<Instrument[]>(`${API_BASE_URL}/api/instruments/all`, {
    withCredentials: true
  })
  return data
}

async function toggleInstrument(symbol: string) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/instruments/toggle`,
    { symbol },
    { withCredentials: true }
  )
  return data
}

export default function SettingsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useRequireAuth()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [showTelegramToken, setShowTelegramToken] = useState(false)
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
  const [tinkoffToken, setTinkoffToken] = useState('')
  const [showTinkoffToken, setShowTinkoffToken] = useState(false)
  const telegramInitialized = useRef(false)
  const openRouterInitialized = useRef(false)
  const tinkoffInitialized = useRef(false)
  const [instrumentSearch, setInstrumentSearch] = useState('')
  const [instrumentTypeFilter, setInstrumentTypeFilter] = useState<'all' | 'crypto' | 'equity'>('all')
  const [modelSearch, setModelSearch] = useState('')
  const [modelProviderFilter, setModelProviderFilter] = useState<'all' | string>('all')
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false)
  const [showEnabledOnly, setShowEnabledOnly] = useState(false)

  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ['settings', 'models'],
    queryFn: fetchModels,
  })

  const { data: dataSources = [], isLoading: dataSourcesLoading } = useQuery({
    queryKey: ['settings', 'data-sources'],
    queryFn: fetchDataSources,
  })

  const { data: analysisTypes = [], isLoading: analysisTypesLoading } = useQuery({
    queryKey: ['analysis-types'],
    queryFn: fetchAnalysisTypes,
  })

  const { data: telegramSettings } = useQuery({
    queryKey: ['settings', 'telegram'],
    queryFn: fetchTelegramSettings,
    enabled: !authLoading,
  })

  const { data: openRouterSettings } = useQuery({
    queryKey: ['settings', 'openrouter'],
    queryFn: fetchOpenRouterSettings,
    enabled: !authLoading,
  })

  const { data: tinkoffSettings } = useQuery({
    queryKey: ['settings', 'tinkoff'],
    queryFn: fetchTinkoffSettings,
    enabled: !authLoading,
  })

  const { data: allInstruments = [], isLoading: instrumentsLoading } = useQuery({
    queryKey: ['instruments', 'all'],
    queryFn: fetchAllInstruments,
    enabled: !authLoading,
  })

  // Initialize form values from API
  useEffect(() => {
    if (telegramSettings && !telegramInitialized.current) {
      if (telegramSettings.bot_token) {
        setTelegramBotToken(telegramSettings.bot_token)
      }
      telegramInitialized.current = true
    }
  }, [telegramSettings])

  useEffect(() => {
    if (openRouterSettings?.api_key && !openRouterInitialized.current) {
      setOpenRouterKey(openRouterSettings.api_key)
      openRouterInitialized.current = true
    }
  }, [openRouterSettings])

  useEffect(() => {
    if (tinkoffSettings?.api_token && !tinkoffInitialized.current) {
      setTinkoffToken(tinkoffSettings.api_token)
      tinkoffInitialized.current = true
    }
  }, [tinkoffSettings])

  const updateModelMutation = useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) =>
      updateModel(id, is_enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'models'] })
    },
  })


  const updateTelegramMutation = useMutation({
    mutationFn: () => updateTelegramSettings(telegramBotToken || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'telegram'] })
      alert('Telegram settings saved!')
    },
  })

  const updateOpenRouterMutation = useMutation({
    mutationFn: () => updateOpenRouterSettings(openRouterKey || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'openrouter'] })
      alert('OpenRouter settings saved!')
    },
  })

  const updateTinkoffMutation = useMutation({
    mutationFn: () => updateTinkoffSettings(tinkoffToken || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'tinkoff'] })
      alert('Tinkoff settings saved!')
    },
  })

  const toggleInstrumentMutation = useMutation({
    mutationFn: toggleInstrument,
    onSuccess: (data) => {
      // Optimistically update the cache
      queryClient.setQueryData(['instruments', 'all'], (old: Instrument[] | undefined) => {
        if (!old) return old
        return old.map(inst => 
          inst.symbol === data.symbol 
            ? { ...inst, is_enabled: data.is_enabled, id: data.id }
            : inst
        )
      })
      // Also invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['instruments', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['instruments'] })
    },
    onError: (error) => {
      console.error('Failed to toggle instrument:', error)
      alert('Failed to toggle instrument. Please try again.')
    },
  })

  const syncModelsMutation = useMutation({
    mutationFn: syncModelsFromOpenRouter,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'models'] })
      alert(`Success! ${data.added} new models added, ${data.skipped} already existed.`)
    },
    onError: (error: any) => {
      console.error('Failed to sync models:', error)
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to sync models'
      alert(`Failed to sync models: ${errorMsg}`)
    },
  })

  // Filter instruments based on search and type
  const filteredInstruments = allInstruments.filter((inst) => {
    const matchesSearch = inst.symbol.toLowerCase().includes(instrumentSearch.toLowerCase()) ||
                         inst.display_name.toLowerCase().includes(instrumentSearch.toLowerCase())
    const matchesType = instrumentTypeFilter === 'all' || inst.type === instrumentTypeFilter
    return matchesSearch && matchesType
  })

  // Filter models based on search, provider, free filter, and enabled filter
  const filteredModels = models.filter((model) => {
    const matchesSearch = model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                         model.display_name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                         (model.description && model.description.toLowerCase().includes(modelSearch.toLowerCase()))
    const matchesProvider = modelProviderFilter === 'all' || model.provider === modelProviderFilter
    const matchesFreeFilter = !showFreeModelsOnly || model.name.toLowerCase().includes(':free') || 
                              model.name.toLowerCase().includes('free') ||
                              model.display_name.toLowerCase().includes('free')
    const matchesEnabledFilter = !showEnabledOnly || model.is_enabled
    return matchesSearch && matchesProvider && matchesFreeFilter && matchesEnabledFilter
  })

  // Get unique providers for filter dropdown
  const uniqueProviders = Array.from(new Set(models.map(m => m.provider))).sort()

  if (authLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded p-4">
            <p className="text-red-700 dark:text-red-400">
              Admin access required to view settings.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-white">
          Settings
        </h1>

        {/* Available Models Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Available Models
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Enable or disable LLM models. Only enabled models will appear in analysis configuration dropdowns.
                {filteredModels.length > 0 && (
                  <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                    {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} found
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => syncModelsMutation.mutate()}
              disabled={syncModelsMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {syncModelsMutation.isPending ? 'Syncing...' : 'Sync from OpenRouter'}
            </button>
          </div>

          {modelsLoading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading models...</p>
          ) : (
            <div className="space-y-4">
              {/* Search and Filter Controls */}
              <div className="flex gap-4 items-center flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search models by name, provider, or description..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                </div>
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={showEnabledOnly}
                    onChange={(e) => setShowEnabledOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white whitespace-nowrap">
                    Enabled only
                  </span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={showFreeModelsOnly}
                    onChange={(e) => setShowFreeModelsOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white whitespace-nowrap">
                    Free to use models
                  </span>
                </label>
                <select
                  value={modelProviderFilter}
                  onChange={(e) => setModelProviderFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Providers</option>
                  {uniqueProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scrollable Model List */}
              {filteredModels.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No models found matching your search.
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                  {/* Scrollable container - shows ~10 items at a time, scrollable to see more */}
                  <div 
                    className="overflow-y-auto"
                    style={{ maxHeight: '500px' }}
                  >
                    {filteredModels.map((model) => (
                      <div
                        key={model.id}
                        className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {model.has_failures && <span className="text-orange-600 dark:text-orange-400 mr-1">⚠️</span>}
                                {model.display_name}
                              </h3>
                              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                                {model.provider}
                              </span>
                              <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                                {model.name}
                              </span>
                              {model.has_failures && (
                                <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded text-orange-600 dark:text-orange-400 font-medium">
                                  Has Failures
                                </span>
                              )}
                            </div>
                            {model.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                {model.description}
                              </p>
                            )}
                            <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                              {model.max_tokens && (
                                <span>Max tokens: {model.max_tokens.toLocaleString()}</span>
                              )}
                              {model.cost_per_1k_tokens && (
                                <span>Cost: {model.cost_per_1k_tokens}/1k tokens</span>
                              )}
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={model.is_enabled}
                              onChange={(e) =>
                                updateModelMutation.mutate({ id: model.id, is_enabled: e.target.checked })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Available Instruments Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Available Instruments
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Enable or disable instruments. Only enabled instruments will appear in dropdowns throughout the application.
            {filteredInstruments.length > 0 && (
              <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                {filteredInstruments.length} instrument{filteredInstruments.length !== 1 ? 's' : ''} found
              </span>
            )}
          </p>

          {instrumentsLoading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading instruments...</p>
          ) : (
            <div className="space-y-4">
              {/* Search and Filter Controls */}
              <div className="flex gap-4 items-center">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search instruments by symbol or name..."
                    value={instrumentSearch}
                    onChange={(e) => setInstrumentSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                </div>
                <select
                  value={instrumentTypeFilter}
                  onChange={(e) => setInstrumentTypeFilter(e.target.value as 'all' | 'crypto' | 'equity')}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Types</option>
                  <option value="crypto">Crypto</option>
                  <option value="equity">Equity</option>
                </select>
              </div>

              {/* Scrollable Instrument List */}
              {filteredInstruments.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No instruments found matching your search.
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                  {/* Scrollable container - shows ~10 items at a time, scrollable to see more */}
                  <div 
                    className="overflow-y-auto"
                    style={{ maxHeight: '500px' }}
                  >
                    {filteredInstruments.map((instrument) => (
                      <div
                        key={instrument.symbol}
                        className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {instrument.display_name}
                              </span>
                              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                                {instrument.symbol}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                instrument.type === 'crypto' 
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              }`}>
                                {instrument.type}
                              </span>
                              {instrument.exchange && (
                                <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-400">
                                  {instrument.exchange}
                                </span>
                              )}
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={instrument.is_enabled}
                              onChange={() => toggleInstrumentMutation.mutate(instrument.symbol)}
                              disabled={toggleInstrumentMutation.isPending}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Telegram Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Telegram Configuration
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Configure Telegram bot token. Messages will be sent to all users who started the bot (sent /start command).
            {telegramSettings?.active_users_count !== undefined && (
              <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                Active users: {telegramSettings.active_users_count}
              </span>
            )}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Bot Token
              </label>
              <div className="relative">
              <input
                  type={showTelegramToken ? "text" : "password"}
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="Get from @BotFather"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
                <button
                  type="button"
                  onClick={() => setShowTelegramToken(!showTelegramToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
                  aria-label={showTelegramToken ? "Hide token" : "Show token"}
                >
                  {showTelegramToken ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.59-3.59L3 3m6.29 6.29L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {telegramSettings?.bot_token_masked && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Current: {telegramSettings.bot_token_masked}
                </p>
              )}
            </div>

            <button
              onClick={() => updateTelegramMutation.mutate()}
              disabled={updateTelegramMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              {updateTelegramMutation.isPending ? 'Saving...' : 'Save Telegram Settings'}
            </button>
          </div>
        </div>

        {/* OpenRouter Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            OpenRouter Configuration
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Configure your OpenRouter API key for LLM model access.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                API Key
              </label>
              <div className="relative">
              <input
                  type={showOpenRouterKey ? "text" : "password"}
                value={openRouterKey}
                onChange={(e) => setOpenRouterKey(e.target.value)}
                placeholder="Get from https://openrouter.ai"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
                <button
                  type="button"
                  onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
                  aria-label={showOpenRouterKey ? "Hide API key" : "Show API key"}
                >
                  {showOpenRouterKey ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.59-3.59L3 3m6.29 6.29L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {openRouterSettings?.api_key_masked && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Current: {openRouterSettings.api_key_masked}
                </p>
              )}
            </div>

            <button
              onClick={() => updateOpenRouterMutation.mutate()}
              disabled={updateOpenRouterMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              {updateOpenRouterMutation.isPending ? 'Saving...' : 'Save OpenRouter Settings'}
            </button>
          </div>
        </div>

        {/* Tinkoff Invest API Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Tinkoff Invest API Configuration
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Configure your Tinkoff Invest API token for MOEX (Moscow Exchange) instruments.
            Required to fetch data for Russian stocks, bonds, and ETFs.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                API Token
              </label>
              <div className="relative">
                <input
                  type={showTinkoffToken ? "text" : "password"}
                  value={tinkoffToken}
                  onChange={(e) => setTinkoffToken(e.target.value)}
                  placeholder="Get from Tinkoff Invest account settings"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowTinkoffToken(!showTinkoffToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
                  aria-label={showTinkoffToken ? "Hide token" : "Show token"}
                >
                  {showTinkoffToken ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.59-3.59L3 3m6.29 6.29L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {tinkoffSettings?.api_token_masked && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Current: {tinkoffSettings.api_token_masked}
                </p>
              )}
            </div>

            <button
              onClick={() => updateTinkoffMutation.mutate()}
              disabled={updateTinkoffMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              {updateTinkoffMutation.isPending ? 'Saving...' : 'Save Tinkoff Settings'}
            </button>
          </div>
        </div>

        {/* Analysis Types Configuration Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Analysis Types Configuration
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Edit default pipeline configurations for each analysis type. Changes will be used as defaults for all future runs.
          </p>

          {analysisTypesLoading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading analysis types...</p>
          ) : analysisTypes.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No analysis types available.</p>
          ) : (
            <div className="space-y-3">
              {analysisTypes.map((analysis) => (
                <div
                  key={analysis.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {analysis.display_name}
                        </h3>
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                          v{analysis.version}
                        </span>
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                          {analysis.config.steps.length} steps
                        </span>
                      </div>
                      {analysis.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {analysis.description}
                        </p>
                      )}
                      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Cost: ${analysis.config.estimated_cost.toFixed(3)}</span>
                        <span>Duration: ~{Math.round(analysis.config.estimated_duration_seconds / 60)} min</span>
                        <span>Default: {analysis.config.default_timeframe}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(`/settings/analyses/${analysis.id}`)}
                      className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      Edit Configuration
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Data Sources Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Available Data Sources
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Data sources used by the system to fetch market data. Sources are automatically selected based on instrument type.
          </p>

          {dataSourcesLoading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading data sources...</p>
          ) : (
            <div className="space-y-4">
              {dataSources.map((source) => (
                <div
                  key={source.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {source.display_name}
                      </h3>
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                        {source.name}
                      </span>
                    </div>
                    {source.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {source.description}
                      </p>
                    )}
                    <div className="flex gap-2 text-xs">
                      {source.supports_crypto && (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-green-700 dark:text-green-400">
                          Crypto
                        </span>
                      )}
                      {source.supports_stocks && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-700 dark:text-blue-400">
                          Stocks
                        </span>
                      )}
                      {source.supports_forex && (
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-400">
                          Forex
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

