'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { API_BASE_URL } from '@/lib/config'

interface Run {
  id: number
  trigger_type: string
  instrument: string
  timeframe: string
  status: string
  created_at: string
  finished_at: string | null
  cost_est_total: number
  analysis_type_id?: number | null
}

async function fetchRuns(analysisTypeId?: string) {
  const url = analysisTypeId 
    ? `${API_BASE_URL}/api/runs?analysis_type_id=${analysisTypeId}`
    : `${API_BASE_URL}/api/runs`
  const { data } = await axios.get<Run[]>(url, { withCredentials: true })
  return data
}

function RunsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const analysisTypeId = searchParams.get('analysis_type_id')

  const { data: runs = [], isLoading, error } = useQuery({
    queryKey: ['runs', analysisTypeId],
    queryFn: () => fetchRuns(analysisTypeId || undefined),
    refetchInterval: 5000, // Poll every 5 seconds
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
      case 'failed':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
      case 'model_failure':
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20'
      case 'running':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
      case 'queued':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">Loading runs...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded p-4">
            <p className="text-red-700 dark:text-red-400">
              Error loading runs: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Analysis Runs
          </h1>
          {analysisTypeId && (
            <p className="text-gray-600 dark:text-gray-400">
              Filtered by analysis type ID: {analysisTypeId}
            </p>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400">
              {analysisTypeId 
                ? 'No runs found for this analysis type.' 
                : 'No runs yet. Create one from the Home or Analyses page!'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Instrument
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Timeframe
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Cost
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        #{run.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {run.instrument}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {run.timeframe}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(run.status)}`}>
                          {run.status === 'model_failure' ? 'Model Failure' : run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        ${run.cost_est_total.toFixed(4)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(run.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RunsPage() {
  return (
    <Suspense fallback={
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">Loading runs...</p>
        </div>
      </div>
    }>
      <RunsContent />
    </Suspense>
  )
}

