import './lib/load-env.js'; // must be first — populates process.env from .env
import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`[assessiq-api] listening on http://localhost:${port}`);
});
