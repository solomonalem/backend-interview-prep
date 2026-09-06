import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import {
  DOCUMENT_MAX_CHARS,
  DOCUMENT_MIN_CHARS,
  type DocumentExtractResponse,
} from '@assessiq/types';
import { AppError } from '../middleware/error.middleware.js';

/**
 * Server-side text extraction for the document grounding tier.
 *
 * Four formats and no more: .pdf, .docx, .txt, .md. No csv (a table is not
 * prose and grounds nothing), no images, no OCR. The extracted text is not the
 * end of the road — it lands back in the manager's editable textarea, so a
 * partial or oddly-ordered extraction is something they can see and fix rather
 * than something that silently degrades a question.
 */
export type DocumentFormat = 'pdf' | 'docx' | 'text';

const BY_MIME: Record<string, DocumentFormat> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/x-markdown': 'text',
};

const BY_EXTENSION: Record<string, DocumentFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  txt: 'text',
  md: 'text',
  markdown: 'text',
};

/**
 * Extension first, mime type second. Browsers disagree about the mime type of
 * a .md file (text/markdown, text/plain, or empty), and the manager chose the
 * file by its name — that is the more reliable signal of what they meant.
 */
export function formatOf(filename: string, mimetype: string): DocumentFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? BY_MIME[mimetype.split(';')[0]!.trim().toLowerCase()] ?? null;
}

/** Collapse the whitespace that PDF and DOCX extraction always produces —
 *  page-break runs of blank lines, trailing spaces from justified text — so
 *  the manager sees prose rather than a column of gaps. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Filename without its extension, as the offered title. */
function titleFrom(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.[^.]+$/, '').trim() || 'Untitled document';
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    return text ?? '';
  } finally {
    // pdfjs holds worker resources; leaking one per upload would eventually
    // take the API process with it.
    await parser.destroy();
  }
}

/**
 * Extract text from one uploaded document.
 *
 * Throws AppError with a message written for the manager, not for a log. Every
 * failure here has an action attached to it — paste instead, trim the section,
 * pick another format — because the alternative is a dead end on a screen
 * whose whole purpose is getting text into a box.
 */
export async function extractDocumentText(
  filename: string,
  mimetype: string,
  buffer: Buffer,
): Promise<DocumentExtractResponse> {
  const format = formatOf(filename, mimetype);
  if (!format) {
    throw new AppError(
      415,
      'UNSUPPORTED_DOCUMENT',
      'Only .pdf, .docx, .txt and .md files can be read. For anything else, paste the text instead.',
    );
  }

  let raw: string;
  try {
    if (format === 'pdf') raw = await extractPdf(buffer);
    else if (format === 'docx') raw = (await mammoth.extractRawText({ buffer })).value;
    else raw = buffer.toString('utf8');
  } catch (err) {
    // The parser's own message describes a file structure, which tells the
    // manager nothing they can act on. Keep it in the log, not the response.
    console.error(`[document] ${format} extraction failed:`, (err as Error).message);
    throw new AppError(
      422,
      'DOCUMENT_UNREADABLE',
      'That file could not be read. It may be corrupt or password-protected — paste the text instead.',
    );
  }

  const text = tidy(raw);

  // A scanned PDF is an image of a page: the parse succeeds and yields almost
  // nothing. We reject rather than OCR — OCR is a whole product surface, and a
  // half-recognised architecture doc grounds worse questions than no document.
  if (text.length < DOCUMENT_MIN_CHARS) {
    throw new AppError(
      422,
      'DOCUMENT_EMPTY',
      format === 'pdf'
        ? 'This PDF appears to be scanned — there is no text to read. Paste the text instead.'
        : 'That file has almost no text in it. Paste the text instead.',
    );
  }

  const truncated = text.length > DOCUMENT_MAX_CHARS;
  return {
    title: titleFrom(filename),
    // Truncation is reported, never silent: the manager is about to generate
    // from whatever is in the box, so they need to know the tail is missing
    // and can paste the section that actually matters.
    text: truncated ? text.slice(0, DOCUMENT_MAX_CHARS) : text,
    chars: text.length,
    truncated,
  };
}
