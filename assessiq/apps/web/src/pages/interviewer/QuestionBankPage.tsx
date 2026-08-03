import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, Target, ShieldAlert, BookOpen, Library } from 'lucide-react';
import type { Difficulty, QuestionListItem } from '@assessiq/types';
import { DIFFICULTIES } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import {
  Badge,
  Card,
  Input,
  Select,
  PageHeader,
  Spinner,
  EmptyState,
  difficultyTone,
} from '../../components/ui';
import { cn } from '../../lib/cn';

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      questionsApi
        .list({ difficulty: difficulty || undefined, search: search || undefined, limit: 100 })
        .then((r) => {
          setQuestions(r.questions);
          setTotal(r.total);
        })
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(t);
  }, [difficulty, search]);

  const topics = useMemo(() => [...new Set(questions.map((q) => q.topic))], [questions]);

  return (
    <>
      <PageHeader
        title="Question Bank"
        subtitle="Rubric-scored questions with senior-signal and trap layers. Click to inspect."
      />

      <Card className="p-3 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search questions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
            className="sm:w-48"
          >
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Loading…
            </span>
          ) : (
            `${total} question${total === 1 ? '' : 's'}`
          )}
        </p>
        {topics.length > 0 && !loading && (
          <p className="text-xs text-slate-400">{topics.length} topics</p>
        )}
      </div>

      {!loading && questions.length === 0 ? (
        <Card>
          <EmptyState icon={<Library size={22} />} title="No questions match" hint="Try clearing the search or difficulty filter." />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {questions.map((q) => {
            const open = expanded === q.id;
            return (
              <Card key={q.id} hover={!open} className={cn(open && 'ring-1 ring-brand-200')}>
                <button
                  onClick={() => setExpanded(open ? null : q.id)}
                  className="w-full text-left px-5 py-4 flex items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-slate-800 leading-snug">{q.text}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Badge tone="brand">{q.topic}</Badge>
                      <Badge tone={difficultyTone[q.difficulty] ?? 'slate'}>{q.difficulty}</Badge>
                      <Badge tone="slate">{q.type}</Badge>
                      {q.domain && <Badge tone="violet">{q.domain}</Badge>}
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={cn('text-slate-400 mt-0.5 transition-transform', open && 'rotate-180')}
                  />
                </button>

                {open && (
                  <div className="px-5 pb-5 pt-1 grid gap-3 animate-fade-in">
                    <Rubric icon={<BookOpen size={14} />} label="Core answer" tone="text-slate-600 bg-slate-50" body={q.core_answer_display} />
                    <Rubric icon={<Target size={14} />} label="Senior signal" tone="text-teal-700 bg-teal-50" body={q.senior_signal_display} />
                    <Rubric icon={<ShieldAlert size={14} />} label="Trap" tone="text-rose-700 bg-rose-50" body={q.trap_display} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Rubric({
  icon,
  label,
  tone,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  body: string;
}) {
  const [text, bg] = tone.split(' ');
  return (
    <div className={cn('rounded-lg p-3.5', bg)}>
      <p className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1', text)}>
        {icon}
        {label}
      </p>
      <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}
