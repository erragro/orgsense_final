import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Cpu,
  ShieldCheck,
  BarChart3,
  ClipboardCheck,
  LifeBuoy,
  BookOpen,
  ArrowRight,
  Zap,
  Sun,
  Moon,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useUIStore } from '@/stores/ui.store'

// ─── Navbar ────────────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const { theme, toggleTheme } = useUIStore()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-slate-200/60 dark:border-zinc-800/60'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-slate-900 dark:text-white font-bold text-lg leading-none">Auralis</span>
            <span className="block text-slate-400 dark:text-zinc-500 text-xs leading-none">orgsense.in</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/team')}
            className="text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors px-3 py-2"
          >
            Meet the Team
          </button>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-500 transition-all"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white text-sm transition-colors px-4 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500"
          >
            Log In
          </button>
          <button
            onClick={() => navigate('/signup')}
            className="text-white text-sm font-medium px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all"
          >
            Sign Up
          </button>
        </div>
      </div>
    </nav>
  )
}


// ─── Capability card ────────────────────────────────────────────────────────

function CapabilityCard({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  accent: string
}) {
  return (
    <div className="group rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6 hover:border-slate-300 dark:hover:border-zinc-600 transition-all duration-300">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${accent} mb-4`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-slate-900 dark:text-white font-semibold text-base mb-2">{title}</h3>
      <p className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

// ─── Team teaser card ───────────────────────────────────────────────────────

function TeaserAvatar({ initials, gradient }: { initials: string; gradient: string }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3">
      <div
        className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
      >
        {initials}
      </div>
      <div className="min-w-0">
        <div className="text-slate-900 dark:text-white text-sm font-medium">
          {initials === 'SC' ? 'Surajit Chaudhuri' : 'Renzil Rodrigues'}
        </div>
        <div className="text-slate-400 dark:text-zinc-500 text-xs">
          {initials === 'SC' ? 'Chief Creator' : 'AI Full Stack Developer'}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const capabilities = [
    {
      icon: Cpu,
      title: 'Cardinal Pipeline',
      description:
        '5-phase ingestion → decision engine. Validates, deduplicates, enriches, and routes every ticket with zero manual input.',
      accent: 'from-blue-600 to-blue-500',
    },
    {
      icon: ShieldCheck,
      title: 'L2 Validator',
      description:
        'Smart deduplication and rule-based routing. Catches conflicts before they reach agents.',
      accent: 'from-violet-600 to-violet-500',
    },
    {
      icon: BarChart3,
      title: 'BI Agent',
      description:
        'Ask your operations data in plain English. Instant SQL, charts, and insights — no data team required.',
      accent: 'from-emerald-600 to-teal-500',
    },
    {
      icon: ClipboardCheck,
      title: 'QA Agent',
      description:
        '10-parameter automated quality scoring across every agent interaction. Audit at scale.',
      accent: 'from-orange-600 to-amber-500',
    },
    {
      icon: LifeBuoy,
      title: 'CRM & Ticket Ops',
      description:
        'Full ticket lifecycle — SLA tracking, automation rules, CSAT, escalation paths, and merge flows.',
      accent: 'from-rose-600 to-pink-500',
    },
    {
      icon: BookOpen,
      title: 'Knowledge Base',
      description:
        'Versioned SOP management with RAG-powered search. Policy-as-code, with simulation before rollout.',
      accent: 'from-cyan-600 to-sky-500',
    },
  ]

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-slate-900 dark:text-white">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-blue-600/8 dark:bg-blue-600/8 blur-3xl" />
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-violet-600/6 dark:bg-violet-600/6 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/60 px-4 py-1.5 text-xs text-slate-500 dark:text-zinc-400 mb-8">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live at orgsense.in
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6 text-slate-900 dark:text-white">
            The Operating System for{' '}
            <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
              Customer Experience Teams
            </span>
          </h1>

          <p className="text-slate-500 dark:text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            From raw complaint to resolved ticket — Cardinal automates the decision layer
            your ops team relies on.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => navigate('/signup')}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-900/20 dark:shadow-blue-900/30"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3.5 rounded-xl border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm transition-all"
            >
              Log In
            </button>
          </div>

          {/* Tagline pill */}
          <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 px-5 py-2 text-sm text-slate-500 dark:text-zinc-400">
            AI-powered · End-to-end CX automation · Built at Swiggy scale
          </div>
        </div>
      </section>

      {/* ── Capabilities ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Platform Capabilities
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 text-base max-w-xl mx-auto">
              Six integrated modules, one decision engine. Each layer feeds the next.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {capabilities.map((cap) => (
              <CapabilityCard key={cap.title} {...cap} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for the problem ──────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-slate-100 dark:border-zinc-900">
        <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-4">
              The Problem
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
              Scaling CX operations without automation creates compounding complexity
            </h2>
            <ul className="space-y-3 text-slate-500 dark:text-zinc-400 text-sm">
              {[
                'Agents making inconsistent decisions on identical complaints',
                'No audit trail — quality scoring is manual and sampled',
                'Knowledge bases that go stale the moment a policy changes',
                'BI requires a data analyst just to answer "how many P1s today?"',
                'SLA breaches invisible until the customer escalates',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-4">
              The Solution
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
              Auralis replaces judgment calls with a decision engine
            </h2>
            <ul className="space-y-3 text-slate-500 dark:text-zinc-400 text-sm">
              {[
                'Cardinal routes every ticket through 5 deterministic phases',
                'QA Agent scores 100% of interactions — no sampling',
                'Knowledge Base versioning with policy simulation before rollout',
                'BI Agent answers ops questions in plain English, instantly',
                'Real-time SLA visibility with automated escalation triggers',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Team teaser ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-slate-100 dark:border-zinc-900">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
            Built by practitioners who've run operations at scale
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-base mb-10 max-w-xl mx-auto">
            The team behind Auralis spent years inside CX operations at Swiggy before building
            the platform they wished existed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <TeaserAvatar initials="SC" gradient="from-blue-700 to-violet-700" />
            <TeaserAvatar initials="RR" gradient="from-emerald-700 to-teal-700" />
          </div>
          <button
            onClick={() => navigate('/team')}
            className="inline-flex items-center gap-2 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 text-sm font-medium transition-colors"
          >
            Meet the Team <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-slate-100 dark:border-zinc-900">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Ready to transform your CX operations?
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-base mb-10">
            Join teams already using Auralis to automate decisions at scale.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => navigate('/signup')}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm transition-all"
            >
              Sign Up Free <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3.5 rounded-xl border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm transition-all"
            >
              Log In
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 dark:border-zinc-900 py-8 px-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400 dark:text-zinc-500 text-sm">
            <div className="flex items-center justify-center w-5 h-5 rounded bg-gradient-to-br from-blue-600 to-violet-600">
              <Zap className="w-3 h-3 text-white" />
            </div>
            Auralis · orgsense.in
          </div>
          <div className="text-slate-300 dark:text-zinc-600 text-sm">© 2026 Auralis. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
