'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useRouter, useParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { API_BASE_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'

interface RAG {
  id: number
  organization_id: number
  name: string
  description: string | null
  vector_db_type: string
  embedding_model: string
  document_count: number
  min_similarity_score: number | null
  public_access_token: string | null
  public_access_mode: string | null
  public_access_enabled: boolean
  created_at: string
  updated_at: string | null
  user_role: string | null
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

async function fetchRAG(ragId: number) {
  const { data } = await axios.get<RAG>(`${API_BASE_URL}/api/rags/${ragId}`, { withCredentials: true })
  return data
}

async function fetchDocuments(ragId: number) {
  const { data } = await axios.get<Document[]>(`${API_BASE_URL}/api/rags/${ragId}/documents`, { withCredentials: true })
  return data
}

async function queryRAG(ragId: number, query: string, topK: number = 5) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/rags/${ragId}/query`,
    { query, top_k: topK },
    { withCredentials: true }
  )
  return data
}

async function uploadDocument(ragId: number, file: File, title?: string) {
  const formData = new FormData()
  formData.append('file', file)
  if (title) formData.append('title', title)
  
  const { data } = await axios.post(
    `${API_BASE_URL}/api/rags/${ragId}/documents`,
    formData,
    { 
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' }
    }
  )
  return data
}

async function importURL(ragId: number, url: string, title?: string) {
  const formData = new FormData()
  formData.append('url', url)
  if (title) formData.append('title', title)
  
  const { data } = await axios.post(
    `${API_BASE_URL}/api/rags/${ragId}/documents/url`,
    formData,
    { 
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' }
    }
  )
  return data
}

async function updateDocument(ragId: number, docId: number, content: string) {
  const formData = new FormData()
  formData.append('content', content)
  
  const { data } = await axios.put(
    `${API_BASE_URL}/api/rags/${ragId}/documents/${docId}`,
    formData,
    { 
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' }
    }
  )
  return data
}

async function deleteDocument(ragId: number, docId: number) {
  const { data } = await axios.delete(
    `${API_BASE_URL}/api/rags/${ragId}/documents/${docId}`,
    { withCredentials: true }
  )
  return data
}

async function bulkDeleteDocuments(ragId: number, documentIds: number[]) {
  const { data } = await axios.delete(
    `${API_BASE_URL}/api/rags/${ragId}/documents/bulk`,
    { 
      withCredentials: true,
      data: { document_ids: documentIds }
    }
  )
  return data
}

async function updateRAG(ragId: number, name?: string, description?: string, min_similarity_score?: number | null) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/rags/${ragId}`,
    { name, description, min_similarity_score },
    { withCredentials: true }
  )
  return data
}

