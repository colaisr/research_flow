'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'

interface Tool {
  id: number
  user_id: number
  organization_id: number | null
  tool_type: 'database' | 'api' | 'rag'
  display_name: string
  config: Record<string, any>
  is_active: boolean
  is_shared: boolean
  created_at: string
  updated_at: string | null
}

interface UpdateToolRequest {
  display_name?: string
  config?: Record<string, any>
  is_active?: boolean
}

async function fetchTool(toolId: number) {
  const { data } = await axios.get<Tool>(
    `${API_BASE_URL}/api/tools/${toolId}`,
    { withCredentials: true }
  )
  return data
}

async function updateTool(toolId: number, request: UpdateToolRequest) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/tools/${toolId}`,
    request,
    { withCredentials: true }
  )
  return data
}

async function testTool(toolId: number) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/tools/${toolId}/test`,
    {},
    { withCredentials: true }
  )
  return data
}

export default function EditToolPage() {
  const router = useRouter()
  const params = useParams()
  const queryClient = useQueryClient()
  const toolId = parseInt(params.id as string)

  const { data: tool, isLoading, error } = useQuery({
    queryKey: ['tool', toolId],
    queryFn: () => fetchTool(toolId),
  })

  const [displayName, setDisplayName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [config, setConfig] = useState<Record<string, any>>({})
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    if (tool) {
      setDisplayName(tool.display_name)
      setIsActive(tool.is_active)
      setConfig(tool.config)
    }
  }, [tool])

  const updateMutation = useMutation({
    mutationFn: (request: UpdateToolRequest) => updateTool(toolId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool', toolId] })
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      alert('Инструмент обновлён')
      router.push('/tools')
    },
    onError: (error: any) => {
      alert(`Failed to update tool: ${error.response?.data?.detail || error.message}`)
    }
  })

  const testMutation = useMutation({
    mutationFn: () => testTool(toolId),
    onSuccess: (data) => {
      setTestResult(data)
      if (data.success) {
        alert('Tool test successful!')
      } else {
        alert(`Tool test failed: ${data.message}`)
      }
    },
    onError: (error: any) => {
      alert(`Tool test failed: ${error.response?.data?.detail || error.message}`)
    }
  })

  const handleSave = () => {
    if (!displayName) {
      alert('Please provide tool display name')
      return
    }

    updateMutation.mutate({
      display_name: displayName,
      config,
      is_active: isActive
    })
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading tool...</p>
        </div>
      </div>
    )
  }

  if (error || !tool) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-100 border border-red-400 rounded p-4">
            <p className="text-red-700">
              Error loading tool: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/tools')}
            className="text-blue-600 hover:underline mb-4"
          >
            ← Назад к инструментам
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Редактировать инструмент
          </h1>
          <p className="text-gray-600">
            Изменить настройки инструмента
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Имя инструмента *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              Активен
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Конфигурация (JSON)
            </label>
            <textarea
              value={JSON.stringify(config, null, 2)}
              onChange={(e) => {
                try {
                  setConfig(JSON.parse(e.target.value))
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="text-sm text-gray-500 mt-1">
              Изменение конфигурации может привести к ошибкам. Будьте осторожны.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {testMutation.isPending ? 'Тестирование...' : 'Протестировать'}
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={() => router.push('/tools')}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>

          {testResult && (
            <div className={`border rounded p-4 ${
              testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <p className={`text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {testResult.message}
              </p>
              {testResult.result && (
                <pre className="mt-2 text-xs overflow-auto">
                  {JSON.stringify(testResult.result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


