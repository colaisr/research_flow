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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    )
  }

  if (isAuthenticated) {
    return null // Will redirect to dashboard
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img src="/logo.svg" alt="Research Flow" className="h-8 w-auto" />
              <span className="ml-3 text-xl font-semibold text-gray-900 dark:text-white">Research Flow</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Войти в систему
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Платформа для создания
              <br />
              <span className="text-blue-600 dark:text-blue-400">исследовательских процессов</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto mb-8">
              Создавайте многошаговые исследовательские процессы, объединяющие любые источники данных, 
              инструменты и базы знаний для комплексного анализа и отчётов.
            </p>
            <div className="flex justify-center space-x-4">
              <Link
                href="/login"
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
              >
                Начать работу
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Video Section */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              У меня есть 1 минута
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Посмотрите, как Research Flow помогает создавать исследовательские процессы за минуту.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">Видео будет здесь</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three Main Blocks */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Функциональность
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Все необходимые инструменты в одном месте
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Block 1: Plan a flow */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Планируйте процесс
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Создавайте многошаговые исследовательские процессы с визуальным редактором. 
                Определяйте последовательность шагов, настраивайте каждый этап и контролируйте 
                передачу данных между шагами.
              </p>
            </div>

            {/* Block 2: Connect any sources */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Подключайте любые источники
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Интегрируйте базы данных, API, RAG-базы знаний и другие источники данных. 
                Настраивайте инструменты один раз и используйте их в любых процессах. 
                Все инструменты хранятся безопасно и доступны только вам.
              </p>
            </div>

            {/* Block 3: Schedule any research */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Планируйте исследования
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Запускайте процессы вручную или настраивайте автоматическое выполнение по расписанию. 
                Получайте актуальные результаты регулярно и экспортируйте их в удобном формате 
                через Telegram, email, webhook или файлы.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Почему Research Flow
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Сфокусированы на гибкости и прозрачности
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Прозрачность шагов
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Видите входные и выходные данные каждого шага. Проверяйте промежуточные результаты 
                перед продолжением процесса.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Гибкость инструментов
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Настраивайте инструменты один раз и используйте их многократно в разных процессах. 
                Поддержка баз данных, API, RAG и других источников.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Универсальность
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Создавайте процессы для любых задач: бизнес-аналитика, исследования, 
                мониторинг соответствия, отчёты и многое другое.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Безопасность
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Безопасное хранение данных, шифрование ключей и соблюдение стандартов безопасности. 
                Все инструменты и процессы доступны только вам.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Быстрый старт
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Подключение за минуты, простая интеграция через API. Начните создавать процессы 
                сразу после регистрации.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Экспорт результатов
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Экспортируйте результаты в различных форматах: Telegram, email, webhook, 
                PDF, JSON, CSV и другие.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Запустите Research Flow и создавайте исследовательские процессы
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            Начните создавать процессы прямо сейчас или войдите в систему, если у вас уже есть аккаунт.
          </p>
          <div className="flex justify-center space-x-4">
            <Link
              href="/login"
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
            >
              Войти в систему
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-black text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <img src="/logo.svg" alt="Research Flow" className="h-6 w-auto" />
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
