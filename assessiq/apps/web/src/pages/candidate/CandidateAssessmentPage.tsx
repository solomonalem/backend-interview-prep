import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Send } from 'lucide-react';
import { Badge, Button, ProgressBar, Textarea } from '../../components/ui';
import { cn } from '../../lib/cn';

interface Question {
  id: string;
  topic: string;
  text: string;
}

// Inline mock deck — this page is public and must not hit the authed questions API.
const DECK: Question[] = [
  {
    id: 'q1',
    topic: 'Node.js runtime',
    text: 'Walk through what happens when a slow synchronous computation runs inside an async HTTP handler. How does it affect the event loop, and how would you keep the server responsive?',
  },
  {
    id: 'q2',
    topic: 'API design',
    text: 'A payments endpoint may be retried by clients after network timeouts. Explain how you would make it idempotent, and where you would store the idempotency state.',
  },
  {
    id: 'q3',
    topic: 'Auth & security',
    text: 'Suppose a JWT access token is stolen. What can the attacker do, and what mechanisms limit the damage? Contrast this with a stolen session cookie.',
  },
  {
    id: 'q4',
    topic: 'MongoDB',
    text: 'A collection of 50M orders is slow on queries filtering by customerId and sorting by createdAt descending. Which index would you create and why, and what does the ESR rule tell you about field order?',
  },
];

const TOTAL_SECONDS = 2700; // 45:00

interface StoredAnswer {
  questionId: string;
  text: string;
  confidence: number | null;
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CandidateAssessmentPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<StoredAnswer[]>([]);
  const [draft, setDraft] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);

  const total = DECK.length;
  const question = DECK[current]; // guarded below (noUncheckedIndexedAccess)
  const isLast = current === total - 1;

  // Countdown — decrement a seconds counter (no Date.now()); auto-submit at zero.
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          navigate(`/a/${token}/done`);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [navigate, token]);

  // Safety guard: if the index falls out of range, end the session.
  useEffect(() => {
    if (!question) navigate(`/a/${token}/done`);
  }, [question, navigate, token]);

  if (!question) return null;

  const low = remaining <= 60;

  const submit = () => {
    const record: StoredAnswer = {
      questionId: question.id,
      text: draft.trim(),
      confidence,
    };
    const next = [...answers, record];
    setAnswers(next);

    if (isLast) {
      navigate(`/a/${token}/done`);
      return;
    }
    setCurrent((c) => c + 1);
    setDraft('');
    setConfidence(null);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold text-slate-500 tabular">
              Question {current + 1} of {total}
            </p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Monitoring
              </span>
              <span
                className={cn(
                  'font-mono tabular text-sm font-semibold',
                  low ? 'text-rose-600' : 'text-slate-700',
                )}
              >
                {fmt(remaining)}
              </span>
            </div>
          </div>
          <ProgressBar
            value={((current + 1) / total) * 100}
            tone="bg-brand-500"
            className="mt-2.5 h-1.5"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-10">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <Badge tone="brand">{question.topic}</Badge>

          <h1 className="text-xl font-semibold leading-snug text-slate-800">{question.text}</h1>

          <div>
            <Textarea
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your answer here…"
              className="min-h-[16rem]"
              autoFocus
            />
          </div>

          {/* Confidence rating */}
          <div>
            <p className="text-sm font-medium text-slate-700">How confident are you?</p>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = confidence !== null && n <= confidence;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setConfidence(n)}
                    aria-label={`Confidence ${n} of 5`}
                    className={cn(
                      'h-10 flex-1 rounded-lg border text-sm font-semibold tabular transition-all',
                      active
                        ? 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] font-medium text-slate-400">
              <span>Not confident</span>
              <span>Very confident</span>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 pt-6">
            <Button size="lg" onClick={submit} className="w-full">
              {isLast ? (
                <>
                  Submit assessment <Send size={17} />
                </>
              ) : (
                <>
                  Submit &amp; continue <ArrowRight size={18} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
