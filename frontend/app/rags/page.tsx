'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { API_BASE_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

interface RAG {
  id: number
  organization_id: number
  name: string
  description: string | null
  vector_db_type: string
  embedding_model: string
  document_count: number
  created_at: string
  updated_at: string | null
  user_role: string | null
}

async function fetchRAGs() {
  const { data } = await axios.get<RAG[]>(`${API_BASE_URL}/api/rags`, { withCredentials: true })
  return data
}

async function deleteRAG(ragId: number) {
  const { data } = await axios.delete(
    `${API_BASE_URL}/api/rags/${ragId}`,
    { withCredentials: true }
  )
  return data
}

export default function RAGsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()
  const [searchQuery, setSearchQuery] = useState<string>('')

  const { data: rags = [], isLoading, error } = useQuery({
    queryKey: ['rags'],
    queryFn: fetchRAGs,
    enabled: isAuthenticated !== false,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRAG,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rags'] })
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error'
      alert(`Failed to delete RAG: ${errorMessage}`)
    }
  })

  const handleDelete = (ragId: number, ragName: string) => {
    if (confirm(`Are you sure you want to delete "${ragName}"? This action cannot be undone. All documents and embeddings will be deleted.`)) {
      deleteMutation.mutate(ragId)
    }
  }

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800'
      case 'editor':
        return 'bg-blue-100 text-blue-800'
      case 'file_manager':
        return 'bg-green-100 text-green-800'
      case 'viewer':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleLabel = (role: string | null) => {
    switch (role) {
      case 'owner':
        return 'Owner'
      case 'editor':
        return 'Editor'
      case 'file_manager':
        return 'File Manager'
      case 'viewer':
        return 'Viewer'
      default:
        return 'No Access'
    }
  }

  // Filter RAGs by search query
  const filteredRAGs = rags.filter(rag => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      rag.name.toLowerCase().includes(query) ||
      (rag.description && rag.description.toLowerCase().includes(query))
    )
  })

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Loading RAGs...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 border border-red-400 rounded p-4">
            <p className="text-red-700">
              Error loading RAGs: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Knowledge Bases</h1>
            <p className="text-gray-600 mt-1">Manage your RAG knowledge bases</p>
          </div>
          <Link
            href="/rags/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Create Knowledge Base
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search knowledge bases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* RAGs Grid */}
        {filteredRAGs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600 mb-4">No knowledge bases found</p>
            <Link
              href="/rags/new"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Create your first knowledge base →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRAGs.map((rag) => (
              <div
                key={rag.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">
                      {rag.name}
                    </h3>
                    {rag.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {rag.description}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getRoleBadgeColor(rag.user_role)}`}>
                    {getRoleLabel(rag.user_role)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                  <span>
                    <span className="font-medium">{rag.document_count}</span> documents
                  </span>
                  {rag.updated_at && (
                    <span>
                      Updated {new Date(rag.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/rags/${rag.id}`}
                    className="flex-1 bg-blue-600 text-white text-center px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Open Editor
                  </Link>
                  {rag.user_role === 'owner' && (
                    <>
                      <button
                        onClick={() => router.push(`/rags/${rag.id}?edit=true`)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rag.id, rag.name)}
                        className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

