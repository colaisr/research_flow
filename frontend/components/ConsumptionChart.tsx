'use client'

import { ChartDataPoint } from '@/lib/api/consumption'

interface ConsumptionChartProps {
  data: ChartDataPoint[]
  groupBy: 'day' | 'week' | 'month'
}

export default function ConsumptionChart({ data, groupBy }: ConsumptionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">No data available</p>
      </div>
    )
  }

  // Calculate max tokens for scaling
  const maxTokens = Math.max(...data.map(d => d.tokens), 1)
  const chartHeight = 200
  const chartWidth = Math.max(600, data.length * 40)

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-full">
        <svg width={chartWidth} height={chartHeight + 40} className="w-full">
          {/* Y-axis labels */}
          <g>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = chartHeight - (ratio * chartHeight) + 20
              const value = Math.round(maxTokens * ratio)
              return (
                <g key={ratio}>
                  <line
                    x1={0}
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={0}
                    y={y + 4}
                    fontSize="12"
                    fill="#6b7280"
                    textAnchor="start"
                  >
                    {value.toLocaleString()}
                  </text>
                </g>
              )
            })}
          </g>

          {/* Data points and lines */}
          <polyline
            points={data.map((point, index) => {
              const x = (index / (data.length - 1 || 1)) * (chartWidth - 100) + 50
              const y = chartHeight - (point.tokens / maxTokens) * chartHeight + 20
              return `${x},${y}`
            }).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
          />

          {/* Data points */}
          {data.map((point, index) => {
            const x = (index / (data.length - 1 || 1)) * (chartWidth - 100) + 50
            const y = chartHeight - (point.tokens / maxTokens) * chartHeight + 20
            return (
              <g key={index}>
                <circle
                  cx={x}
                  cy={y}
                  r={4}
                  fill="#3b82f6"
                  className="hover:r-6 transition-all cursor-pointer"
                />
                <title>
                  {new Date(point.date).toLocaleDateString()}: {point.tokens.toLocaleString()} tokens
                </title>
              </g>
            )
          })}

          {/* X-axis labels */}
          <g>
            {data.map((point, index) => {
              if (index % Math.ceil(data.length / 8) !== 0 && index !== data.length - 1) return null
              const x = (index / (data.length - 1 || 1)) * (chartWidth - 100) + 50
              const date = new Date(point.date)
              const label = groupBy === 'month'
                ? date.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })
                : groupBy === 'week'
                ? `Неделя ${Math.ceil((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`
                : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
              
              return (
                <text
                  key={index}
                  x={x}
                  y={chartHeight + 35}
                  fontSize="11"
                  fill="#6b7280"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}

