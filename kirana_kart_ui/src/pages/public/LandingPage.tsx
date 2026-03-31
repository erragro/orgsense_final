import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Cpu, ShieldCheck, BarChart3, ClipboardCheck, LifeBuoy, BookOpen,
  ArrowRight, Zap, Sun, Moon, CheckCircle2, XCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useUIStore } from '@/stores/ui.store'

// ─── Animation styles ────────────────────────────────────────────────────────

const ANIMATION_CSS = `
  @keyframes float-a {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-14px) rotate(1deg); }
  }
  @keyframes float-b {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-10px) rotate(-1deg); }
  }
  @keyframes float-c {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-18px); }
  }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes orb-drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(30px, -20px) scale(1.05); }
    66% { transform: translate(-20px, 15px) scale(0.97); }
  }
  .float-a { animation: float-a 7s ease-in-out infinite; }
  .float-b { animation: float-b 9s ease-in-out infinite 1.5s; }
  .float-c { animation: float-c 11s ease-in-out infinite 3s; }
  .orb-drift { animation: orb-drift 18s ease-in-out infinite; }
  .orb-drift-2 { animation: orb-drift 22s ease-in-out infinite reverse 4s; }
  .hero-text-1 { animation: fade-up 0.7s ease forwards; }
  .hero-text-2 { animation: fade-up 0.7s ease forwards 0.15s; opacity: 0; }
  .hero-text-3 { animation: fade-up 0.7s ease forwards 0.3s; opacity: 0; }
  .hero-text-4 { animation: fade-up 0.7s ease forwards 0.45s; opacity: 0; }
  .reveal {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.55s ease, transform 0.55s ease;
  }
  .reveal.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .shimmer-text {
    background: linear-gradient(
      90deg,
      currentColor 0%,
      currentColor 35%,
      rgba(147,51,234,0.9) 50%,
      currentColor 65%,
      currentColor 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`

