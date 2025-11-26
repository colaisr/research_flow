'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { API_BASE_URL } from '@/lib/config'

interface PublicRAG {
  id: number
  name: string
  description: string | null
  document_count: number
  public_access_mode: string | null
  created_at: string
  updated_at: string | null
}

interface Document {
  id: number
  rag_id: number
  title: string
  content: string
  file_path: string | null
  document_metadata: Record<string, any> | null
  embedding_status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  updated_at: string | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{
    document: string
    metadata: Record<string, any>
    distance?: number
  }>
}

async function fetchPublicRAG(token: string) {
  const { data } = await axios.get<PublicRAG>(`${API_BASE_URL}/api/rags/public/${token}`)
  return data
}

async function fetchPublicDocuments(token: string) {
  const { data } = await axios.get<Document[]>(`${API_BASE_URL}/api/rags/public/${token}/documents`)
  return data
}

async function queryPublicRAG(token: string, query: string, topK: number = 5) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/rags/public/${token}/query`,
    { query, top_k: topK }
  )
  return data
}

async function uploadPublicDocument(token: string, file: File, title?: string) {
  const formData = new FormData()
  formData.append('file', file)
  if (title) formData.append('title', title)
  
  
  const { data } = await axios.post(
    `${API_BASE_URL}/api/rags/public/${token}/documents`,
    formData,
    { 
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000 // 60 seconds timeout for large files
    }
  )
  return data
}

async function deletePublicDocument(token: string, docId: number) {
  const { data } = await axios.delete(
    `${API_BASE_URL}/api/rags/public/${token}/documents/${docId}`
  )
  return data
}

export default function PublicRAGEditorPage() {
  const params = useParams()
  const token = params.token as string
  const queryClient = useQueryClient()

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set())
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const [showDocumentPreview, setShowDocumentPreview] = useState<Document | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: rag, isLoading: ragLoading } = useQuery({
    queryKey: ['public-rag', token],
    queryFn: () => fetchPublicRAG(token),
    enabled: !!token,
  })

  const { data: documents = [], refetch: refetchDocuments } = useQuery({
    queryKey: ['public-documents', token],
    queryFn: () => fetchPublicDocuments(token),
    enabled: !!token,
  })

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(documentSearchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(documentSearchQuery.toLowerCase())
  )

  const canManageFiles = rag?.public_access_mode === 'full_editor' || rag?.public_access_mode === 'folder_only'
  const canQuery = rag?.public_access_mode === 'full_editor'

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages])

  const uploadMutation = useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) => uploadPublicDocument(token, file, title),
    onSuccess: () => {
      refetchDocuments()
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || error.message || 'Network Error'
      alert(`Не удалось загрузить файл: ${errorMessage}`)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => deletePublicDocument(token, docId),
    onSuccess: () => {
      refetchDocuments()
      setSelectedDocuments(new Set())
    },
    onError: (error: any) => {
      alert(`Не удалось удалить документ: ${error.response?.data?.detail || error.message}`)
    }
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      uploadMutation.mutate({ file })
    })
  }

  const handleToggleSelect = (docId: number) => {
    const newSelected = new Set(selectedDocuments)
    if (newSelected.has(docId)) {
      newSelected.delete(docId)
    } else {
      newSelected.add(docId)
    }
    setSelectedDocuments(newSelected)
  }

  const handleBulkDelete = () => {
    if (selectedDocuments.size === 0) return
    if (confirm(`Удалить ${selectedDocuments.size} документов?`)) {
      Array.from(selectedDocuments).forEach(docId => {
        deleteMutation.mutate(docId)
      })
    }
  }

  const handleQuery = async () => {
    if (!queryInput.trim() || !canQuery) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: queryInput,
    }
    setChatMessages(prev => [...prev, userMessage])
    setQueryInput('')
    setIsQuerying(true)

    try {
      const response = await queryPublicRAG(token, queryInput, 5)
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.results.length > 0
          ? `Найдено ${response.results.length} релевантных фрагментов:\n\n${response.results.map((r: any, idx: number) => `[${idx + 1}] ${r.document.substring(0, 200)}...`).join('\n\n')}`
          : 'Не найдено релевантных документов.',
        sources: response.results.map((r: any) => ({
          document: r.document,
          metadata: r.metadata || {},
          distance: r.distance,
        })),
      }
      setChatMessages(prev => [...prev, assistantMessage])
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Ошибка: ${error.response?.data?.detail || error.message}`,
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setIsQuerying(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'processing':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  if (ragLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!rag) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-700 mb-2">База знаний не найдена</p>
          <p className="text-sm text-gray-500">Проверьте правильность ссылки</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{rag.name}</h1>
          {rag.description && (
            <p className="text-gray-600 mt-1">{rag.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span>{rag.document_count} {rag.document_count === 1 ? 'документ' : rag.document_count < 5 ? 'документа' : 'документов'}</span>
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Публичный доступ
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[32%_68%] gap-6 h-[calc(100vh-200px)]">
          {/* Left Panel - Documents */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 mb-3">Документы</h2>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Поиск документов..."
                    value={documentSearchQuery}
                    onChange={(e) => setDocumentSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  {filteredDocuments.length} из {documents.length}
                </span>
              </div>
              {canManageFiles && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm hover:shadow flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Загрузить
                  </button>
                </div>
              )}
              {selectedDocuments.size > 0 && canManageFiles && (
                <div className="mb-4">
                  <button
                    onClick={handleBulkDelete}
                    className="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium shadow-sm hover:shadow flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Удалить выбранные ({selectedDocuments.size})
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredDocuments.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  <p>Пока нет документов</p>
                </div>
              ) : (
                filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`bg-white border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow flex items-start gap-3 ${
                      selectedDocuments.has(doc.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    onClick={() => canManageFiles && handleToggleSelect(doc.id)}
                  >
                    {canManageFiles && (
                      <input
                        type="checkbox"
                        checked={selectedDocuments.has(doc.id)}
                        onChange={() => handleToggleSelect(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-medium text-sm text-gray-900 line-clamp-1">{doc.title}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(doc.embedding_status)}`}>
                          {doc.embedding_status === 'pending' ? 'Ожидание' : 
                           doc.embedding_status === 'processing' ? 'Обработка' : 
                           doc.embedding_status === 'completed' ? 'Завершено' : 
                           doc.embedding_status === 'failed' ? 'Ошибка' : doc.embedding_status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 mb-2">{doc.content.length} симв.</p>
                      <div className="flex gap-2 text-xs">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowDocumentPreview(doc)
                          }}
                          className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          Просмотр
                        </button>
                        {doc.file_path && (
                          <a
                            href={`${API_BASE_URL}/api/rags/public/${token}/download/${doc.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-green-600 hover:text-green-700 flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Скачать
                          </a>
                        )}
                        {canManageFiles && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm('Удалить этот документ?')) {
                                deleteMutation.mutate(doc.id)
                              }
                            }}
                            className="text-red-600 hover:text-red-700 flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel - Chat Interface */}
          <div className="flex-1 flex flex-col bg-gray-50 min-w-0 h-full">
            {canQuery ? (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 py-16">
                      <div className="w-20 h-20 mx-auto mb-4 bg-blue-50 rounded-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-lg font-medium text-gray-700 mb-2">Начните запрашивать базу знаний</p>
                      <p className="text-sm text-gray-500">Задавайте вопросы и получайте релевантные фрагменты документов</p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-xl p-4 shadow-sm ${
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-900 border border-gray-200'
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-300">
                              <p className="text-xs font-semibold mb-3 text-gray-600 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Источники ({msg.sources.length}):
                              </p>
                              <div className="space-y-2">
                                {msg.sources.map((source, idx) => (
                                  <div key={idx} className="text-xs bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                      <span className="font-semibold text-gray-700">Документ {idx + 1}</span>
                                      {source.distance !== undefined && (
                                        <span className="text-gray-500 font-medium">
                                          {(1 - source.distance).toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-gray-600 leading-relaxed line-clamp-3">
                                      {source.document}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isQuerying && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <p className="text-sm text-gray-600">Поиск...</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="border-t border-gray-200 bg-white p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleQuery()}
                      placeholder="Задайте вопрос о документах..."
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isQuerying}
                    />
                    <button
                      onClick={handleQuery}
                      disabled={!queryInput.trim() || isQuerying}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {isQuerying ? 'Поиск...' : 'Запрос'}
                    </button>
                    {chatMessages.length > 0 && (
                      <button
                        onClick={() => setChatMessages([])}
                        className="px-3 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center text-gray-500">
                <div className="py-16">
                  <svg className="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 0A9 9 0 0112 18.5c-2.973 0-5.66-1.192-7.636-3.164M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-lg font-medium text-gray-700 mb-2">Чат недоступен</p>
                  <p className="text-sm text-gray-500">В этом режиме доступна только работа с файлами</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Document Preview Modal */}
        {showDocumentPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-4xl w-full max-h-[85vh] flex flex-col">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{showDocumentPreview.title}</h3>
                <button
                  onClick={() => setShowDocumentPreview(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto mb-4">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-mono">
                    {showDocumentPreview.content}
                  </pre>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-4 flex justify-end">
                <button
                  onClick={() => setShowDocumentPreview(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

