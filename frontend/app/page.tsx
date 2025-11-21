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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (isAuthenticated) {
    return null // Will redirect to dashboard
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img src="/rf_logo.png" alt="Research Flow" className="h-8 w-auto" />
              <span className="ml-3 text-lg font-semibold text-gray-900">Research Flow</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/register"
                className="px-5 py-2.5 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium rounded-lg transition-all"
              >
                Регистрация
              </Link>
              <Link
                href="/login"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
              >
                Войти в систему
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Video */}
      <section className="pt-20 pb-24 lg:pt-28 lg:pb-32 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-30"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-20"></div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Text Content */}
            <div>
              <div className="mb-6">
                <span className="inline-block px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-50 rounded-full uppercase tracking-wide">
                  ПЛАТФОРМА ДЛЯ ИССЛЕДОВАНИЙ
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Платформа для создания
                <br />
                <span className="text-blue-600">исследовательских процессов</span>
              </h1>
              <p className="text-xl text-gray-600 mb-10 max-w-xl leading-relaxed">
                Создавайте многошаговые исследовательские процессы, объединяющие любые источники данных, 
                инструменты и базы знаний для комплексного анализа и отчётов.
              </p>
            </div>

            {/* Right: Video */}
            <div className="relative">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  У меня есть минутка ...
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  Посмотрите, как Research Flow помогает создавать исследовательские процессы за минуту.
                </p>
              </div>
              <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow cursor-pointer group relative overflow-hidden">
                {/* Play button overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="text-center relative z-10">
                  <div className="w-20 h-20 mx-auto mb-4 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <svg className="w-8 h-8 text-blue-600 ml-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 text-sm font-medium">Видео будет здесь</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three Main Blocks */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Функциональность
            </h2>
            <p className="text-lg text-gray-600">
              Все необходимые инструменты в одном месте
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Block 1: Plan a flow */}
            <div className="bg-white rounded-xl p-8 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 group">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-colors">
                Планируйте процесс
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Создавайте многошаговые исследовательские процессы с визуальным редактором. 
                Определяйте последовательность шагов, настраивайте каждый этап и контролируйте 
                передачу данных между шагами.
              </p>
            </div>

            {/* Block 2: Connect any sources */}
            <div className="bg-white rounded-xl p-8 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 group">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-colors">
                Подключайте любые источники
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Интегрируйте базы данных, API, RAG-базы знаний и другие источники данных. 
                Настраивайте инструменты один раз и используйте их в любых процессах. 
                Все инструменты хранятся безопасно и доступны только вам.
              </p>
            </div>

            {/* Block 3: Schedule any research */}
            <div className="bg-white rounded-xl p-8 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all duration-300 group">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-colors">
                Планируйте исследования
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Запускайте процессы вручную или настраивайте автоматическое выполнение по расписанию. 
                Получайте актуальные результаты регулярно и экспортируйте их в удобном формате 
                через Telegram, email, webhook или файлы.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Почему Research Flow
            </h2>
            <p className="text-lg text-gray-600">
              Сфокусированы на гибкости и прозрачности
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="group">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Прозрачность шагов
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Видите входные и выходные данные каждого шага. Проверяйте промежуточные результаты 
                перед продолжением процесса.
              </p>
            </div>
            <div className="group">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Гибкость инструментов
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Настраивайте инструменты один раз и используйте их многократно в разных процессах. 
                Поддержка баз данных, API, RAG и других источников.
              </p>
            </div>
            <div className="group">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Универсальность
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Создавайте процессы для любых задач: бизнес-аналитика, исследования, 
                мониторинг соответствия, отчёты и многое другое.
              </p>
            </div>
            <div className="group">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Безопасность
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Безопасное хранение данных, шифрование ключей и соблюдение стандартов безопасности. 
                Все инструменты и процессы доступны только вам.
              </p>
            </div>
            <div className="group">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Быстрый старт
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Подключение за минуты, простая интеграция через API. Начните создавать процессы 
                сразу после регистрации.
              </p>
            </div>
            <div className="group">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Экспорт результатов
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Экспортируйте результаты в различных форматах: Telegram, email, webhook, 
                PDF, JSON, CSV и другие.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-white rounded-2xl p-12 shadow-xl border border-gray-100">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
              Запустите Research Flow и создавайте исследовательские процессы
            </h2>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Начните создавать процессы прямо сейчас или войдите в систему, если у вас уже есть аккаунт.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/register"
                className="px-8 py-4 bg-white hover:bg-gray-50 text-gray-900 font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 transform duration-200 border border-gray-200"
              >
                Создать аккаунт
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 transform duration-200"
              >
                Войти в систему
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <img src="/rf_logo.png" alt="Research Flow" className="h-6 w-auto" />
                <span className="ml-2 text-white font-semibold">Research Flow</span>
              </div>
              <p className="text-sm">
                Платформа для создания исследовательских процессов с использованием любых источников данных, 
                инструментов и баз знаний.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Продукт</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Функции</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Дорожная карта</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Безопасность</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Ресурсы</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Документация</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Блог</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Поддержка</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Связаться</h4>
              <ul className="space-y-2 text-sm">
                <li>support@researchflow.com</li>
                <li>Москва · Санкт-Петербург · Онлайн</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm">
            <p>© 2025 Research Flow. Все права защищены.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
