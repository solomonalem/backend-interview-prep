import type { HLJSApi } from 'highlight.js';
// The token colours. Imported here rather than in the app's global stylesheet
// so it travels in this module's chunk — the theme arrives with the highlighter
// or not at all. GitHub dark: code gets the surface it is read on everywhere
// else, and the shift in ground is what separates what the candidate WROTE
// from the report's own commentary about it.
import 'highlight.js/styles/github-dark.css';
import { SNIPPET_LANGUAGES, type SnippetLanguage } from '@assessiq/types';

/**
 * Syntax highlighting for a candidate's code sketch — DISPLAY SIDE ONLY.
 *
 * Nothing here parses code in order to judge it, and nothing anywhere runs it.
 * This turns text into coloured text for an interviewer reading a report, and
 * that is the entire contract.
 *
 * WHY highlight.js (and not Prism): the language dropdown defaults to Auto, so
 * most sketches arrive with no language declared. highlight.js is the one
 * mainstream highlighter with real auto-detection; Prism requires the language
 * up front, which would mean either guessing in our own code or pushing the
 * classification back onto a candidate who is being timed.
 *
 * WHY the explicit language map: `highlight.js/lib/core` plus the twenty
 * languages we actually offer is a fraction of the full bundle, and
 * `highlightAuto` only ever considers what is registered — so the list below is
 * both the download and the detection space. The whole module is loaded through
 * a dynamic import on first use, which keeps it in its own chunk: a candidate
 * taking an assessment never downloads a highlighter they will never see.
 */

// `auto` has nothing to load, and `plaintext` is rendered without highlighting.
type LoadableLanguage = Exclude<SnippetLanguage, 'auto' | 'plaintext'>;

// Static import paths so Vite can find and split them. HTML lives in the `xml`
// module, which declares `html` among its aliases — registerLanguage brings the
// aliases with it, so `highlight(code, { language: 'html' })` still resolves.
const LOADERS: Record<LoadableLanguage, () => Promise<{ default: unknown }>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  java: () => import('highlight.js/lib/languages/java'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  php: () => import('highlight.js/lib/languages/php'),
  sql: () => import('highlight.js/lib/languages/sql'),
  bash: () => import('highlight.js/lib/languages/bash'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  swift: () => import('highlight.js/lib/languages/swift'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  html: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  json: () => import('highlight.js/lib/languages/json'),
};

// Registered under the hljs name, which differs from ours for HTML.
const HLJS_NAME: Partial<Record<LoadableLanguage, string>> = { html: 'xml' };

let loading: Promise<HLJSApi> | null = null;

async function load(): Promise<HLJSApi> {
  if (!loading) {
    loading = (async () => {
      const core = await import('highlight.js/lib/core');
      const hljs = core.default;
      const entries = Object.entries(LOADERS) as [LoadableLanguage, () => Promise<{ default: unknown }>][];
      const mods = await Promise.all(entries.map(([, importer]) => importer()));
      entries.forEach(([name], i) => {
        const mod = mods[i];
        if (!mod) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hljs.registerLanguage(HLJS_NAME[name] ?? name, mod.default as any);
      });
      hljs.configure({ ignoreUnescapedHTML: true });
      return hljs;
    })();
  }
  return loading;
}

export interface HighlightResult {
  /** Escaped HTML with hljs token spans. Safe to inject — hljs escapes it. */
  html: string;
}

/**
 * What auto-detection guessed is deliberately NOT returned.
 *
 * `highlightAuto` picks the grammar that colours the text best, which is not
 * the same as identifying the language: a short JavaScript sketch scores
 * happily as C++, and the colours still come out right. Printing that guess in
 * a hiring report would state something false about the candidate's submission
 * to buy a word of decoration, so an undeclared sketch is labelled "Code".
 */

/**
 * Highlight one sketch. Returns null when the caller should just render the
 * text as it is — plaintext, or a highlighter that failed to load.
 *
 * Never throws. A report that loses its colours is a small thing; a report that
 * fails to render an answer is not.
 */
export async function highlightSnippet(
  code: string,
  language: SnippetLanguage | null,
): Promise<HighlightResult | null> {
  if (language === 'plaintext') return null;
  try {
    const hljs = await load();
    if (language && language !== 'auto' && (SNIPPET_LANGUAGES as readonly string[]).includes(language)) {
      const res = hljs.highlight(code, { language, ignoreIllegals: true });
      return { html: res.value };
    }
    return { html: hljs.highlightAuto(code).value };
  } catch {
    return null;
  }
}
