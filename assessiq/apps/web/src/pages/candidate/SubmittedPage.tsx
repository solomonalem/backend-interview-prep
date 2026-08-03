import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { useCandidateSession } from '../../store/candidateSession';

export default function SubmittedPage() {
  const clear = useCandidateSession((s) => s.clear);
  useEffect(() => clear(), [clear]);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center animate-fade-in">
        {/* Success mark */}
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-sm">
          <Check size={38} strokeWidth={2.5} />
        </span>

        <h1 className="mt-6 text-2xl font-bold text-slate-800">Assessment submitted</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          Thank you — your responses have been recorded. The hiring team will review them and follow
          up with next steps. You can safely close this tab.
        </p>

        <p className="mt-10 text-xs font-medium text-slate-400">
          Powered by <span className="font-semibold text-slate-500">AssessIQ</span>
        </p>
      </div>
    </div>
  );
}
