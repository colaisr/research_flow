'use client'

import { useParams, useRouter } from 'next/navigation'
import PipelineEditor from '@/components/PipelineEditor'

export default function EditPipelinePage() {
  const params = useParams()
  const router = useRouter()
  const pipelineId = params.id as string

  return (
    <div className="h-full w-full">
      <PipelineEditor pipelineId={parseInt(pipelineId)} />
    </div>
  )
}

