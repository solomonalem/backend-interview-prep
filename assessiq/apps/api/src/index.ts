import './lib/load-env.js'; // must be first — populates process.env from .env
import { createApp } from './app.js';
import { closePdfBrowser } from './lib/pdf.js';

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`[assessiq-api] listening on http://localhost:${port}`);
});

// Chromium is launched lazily for PDF export and reused; a killed API should
// not leave it running.
async function shutdown(): Promise<void> {
  await closePdfBrowser();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
