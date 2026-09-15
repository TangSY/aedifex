import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for the Aedifex open-source editor.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              Home
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">Terms of Service</span>
            <span className="text-muted-foreground">|</span>
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/privacy"
            >
              Privacy Policy
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 py-12">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="mb-2 font-bold text-3xl">Terms of Service</h1>
          <p className="mb-8 text-muted-foreground text-sm">Effective Date: February 20, 2026</p>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">1. Open-Source License</h2>
            <p className="text-foreground/90 leading-relaxed">
              Aedifex is open-source software released under the MIT License. You may use, copy,
              modify, merge, publish, distribute, sublicense, and/or sell copies of the software in
              accordance with the MIT License terms.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">2. Disclaimer of Warranties</h2>
            <p className="text-foreground/90 leading-relaxed">
              THE SOFTWARE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
              WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
              IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">3. Limitation of Liability</h2>
            <p className="text-foreground/90 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE AUTHORS SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
              DATA, PROFITS, OR GOODWILL, ARISING FROM YOUR USE OF THE SOFTWARE.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">4. Your Content</h2>
            <p className="text-foreground/90 leading-relaxed">
              You retain full ownership of all content, projects, and data you create using the
              editor. Your data is stored locally on your device and is fully under your control.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">5. Changes to Terms</h2>
            <p className="text-foreground/90 leading-relaxed">
              We may update these Terms from time to time. Changes will be reflected in the
              repository.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold text-xl">6. Contact Us</h2>
            <p className="text-foreground/90 leading-relaxed">
              If you have questions about these Terms, please open an issue on the{' '}
              <a
                className="text-foreground underline hover:text-foreground/80"
                href="https://github.com/AedifexSoftware/aedifex"
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub repository
              </a>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
