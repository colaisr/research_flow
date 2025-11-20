'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import PipelineEditor from '@/components/PipelineEditor'

export default function NewPipelinePage() {
  const router = useRouter()

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/analyses')}
            className="text-blue-600 dark:text-blue-400 hover:underline mb-4"
          >
            ← Back to Analyses
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Create New Pipeline
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Build a custom analysis pipeline from scratch
          </p>
        </div>

        <PipelineEditor pipelineId={null} />
      </div>
    </div>
  )
}

