'use client'

import { useParams, useRouter } from 'next/navigation'
import PipelineEditor from '@/components/PipelineEditor'

export default function EditPipelinePage() {
  const params = useParams()
  const router = useRouter()
  const pipelineId = params.id as string

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
            Edit Pipeline
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Modify your custom analysis pipeline
          </p>
        </div>

        <PipelineEditor pipelineId={parseInt(pipelineId)} />
      </div>
    </div>
  )
}

