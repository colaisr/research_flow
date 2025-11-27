'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { API_BASE_URL } from '@/lib/config'

interface CreateToolRequest {
  tool_type: 'database' | 'api' | 'rag'
  display_name: string
  config: Record<string, any>
  is_shared: boolean
}

async function createTool(request: CreateToolRequest) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/tools`,
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

export default function NewToolPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  
  // Step 1: Tool type and creation method
  const [toolType, setToolType] = useState<'database' | 'api' | 'rag' | ''>('')
  const [creationMethod, setCreationMethod] = useState<'predefined' | 'custom' | ''>('')
  
  // Step 2: Configuration
  const [config, setConfig] = useState<Record<string, any>>({})
  
  // Step 3: Test
  const [testResult, setTestResult] = useState<any>(null)
  const [testedToolId, setTestedToolId] = useState<number | null>(null)
  
  // Step 4: Name and save
  const [displayName, setDisplayName] = useState('')
  const [isShared, setIsShared] = useState(true)

  const createMutation = useMutation({
    mutationFn: createTool,
    onSuccess: (data) => {
      setTestedToolId(data.id)
      setStep(4) // Go to test/save step
    },
    onError: (error: any) => {
      alert(`Failed to create tool: ${error.response?.data?.detail || error.message}`)
    }
  })

  const testMutation = useMutation({
    mutationFn: testTool,
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

  const handleStep1Next = () => {
    if (!toolType) {
      alert('Please select a tool type')
      return
    }
    if (toolType === 'rag') {
      // RAG tools skip to step 3 (name/description)
      setStep(3)
      return
    }
    if (!creationMethod) {
      alert('Please select creation method')
      return
    }
    setStep(2)
  }

  const handleStep2Next = () => {
    // Validate config based on tool type and creation method
    if (toolType === 'api' && creationMethod === 'custom') {
      if (!config.base_url) {
        alert('Please provide base URL')
        return
      }
    } else if (toolType === 'database' && creationMethod === 'custom') {
      if (!config.host || !config.database || !config.username) {
        alert('Please provide database connection details')
        return
      }
    }
    setStep(3)
  }

  const handleStep3Next = async () => {
    if (!displayName) {
      alert('Please provide tool display name')
      return
    }
    
    // For RAG tools, create via RAG API (creates both RAG and tool)
    if (toolType === 'rag') {
      try {
        console.log('[RAG Creation] Sending request to:', `${API_BASE_URL}/api/rags`)
        console.log('[RAG Creation] Payload:', { name: displayName, description: config.description || null })
        const { data } = await axios.post(
          `${API_BASE_URL}/api/rags`,
          {
            name: displayName,
            description: config.description || null,
          },
          { 
            withCredentials: true,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
        console.log('[RAG Creation] Success:', data)
        // Redirect to RAG editor
        router.push(`/rags/${data.id}`)
        return
      } catch (error: any) {
        console.error('[RAG Creation] Error:', error)
        console.error('[RAG Creation] Error response:', error.response)
        console.error('[RAG Creation] Error message:', error.message)
        const errorMessage = error.response?.data?.detail || error.message || 'Network Error'
        alert(`Не удалось создать RAG: ${errorMessage}`)
        return
      }
    }
    
    // Create other tool types
    const request: CreateToolRequest = {
      tool_type: toolType as 'database' | 'api',
      display_name: displayName,
      config: {
        connector_type: creationMethod,
        connector_name: config.connector_name || undefined,
        ...config
      },
      is_shared: isShared
    }
    createMutation.mutate(request)
  }

  const handleStep4Save = () => {
    // Tool already created and tested, go to tools list
    queryClient.invalidateQueries({ queryKey: ['tools'] })
    router.push('/tools')
  }

  const handleTest = () => {
    if (testedToolId) {
      testMutation.mutate(testedToolId)
    }
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Тип инструмента *
        </label>
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setToolType('api')}
            className={`p-4 border-2 rounded-lg text-center transition ${
              toolType === 'api'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="font-medium">API</div>
            <div className="text-sm text-gray-600 mt-1">REST API, GraphQL</div>
          </button>
          <button
            onClick={() => setToolType('database')}
            className={`p-4 border-2 rounded-lg text-center transition ${
              toolType === 'database'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="font-medium">Database</div>
            <div className="text-sm text-gray-600 mt-1">MySQL, PostgreSQL</div>
          </button>
          <button
            onClick={() => setToolType('rag')}
            className={`p-4 border-2 rounded-lg text-center transition ${
              toolType === 'rag'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="font-medium">RAG</div>
            <div className="text-sm text-gray-600 mt-1">Knowledge Base</div>
          </button>
        </div>
      </div>

      {toolType && toolType !== 'rag' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Способ создания *
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setCreationMethod('predefined')}
              className={`p-4 border-2 rounded-lg text-center transition ${
                creationMethod === 'predefined'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="font-medium">Предустановленный</div>
              <div className="text-sm text-gray-600 mt-1">Binance, PostgreSQL и др.</div>
            </button>
            <button
              onClick={() => setCreationMethod('custom')}
              className={`p-4 border-2 rounded-lg text-center transition ${
                creationMethod === 'custom'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="font-medium">Пользовательский</div>
              <div className="text-sm text-gray-600 mt-1">Настроить вручную</div>
            </button>
          </div>
        </div>
      )}

      {toolType === 'api' && creationMethod === 'predefined' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Выберите коннектор
          </label>
          <select
            value={config.connector_name || ''}
            onChange={(e) => setConfig({ ...config, connector_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Выберите...</option>
            <option value="binance">Binance API</option>
            <option value="yfinance">Yahoo Finance API</option>
            <option value="tinkoff">Tinkoff Invest API</option>
          </select>
        </div>
      )}

      {toolType === 'database' && creationMethod === 'predefined' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Выберите тип БД
          </label>
          <select
            value={config.connector_name || ''}
            onChange={(e) => setConfig({ ...config, connector_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Выберите...</option>
            <option value="mysql">MySQL</option>
            <option value="postgresql">PostgreSQL</option>
            <option value="mongodb">MongoDB</option>
          </select>
        </div>
      )}
    </div>
  )

  const renderStep2 = () => {
    if (toolType === 'api' && creationMethod === 'custom') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Base URL *
            </label>
            <input
              type="text"
              value={config.base_url || ''}
              onChange={(e) => setConfig({ ...config, base_url: e.target.value })}
              placeholder="https://api.example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Auth Type
            </label>
            <select
              value={config.auth_type || 'none'}
              onChange={(e) => setConfig({ ...config, auth_type: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="api_key">API Key</option>
              <option value="basic">Basic Auth</option>
              <option value="oauth">OAuth</option>
            </select>
          </div>
          {config.auth_type === 'api_key' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={config.api_key_encrypted || ''}
                onChange={(e) => setConfig({ ...config, api_key_encrypted: e.target.value })}
                placeholder="Enter API key"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {config.auth_type === 'basic' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={config.username || ''}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={config.password_encrypted || ''}
                  onChange={(e) => setConfig({ ...config, password_encrypted: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Timeout (seconds)
            </label>
            <input
              type="number"
              value={config.timeout || 30}
              onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )
    }

    if (toolType === 'database' && creationMethod === 'custom') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Host *
            </label>
            <input
              type="text"
              value={config.host || ''}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
              placeholder="localhost"
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Port *
              </label>
              <input
                type="number"
                value={config.port || ''}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                placeholder="3306"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Database *
              </label>
              <input
                type="text"
                value={config.database || ''}
                onChange={(e) => setConfig({ ...config, database: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username *
              </label>
              <input
                type="text"
                value={config.username || ''}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                value={config.password_encrypted || ''}
                onChange={(e) => setConfig({ ...config, password_encrypted: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SSL Mode
            </label>
            <select
              value={config.ssl_mode || 'DISABLED'}
              onChange={(e) => setConfig({ ...config, ssl_mode: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DISABLED">Disabled</option>
              <option value="REQUIRED">Required</option>
              <option value="VERIFY_CA">Verify CA</option>
              <option value="VERIFY_IDENTITY">Verify Identity</option>
            </select>
          </div>
        </div>
      )
    }

    // Predefined connectors - minimal config needed
    if (creationMethod === 'predefined') {
      return (
        <div className="space-y-4">
          {toolType === 'api' && config.connector_name === 'tinkoff' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tinkoff API Token
              </label>
              <input
                type="password"
                value={config.api_token || ''}
                onChange={(e) => setConfig({ ...config, api_token: e.target.value })}
                placeholder="Enter Tinkoff API token"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Token will be stored securely in tool configuration
              </p>
            </div>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <p className="text-sm text-blue-800">
              Предустановленный коннектор настроен. Нажмите "Далее" для продолжения.
            </p>
          </div>
        </div>
      )
    }

    return null
  }

  const renderStep3 = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {toolType === 'rag' ? 'Название базы знаний' : 'Имя инструмента'} *
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={toolType === 'rag' ? 'Legal Documents, Research Papers...' : 'Binance API'}
          className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-sm text-gray-500 mt-1">
          {toolType === 'rag' ? 'Название вашей базы знаний' : 'Показывается пользователям'}
        </p>
      </div>
      {toolType === 'rag' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Описание (необязательно)
          </label>
          <textarea
            value={config.description || ''}
            onChange={(e) => setConfig({ ...config, description: e.target.value })}
            placeholder="Описание содержимого базы знаний..."
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}
      {toolType !== 'rag' && (
      <div className="flex items-center">
        <input
          type="checkbox"
          id="is_shared"
          checked={isShared}
          onChange={(e) => setIsShared(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="is_shared" className="text-sm text-gray-700">
          Доступен во всех организациях, где я владелец
        </label>
      </div>
      )}
      {toolType === 'rag' && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <p className="text-sm text-blue-800">
            После создания вы сможете загружать документы, импортировать из URL и выполнять семантический поиск.
            Модель эмбеддингов и векторная база данных настраиваются автоматически.
          </p>
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-4">
      {testedToolId ? (
        <>
          <div className="bg-green-50 border border-green-200 rounded p-4">
            <p className="text-sm text-green-800">
              Инструмент создан успешно (ID: {testedToolId})
            </p>
          </div>
          <div>
            <button
              onClick={handleTest}
              disabled={testMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mb-4"
            >
              {testMutation.isPending ? 'Тестирование...' : 'Протестировать соединение'}
            </button>
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
        </>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <p className="text-sm text-yellow-800">
            Создайте инструмент на предыдущем шаге
          </p>
        </div>
      )}
    </div>
  )

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
            Создать инструмент
          </h1>
          <p className="text-gray-600">
            Настройте новый инструмент для использования в анализах
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  step === s
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : step > s
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}>
                  {step > s ? '✓' : s}
                </div>
                {s < 4 && (
                  <div className={`flex-1 h-1 mx-2 ${
                    step > s ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-600">
            <span>Тип</span>
            <span>Настройка</span>
            <span>Тест</span>
            <span>Сохранение</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <button
            onClick={() => {
              if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4)
              else router.push('/tools')
            }}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            {step === 1 ? 'Отмена' : 'Назад'}
          </button>
          <button
            onClick={async () => {
              if (step === 1) handleStep1Next()
              else if (step === 2) handleStep2Next()
              else if (step === 3) await handleStep3Next()
              else if (step === 4) handleStep4Save()
            }}
            disabled={createMutation.isPending || testMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {step === 1 && 'Далее'}
            {step === 2 && 'Далее'}
            {step === 3 && (createMutation.isPending ? 'Создание...' : 'Создать')}
            {step === 4 && 'Готово'}
          </button>
        </div>
      </div>
    </div>
  )
}

