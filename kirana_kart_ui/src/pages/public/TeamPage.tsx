import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Github, Zap } from 'lucide-react'

// ─── Navbar ────────────────────────────────────────────────────────────────

function Navbar() {
  const navigate = useNavigate()
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/60">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-bold">Auralis</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="text-zinc-300 hover:text-white text-sm transition-colors px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500"
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

// ─── Stat pill ──────────────────────────────────────────────────────────────

function StatPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-300 font-medium">
      {label}
    </span>
  )
}

// ─── Skill tag ──────────────────────────────────────────────────────────────

function SkillTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
      {label}
    </span>
  )
}

// ─── Profile card ───────────────────────────────────────────────────────────

interface ProfileCardProps {
  name: string
  role: string
  title: string
  summary: string
  stats: string[]
  skills: string[]
  linkedIn: string
  github: string
  gradient: string
  initials: string
}

function ProfileCard({
  name,
  role,
  title,
  summary,
  stats,
  skills,
  linkedIn,
  github,
  gradient,
  initials,
}: ProfileCardProps) {
  return (
    <div className="flex flex-col rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40">
      {/* Gradient header strip */}
      <div className={`bg-gradient-to-r ${gradient} h-32 relative flex-shrink-0`}>
        {/* Avatar */}
        <div className="absolute -bottom-8 left-8">
          <div
            className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} border-4 border-zinc-900 flex items-center justify-center text-white font-bold text-xl shadow-lg`}
          >
            {initials}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="pt-12 px-8 pb-8 flex flex-col gap-5">
        {/* Name + role */}
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-white text-xl font-bold">{name}</h3>
            <span
              className={`inline-flex items-center rounded-full bg-gradient-to-r ${gradient} px-3 py-0.5 text-xs text-white font-semibold`}
            >
              {role}
            </span>
          </div>
          <p className="text-zinc-500 text-sm mt-1">{title}</p>
        </div>

        {/* Summary */}
        <p className="text-zinc-300 text-sm leading-relaxed">{summary}</p>

        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <StatPill key={s} label={s} />
          ))}
        </div>

        {/* Skills */}
        <div>
          <div className="text-zinc-500 text-xs uppercase tracking-widest font-semibold mb-2">
            Skills
          </div>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <SkillTag key={s} label={s} />
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="flex items-center gap-3 pt-1 border-t border-zinc-800">
          <a
            href={linkedIn}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            LinkedIn
          </a>
          <span className="text-zinc-700">·</span>
          <a
            href={github}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function TeamPage() {
  const navigate = useNavigate()

  const surajit: ProfileCardProps = {
    name: 'Surajit Chaudhuri',
    role: 'Chief Creator',
    title: 'AI Solutions Architect · AI Product Manager · Full Stack',
    summary:
      '7+ years at Swiggy engineering operational decision systems. Architect of Iris — an in-house audit platform that replaced Observe.AI and cut costs by ~₹5Cr — and Resolute, a decision engine supporting 8K+ users that reduced average handling time by 50% and delivered ₹2.4Cr in operational savings.',
    stats: ['₹5Cr+ (Iris Platform)', '₹2.4Cr Cost Reduction', '8K+ Users', 'Top 10 Company Project'],
    skills: ['Hierarchical RAG', 'LLM Pipelines', 'Python', 'React', 'System Design', 'Policy-as-Code'],
    linkedIn: 'https://www.linkedin.com/in/surajit-chaudhuri',
    github: 'https://github.com/surajitchaudhuri',
    gradient: 'from-blue-700 to-violet-700',
    initials: 'SC',
  }

  const renzil: ProfileCardProps = {
    name: 'Renzil Rodrigues',
    role: 'AI Full Stack Developer',
    title: 'Technical Architect · Process Automation · AI & Content Strategist',
    summary:
      'Process automation architect at Swiggy. Built AI/NLP escalation-prevention models saving ₹7Cr annually in refund leakage, eliminated 20K+ manual hours, and engineered deduplication systems that processed 1.5L+ tickets where 98% of the original noise was duplicates.',
    stats: ['₹7Cr Annual Savings', '20K+ Hours Automated', '1.5L+ Tickets Deduplicated', '98% Noise Eliminated'],
    skills: ['Python', 'NLP/ML', 'LangChain', 'Google Workspace', 'MERN Stack', 'Snowflake'],
    linkedIn: 'https://www.linkedin.com/in/renzil-rodrigues',
    github: 'https://github.com/renzilrodrigues',
    gradient: 'from-emerald-700 to-teal-700',
    initials: 'RR',
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 left-1/4 w-[500px] h-[400px] rounded-full bg-blue-600/6 blur-3xl" />
          <div className="absolute -top-10 right-1/4 w-[400px] h-[300px] rounded-full bg-emerald-600/5 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-2xl">
          <h1 className="text-5xl font-bold text-white mb-4">The Team</h1>
          <p className="text-zinc-400 text-lg">
            Built by practitioners who've run customer operations at scale — and got tired of
            solving the same problems manually.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section className="py-12 px-6 pb-24">
        <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8">
          <ProfileCard {...surajit} />
          <ProfileCard {...renzil} />
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 px-6 border-t border-zinc-900 text-center">
        <p className="text-zinc-400 text-base mb-6">Want to see what we built?</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={() => navigate('/signup')}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm transition-all"
          >
            Get Started
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium text-sm transition-all"
          >
            See Platform
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 px-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <div className="flex items-center justify-center w-5 h-5 rounded bg-gradient-to-br from-blue-600 to-violet-600">
              <Zap className="w-3 h-3 text-white" />
            </div>
            Auralis · orgsense.in
          </div>
          <div className="text-zinc-600 text-sm">© 2026 Auralis. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
