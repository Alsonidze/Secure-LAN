import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/routes.js';
import { getDb, dbGet } from './server/db.js';
import { runNetworkScan, checkTemporaryAuthorizations } from './server/scanner.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const HOST = '0.0.0.0';

  // Basic security headers (nosniff, referrer-policy)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(express.json());

  // Initialize DB and ensure baseline
  const db = await getDb();
  console.log(`Secure LAN: База данных SQLite успешно инициализирована. Хост: ${HOST}:${PORT}`);

  // Mount API router
  app.use('/api', apiRouter);

  // Background timer: checks authorization expirations and runs scheduled scans
  let lastAutoScanTime = Date.now();
  setInterval(async () => {
    try {
      const database = await getDb();
      checkTemporaryAuthorizations(database);

      const autoScanRow = dbGet<{ value: string }>(database, "SELECT value FROM settings WHERE key = 'auto_scan_enabled';");
      const intervalRow = dbGet<{ value: string }>(database, "SELECT value FROM settings WHERE key = 'auto_scan_interval';");

      const isAutoScan = autoScanRow ? autoScanRow.value === 'true' : true;
      const intervalSec = intervalRow ? parseInt(intervalRow.value, 10) : 60;

      if (isAutoScan && Date.now() - lastAutoScanTime >= intervalSec * 1000) {
        lastAutoScanTime = Date.now();
        await runNetworkScan(database);
      }
    } catch (e: any) {
      if (e.code !== 'SCAN_IN_PROGRESS') {
        console.warn('Предупреждение фонового сканирования:', e?.message || e);
      }
    }
  }, 10000);

  // Frontend serving via Vite middleware (dev) or static dist (prod)
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Secure LAN: Сервер запущен на http://${HOST}:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Критический сбой запуска Secure LAN:', err);
  process.exit(1);
});
