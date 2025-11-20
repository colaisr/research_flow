'use client'

import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    )
  }

  if (isAuthenticated) {
    return null // Will redirect to dashboard
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-extrabold mb-4 text-gray-900 dark:text-white">
            <span className="text-gray-900 dark:text-white">Max Sig</span>
            <span className="text-7xl text-blue-600 dark:text-blue-400 font-bold">N</span>
            <span className="text-gray-900 dark:text-white">al bot</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            AI-Powered Market Analysis Platform v0.1.2
          </p>
        </div>

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
          {/* Left: Description */}
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Professional Trading Analysis Made Simple
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              Max SigNal bot combines multiple advanced trading methodologies to provide comprehensive market analysis:
            </p>
            <ul className="space-y-3 text-gray-700 dark:text-gray-300">
              <li className="flex items-start">
                <span className="text-blue-600 dark:text-blue-400 mr-2">✓</span>
                <span><strong>Wyckoff Method</strong> - Identify accumulation, distribution, and market phases</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 dark:text-blue-400 mr-2">✓</span>
                <span><strong>Smart Money Concepts (SMC)</strong> - Track institutional order blocks and liquidity zones</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 dark:text-blue-400 mr-2">✓</span>
                <span><strong>Volume Spread Analysis (VSA)</strong> - Detect large player activity and market manipulation</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 dark:text-blue-400 mr-2">✓</span>
                <span><strong>Delta Analysis</strong> - Understand buyer vs seller dominance</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 dark:text-blue-400 mr-2">✓</span>
                <span><strong>ICT Methodology</strong> - Identify optimal entry points after liquidity sweeps</span>
              </li>
            </ul>
          </div>

          {/* Right: Features */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
            <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
              Key Features
            </h3>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">1</span>
                </div>
                <div className="ml-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Configurable Analysis Pipelines</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Customize models, prompts, and data sources for each analysis step</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">2</span>
                </div>
                <div className="ml-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Real-Time Step Tracking</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Watch analysis steps complete in real-time with detailed outputs</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">3</span>
                </div>
                <div className="ml-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Telegram Integration</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Publish analysis results directly to your Telegram channel</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">4</span>
                </div>
                <div className="ml-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Multiple Data Sources</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Support for crypto exchanges (CCXT) and traditional markets (Yahoo Finance)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md mx-auto">
            <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
              Ready to Get Started?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Sign in to access the analysis platform and start generating trading insights.
            </p>
            <Link
              href="/login"
              className="inline-block w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-center"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Max SigNal bot - AI-Powered Market Analysis Platform</p>
        </div>
      </div>
    </div>
  )
}
