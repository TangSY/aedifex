import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for the Aedifex open-source editor.',
}

export default function PrivacyPage() {
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
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="/terms"
            >
              Terms of Service
            </Link>
            <span className="text-muted-foreground">|</span>
            <span className="font-medium text-foreground">Privacy Policy</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 py-12">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="mb-2 font-bold text-3xl">Privacy Policy</h1>
          <p className="mb-8 text-muted-foreground text-sm">Effective Date: February 20, 2026</p>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">1. Introduction</h2>
            <p className="text-foreground/90 leading-relaxed">
              Aedifex is an open-source 3D building editor released under the MIT License. This
              Privacy Policy describes what data the editor collects when you use it locally.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">2. Data We Collect</h2>
            <p className="text-foreground/90 leading-relaxed">
              The open-source editor runs entirely in your browser. By default, it does not collect
              any personal data, does not require an account, and does not send data to external
              servers.
            </p>
            <p className="text-foreground/90 leading-relaxed">
              If you enable the optional AI assistant feature, your scene context and messages are
              sent to the configured AI API provider (e.g., Anthropic) to generate responses. No
              data is stored on our servers.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">3. Local Storage</h2>
            <p className="text-foreground/90 leading-relaxed">
              The editor uses your browser&apos;s localStorage to save scene data, presets, and
              editor preferences. This data remains on your device and is never transmitted
              externally.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">4. Third-Party Services</h2>
            <p className="text-foreground/90 leading-relaxed">
              When self-hosting, you control all third-party integrations. The open-source editor
              does not include any analytics, tracking, or advertising services by default.
            </p>
          </section>

          <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">5. Changes to This Policy</h2>
            <p className="text-foreground/90 leading-relaxed">
              We may update this Privacy Policy from time to time. Changes will be reflected in the
              repository.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold text-xl">6. Contact Us</h2>
            <p className="text-foreground/90 leading-relaxed">
              If you have questions about this Privacy Policy, please open an issue on the{' '}
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
