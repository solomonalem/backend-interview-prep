import { useEffect } from 'react';
import { Check, Eye } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useCandidateSession } from '../../store/candidateSession';

export default function SubmittedPage({ preview = false }: { preview?: boolean } = {}) {
  const { assessmentId } = useParams();
  const clear = useCandidateSession((s) => s.clear);
  useEffect(() => clear(), [clear]);

  // A preview ends differently because it meant something different: nothing
  // was recorded, and the manager wants to go back to their assessment, not to
  // be thanked for their responses.
  if (preview) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md text-center animate-fade-in">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-600 shadow-sm">
            <Eye size={36} strokeWidth={2.2} />
          </span>
          <h1 className="mt-6 text-2xl font-bold text-slate-800">Preview finished</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            That is exactly what your candidate will see. Nothing was scored, nothing was recorded,
            and no report was created.
          </p>
          {assessmentId && (
            <Link
              to={`/assessments/${assessmentId}`}
              className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              Back to the assessment
            </Link>
          )}
        </div>
      </div>
    );
  }

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
