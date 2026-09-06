import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  HelpCircle,
  Loader2,
  ShieldCheck,
  Upload,
  Wand2,
} from 'lucide-react';
import type {
  Difficulty,
  DocumentCheckResponse,
  ElicitationAnswer,
  GroundedQuestionsResponse,
  QuestionDraft,
  QuestionType,
} from '@assessiq/types';
import {
  DIFFICULTIES,
  DOCUMENT_MAX_CHARS,
  DOCUMENT_MAX_UPLOAD_BYTES,
  DOCUMENT_MIN_CHARS,
  QUESTION_TYPES,
} from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { QuestionReviewPanel } from '../../components/QuestionReviewPanel';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import { ApiRequestError } from '../../api/client';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { cn } from '../../lib/cn';

const ACCEPT = '.pdf,.docx,.txt,.md';
const MAX_MB = Math.round(DOCUMENT_MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * The middle grounding tier: questions written from a document the manager
 * supplies. For teams that will never grant repository access — an
 * architecture note, a project description, a detailed JD.
 *
 * Deliberately shaped like the scan page, because the pipeline behind it is
 * the same one: generation is queued, the drafts are the result, and every
 * draft still goes through the same review before it can be used.
 *
 * The one thing this page has that the scan page does not is the sufficiency
 * gate. A thin document does not fail loudly at generation time — it succeeds
 * quietly and produces questions that could have been written from the
 * technology name alone. Asking three concrete questions first is the cheapest
 * way to turn it into a document worth grounding.
 */
export default function DocumentGroundingPage() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [seniority, setSeniority] = useState<Difficulty>('senior');
  const [type, setType] = useState<QuestionType | ''>('');
  const [count, setCount] = useState(5);

  // ── The sufficiency gate ───────────────────────────────────────────────────
  // `checkedText` is what the verdict applies to. Editing the document after a
  // check invalidates it: a verdict about text that is no longer on screen is
  // worse than no verdict.
  const [check, setCheck] = useState<DocumentCheckResponse | null>(null);
  const [checkedText, setCheckedText] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // One elicitation round, never more. After the re-check the manager sees the
  // verdict and generates; we do not ask a second set of questions.
  const [rounds, setRounds] = useState(0);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [mayBeGeneric, setMayBeGeneric] = useState(false);

  // ── Where the questions went ───────────────────────────────────────────────
  const [grounded, setGrounded] = useState<GroundedQuestionsResponse | null>(null);
  const [awaiting, setAwaiting] = useState(0);
  const [reviewing, setReviewing] = useState<QuestionDraft | null>(null);
  const [justApproved, setJustApproved] = useState(false);

  const chars = text.trim().length;
  const tooShort = chars > 0 && chars < DOCUMENT_MIN_CHARS;
  const overCap = chars > DOCUMENT_MAX_CHARS;
  const stale = check !== null && text !== checkedText;
  const verdict = stale ? null : check;

  const answered: ElicitationAnswer[] = (verdict?.gaps ?? check?.gaps ?? [])
    .map((q) => ({ question: q, answer: (answers[q] ?? '').trim() }))
    .filter((a) => a.answer.length > 0);

  const onText = (v: string) => {
    setText(v);
    setInputError(null);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setInputError(null);
    setUploadNote(null);
    if (file.size > DOCUMENT_MAX_UPLOAD_BYTES) {
      setInputError(`That file is over ${MAX_MB} MB. Paste the relevant section instead.`);
      return;
    }
    setUploading(true);
    try {
      const r = await questionsApi.extractDocument(file);
      // The extraction lands IN the editable box — the manager sees exactly
      // what will be used and can fix a bad parse before anything generates.
      setText(r.text);
      setCheck(null);
      setRounds(0);
      setAnswers({});
      if (!title.trim()) setTitle(r.title);
      setUploadNote(
        r.truncated
          ? `Read ${r.chars.toLocaleString()} characters and kept the first ${DOCUMENT_MAX_CHARS.toLocaleString()} — check that the part that matters is still below, or paste just that section.`
          : `Read ${r.chars.toLocaleString()} characters from ${file.name}. Edit anything the parse got wrong.`,
      );
    } catch (e) {
      setInputError(
        e instanceof ApiRequestError ? e.message : 'That file could not be read. Paste the text instead.',
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** Round 1 checks the document. Round 2 checks it with the answers appended,
   *  which is the whole point of asking them. */
  const runCheck = async () => {
    if (checking || chars < DOCUMENT_MIN_CHARS || overCap) return;
    setChecking(true);
    setCheckError(null);
    try {
      const withAnswers = answered.length
        ? `${text}\n\n--- ADDITIONAL DETAIL FROM THE HIRING MANAGER ---\n${answered
            .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
            .join('\n\n')}`
        : text;
      const r = await questionsApi.checkDocument({ text: withAnswers, count });
      setCheck(r);
      setCheckedText(text);
      setRounds((n) => n + 1);
    } catch (e) {
      setCheckError(
        e instanceof ApiRequestError ? e.message : 'Could not assess this document. Try again, or generate anyway.',
      );
    } finally {
      setChecking(false);
    }
  };

  const loadGrounded = useCallback(async () => {
    if (!documentId) return;
    try {
      const g = await questionsApi.documentGrounded(documentId);
      setGrounded(g);
      setAwaiting((n) => (n > 0 && g.drafts.length + g.vetted.length >= n ? 0 : n));
    } catch {
      /* read-through; a transient failure just retries on the next tick */
    }
  }, [documentId]);

  // Generation is a Claude call per batch, so drafts trickle in over tens of
  // seconds. Nothing blocks — the manager can leave and come back.
  useLiveRefresh(loadGrounded, { intervalMs: 4_000, enabled: awaiting > 0 });

  const generate = async () => {
    if (generating || chars < DOCUMENT_MIN_CHARS || overCap) return;
    setGenerating(true);
    setGenError(null);
    try {
      const r = await questionsApi.generateFromDocument({
        title: title.trim() || 'Untitled document',
        text,
        ...(answered.length ? { elicitation: answered } : {}),
        seniority,
        ...(type ? { type } : {}),
        count,
        sufficiency_unmet: verdict ? !verdict.sufficient : false,
      });
      setDocumentId(r.document_id);
      setMayBeGeneric(r.may_be_generic);
      setAwaiting(r.expected);
      setGrounded(null);
    } catch (e) {
      setGenError(e instanceof ApiRequestError ? e.message : 'Could not generate questions.');
    } finally {
      setGenerating(false);
    }
  };

  // Reviewing returns to the list, never to another modal — which question to
  // deal with next is the manager's choice.
  const afterReview = (approved: boolean) => {
    setReviewing(null);
    setJustApproved(approved);
    void loadGrounded();
  };

  const canCheck = chars >= DOCUMENT_MIN_CHARS && !overCap;
  const showGaps = verdict !== null && !verdict.sufficient && verdict.gaps.length > 0;

  return (
    <>
      {/* The SAME review panel as everywhere else. Grounding changes what a
          question is about, not how it earns approval. */}
      {reviewing && (
        <QuestionReviewPanel
          draft={reviewing}
          onApproved={() => afterReview(true)}
          onRejected={() => afterReview(false)}
          onClose={() => setReviewing(null)}
        />
      )}

      <PageHeader
        title="Questions from a document"
        subtitle="Paste or upload something that describes your system — questions get written from what it actually says."
      />

      <div className="space-y-6">
        {/* ── 1. The document ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <FileText size={16} className="text-brand-500" /> The document
            </h3>
            <span className={cn('text-xs', overCap ? 'text-rose-600' : 'text-slate-400')}>
              {chars.toLocaleString()} / {DOCUMENT_MAX_CHARS.toLocaleString()} characters
            </span>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Payments platform overview"
                  maxLength={200}
                />
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => void pickFile(e.target.files?.[0])}
                />
                <Button
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Spinner /> : <Upload size={15} />}
                  {uploading ? 'Reading…' : 'Upload a file'}
                </Button>
              </div>
            </div>

            <div>
              <Label>Text</Label>
              <Textarea
                value={text}
                onChange={(e) => onText(e.target.value)}
                rows={14}
                placeholder="Paste an architecture note, a project description, or a detailed job description. What the system does, what it is built on, how the pieces talk to each other, what it must guarantee."
                className="font-normal"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                .pdf, .docx, .txt or .md, up to {MAX_MB} MB — an uploaded file is read into this box
                so you can see and fix what was extracted. Scanned PDFs have no text to read; paste
                those instead.
              </p>
            </div>

            {uploadNote && (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {uploadNote}
              </p>
            )}
            {tooShort && (
              <p className="text-xs text-amber-700">
                That is too short to ground a question — {DOCUMENT_MIN_CHARS} characters is the floor.
              </p>
            )}
            {overCap && (
              <p className="text-xs text-rose-600">
                That is longer than we can use. Paste the section that matters instead.
              </p>
            )}
            {inputError && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {inputError}
              </p>
            )}
          </CardBody>
        </Card>

        {/* ── 2. What to generate ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <Wand2 size={16} className="text-brand-500" /> What to generate
            </h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Label>Seniority</Label>
                <Select
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value as Difficulty)}
                  disabled={generating}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-48">
                <Label>Question type</Label>
                <Select
                  value={type}
                  onChange={(e) => setType(e.target.value as QuestionType | '')}
                  disabled={generating}
                >
                  <option value="">Whatever suits the material</option>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-28">
                <Label>How many</Label>
                <Select
                  value={String(count)}
                  onChange={(e) => setCount(Number(e.target.value))}
                  disabled={generating}
                >
                  {[3, 5, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>

              <Button variant="secondary" onClick={runCheck} disabled={!canCheck || checking}>
                {checking ? <Spinner /> : <ShieldCheck size={15} />}
                {checking ? 'Reading it…' : rounds === 0 ? 'Check this document' : 'Check again'}
              </Button>

              <Button onClick={generate} disabled={!canCheck || generating}>
                {generating ? <Spinner className="border-white/40 border-t-white" /> : <Wand2 size={16} />}
                {generating ? 'Queueing…' : `Generate ${count} question${count === 1 ? '' : 's'}`}
              </Button>
            </div>

            <p className="text-xs text-slate-400">
              The check is one cheap call that says whether there is enough here to ground specific
              questions. You can skip it and generate anyway — the result is just more likely to be
              generic. Everything generated goes through review before it can be used.
            </p>

            {checkError && (
              <p className="rounded-md border border-amber-100 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
                {checkError}
              </p>
            )}
            {genError && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
                {genError}
              </p>
            )}
            {stale && (
              <p className="text-xs text-slate-400">
                The document changed since the last check. Check again, or generate as it stands.
              </p>
            )}

            {verdict?.sufficient && (
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">There is enough here.</span> This document says
                  concrete things about a real system — the questions can be grounded in it rather
                  than in the technology names.
                </span>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── 3. Elicitation — the differentiator ─────────────────────────── */}
        {showGaps && (
          <Card className="ring-1 ring-amber-200">
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <HelpCircle size={16} className="text-amber-600" /> A few things the document
                doesn&apos;t say
              </h3>
              <Badge tone="amber">{verdict.gaps.length} to answer</Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-xs text-slate-500">
                As it stands, questions written from this would come out generic — the kind you
                could ask from a technology name alone. Answering even one of these grounds them in
                your system. All optional: you can generate without answering.
              </p>
              {verdict.gaps.map((g) => (
                <div key={g}>
                  <Label>{g}</Label>
                  <Textarea
                    value={answers[g] ?? ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [g]: e.target.value }))}
                    rows={2}
                    placeholder="A sentence or two is plenty."
                  />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {/* One round, never more: after this re-check the manager sees a
                    verdict and generates — we do not ask a second set. */}
                {rounds < 2 && (
                  <Button variant="secondary" onClick={runCheck} disabled={!answered.length || checking}>
                    {checking ? <Spinner /> : <ShieldCheck size={15} />}
                    Re-check with these answers
                  </Button>
                )}
                <Button onClick={generate} disabled={generating}>
                  {generating ? <Spinner className="border-white/40 border-t-white" /> : <Wand2 size={16} />}
                  {answered.length ? 'Generate with these answers' : 'Generate anyway'}
                </Button>
                {rounds >= 2 && (
                  <span className="text-xs text-slate-400">
                    Checked twice — that is as far as the check goes. Generate when you are ready.
                  </span>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── 4. Where the questions went ─────────────────────────────────── */}
        {documentId && (
          <Card className="ring-1 ring-brand-200">
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <ClipboardList size={16} className="text-brand-500" /> Questions from this document
              </h3>
              <div className="flex items-center gap-1.5">
                <Badge tone={grounded?.counts.vetted ? 'emerald' : 'slate'}>
                  {grounded?.counts.vetted ?? 0} vetted
                </Badge>
                <Badge tone={grounded?.counts.draft ? 'amber' : 'slate'}>
                  {grounded?.counts.draft ?? 0} awaiting review
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {mayBeGeneric && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">These may be generic.</span> The document
                    didn&apos;t clear the check and the follow-ups went unanswered, so read them
                    with that in mind — a question you could have asked without the document is one
                    to reject.
                  </span>
                </div>
              )}

              {justApproved && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>
                    <span className="font-medium">Added to your bank</span> — vetted and ready to
                    use in an assessment.
                  </span>
                  <Link
                    to="/build"
                    className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                  >
                    Use in an assessment
                  </Link>
                  <Link
                    to="/bank"
                    className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                  >
                    View in the bank
                  </Link>
                </div>
              )}

              {grounded && grounded.drafts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Ready for review
                  </p>
                  {grounded.drafts.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setReviewing(q)}
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-800 line-clamp-2">{q.text}</span>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {q.topic} · {q.difficulty}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-amber-700">Review →</span>
                    </button>
                  ))}
                </div>
              )}

              {awaiting > 0 && (
                <p className="flex items-center gap-2 text-xs text-brand-700">
                  <Loader2 size={13} className="animate-spin" />
                  Writing questions in the background — they appear here as they finish. You can
                  leave this page; they will be waiting in your bank.
                </p>
              )}

              {grounded && grounded.vetted.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    In your bank, ready to use
                  </p>
                  {grounded.vetted.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                    >
                      <p className="text-sm text-slate-700 line-clamp-2">{q.text}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {q.topic} · {q.difficulty}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )}

        <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
          <span>
            The document is stored as you gave it and used only to write these questions. The
            candidate never sees it — not the title, not a sentence of it, and not that the question
            came from a document of yours.
          </span>
        </div>
      </div>
    </>
  );
}
