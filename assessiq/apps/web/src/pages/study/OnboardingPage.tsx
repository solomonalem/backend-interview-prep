import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Wand2, FileText, ArrowRight, Layers } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Label,
  Textarea,
  Spinner,
} from '../../components/ui';
import { cn } from '../../lib/cn';

type Weight = 'Critical' | 'High' | 'Differentiator' | 'Low';

const weightTone: Record<Weight, 'rose' | 'amber' | 'violet' | 'slate'> = {
  Critical: 'rose',
  High: 'amber',
  Differentiator: 'violet',
  Low: 'slate',
};

interface DecodedTopic {
  topic: string;
  weight: Weight;
  questions: number;
}

interface Decoded {
  role: string;
  domain: string;
  topics: DecodedTopic[];
}

const BASE_TOPICS: DecodedTopic[] = [
  { topic: 'Node.js', weight: 'Critical', questions: 14 },
  { topic: 'MongoDB', weight: 'High', questions: 11 },
  { topic: 'Security & JWT', weight: 'Critical', questions: 9 },
  { topic: 'Microservices', weight: 'High', questions: 8 },
  { topic: 'System Design', weight: 'Differentiator', questions: 7 },
  { topic: 'Healthcare / PHI', weight: 'Low', questions: 5 },
];

// Lightweight, deterministic "decode" of a pasted JD (no real backend yet).
function decode(jd: string): Decoded {
  const text = jd.toLowerCase();
  const isHealth = /health|phi|hipaa|clinical|patient|medical/.test(text);
  const isSenior = /senior|lead|staff|principal/.test(text);

  const topics = BASE_TOPICS.map((t) =>
    t.topic === 'Healthcare / PHI'
      ? { ...t, weight: (isHealth ? 'Critical' : 'Low') as Weight, questions: isHealth ? 10 : 5 }
      : t.topic === 'System Design'
        ? { ...t, weight: (isSenior ? 'Critical' : 'Differentiator') as Weight }
        : t,
  );

  return {
    role: isSenior ? 'Senior Backend Engineer' : 'Backend Engineer',
    domain: isHealth ? 'healthcare' : 'general',
    topics,
  };
}

export default function OnboardingPage() {
  const [jd, setJd] = useState('');
  const [resume, setResume] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Decoded | null>(null);

  function run() {
    if (!jd.trim()) return;
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      setResult(decode(jd));
      setLoading(false);
    }, 1200);
  }

  return (
    <>
      <PageHeader title="Target a role" subtitle="Paste a job description and we'll build a weighted study plan around it." />

      {/* Hero */}
      <Card className="mb-6 overflow-hidden">
        <div className="bg-brand-gradient px-6 py-7 text-white">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80">
            <Sparkles size={16} /> AI role decoder
          </div>
          <h2 className="mt-2 text-xl font-bold">Turn any job description into a focused prep plan</h2>
          <p className="mt-1 text-sm text-white/80 max-w-xl">
            We extract the role, domain, and the topics that actually get tested — then weight them so you
            study what matters most.
          </p>
        </div>
      </Card>

      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div>
            <Label>Job description</Label>
            <Textarea
              rows={7}
              placeholder="Paste the full job description here…"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
          </div>
          <div>
            <Label>Your resume or key bullets (optional)</Label>
            <Textarea
              rows={4}
              placeholder="Paste a few resume bullets so we can tailor to your experience…"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <FileText size={13} /> Nothing is stored — this runs on your device.
            </p>
            <Button onClick={run} disabled={!jd.trim() || loading}>
              {loading ? (
                <>
                  <Spinner className="border-white/40 border-t-white" /> Analyzing…
                </>
              ) : (
                <>
                  <Wand2 size={16} /> Decode with AI
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>

      {result && (
        <div className="animate-fade-in space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-lg bg-brand-gradient text-white flex items-center justify-center shadow-glow">
                  <Sparkles size={18} />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-800">{result.role}</h3>
                  <p className="text-xs text-slate-400">Decoded from your job description</p>
                </div>
              </div>
              <Badge tone={result.domain === 'healthcare' ? 'sky' : 'slate'}>{result.domain}</Badge>
            </CardHeader>
            <CardBody className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                Weighted focus
              </p>
              {result.topics.map((t) => (
                <div
                  key={t.topic}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                      <Layers size={15} />
                    </span>
                    <p className="text-sm font-medium text-slate-700 truncate">{t.topic}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400 tabular w-20 text-right hidden sm:block">
                      {t.questions} questions
                    </span>
                    <Badge tone={weightTone[t.weight]} className={cn('w-28 justify-center')}>
                      {t.weight}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="flex justify-center">
            <Link to="/study">
              <Button size="lg">
                Build my study plan <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