// ─── Navbar ──────────────────────────────────────────────────────────────────

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
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-slate-200/60 dark:border-zinc-800/60'
        : 'bg-transparent'
    }`}>
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 shadow-lg shadow-blue-600/30">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-slate-900 dark:text-white font-bold text-lg leading-none">Auralis</span>
            <span className="block text-slate-400 dark:text-zinc-500 text-xs leading-none">orgsense.in</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/team')}
            className="text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors px-3 py-2">
            Meet the Team
          </button>
          <button onClick={toggleTheme}
            className="p-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-500 transition-all"
            aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => navigate('/login')}
            className="text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white text-sm transition-colors px-4 py-2 rounded-lg border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500">
            Log In
          </button>
          <button onClick={() => navigate('/signup')}
            className="text-white text-sm font-medium px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all shadow-lg shadow-blue-600/20">
            Sign Up
          </button>
        </div>
      </div>
    </nav>
  )
}

// ─── Floating badge ───────────────────────────────────────────────────────────

function FloatingBadge({
  icon: Icon, label, value, className, floatClass, accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  className?: string
  floatClass: string
  accent: string
}) {
  return (
    <div className={`${floatClass} ${className} absolute hidden lg:flex items-center gap-2.5 rounded-2xl border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm px-4 py-3 shadow-xl shadow-black/10 dark:shadow-black/40 border-slate-200/80 dark:border-zinc-700/60`}>
      <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-slate-900 dark:text-white text-sm font-bold leading-tight">{value}</p>
        <p className="text-slate-400 dark:text-zinc-500 text-xs leading-tight">{label}</p>
      </div>
    </div>
  )
}

// ─── Capability card ──────────────────────────────────────────────────────────

function CapabilityCard({
  icon: Icon, title, description, accent, index,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  accent: string
  index: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) el.classList.add('visible') },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="reveal group rounded-2xl bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-6 hover:border-blue-300/60 dark:hover:border-zinc-600 hover:shadow-xl hover:shadow-blue-500/5 dark:hover:shadow-black/30 transition-all duration-300 cursor-default"
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${accent} mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-slate-900 dark:text-white font-semibold text-base mb-2">{title}</h3>
      <p className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

// ─── Reveal section wrapper ───────────────────────────────────────────────────

function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) el.classList.add('visible') },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { theme } = useUIStore()

  const orb1Ref = useRef<HTMLDivElement>(null)
  const orb2Ref = useRef<HTMLDivElement>(null)
  const heroBadgesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  // Parallax on scroll
  useEffect(() => {
    const handler = () => {
      const y = window.scrollY
      if (orb1Ref.current) orb1Ref.current.style.transform = `translateY(${y * 0.18}px)`
      if (orb2Ref.current) orb2Ref.current.style.transform = `translateY(${y * -0.12}px)`
      if (heroBadgesRef.current) heroBadgesRef.current.style.transform = `translateY(${y * 0.08}px)`
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const capabilities = [
    { icon: Cpu,           title: 'Cardinal Pipeline',  description: '5-phase ingestion → decision engine. Validates, deduplicates, enriches, and routes every ticket with zero manual input.', accent: 'from-blue-600 to-blue-500' },
    { icon: ShieldCheck,   title: 'L2 Validator',       description: 'Smart deduplication and rule-based routing. Catches conflicts before they reach agents.',                                   accent: 'from-violet-600 to-violet-500' },
    { icon: BarChart3,     title: 'BI Agent',            description: 'Ask your operations data in plain English. Instant SQL, charts, and insights — no data team required.',                    accent: 'from-emerald-600 to-teal-500' },
    { icon: ClipboardCheck,title: 'QA Agent',            description: '10-parameter automated quality scoring across every agent interaction. Audit at scale.',                                    accent: 'from-orange-600 to-amber-500' },
    { icon: LifeBuoy,      title: 'CRM & Ticket Ops',   description: 'Full ticket lifecycle — SLA tracking, automation rules, CSAT, escalation paths, and merge flows.',                         accent: 'from-rose-600 to-pink-500' },
    { icon: BookOpen,      title: 'Knowledge Base',      description: 'Versioned SOP management with RAG-powered search. Policy-as-code, with simulation before rollout.',                        accent: 'from-cyan-600 to-sky-500' },
  ]

  const dotGrid = theme === 'dark'
    ? 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)'
    : 'radial-gradient(circle, rgba(0,0,0,0.055) 1px, transparent 1px)'

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-slate-900 dark:text-white overflow-x-hidden">
      <style>{ANIMATION_CSS}</style>
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center pt-20 pb-16 px-6 overflow-hidden">

        {/* Dot grid background */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: dotGrid, backgroundSize: '28px 28px' }} />

        {/* Gradient orbs — parallax */}
        <div ref={orb1Ref} className="orb-drift absolute -top-32 left-1/4 w-[700px] h-[600px] rounded-full bg-blue-600/10 dark:bg-blue-600/12 blur-[120px] pointer-events-none" />
        <div ref={orb2Ref} className="orb-drift-2 absolute top-20 right-1/4 w-[500px] h-[500px] rounded-full bg-violet-600/8 dark:bg-violet-600/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[200px] bg-gradient-to-t from-white dark:from-zinc-950 to-transparent pointer-events-none" />

        <div className="relative mx-auto max-w-5xl w-full">
          <div className="text-center">
            {/* Live badge */}
            <div className="hero-text-1 inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 backdrop-blur-sm px-4 py-1.5 text-xs text-slate-500 dark:text-zinc-400 mb-8">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live at orgsense.in
            </div>

            {/* Headline */}
            <h1 className="hero-text-2 text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-6">
              <span className="text-slate-900 dark:text-white">The Operating System</span>
              <br />
              <span className="text-slate-900 dark:text-white">for </span>
              <span className="bg-gradient-to-r from-blue-500 via-violet-500 to-blue-400 bg-clip-text text-transparent">
                CX Teams
              </span>
            </h1>

            <p className="hero-text-3 text-slate-500 dark:text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
              From raw complaint to resolved ticket — Cardinal automates the decision layer
              your ops team relies on.
            </p>

            {/* CTAs */}
            <div className="hero-text-4 flex items-center justify-center gap-4 flex-wrap">
              <button onClick={() => navigate('/signup')}
                className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm transition-all shadow-xl shadow-blue-600/25 hover:shadow-blue-600/40 hover:-translate-y-0.5">
                Get Started
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button onClick={() => navigate('/login')}
                className="px-8 py-4 rounded-xl border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm transition-all hover:-translate-y-0.5">
                Log In
              </button>
            </div>

            {/* Tagline */}
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 px-5 py-2 text-sm text-slate-400 dark:text-zinc-500">
              AI-powered · End-to-end CX automation · Enterprise-grade
            </div>
          </div>

          {/* Floating accent badges — parallax via ref */}
          <div ref={heroBadgesRef}>
            <FloatingBadge icon={Cpu} value="5-Phase" label="Cardinal Pipeline" accent="from-blue-600 to-blue-500"
              floatClass="float-a" className="-left-4 top-1/4" />
            <FloatingBadge icon={BarChart3} value="Plain English" label="BI Queries" accent="from-emerald-600 to-teal-500"
              floatClass="float-b" className="-right-4 top-1/3" />
            <FloatingBadge icon={ClipboardCheck} value="10-Param" label="QA Scoring" accent="from-orange-600 to-amber-500"
              floatClass="float-c" className="left-8 bottom-16" />
            <FloatingBadge icon={ShieldCheck} value="100%" label="Interactions Audited" accent="from-violet-600 to-violet-500"
              floatClass="float-b" className="right-8 bottom-8" />
          </div>
        </div>
      </section>

      {/* ── Capabilities ────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 relative">
        <div className="mx-auto max-w-7xl">
          <RevealSection className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 px-4 py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium mb-4">
              Platform Modules
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Six modules. One decision engine.
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 text-base max-w-xl mx-auto">
              Each layer feeds the next — from raw signal to resolved outcome.
            </p>
          </RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {capabilities.map((cap, i) => (
              <CapabilityCard key={cap.title} {...cap} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem / Solution ───────────────────────────────────────────────── */}
      <section className="py-28 px-6 border-t border-slate-100 dark:border-zinc-900 relative overflow-hidden">
        {/* subtle bg accent */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-violet-600/3 dark:bg-violet-600/5 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-16 items-start relative">
          <RevealSection>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-1 text-xs text-red-600 dark:text-red-400 font-medium mb-6">
              The Problem
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-8 leading-tight">
              Scaling CX without automation creates compounding complexity
            </h2>
            <ul className="space-y-4">
              {[
                'Agents making inconsistent decisions on identical complaints',
                'No audit trail — quality scoring is manual and sampled',
                'Knowledge bases go stale the moment a policy changes',
                'BI requires a data analyst just to answer "how many P1s today?"',
                'SLA breaches invisible until the customer escalates',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 group">
                  <XCircle className="w-4 h-4 mt-0.5 text-red-400 dark:text-red-500 flex-shrink-0" />
                  <span className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </RevealSection>

          <RevealSection className="[transition-delay:150ms]">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-6">
              The Solution
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-8 leading-tight">
              Auralis replaces judgment calls with a decision engine
            </h2>
            <ul className="space-y-4">
              {[
                'Cardinal routes every ticket through 5 deterministic phases',
                'QA Agent scores 100% of interactions — no sampling',
                'Knowledge Base versioning with policy simulation before rollout',
                'BI Agent answers ops questions in plain English, instantly',
                'Real-time SLA visibility with automated escalation triggers',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </RevealSection>
        </div>
      </section>

      {/* ── Team teaser ──────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 border-t border-slate-100 dark:border-zinc-900">
        <RevealSection className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 px-4 py-1.5 text-xs text-slate-500 dark:text-zinc-400 font-medium mb-6">
            The Team
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Built by operators, not observers
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-base mb-12 max-w-xl mx-auto">
            The team behind Auralis spent years leading CX operations at scale before
            building the platform they wished existed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            {[
              { initials: 'SC', name: 'Surajit Chaudhuri', role: 'Chief Creator', gradient: 'from-blue-700 to-violet-700' },
              { initials: 'RR', name: 'Renzil Rodrigues',  role: 'AI Full Stack Developer', gradient: 'from-emerald-700 to-teal-700' },
            ].map(({ initials, name, role, gradient }) => (
              <div key={initials}
                className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl px-5 py-4 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30 hover:-translate-y-1 transition-all duration-300 cursor-default">
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md`}>
                  {initials}
                </div>
                <div className="text-left">
                  <div className="text-slate-900 dark:text-white text-sm font-semibold">{name}</div>
                  <div className="text-slate-400 dark:text-zinc-500 text-xs">{role}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/team')}
            className="inline-flex items-center gap-2 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 text-sm font-medium transition-colors group">
            Meet the Team
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </RevealSection>
      </section>

      {/* ── Footer CTA ───────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 border-t border-slate-100 dark:border-zinc-900 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-blue-600/5 dark:bg-blue-600/8 blur-[100px]" />
        </div>
        <RevealSection className="mx-auto max-w-3xl text-center relative">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            Ready to transform your CX operations?
          </h2>
          <p className="text-slate-500 dark:text-zinc-400 text-base mb-10">
            Join teams already using Auralis to automate decisions at scale.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button onClick={() => navigate('/signup')}
              className="group flex items-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm transition-all shadow-xl shadow-blue-600/25 hover:shadow-blue-600/40 hover:-translate-y-0.5">
              Sign Up Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button onClick={() => navigate('/login')}
              className="px-10 py-4 rounded-xl border border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm transition-all hover:-translate-y-0.5">
              Log In
            </button>
          </div>
        </RevealSection>
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
