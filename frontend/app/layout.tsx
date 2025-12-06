import Providers from './providers'
import LayoutWrapper from '@/components/LayoutWrapper'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
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
          <OnboardingProvider>
            <LayoutWrapper>
              {children}
            </LayoutWrapper>
          </OnboardingProvider>
        </Providers>
      </body>
    </html>
  )
}
