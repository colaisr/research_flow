'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { API_BASE_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'
import { useEffect } from 'react'

interface CreateRAGRequest {
  name: string
  description?: string | null
}

async function createRAG(request: CreateRAGRequest) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/rags`,
    request,
    { withCredentials: true }
  )
  return data
}

export default function CreateRAGPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated && isAuthenticated !== undefined) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  const createMutation = useMutation({
    mutationFn: createRAG,
    onSuccess: (data) => {
      // Redirect to RAG Editor
      router.push(`/rags/${data.id}`)
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create knowledge base'
      setError(errorMessage)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
    })
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/rags"
            className="text-blue-600 hover:text-blue-700 mb-4 inline-block"
          >
            ← Back to Knowledge Bases
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Create Knowledge Base</h1>
          <p className="text-gray-600 mt-1">Create a new RAG knowledge base for document storage and semantic search</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6">
          {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Legal Documents, Research Papers, Company Policies"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of what this knowledge base will contain..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Knowledge Base'}
            </button>
            <Link
              href="/rags"
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-center"
            >
              Cancel
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Note:</strong> After creation, you'll be able to upload documents, import from URLs, and query the knowledge base.
              The embedding model and vector database are configured automatically (transparent to you).
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

