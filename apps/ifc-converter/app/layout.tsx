import type { ReactNode } from 'react'
import { ClientBootstrap } from './client-bootstrap'
import './globals.css'

export const metadata = {
  title: 'IFC → Aedifex Converter',
  description: 'Convert IFC building models into Aedifex scene-graph JSON.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientBootstrap>{children}</ClientBootstrap>
      </body>
    </html>
  )
}
