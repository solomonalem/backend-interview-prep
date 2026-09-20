import { useRef, type KeyboardEvent } from 'react';
import { Code2, X } from 'lucide-react';
import {
  SNIPPET_LANGUAGES,
  SNIPPET_LANGUAGE_LABELS,
  SNIPPET_MAX_CHARS,
  type SnippetLanguage,
} from '@assessiq/types';
import { Select } from '../ui';
import { cn } from '../../lib/cn';

/**
 * The optional code sketch under the answer box.
 *
 * Deliberately a plain textarea. No CodeMirror, no Monaco, no autocomplete, no
 * bracket matching and no highlighting while typing: a candidate under a clock
 * needs a box that behaves exactly as they expect, and a half-configured editor
 * that swallows a keystroke costs more than the syntax colours are worth. The
 * one editor affordance kept is Tab, because a Tab that moves focus out of the
 * box mid-thought is worse than no Tab at all.
 *
 * Nothing here is run. The candidate is told so, in the field itself — a
 * "sketch to support your answer" and "write code that passes the tests" are
 * different tasks, and a candidate who guesses the second one wastes their time
 * making it compile.
 */
interface Props {
  open: boolean;
  code: string;
  language: SnippetLanguage;
  onOpen: () => void;
  /** Collapsing discards the sketch — said on the button, not just here. */
  onRemove: () => void;
  onCodeChange: (code: string) => void;
  onLanguageChange: (language: SnippetLanguage) => void;
  /** Same proctoring event the answer box records. See the page for why. */
  onPaste: (charCount: number) => void;
  onActivity: () => void;
}

export function CodeSketchField({
  open,
  code,
  language,
  onOpen,
  onRemove,
  onCodeChange,
  onLanguageChange,
  onPaste,
  onActivity,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          onOpen();
          onActivity();
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-500 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
      >
        <Code2 size={15} /> Add code (optional)
      </button>
    );
  }

  const over = code.length > SNIPPET_MAX_CHARS;

  // Tab indents by two spaces instead of leaving the box. Shift+Tab is left
  // alone on purpose: it stays the keyboard way out of a textarea that now
  // captures Tab, and taking that away would trap anyone not using a mouse.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${code.slice(0, start)}  ${code.slice(end)}`;
    onCodeChange(next);
    // After React re-renders with the new value — otherwise the caret snaps to
    // the end of the text and every Tab loses the candidate's place.
    requestAnimationFrame(() => {
      const node = ref.current;
      if (node) node.selectionStart = node.selectionEnd = start + 2;
    });
    onActivity();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Code2 size={13} /> Code
        </p>
        <div className="flex items-center gap-2">
          {/* Wrapped rather than given a width class: the shared Select is
              w-full, and cn() only joins strings — it does not resolve a
              Tailwind conflict, so the wrapper is the honest way to size it. */}
          <div className="w-40">
            <Select
              value={language}
              onChange={(e) => {
                onLanguageChange(e.target.value as SnippetLanguage);
                onActivity();
              }}
              aria-label="Snippet language"
            >
              {SNIPPET_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l === 'auto' ? 'Auto-detect' : SNIPPET_LANGUAGE_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600"
          >
            <X size={13} /> Remove
          </button>
        </div>
      </div>

      <textarea
        ref={ref}
        value={code}
        rows={8}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => {
          onCodeChange(e.target.value);
          onActivity();
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          // Identical to the answer box: without this the sketch would be a
          // hole in paste tracking, and a candidate who pasted their answer as
          // "code" would look like one who typed it.
          const text = e.clipboardData.getData('text');
          if (text) onPaste(text.length);
          onActivity();
        }}
        placeholder={'function example() {\n  // sketch the idea — it does not have to run\n}'}
        className={cn(
          'w-full resize-y rounded-lg border bg-white px-3 py-2.5 font-mono text-[13px] leading-relaxed text-slate-800 shadow-sm transition placeholder:text-slate-300 focus:outline-none focus:ring-2',
          over
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100',
        )}
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">
          Sketch, don't polish — this is read alongside your answer, never run or tested. Tab
          indents.
        </p>
        <p
          className={cn(
            'tabular text-[11px] font-medium',
            over ? 'text-rose-600' : 'text-slate-400',
          )}
        >
          {code.length.toLocaleString()} / {SNIPPET_MAX_CHARS.toLocaleString()}
        </p>
      </div>

      {over && (
        <p className="mt-1.5 text-xs text-rose-600">
          Your code snippet is too long — the limit is {SNIPPET_MAX_CHARS.toLocaleString()}{' '}
          characters. Trim {(code.length - SNIPPET_MAX_CHARS).toLocaleString()} to continue.
        </p>
      )}
    </div>
  );
}
