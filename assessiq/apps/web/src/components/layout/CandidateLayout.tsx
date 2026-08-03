import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

// Minimal, distraction-free chrome for the candidate assessment flow.
export default function CandidateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6">
        <span className="h-7 w-7 rounded-lg bg-brand-gradient flex items-center justify-center mr-2">
          <Sparkles size={15} className="text-white" />
        </span>
        <span className="font-bold text-slate-800 text-sm">
          Assess<span className="text-brand-600">IQ</span>
        </span>
      </header>
      <div className="flex-1 flex flex-col animate-fade-in">{children}</div>
    </div>
  );
}
