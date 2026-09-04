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

// Health checks
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

// Auth middleware
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
    req.user = { email: claims.email || claims.sub, name: claims.name, hd: claims.hd, sub: claims.sub };
    next();
  } catch (err) {
    console.warn('Token verify failed:', err.message);
    res.status(401).json({ error: 'INVALID_TOKEN', detail: err.message });
  }
}

// API routes (must come before static)
app.use('/api', requireGoogleAuth);
app.use('/api/data', dataRoutes);

// Static frontend with proper UTF-8 headers
const frontendDir = '/app/frontend';
console.log(`[EMS] Serving static frontend from: ${frontendDir}`);

const staticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
  }
};

app.use('/shim', express.static(path.join(frontendDir, 'shared'), staticOptions));
app.use('/', express.static(frontendDir, staticOptions));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    detail: process.env.NODE_ENV === 'production' ? undefined : String(err.message || err)
  });
});

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