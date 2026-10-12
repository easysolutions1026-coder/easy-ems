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
import alertRoutes, { getTechAlerts, respondToAlert } from './routes/alerts.js';

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
// Role-based access control for technician accounts.
const TECHNICIAN_EMAILS = (process.env.TECHNICIAN_EMAILS || 'imsetechnician@gmail.com')
  .split(',').map(function(e) { return e.trim().toLowerCase(); }).filter(Boolean);

const TECHNICIAN_ALLOWED_COLLECTIONS = new Set([
  'projectExpenses', 'workLogs', 'fundRequests',
  'staff',      // read-only (see check below)
  'fundPools'   // read-only (see check below)
]);

const TECHNICIAN_READ_ONLY_COLLECTIONS = new Set(['staff', 'fundPools']);

function enforceRoleAccess(req, res, next) {
  const email = (req.user && req.user.email || '').toLowerCase();
  const isTechnician = TECHNICIAN_EMAILS.includes(email);
  if (req.user) req.user.role = isTechnician ? 'technician' : 'office';

  if (!isTechnician) return next();

  const m = req.path.match(/^\/([^/]+)/);
  const collection = m ? m[1] : '';

  if (!TECHNICIAN_ALLOWED_COLLECTIONS.has(collection)) {
    return res.status(403).json({
      error: 'FORBIDDEN_FOR_ROLE',
      detail: 'Technician role cannot access ' + collection
    });
  }

  if (req.method !== 'GET' && TECHNICIAN_READ_ONLY_COLLECTIONS.has(collection)) {
    return res.status(403).json({
      error: 'READ_ONLY_FOR_ROLE',
      detail: 'Technician role has read-only access to ' + collection
    });
  }

  next();
}

// ════════════════════════════════════════════════════════════════
// TECHNICIAN SELF-SERVICE API — PIN-based auth, no Google OAuth.
//
// These endpoints let technicians mark daily readiness, submit
// leave/not-well requests, and view their own attendance using
// only their staffID + 4-digit PIN. No Google account needed.
//
// Security model:
//   - PIN is verified against the staff record in the database.
//   - Rate-limited: 5 failed PIN attempts per staffID → 30-min lock.
//   - Only the technician's OWN attendance and readiness data is
//     accessible — no cross-staff reads, no financial data.
//   - Writes are limited to techReadiness[] and attendance[] arrays
//     on the staff record. All other fields are read-only.
// ════════════════════════════════════════════════════════════════

const _techPinFailures = new Map();  // staffID → { count, lockedUntil }
const TECH_PIN_MAX_ATTEMPTS = 5;
const TECH_PIN_LOCK_MINS = 30;

const techRouter = express.Router();

