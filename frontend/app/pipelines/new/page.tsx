'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import PipelineEditor from '@/components/PipelineEditor'

export default function NewPipelinePage() {
  const router = useRouter()

  return (
    <div className="h-full w-full">
      <PipelineEditor pipelineId={null} />
    </div>
  )
}

