import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Library,
  FilePlus2,
  GraduationCap,
  BookOpenCheck,
  Timer,
  NotebookPen,
  Sparkles,
  LogOut,
  Briefcase,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useAuth } from '../../hooks/useAuth';
import { Avatar } from '../ui/Avatar';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const interviewerNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/bank', label: 'Question Bank', icon: <Library size={18} /> },
  { to: '/build', label: 'New Assessment', icon: <FilePlus2 size={18} /> },
];

const studyNav: NavItem[] = [
  { to: '/study', label: 'Study Dashboard', icon: <GraduationCap size={18} /> },
  { to: '/study/session', label: 'Review Cards', icon: <BookOpenCheck size={18} /> },
  { to: '/practice', label: 'Timed Practice', icon: <Timer size={18} /> },
  { to: '/stories', label: 'Story Bank', icon: <NotebookPen size={18} /> },
  { to: '/onboarding', label: 'Target a Role', icon: <Sparkles size={18} /> },
];

const studyPaths = ['/study', '/practice', '/stories', '/onboarding'];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const mode: 'study' | 'hire' = studyPaths.some((p) => pathname.startsWith(p)) ? 'study' : 'hire';
  const nav = mode === 'study' ? studyNav : interviewerNav;

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col fixed inset-y-0">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-100">
          <span className="h-8 w-8 rounded-lg bg-brand-gradient flex items-center justify-center shadow-glow">
            <Sparkles size={17} className="text-white" />
          </span>
          <span className="font-bold text-slate-800 text-[15px]">
            Assess<span className="text-brand-600">IQ</span>
          </span>
        </div>

        {/* Mode switch */}
        <div className="p-3">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => navigate('/dashboard')}
              className={cn(
                'flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition',
                mode === 'hire' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <Briefcase size={13} /> Hire
            </button>
            <button
              onClick={() => navigate('/study')}
              className={cn(
                'flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition',
                mode === 'study' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <GraduationCap size={13} /> Prepare
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scroll-slim">
          <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {mode === 'study' ? 'Job Seeker' : 'Interviewer'}
          </p>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Avatar name={user?.name ?? user?.email ?? 'You'} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-700 truncate">{user?.name ?? 'You'}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="text-slate-400 hover:text-rose-500 transition p-1"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 ml-64 min-w-0">
        {/*
          Fills the viewport rather than sitting in a 1152px column — these are
          dense working screens (question pools, candidate tables, builders),
          and the old max-w-6xl left ~250px dead on each side of a 1080p
          display while the content below scrolled.

          The cap is deliberately high rather than absent: past ~1800px a card
          row stops being scannable in one sweep and long prose lines get hard
          to track. Padding grows with the viewport so content never runs into
          the edge.
        */}
        <div className="mx-auto w-full max-w-[1800px] px-6 py-6 lg:px-8 xl:px-10 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
