// IMSE EASY EMS - Express entry point (Phase 0)

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

// --- Middleware -----------------------------------------------------

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:8080').split(','),
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Health checks --------------------------------------------------

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

// --- Auth middleware ------------------------------------------------

async function requireGoogleAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const m = authHeader.match(/^Bearer (.+)$/i);
  if (!m) return res.status(401).json({ error: 'MISSING_TOKEN' });

  try {
    const claims = await verifyGoogleToken(m[1]);
    const requiredDomain = process.env.GOOGLE_WORKSPACE_DOMAIN;
    if (requiredDomain && claims.hd !== requiredDomain) {
      return res.status(403).json({ error: 'DOMAIN_NOT_ALLOWED' });
    }
    // Accept the token even if email is not present (may need extra scope)
    req.user = { email: claims.email || claims.sub, name: claims.name, hd: claims.hd, sub: claims.sub };
    next();
  } catch (err) {
    console.warn('Token verify failed:', err.message);
    res.status(401).json({ error: 'INVALID_TOKEN', detail: err.message });
  }
}

// --- API routes (auth-required) - MUST come before static middleware ---
app.use('/api', requireGoogleAuth);
app.use('/api/data', dataRoutes);

// --- Static frontend files ------------------------------------------
// Frontend is mounted at /app/frontend by docker-compose.yml.
// Use absolute path so it works regardless of __dirname resolution.
const frontendDir = '/app/frontend';
console.log(`[EMS] Serving static frontend from: ${frontendDir}`);
app.use('/shim', express.static(path.join(frontendDir, 'shared')));
app.use('/', express.static(frontendDir));

// --- Global error handler ------------------------------------------

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    detail: process.env.NODE_ENV === 'production' ? undefined : String(err.message || err)
  });
});

// --- Start ---------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`[EMS] Listening on :${PORT} (env=${process.env.NODE_ENV || 'dev'})`);
});

function shutdown(signal) {
  console.log(`[EMS] ${signal} received, closing...`);
  server.close(() => {
    prisma.$disconnect().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));