// POST /api/tech/login — verify PIN, return staff record (own data only)
techRouter.post('/login', async (req, res) => {
  try {
    const { staffID, pin } = req.body || {};
    if (!staffID || !pin) {
      return res.status(400).json({ error: 'MISSING_FIELDS', detail: 'staffID and pin required' });
    }

    // Rate limit check
    const fail = _techPinFailures.get(staffID);
    if (fail && fail.lockedUntil && Date.now() < fail.lockedUntil) {
      const minsLeft = Math.ceil((fail.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: 'ACCOUNT_LOCKED',
        detail: `Too many failed attempts. Try again in ${minsLeft} minute(s).`
      });
    }

    // Read staff record from DB
    const row = await prisma.staff.findUnique({ where: { staffID } });
    if (!row || row.status !== 'Active') {
      return res.status(404).json({ error: 'STAFF_NOT_FOUND' });
    }
    const staff = row.data || {};

    // PIN check
    const storedPin = String(staff.pin || staff.techPin || '');
    if (storedPin !== String(pin)) {
      const current = _techPinFailures.get(staffID) || { count: 0, lockedUntil: null };
      current.count++;
      if (current.count >= TECH_PIN_MAX_ATTEMPTS) {
        current.lockedUntil = Date.now() + TECH_PIN_LOCK_MINS * 60 * 1000;
        current.count = 0;
      }
      _techPinFailures.set(staffID, current);
      return res.status(401).json({ error: 'INVALID_PIN' });
    }

    // PIN correct — clear failures
    _techPinFailures.delete(staffID);

    // Return only the tech's own record (strip sensitive fields)
    const safeStaff = {
      staffID: staff.staffID,
      name: staff.name,
      staffType: staff.staffType,
      designation: staff.designation,
      attendance: staff.attendance || [],
      techReadiness: staff.techReadiness || [],
      registeredMobile: staff.registeredMobile || '',
      warnings: staff.warnings || [],
      // Wage parameters — all raw values from staff record for salary/wage display
      gender: staff.gender || '',
      basicSalary: staff.basicSalary || staff.techBasic || staff.basic || 0,
      hraPct: staff.hraPct ?? staff.techHRAPct ?? 0,
      daPct: staff.daPct ?? staff.techDAPct ?? 0,
      gradePay: staff.gradePay ?? 0,  // Fixed amount (₹), NOT a percentage
      variable: staff.variable ?? staff.techVariable ?? staff.variableAllow ?? 0,
      conveyance: staff.conveyance ?? 0,
      medical: staff.medical ?? 0,
      pfPct: staff.pfPct ?? staff.techPFPct ?? 12,
      esicPct: staff.esicPct ?? staff.techESICPct ?? 0.75,
      travelAllow: staff.travelAllow ?? staff.travelAllowance ?? 0,
      outstationPct: staff.outstationPct ?? 20,
      sailingPct: staff.sailingPct ?? 30,
      anchoragePct: staff.anchoragePct ?? 30,
      dailyWage: staff.dailyWage ?? 0,
      standbyWage: staff.standbyWage ?? 0,
      standbyPct: staff.standbyPct ?? 0,
      tdsMonthly: staff.tdsMonthly ?? 0,
      // Document fields — read-only display in field app
      pan: staff.pan || '',
      aadhar: staff.aadhar || '',
      pfNumber: staff.pfNumber || '',
      esicNumber: staff.esicNumber || '',
      passport: staff.passport || '',
      passportExpiry: staff.passportExpiry || null,
      drivingLicence: staff.drivingLicence || '',
      dlExpiry: staff.dlExpiry || null,
      cdc: staff.cdc || '',
      cdcExpiry: staff.cdcExpiry || null,
      profCert: staff.profCert || '',
      courseCert: staff.courseCert || '',
      courseCertExpiry: staff.courseCertExpiry || null,
      documents: (staff.documents || []).map(d => ({
        id: d.id, type: d.type, label: d.label, fileName: d.fileName,
        expiry: d.expiry || null, notes: d.notes || '',
        mime: d.mime || '', size: d.size || 0,
        driveFileId: d.driveFileId || null
      })),
      // Loan deductions — show active loans with EMI for salary summary
      loans: (staff.loans || []).filter(l => l.status === 'Active').map(l => ({
        loanID: l.loanID, remarks: l.remarks || '', emi: l.emi || 0,
        principal: l.principal || 0, status: l.status,
        firstDeductMonth: l.firstDeductMonth, firstDeductYear: l.firstDeductYear,
        disbursedDate: l.disbursedDate || '', startDate: l.startDate || '',
        closedDate: l.closedDate || '',
        pauseUntil: l.pauseUntil || '', pauseReason: l.pauseReason || '',
        deductionLog: l.deductionLog || [], manualRepayments: l.manualRepayments || [],
        installments: l.installments || 0
      }))
    };

    res.json({ ok: true, staff: safeStaff });
  } catch (err) {
    console.error('[tech/login] error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /api/tech/staff-list — return technician names + IDs only (for the
// dropdown on the login screen). No PIN needed — names aren't sensitive.
techRouter.get('/staff-list', async (req, res) => {
  try {
    const rows = await prisma.staff.findMany({
      where: { status: 'Active' },
      select: { staffID: true, name: true, staffType: true, designation: true }
    });
    const staffList = rows
      .map(r => ({ staffID: r.staffID, name: r.name, staffType: r.staffType || '', designation: r.designation || '' }));
    res.json(staffList);
  } catch (err) {
    console.error('[tech/staff-list] error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// POST /api/tech/readiness — submit daily readiness (Ready / Leave / NotWell)
// Body: { staffID, pin, readiness: { date, status, ... }, attendance: { date, status, ... } }
techRouter.post('/readiness', async (req, res) => {
  try {
    const { staffID, pin, readiness, attendance } = req.body || {};
    if (!staffID || !pin || !readiness) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    // Rate limit check
    const fail = _techPinFailures.get(staffID);
    if (fail && fail.lockedUntil && Date.now() < fail.lockedUntil) {
      return res.status(429).json({ error: 'ACCOUNT_LOCKED' });
    }

    // Read + verify PIN
    const row = await prisma.staff.findUnique({ where: { staffID } });
    if (!row || row.status !== 'Active') {
      return res.status(404).json({ error: 'STAFF_NOT_FOUND' });
    }
    const staff = row.data || {};

    const storedPin = String(staff.pin || staff.techPin || '');
    if (storedPin !== String(pin)) {
      const current = _techPinFailures.get(staffID) || { count: 0, lockedUntil: null };
      current.count++;
      if (current.count >= TECH_PIN_MAX_ATTEMPTS) {
        current.lockedUntil = Date.now() + TECH_PIN_LOCK_MINS * 60 * 1000;
        current.count = 0;
      }
      _techPinFailures.set(staffID, current);
      return res.status(401).json({ error: 'INVALID_PIN' });
    }
    _techPinFailures.delete(staffID);

    // Update techReadiness — replace today's entry or add new
    if (!Array.isArray(staff.techReadiness)) staff.techReadiness = [];
    const rDate = readiness.date;
    staff.techReadiness = staff.techReadiness.filter(r => r.date !== rDate);
    staff.techReadiness.push(readiness);

    // Update attendance — only if no office-set entry exists for this date
    if (attendance && attendance.date) {
      if (!Array.isArray(staff.attendance)) staff.attendance = [];
      const existing = staff.attendance.find(a => a.date === attendance.date);
      if (existing) {
        if (existing._autoByTechSS) {
          existing.status = attendance.status;
          existing._autoByTechSS = true;
          existing.updatedAt = new Date().toISOString();
        }
      } else {
        staff.attendance.push({
          attID: 'ATT' + Date.now(),
          staffID: staff.staffID,
          staffName: staff.name,
          ...attendance,
          _autoByTechSS: true,
          enteredAt: new Date().toISOString()
        });
      }
    }

    // Save back — update the data JSONB column
    await prisma.staff.update({
      where: { staffID },
      data: { data: staff, updatedAt: new Date() }
    });

    // Return updated own record
    res.json({
      ok: true,
      staff: {
        staffID: staff.staffID,
        name: staff.name,
        staffType: staff.staffType,
        designation: staff.designation,
        attendance: staff.attendance || [],
        techReadiness: staff.techReadiness || [],
        warnings: staff.warnings || [],
        gender: staff.gender || '',
        basicSalary: staff.basicSalary || staff.techBasic || staff.basic || 0,
        hraPct: staff.hraPct ?? staff.techHRAPct ?? 0,
        daPct: staff.daPct ?? staff.techDAPct ?? 0,
        gradePay: staff.gradePay ?? 0,
        variable: staff.variable ?? staff.techVariable ?? staff.variableAllow ?? 0,
        conveyance: staff.conveyance ?? 0,
        medical: staff.medical ?? 0,
        pfPct: staff.pfPct ?? staff.techPFPct ?? 12,
        esicPct: staff.esicPct ?? staff.techESICPct ?? 0.75,
        travelAllow: staff.travelAllow ?? staff.travelAllowance ?? 0,
        outstationPct: staff.outstationPct ?? 20,
        sailingPct: staff.sailingPct ?? 30,
        anchoragePct: staff.anchoragePct ?? 30,
        dailyWage: staff.dailyWage ?? 0,
        standbyWage: staff.standbyWage ?? 0,
        standbyPct: staff.standbyPct ?? 0,
        tdsMonthly: staff.tdsMonthly ?? 0,
      }
    });
  } catch (err) {
    console.error('[tech/readiness] error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /api/tech/projects — return project list for work log dropdown (no auth needed)
techRouter.get('/projects', async (req, res) => {
  try {
    const rows = await prisma.projectExpenses.findMany({
      select: { projExpID: true, data: true }
    });
    const projects = rows.map(r => {
      const d = r.data || {};
      return {
        projExpID: d.projExpID || r.projExpID,
        projectName: d.projectName || '',
        projectRef: d.projectRef || '',
        status: d.status || 'Active'
      };
    }).filter(p => p.projectName);
    res.json(projects);
  } catch (err) {
    console.error('[tech/projects] error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Tech alert routes — PIN-based, no Google auth
techRouter.get('/alerts', getTechAlerts);
techRouter.post('/alerts/respond', respondToAlert);

// Mount tech routes — NO requireGoogleAuth on this path
app.use('/api/tech', techRouter);

// API routes (must come before static)
app.use('/api', requireGoogleAuth);
app.use('/api/data', enforceRoleAccess, dataRoutes);
app.use('/api/data/alerts', alertRoutes);

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
// Field app route - serves field_app.html at /field
app.get('/field', function(req, res) {
  res.sendFile(path.join(frontendDir, 'field_app.html'));
});
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
