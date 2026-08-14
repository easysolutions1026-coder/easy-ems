// ════════════════════════════════════════════════════════════════════
// IMSE EASY EMS — Express entry point (Phase 0)
// ════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prisma } from './db/prisma.js';
import { verifyGoogleToken } from './auth/google-oauth.js';
import dataRoutes from './routes/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// ── Middleware ───────────────────────────────────────────────────

// Helmet with a relaxed CSP because the current index.html uses inline
// scripts + Tailwind CDN. Phase 4 can tighten this once we ship the
// consolidated bundle.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:8080').split(','),
  credentials: true,
}));

app.use(express.json({ limit: '25mb' })); // some JSON files (staff w/ attendance) are large
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Health checks (Cloud Run readiness / liveness) ───────────────

app.get('/healthz', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.get('/readyz', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    console.error('readyz DB check failed:', err);
    res.status(503).json({ ok: false, db: 'down', error: String(err.message || err) });
  }
});

// ── Auth middleware ──────────────────────────────────────────────
// Every /api/* request must carry a valid Google OAuth access token.
// The PIN-based `appUsers` layer is enforced inside the routes.

async function requireGoogleAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const m = authHeader.match(/^Bearer (.+)$/i);
  if (!m) return res.status(401).json({ error: 'MISSING_TOKEN' });

  try {
    const claims = await verifyGoogleToken(m[1]);
    // If Workspace domain is configured, enforce it.
    const requiredDomain = process.env.GOOGLE_WORKSPACE_DOMAIN;
    if (requiredDomain && claims.hd !== requiredDomain) {
      return res.status(403).json({ error: 'DOMAIN_NOT_ALLOWED' });
    }
    req.user = { email: claims.email, name: claims.name, hd: claims.hd };
    next();
  } catch (err) {
    console.warn('Token verify failed:', err.message);
    res.status(401).json({ error: 'INVALID_TOKEN', detail: err.message });
  }
}

// ── Routes ───────────────────────────────────────────────────────

app.use('/api', requireGoogleAuth);
app.use('/api/data', dataRoutes);

// Serve the frontend during local dev. In production, static files are
// served from a CDN or GitHub Pages, so this block is inert unless the
// frontend dir is mounted (see docker-compose.yml).
if (process.env.NODE_ENV !== 'production') {
  const frontendDir = path.resolve(__dirname, '../../frontend');
  app.use('/shim', express.static(path.join(frontendDir, 'shared')));
  app.use('/', express.static(frontendDir));
}

// ── Global error handler ─────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    detail: process.env.NODE_ENV === 'production' ? undefined : String(err.message || err)
  });
});

// ── Start ────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[EMS] Listening on :${PORT} (env=${process.env.NODE_ENV || 'dev'})`);
});

// Graceful shutdown for Cloud Run
function shutdown(signal) {
  console.log(`[EMS] ${signal} received, closing…`);
  server.close(() => {
    prisma.$disconnect().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