async function updatePublicAccess(ragId: number, enabled: boolean, mode?: string) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/rags/${ragId}/public-access`,
    { enabled, mode },
    { withCredentials: true }
  )
  return data
}

export default function RAGEditorPage() {
  const router = useRouter()
  const params = useParams()
  const ragId = parseInt(params.id as string)
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()
  
  const [selectedDocuments, setSelectedDocuments] = useState<Set<number>>(new Set())
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [showDocumentPreview, setShowDocumentPreview] = useState<Document | null>(null)
  const [showURLImport, setShowURLImport] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [minScore, setMinScore] = useState<number | null>(null)
  const [isSavingMinScore, setIsSavingMinScore] = useState(false)
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const [showFilterSettings, setShowFilterSettings] = useState(false)
  const [showPublicAccessModal, setShowPublicAccessModal] = useState(false)
  const [isEditingDocument, setIsEditingDocument] = useState(false)
  const [editedDocumentContent, setEditedDocumentContent] = useState('')
  const [processingDocumentId, setProcessingDocumentId] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const { data: rag, isLoading: ragLoading } = useQuery({
    queryKey: ['rag', ragId],
    queryFn: () => fetchRAG(ragId),
    enabled: isAuthenticated !== false && !isNaN(ragId),
  })

  const { data: documents = [], isLoading: docsLoading, refetch: refetchDocuments } = useQuery({
    queryKey: ['rag-documents', ragId],
    queryFn: () => fetchDocuments(ragId),
    enabled: isAuthenticated !== false && !isNaN(ragId),
    refetchInterval: 5000, // Poll every 5 seconds to check for processing status
  })

  const uploadMutation = useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) => uploadDocument(ragId, file, title),
    onSuccess: () => {
      refetchDocuments()
      queryClient.invalidateQueries({ queryKey: ['rag', ragId] })
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error occurred'
      // Show user-friendly error message
      alert(`Не удалось загрузить документ: ${errorMessage}`)
      // Clear file input so user can try again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  })

  const urlImportMutation = useMutation({
    mutationFn: ({ url, title }: { url: string; title?: string }) => importURL(ragId, url, title),
    onSuccess: () => {
      refetchDocuments()
      queryClient.invalidateQueries({ queryKey: ['rag', ragId] })
      setShowURLImport(false)
      setUrlInput('')
      setUrlTitle('')
    },
    onError: (error: any) => {
      alert(`Не удалось импортировать URL: ${error.response?.data?.detail || error.message}`)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => deleteDocument(ragId, docId),
    onSuccess: () => {
      refetchDocuments()
      queryClient.invalidateQueries({ queryKey: ['rag', ragId] })
      setSelectedDocuments(new Set())
    },
    onError: (error: any) => {
      alert(`Не удалось удалить документ: ${error.response?.data?.detail || error.message}`)
    }
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (documentIds: number[]) => bulkDeleteDocuments(ragId, documentIds),
    onSuccess: () => {
      refetchDocuments()
      queryClient.invalidateQueries({ queryKey: ['rag', ragId] })
      setSelectedDocuments(new Set())
    },
    onError: (error: any) => {
      alert(`Не удалось удалить документы: ${error.response?.data?.detail || error.message}`)
    }
  })

  const updateDocumentMutation = useMutation({
    mutationFn: ({ docId, content }: { docId: number; content: string }) => updateDocument(ragId, docId, content),
    onSuccess: (data, variables) => {
      // Show processing modal
      setProcessingDocumentId(variables.docId)
      setIsEditingDocument(false)
      setEditedDocumentContent('')
      refetchDocuments()
      queryClient.invalidateQueries({ queryKey: ['rag', ragId] })
    },
    onError: (error: any) => {
      alert(`Не удалось обновить документ: ${error.response?.data?.detail || error.message}`)
      setProcessingDocumentId(null)
    }
  })

  const updateRAGMutation = useMutation({
    mutationFn: ({ name, description, min_similarity_score }: { name?: string; description?: string; min_similarity_score?: number | null }) => updateRAG(ragId, name, description, min_similarity_score),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag', ragId] })
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      setIsEditingName(false)
    },
    onError: (error: any) => {
      alert(`Не удалось обновить RAG: ${error.response?.data?.detail || error.message}`)
      setEditedName(rag?.name || '')
    }
  })

  const updatePublicAccessMutation = useMutation({
    mutationFn: ({ enabled, mode }: { enabled: boolean; mode?: string }) => updatePublicAccess(ragId, enabled, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag', ragId] })
    },
    onError: (error: any) => {
      alert(`Не удалось обновить публичный доступ: ${error.response?.data?.detail || error.message}`)
    }
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      uploadMutation.mutate({ file })
    })
  }

  const handleURLImport = () => {
    if (!urlInput.trim()) {
      alert('Пожалуйста, введите URL')
      return
    }
    urlImportMutation.mutate({ url: urlInput.trim(), title: urlTitle.trim() || undefined })
  }

  const handleQuery = async () => {
    if (!queryInput.trim() || isQuerying) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: queryInput.trim(),
    }
    setChatMessages(prev => [...prev, userMessage])
    setQueryInput('')
    setIsQuerying(true)

    try {
      const response = await queryRAG(ragId, queryInput.trim())
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.results.length > 0
          ? `Найдено ${response.results.length} ${response.results.length === 1 ? 'релевантный документ' : response.results.length < 5 ? 'релевантных документа' : 'релевантных документов'}:\n\n${response.results.map((r: any, i: number) => `${i + 1}. ${r.document.substring(0, 200)}...`).join('\n\n')}`
          : 'Релевантные документы не найдены.',
        sources: response.results,
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

  const handleToggleSelect = (docId: number) => {
    setSelectedDocuments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(docId)) {
        newSet.delete(docId)
      } else {
        newSet.add(docId)
      }
      return newSet
    })
  }

  const handleBulkDelete = () => {
    if (selectedDocuments.size === 0) return
    if (confirm(`Удалить ${selectedDocuments.size} ${selectedDocuments.size === 1 ? 'документ' : selectedDocuments.size < 5 ? 'документа' : 'документов'}?`)) {
      bulkDeleteMutation.mutate(Array.from(selectedDocuments))
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'processing':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const canManageFiles = rag?.user_role === 'owner' || rag?.user_role === 'editor' || rag?.user_role === 'file_manager'
  const canQuery = rag?.user_role === 'owner' || rag?.user_role === 'editor' || rag?.user_role === 'viewer'
  const canEdit = rag?.user_role === 'owner' || rag?.user_role === 'editor'

  // Filter documents by search query
  const filteredDocuments = documents.filter(doc => 
    doc.title.toLowerCase().includes(documentSearchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(documentSearchQuery.toLowerCase())
  )

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    if (rag) {
      setEditedName(rag.name)
      setMinScore(rag.min_similarity_score)
    }
  }, [rag])

  // Monitor document processing status and close modal when done
  useEffect(() => {
    if (processingDocumentId === null) return

    const processedDoc = documents.find(doc => doc.id === processingDocumentId)
    if (processedDoc) {
      if (processedDoc.embedding_status === 'completed' || processedDoc.embedding_status === 'failed') {
        // Processing is done, close modal after a short delay
        setTimeout(() => {
          setProcessingDocumentId(null)
        }, 1500) // Small delay to show completion state
      }
    }
  }, [documents, processingDocumentId])

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  const handleStartEditName = () => {
    if (canEdit && rag) {
      setEditedName(rag.name)
      setIsEditingName(true)
    }
  }

  const handleSaveName = () => {
    if (editedName.trim() && editedName.trim() !== rag?.name) {
      updateRAGMutation.mutate({ name: editedName.trim() })
    } else {
      setIsEditingName(false)
      setEditedName(rag?.name || '')
    }
  }

  const handleCancelEditName = () => {
    setIsEditingName(false)
    setEditedName(rag?.name || '')
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveName()
    } else if (e.key === 'Escape') {
      handleCancelEditName()
    }
  }

  if (ragLoading || docsLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!rag) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="max-w-md mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700 font-medium mb-2">RAG не найден</p>
            <Link href="/tools" className="text-blue-600 hover:text-blue-700 text-sm inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Назад к инструментам
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50 overflow-hidden">
      {/* Header - Redesigned Toolbar */}
      <div className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-full mx-auto px-6 py-4">
          {/* Top Row: Navigation & Title */}
          <div className="flex items-center justify-between gap-6 mb-3">
            {/* Left: Navigation & Title */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <Link 
                href="/tools" 
                className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1.5 flex-shrink-0 group"
              >
                <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">К инструментам</span>
              </Link>
              <div className="h-4 w-px bg-gray-300 flex-shrink-0"></div>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleNameKeyDown}
                  className="text-2xl font-bold text-gray-900 bg-white border-2 border-blue-500 rounded-lg px-3 py-1.5 flex-1 min-w-0 max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <h1 
                  className={`text-2xl font-bold text-gray-900 truncate ${canEdit ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                  onClick={handleStartEditName}
                  title={canEdit ? 'Нажмите, чтобы изменить название' : rag.name}
                >
                  {rag.name}
                </h1>
              )}
            </div>

            {/* Right: Actions & Stats */}
            <div className="flex items-center gap-4 flex-shrink-0">
              {/* Stats Card */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <div className="text-lg font-bold text-gray-900 leading-none">{rag.document_count}</div>
                    <div className="text-xs text-gray-500 leading-none mt-0.5">
                      {rag.document_count === 1 ? 'документ' : rag.document_count < 5 ? 'документа' : 'документов'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Role Badge */}
              <div className={`px-3 py-1.5 rounded-lg border ${getStatusColor('completed')} flex-shrink-0`}>
                <span className="text-xs font-semibold">
                  {rag.user_role === 'owner' ? 'Владелец' : rag.user_role === 'editor' ? 'Редактор' : rag.user_role === 'file_manager' ? 'Менеджер файлов' : rag.user_role === 'viewer' ? 'Просмотр' : 'Нет доступа'}
                </span>
              </div>

              {/* Share Button (Owner only) */}
              {rag.user_role === 'owner' && (
                <>
                  <div className="h-6 w-px bg-gray-300 flex-shrink-0"></div>
                  <button
                    onClick={() => setShowPublicAccessModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm hover:shadow-md flex-shrink-0"
                    title="Поделиться базой знаний"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Поделиться
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bottom Row: Description */}
          {rag.description && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-600 line-clamp-2">{rag.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel - Files Management (32%) */}
        <div className="w-[32%] border-r border-gray-200 flex flex-col bg-white min-w-0 flex-shrink-0">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-gray-900">Документы</h2>
              {documents.length > 0 && (
                <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                  {filteredDocuments.length}/{documents.length}
                </span>
              )}
            </div>
            
            {/* Search */}
            {documents.length > 0 && (
              <div className="mb-2">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={documentSearchQuery}
                    onChange={(e) => setDocumentSearchQuery(e.target.value)}
                    placeholder="Поиск..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white"
                  />
                </div>
              </div>
            )}
            
            {canManageFiles && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium shadow-sm hover:shadow flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Загрузить
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => setShowURLImport(true)}
                  className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium shadow-sm hover:shadow flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  URL
                </button>
                {selectedDocuments.size > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="px-2 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium shadow-sm hover:shadow flex items-center justify-center"
                    title={`Удалить ${selectedDocuments.size} документов`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Documents List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {documents.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-700 font-medium mb-1">Пока нет документов</p>
                {canManageFiles && (
                  <p className="text-sm text-gray-500">Загрузите файлы или импортируйте из URL, чтобы начать</p>
                )}
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-sm">Документы не найдены</p>
                <button
                  onClick={() => setDocumentSearchQuery('')}
                  className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                >
                  Очистить поиск
                </button>
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`bg-white border rounded-lg p-2.5 cursor-pointer hover:shadow-sm transition-all ${
                    selectedDocuments.has(doc.id) ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => canManageFiles && handleToggleSelect(doc.id)}
                >
                  <div className="flex items-start gap-2">
                    {canManageFiles && (
                      <input
                        type="checkbox"
                        checked={selectedDocuments.has(doc.id)}
                        onChange={() => handleToggleSelect(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-medium text-xs text-gray-900 line-clamp-2 leading-snug flex-1 min-w-0">{doc.title}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getStatusColor(doc.embedding_status)} flex-shrink-0 whitespace-nowrap`}>
                          {doc.embedding_status === 'pending' ? 'Ожидание' : 
                           doc.embedding_status === 'processing' ? 'Обработка' : 
                           doc.embedding_status === 'completed' ? 'Готово' : 
                           doc.embedding_status === 'failed' ? 'Ошибка' : doc.embedding_status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5">
                        <span className="flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                          </svg>
                          {doc.content.length.toLocaleString('ru-RU')} симв.
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setIsEditingDocument(false)
                            setEditedDocumentContent('')
                            setShowDocumentPreview(doc)
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-blue-50 rounded"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Просмотр
                        </button>
                        {doc.file_path && (
                          <a
                            href={`${API_BASE_URL}/api/rags/${ragId}/download/${doc.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-green-50 rounded"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
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
                            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-red-50 rounded ml-auto"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Chat Interface (68%) */}
        <div className="flex-1 flex flex-col bg-gray-50 min-w-0 min-h-0">
          {canQuery ? (
            <>
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 mx-auto mb-3 bg-blue-50 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-base font-medium text-gray-700 mb-1">Начните запрашивать вашу базу знаний</p>
                    <p className="text-xs text-gray-500">Задавайте вопросы и получайте релевантные фрагменты документов</p>
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

              {/* Query Input */}
              <div className="border-t border-gray-200 bg-white p-3 space-y-2 shadow-sm flex-shrink-0">
                {/* Similarity Threshold Control - Collapsible */}
                {canEdit && (
                  <div className="bg-blue-50 rounded-lg border border-blue-100">
                    <button
                      onClick={() => setShowFilterSettings(!showFilterSettings)}
                      className="w-full flex items-center justify-between p-2.5 text-left hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span className="text-xs font-semibold text-gray-900">Фильтр релевантности</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${minScore === null ? 'bg-gray-200 text-gray-600' : 'bg-blue-200 text-blue-700'}`}>
                          {minScore === null ? 'Выкл' : minScore.toFixed(1)}
                        </span>
                      </div>
                      <svg 
                        className={`w-4 h-4 text-gray-500 transition-transform ${showFilterSettings ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showFilterSettings && (
                      <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-blue-100 pt-2.5">
                        <p className="text-xs text-gray-600">
                          Чем выше значение, тем меньше, но более релевантных результатов.
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-16 text-left">Строго</span>
                          <div className="flex-1 relative">
                            <input
                              type="range"
                              min="0.5"
                              max="2.0"
                              step="0.1"
                              value={minScore ?? 1.2}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value)
                                setMinScore(value)
                              }}
                              onMouseUp={() => {
                                if (minScore !== rag?.min_similarity_score && minScore !== null) {
                                  setIsSavingMinScore(true)
                                  updateRAGMutation.mutate(
                                    { min_similarity_score: minScore },
                                    {
                                      onSettled: () => setIsSavingMinScore(false)
                                    }
                                  )
                                }
                              }}
                              disabled={minScore === null}
                              className={`w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer transition-opacity ${
                                minScore === null ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              style={{
                                background: minScore === null 
                                  ? 'linear-gradient(to right, #e5e7eb 0%, #e5e7eb 100%)'
                                  : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((minScore - 0.5) / 1.5) * 100}%, #e5e7eb ${((minScore - 0.5) / 1.5) * 100}%, #e5e7eb 100%)`
                              }}
                            />
                            <style jsx global>{`
                              input[type="range"]:not(:disabled)::-webkit-slider-thumb {
                                appearance: none;
                                width: 16px;
                                height: 16px;
                                border-radius: 50%;
                                background: #3b82f6;
                                cursor: pointer;
                                border: 2px solid white;
                                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                              }
                              input[type="range"]:not(:disabled)::-moz-range-thumb {
                                width: 16px;
                                height: 16px;
                                border-radius: 50%;
                                background: #3b82f6;
                                cursor: pointer;
                                border: 2px solid white;
                                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                              }
                              input[type="range"]:disabled::-webkit-slider-thumb {
                                appearance: none;
                                width: 16px;
                                height: 16px;
                                border-radius: 50%;
                                background: #9ca3af;
                                cursor: not-allowed;
                                border: 2px solid white;
                                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                              }
                              input[type="range"]:disabled::-moz-range-thumb {
                                width: 16px;
                                height: 16px;
                                border-radius: 50%;
                                background: #9ca3af;
                                cursor: not-allowed;
                                border: 2px solid white;
                                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                              }
                            `}</style>
                          </div>
                          <span className="text-xs text-gray-600 w-20 text-right">Мягко</span>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-blue-100">
                          {isSavingMinScore && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Сохранение...
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const newValue = minScore === null ? 1.2 : null
                              setMinScore(newValue)
                              setIsSavingMinScore(true)
                              updateRAGMutation.mutate(
                                { min_similarity_score: newValue },
                                {
                                  onSettled: () => setIsSavingMinScore(false)
                                }
                              )
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 hover:bg-blue-100 rounded transition-colors ml-auto"
                          >
                            {minScore === null ? '✓ Включить' : '✕ Выключить'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleQuery()}
                      placeholder="Задайте вопрос о ваших документах..."
                      className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm disabled:bg-gray-50 disabled:cursor-not-allowed text-sm"
                      disabled={isQuerying}
                    />
                    {queryInput && (
                      <button
                        onClick={() => setQueryInput('')}
                        className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleQuery}
                    disabled={!queryInput.trim() || isQuerying}
                    className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow flex items-center gap-1.5 text-sm"
                  >
                    {isQuerying ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Поиск...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Запрос
                      </>
                    )}
                  </button>
                  {chatMessages.length > 0 && (
                    <button
                      onClick={() => setChatMessages([])}
                      className="px-3 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-xs font-medium text-gray-700 flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Очистить
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-700 mb-2">Доступ к запросам ограничен</p>
                <p className="text-sm text-gray-500">Для запросов к этой базе знаний необходима роль Редактора или Просмотра</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Public Access Modal */}
      {showPublicAccessModal && rag?.user_role === 'owner' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Публичный доступ</h3>
                  <p className="text-sm text-gray-500">Поделитесь базой знаний с внешними пользователями</p>
                </div>
              </div>
              <button
                onClick={() => setShowPublicAccessModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4">
              {rag.public_access_enabled ? (
                <>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-semibold text-green-800">Публичный доступ включен</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Режим доступа
                        </label>
                        <select
                          value={rag.public_access_mode || 'full_editor'}
                          onChange={(e) => {
                            updatePublicAccessMutation.mutate({
                              enabled: true,
                              mode: e.target.value
                            })
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="full_editor">Полный редактор (загрузка, запросы, чат)</option>
                          <option value="folder_only">Только файлы (загрузка, скачивание, без чата)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          {rag.public_access_mode === 'full_editor' 
                            ? 'Пользователи могут загружать файлы, задавать вопросы и использовать чат'
                            : 'Пользователи могут только загружать и скачивать файлы, без доступа к чату'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Публичная ссылка
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/rags/public/${rag.public_access_token}`}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 text-sm"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            onClick={() => {
                              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/rags/public/${rag.public_access_token}`
                              navigator.clipboard.writeText(url)
                              alert('Ссылка скопирована в буфер обмена')
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Копировать
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Поделитесь этой ссылкой с пользователями, которым нужен доступ к базе знаний
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      onClick={() => {
                        if (confirm('Отключить публичный доступ? Пользователи больше не смогут получить доступ по ссылке.')) {
                          updatePublicAccessMutation.mutate({ enabled: false })
                          setShowPublicAccessModal(false)
                        }
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                    >
                      Отключить публичный доступ
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-gray-700 mb-4">
                      Включите публичный доступ, чтобы поделиться этой базой знаний с внешними пользователями через специальную ссылку.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Выберите режим доступа:</h4>
                        <div className="grid grid-cols-1 gap-3">
                          <button
                            onClick={() => {
                              updatePublicAccessMutation.mutate({
                                enabled: true,
                                mode: 'full_editor'
                              })
                            }}
                            className="p-4 border-2 border-blue-300 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 mb-1">Полный редактор</div>
                                <div className="text-xs text-gray-600">
                                  Пользователи могут загружать файлы, задавать вопросы и использовать чат для поиска по документам
                                </div>
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              updatePublicAccessMutation.mutate({
                                enabled: true,
                                mode: 'folder_only'
                              })
                            }}
                            className="p-4 border-2 border-gray-300 bg-white rounded-lg hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 mb-1">Только файлы</div>
                                <div className="text-xs text-gray-600">
                                  Пользователи могут только загружать и скачивать файлы, без доступа к чату и запросам
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowPublicAccessModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL Import Modal */}
      {showURLImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Импорт из URL</h3>
              <button
                onClick={() => {
                  setShowURLImport(false)
                  setUrlInput('')
                  setUrlTitle('')
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">URL</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Название (необязательно)</label>
                <input
                  type="text"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  placeholder="Название документа"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleURLImport}
                  disabled={urlImportMutation.isPending}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  {urlImportMutation.isPending ? 'Импорт...' : 'Импортировать'}
                </button>
                <button
                  onClick={() => {
                    setShowURLImport(false)
                    setUrlInput('')
                    setUrlTitle('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {showDocumentPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{showDocumentPreview.title}</h3>
              <button
                onClick={() => {
                  setShowDocumentPreview(null)
                  setIsEditingDocument(false)
                  setEditedDocumentContent('')
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto mb-4">
              {isEditingDocument ? (
                <textarea
                  value={editedDocumentContent}
                  onChange={(e) => setEditedDocumentContent(e.target.value)}
                  className="w-full h-full min-h-[400px] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm leading-relaxed resize-none"
                  placeholder="Введите текст документа..."
                />
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-mono">
                    {showDocumentPreview.content}
                  </pre>
                </div>
              )}
            </div>
            {canEdit && (
              <div className="border-t border-gray-200 pt-4 flex justify-end gap-2">
                {isEditingDocument ? (
                  <>
                    <button
                      onClick={() => {
                        setIsEditingDocument(false)
                        setEditedDocumentContent('')
                      }}
                      disabled={updateDocumentMutation.isPending}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => {
                        if (!editedDocumentContent.trim()) {
                          alert('Текст документа не может быть пустым')
                          return
                        }
                        updateDocumentMutation.mutate({
                          docId: showDocumentPreview.id,
                          content: editedDocumentContent.trim()
                        })
                      }}
                      disabled={updateDocumentMutation.isPending}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm hover:shadow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updateDocumentMutation.isPending ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Сохранение...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Сохранить
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setEditedDocumentContent(showDocumentPreview.content)
                      setIsEditingDocument(true)
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm hover:shadow flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Редактировать текст
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing Embeddings Modal */}
      {processingDocumentId && (() => {
        const processedDoc = documents.find(doc => doc.id === processingDocumentId)
        const isProcessing = !processedDoc || processedDoc.embedding_status === 'processing'
        const isCompleted = processedDoc?.embedding_status === 'completed'
        const isFailed = processedDoc?.embedding_status === 'failed'
        
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
              <div className="flex flex-col items-center justify-center text-center">
                {isProcessing && (
                  <div className="relative w-16 h-16 mb-6">
                    <svg className="w-16 h-16 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
                {isCompleted && (
                  <div className="w-16 h-16 mb-6 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
                {isFailed && (
                  <div className="w-16 h-16 mb-6 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                      <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Переобработка embeddings</h3>
                <p className="text-sm text-gray-600">
                  {isProcessing && 'Удаление старых embeddings и создание новых...'}
                  {isCompleted && 'Готово! Embeddings успешно переобработаны.'}
                  {isFailed && 'Ошибка при переобработке embeddings.'}
                  {!processedDoc && 'Обработка документа...'}
                </p>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

