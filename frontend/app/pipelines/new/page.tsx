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
            className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-1 transition-colors"
          >
            <span>←</span> Назад к анализам
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Создание процесса
          </h1>
          <p className="text-gray-600">
            Создайте собственный аналитический процесс с нуля
          </p>
        </div>

        <PipelineEditor pipelineId={null} />
      </div>
    </div>
  )
}

