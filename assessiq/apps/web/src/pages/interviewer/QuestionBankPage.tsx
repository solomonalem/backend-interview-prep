import { useEffect, useState } from 'react';
import type { Difficulty, QuestionListItem } from '@assessiq/types';
import { DIFFICULTIES } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { useAuth } from '../../hooks/useAuth';

const difficultyColor: Record<Difficulty, string> = {
  junior: 'bg-emerald-100 text-emerald-700',
  mid: 'bg-sky-100 text-sky-700',
  senior: 'bg-amber-100 text-amber-700',
  staff: 'bg-rose-100 text-rose-700',
};

export default function QuestionBankPage() {
  const { user, logout } = useAuth();
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    questionsApi
      .list({ difficulty: difficulty || undefined, search: search || undefined, limit: 100 })
      .then((r) => {
        setQuestions(r.questions);
        setTotal(r.total);
      })
      .finally(() => setLoading(false));
  }, [difficulty, search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <span className="font-bold text-slate-800">AssessIQ</span>
            <span className="text-slate-400 text-sm"> · Question Bank</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{user?.email}</span>
            <button
              onClick={logout}
              className="rounded-md border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <input
            placeholder="Search questions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-400 mb-3">
          {loading ? 'Loading…' : `${total} question${total === 1 ? '' : 's'}`}
        </p>

        <ul className="space-y-2">
          {questions.map((q) => (
            <li key={q.id} className="bg-white border border-slate-200 rounded-lg">
              <button
                onClick={() => setExpanded(expanded === q.id ? null : q.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{q.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {q.topic}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${difficultyColor[q.difficulty]}`}
                    >
                      {q.difficulty}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {q.type}
                    </span>
                    {q.domain && (
                      <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700">
                        {q.domain}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-slate-400 text-xs mt-1">{expanded === q.id ? '−' : '+'}</span>
              </button>

              {expanded === q.id && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100 text-sm">
                  <Rubric label="Core answer" color="text-slate-700" body={q.core_answer_display} />
                  <Rubric
                    label="Senior signal"
                    color="text-teal-700"
                    body={q.senior_signal_display}
                  />
                  <Rubric label="Trap" color="text-rose-700" body={q.trap_display} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Rubric({ label, color, body }: { label: string; color: string; body: string }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
      <p className="text-slate-600 mt-0.5">{body}</p>
    </div>
  );
}
