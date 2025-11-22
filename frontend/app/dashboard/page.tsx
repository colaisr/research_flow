'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { API_BASE_URL } from '@/lib/config'

interface Instrument {
  symbol: string
  type: string
  exchange: string | null
}

interface AnalysisType {
  id: number
  name: string
  display_name: string
  description: string | null
}

interface Run {
  id: number
  trigger_type: string
  instrument: string
  timeframe: string
  status: string
  created_at: string
  finished_at: string | null
  cost_est_total: number
}

async function fetchAnalysisTypes() {
  const { data } = await axios.get<AnalysisType[]>(`${API_BASE_URL}/api/analyses`, {
    withCredentials: true
  })
  return data
}

async function fetchInstruments(analysisTypeId?: number) {
  const url = analysisTypeId 
    ? `${API_BASE_URL}/api/instruments?analysis_type_id=${analysisTypeId}`
    : `${API_BASE_URL}/api/instruments`
  const { data } = await axios.get<Instrument[]>(url)
  return data
}

async function fetchRuns() {
  const { data } = await axios.get<Run[]>(`${API_BASE_URL}/api/runs?limit=10`)
  return data
}


async function createRun(analysisTypeId: number | null, instrument: string, timeframe: string) {
  const payload: any = {
    instrument,
    timeframe,
  }
  if (analysisTypeId) {
    payload.analysis_type_id = analysisTypeId
  }
  const { data } = await axios.post(`${API_BASE_URL}/api/runs`, payload, {
    withCredentials: true
  })
  return data
}

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isLoading: authLoading } = useRequireAuth()
  
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<number | null>(null)
  const [selectedInstrument, setSelectedInstrument] = useState<string>('')
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('H1')

  const { data: analysisTypes = [], isLoading: analysisTypesLoading } = useQuery({
    queryKey: ['analysis-types'],
    queryFn: fetchAnalysisTypes,
  })

  const { data: instruments = [], isLoading: instrumentsLoading, error: instrumentsError } = useQuery({
    queryKey: ['instruments', selectedAnalysisType],
    queryFn: () => fetchInstruments(selectedAnalysisType || undefined),
    enabled: true,
  })

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    refetchInterval: 5000, // Poll every 5 seconds
  })


  const createRunMutation = useMutation({
    mutationFn: ({ analysisTypeId, instrument, timeframe }: { analysisTypeId: number | null; instrument: string; timeframe: string }) =>
      createRun(analysisTypeId, instrument, timeframe),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      router.push(`/runs/${data.id}`)
    },
  })

  const handleRunAnalysis = () => {
    if (!selectedInstrument) {
      alert('Пожалуйста, выберите инструмент')
      return
    }
    if (!selectedAnalysisType) {
      alert('Пожалуйста, выберите тип анализа')
      return
    }
    createRunMutation.mutate({
      analysisTypeId: selectedAnalysisType,
      instrument: selectedInstrument,
      timeframe: selectedTimeframe,
    })
  }

  // Reset instrument when analysis type changes
  const handleAnalysisTypeChange = (analysisTypeId: string) => {
    const id = analysisTypeId ? parseInt(analysisTypeId) : null
    setSelectedAnalysisType(id)
    setSelectedInstrument('') // Reset instrument selection
  }

  const timeframes = [
    { value: 'M1', label: '1 Minute' },
    { value: 'M5', label: '5 Minutes' },
    { value: 'M15', label: '15 Minutes' },
    { value: 'H1', label: '1 Hour' },
    { value: 'D1', label: '1 Day' },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'text-green-600'
      case 'failed':
        return 'text-red-600'
      case 'model_failure':
        return 'text-orange-600'
      case 'running':
        return 'text-blue-600'
      case 'queued':
        return 'text-yellow-600'
      default:
        return 'text-gray-600'
    }
  }

  const getStatusDisplayName = (status: string) => {
    if (status === 'model_failure') return 'Model Failure'
    return status
  }

  if (authLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">

        {/* Run Analysis Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900">
            Run Analysis
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Тип анализа
              </label>
              <select
                value={selectedAnalysisType || ''}
                onChange={(e) => handleAnalysisTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                disabled={analysisTypesLoading}
              >
                <option value="">Выберите тип анализа...</option>
                {analysisTypesLoading ? (
                  <option disabled>Загрузка...</option>
                ) : (
                  analysisTypes.map((at) => (
                    <option key={at.id} value={at.id}>
                      {at.display_name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Инструмент
              </label>
              <select
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                disabled={instrumentsLoading || !selectedAnalysisType}
              >
                <option value="">Выберите инструмент...</option>
                {!selectedAnalysisType ? (
                  <option disabled>Сначала выберите тип анализа</option>
                ) : instrumentsLoading ? (
                  <option disabled>Загрузка инструментов...</option>
                ) : (
                  instruments.map((inst) => (
                    <option key={inst.symbol} value={inst.symbol}>
                      {inst.symbol} ({inst.type})
                    </option>
                  ))
                )}
              </select>
              {selectedAnalysisType && (
                <p className="mt-1 text-xs text-gray-500">
                  Показаны только инструменты, подходящие для данного типа анализа
                </p>
              )}
              {instrumentsError && (
                <p className="mt-1 text-xs text-red-600">
                  Ошибка загрузки инструментов
                </p>
              )}
            </div>

            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Таймфрейм
              </label>
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
              >
                {timeframes.map((tf) => (
                  <option key={tf.value} value={tf.value}>
                    {tf.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 h-5"></div>
            </div>

            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700 opacity-0">
                Действие
              </label>
              <button
                onClick={handleRunAnalysis}
                disabled={!selectedAnalysisType || !selectedInstrument || createRunMutation.isPending}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              >
                {createRunMutation.isPending ? 'Создание...' : 'Запустить анализ'}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <Link
              href="/analyses"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              → Or choose from available analysis types
            </Link>
          </div>
        </div>

        {/* Recent Runs */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900">
            Recent Runs
          </h2>

          {runsLoading ? (
            <p className="text-gray-600">Loading runs...</p>
          ) : runs.length === 0 ? (
            <p className="text-gray-600">
              No runs yet. Start your first analysis above!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Instrument
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timeframe
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cost
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {run.instrument}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {run.timeframe}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${getStatusColor(run.status)}`}>
                          {getStatusDisplayName(run.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(run.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${run.cost_est_total.toFixed(3)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

