import Providers from './providers'
import Navigation from '@/components/Navigation'
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/rf_logo.png" type="image/png" />
      </head>
      <body>
        <Providers>
          <div className="min-h-screen bg-white dark:bg-gray-950">
            <Navigation />
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
