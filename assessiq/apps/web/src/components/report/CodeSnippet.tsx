import { useEffect, useState } from 'react';
import { Code2 } from 'lucide-react';
import { snippetLanguageLabel, type SnippetLanguage } from '@assessiq/types';
import type { HighlightResult } from '../../lib/highlight';

/**
 * The candidate's code sketch, as the interviewer sees it.
 *
 * Read-only in the strongest sense: there is no run button, no test output and
 * no pass/fail, because none of that exists anywhere in this product. What the
 * sketch is worth was decided by the scorer, which read it as part of the
 * answer; this block is here so the person making the hiring decision can see
 * what the scorer saw.
 *
 * The highlighter is pulled in on demand. Until it lands — and permanently, if
 * it fails to load at all — the code renders as plain monospace text, which is
 * a perfectly good way to read it.
 */
export function CodeSnippet({
  code,
  language,
}: {
  code: string;
  language: SnippetLanguage | null;
}) {
  const [result, setResult] = useState<HighlightResult | null>(null);

  useEffect(() => {
    let alive = true;
    // Dynamic: this is what keeps highlight.js out of the main bundle, and out
    // of the download of every candidate taking an assessment.
    void import('../../lib/highlight')
      .then(({ highlightSnippet }) => highlightSnippet(code, language))
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch(() => {
        /* plain text is the fallback, and it is a fine one */
      });
    return () => {
      alive = false;
    };
  }, [code, language]);

  // "Python" when they picked one, plain "Code" when they left it on Auto.
  // Auto-detection still runs — it is what colours the text — but what it
  // guessed is never printed: it picks the grammar that highlights best, not
  // the language, and a wrong language stated in a hiring report is worse than
  // no language at all.
  const label = language && language !== 'auto' ? snippetLanguageLabel(language) : 'Code';

  // Dark, on a report that is otherwise a white document. Deliberate: code is
  // read on a dark ground nearly everywhere else, the GitHub Dark tokens are
  // tuned for exactly this background, and the change of surface marks where
  // the candidate's own writing stops and our commentary about it starts.
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/60 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 bg-slate-800 px-3 py-1.5">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          <Code2 size={12} /> {label}
        </p>
        <p className="text-[11px] text-slate-400">attached by the candidate · not executed</p>
      </div>
      {/* Its own horizontal scroller: a long line in a sketch must not push the
          report's layout sideways. */}
      {/* Ligatures off: an interviewer is reading the characters the candidate
          actually typed, and a font that draws "=>" as a single arrow glyph
          quietly edits them. */}
      <pre className="overflow-x-auto bg-[#0d1117] px-3.5 py-3 text-[13px] leading-relaxed [font-variant-ligatures:none]">
        {result ? (
          // hljs escapes its own output, so this is the library's markup around
          // the candidate's text — not the candidate's markup.
          //
          // No `hljs` class on purpose: the theme styles `pre code.hljs` with
          // its own padding and background, which would fight this block's.
          // The token classes inside carry all the colour.
          <code
            className="font-mono text-slate-200"
            dangerouslySetInnerHTML={{ __html: result.html }}
          />
        ) : (
          <code className="font-mono text-slate-200">{code}</code>
        )}
      </pre>
    </div>
  );
}
