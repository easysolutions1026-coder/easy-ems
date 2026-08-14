// ════════════════════════════════════════════════════════════════════
// Generic data routes — the API surface that api-shim.js consumes.
// ────────────────────────────────────────────────────────────────────
// Design goal for Phase 0:
//   Preserve the current shape of the app. The client sees each
//   collection as an ARRAY OF OBJECTS, exactly like the JSON files
//   on Drive today. The shim calls:
//
//     GET  /api/data/:collection         → returns full array
//     POST /api/data/:collection         → overwrites full array
//     GET  /api/data/:collection/meta    → returns lightweight metadata
//                                          (version, count, lastModifiedAt)
//                                          for concurrency polling
//
//   In Phase 2 we'll add fine-grained endpoints (POST one record,
//   PATCH by id, DELETE by id) plus SSE for live updates. But Phase 0
//   ships the minimum needed to fully replace Google Drive JSON storage.
//
// Concurrency:
//   The POST expects the client to send the FULL collection payload,
//   which mirrors current Drive behavior. If the client's `ifVersion`
//   query param doesn't match the current DB version, we return 409.
//   The client (index.html / field_app.html) already has retry-with-
//   merge logic for this.
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

// ── Collection → Prisma model registry ───────────────────────────
//
// Every collection the app uses today is listed here. The shape:
//   {
//     model: prisma.<modelName>,
//     idField: legacy JSON id field (used for upsert on POST),
//     mapIn:  legacy record → DB row (for INSERT / UPDATE),
//     mapOut: DB row → legacy record (for GET),
//   }
//
// The default mapIn/mapOut just puts the record in `data` and copies
// through the legacy id. Tables with promoted columns override mapIn
// to pull those fields out.

function defaultMapOut(row) {
  // Return the original JSON shape, augmented with server-managed fields.
  return {
    ...row.data,
    _dbId:            row.id,
    _version:         row.version,
    _createdAt:       row.createdAt?.toISOString?.(),
    _updatedAt:       row.updatedAt?.toISOString?.(),
    _lastModifiedBy:  row.lastModifiedBy,
  };
}

const COLLECTIONS = {
  // — auth / audit
  appUsers: {
    model:   prisma.appUser,
    idField: 'userID',
    mapIn:   (r) => ({
      userID:  r.userID,
      email:   r.email,
      name:    r.name,
      role:    r.role,
      pinHash: r.pinHash,
      pinExpiry: r.pinExpiry ? new Date(r.pinExpiry) : null,
      pinPeriodDays: r.pinPeriodDays ?? 30,
      active: r.active ?? true,
      permissions: r.permissions ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  auditLog: {
    // Special-case: append-only. GET returns last 500 rows for parity
    // with the current in-memory cache.
    model:  prisma.auditLog,
    idField: 'id',
    isAppendOnly: true,
  },

  // — misc single-document collections
  settings: {
    isKeyValue: true, // stored in prisma.setting
  },

  // — masters
  parties: {
    model: prisma.party,
    idField: 'partyID',
    mapIn: (r) => ({
      partyID: r.partyID,
      name: r.name,
      gstin: r.gstin ?? null,
      partyType: r.partyType ?? null,
      active: r.active ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  chartOfAccounts: {
    model: prisma.chartOfAccount,
    idField: 'accountCode',
    mapIn: (r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType ?? null,
      parentCode:  r.parentCode ?? null,
      active:      r.active ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  bankAccounts: {
    model: prisma.bankAccount,
    idField: 'accountID',
    mapIn: (r) => ({
      accountID: r.accountID,
      accountName: r.accountName,
      bankName: r.bankName ?? null,
      accountNo: r.accountNo ?? null,
      ifsc: r.ifsc ?? null,
      balance: r.balance != null ? r.balance : null,
      active: r.active ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  bankReconciliations: {
    model: prisma.bankReconciliation,
    idField: 'reconID',
    mapIn: (r) => ({
      reconID: r.reconID,
      accountID: r.accountID,
      periodMonth: Number(r.periodMonth),
      periodYear:  Number(r.periodYear),
      openingBal: r.openingBal ?? null,
      closingBal: r.closingBal ?? null,
      status: r.status ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  staff: {
    model: prisma.staff,
    idField: 'staffID',
    mapIn: (r) => ({
      staffID: r.staffID,
      name: r.name,
      designation: r.designation ?? null,
      staffType: r.staffType ?? null,
      status: r.status ?? 'Active',
      email: r.email ?? null,
      phone: r.phone ?? null,
      joinDate: r.joinDate ? new Date(r.joinDate) : null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },

  // — transactional
  transactions: {
    model: prisma.transaction,
    idField: 'txnID',
    mapIn: (r) => ({
      txnID: r.txnID,
      txnCategory: r.txnCategory,
      txnDate: r.txnDate ? new Date(r.txnDate) : null,
      partyID: r.partyID ?? null,
      partyName: r.partyName ?? null,
      totalAmount: r.totalAmount ?? null,
      status: r.status ?? null,
      revisionNo: r.revisionNo ?? 0,
      fiscalYear: r.fiscalYear ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  expenses: {
    model: prisma.expense,
    idField: 'exID',
    mapIn: (r) => ({
      exID: r.exID,
      billType: r.billType ?? null,
      billDate: r.billDate ? new Date(r.billDate) : null,
      partyID: r.partyID ?? null,
      partyName: r.partyName ?? null,
      totalAmount: r.totalAmount ?? null,
      balanceAmount: r.balanceAmount ?? null,
      status: r.status ?? null,
      gstClaimable: !!r.gstClaimable,
      tdsApplicable: !!r.tdsApplicable,
      fiscalYear: r.fiscalYear ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  directorExpenses: {
    model: prisma.directorExpense,
    idField: 'deID',
    mapIn: (r) => ({
      deID: r.deID,
      directorName: r.directorName ?? null,
      expenseDate: r.expenseDate ? new Date(r.expenseDate) : null,
      amount: r.amount ?? null,
      reimbursed: !!r.reimbursed,
      reimburseDate: r.reimburseDate ? new Date(r.reimburseDate) : null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  paymentRequests: {
    model: prisma.paymentRequest,
    idField: 'prID',
    mapIn: (r) => ({
      prID: r.prID,
      prDate: r.prDate ? new Date(r.prDate) : null,
      billIDs: r.billIDs ?? null,
      requestedAmt: r.requestedAmt ?? null,
      approvedAmt: r.approvedAmt ?? null,
      disbursedAmt: r.disbursedAmt ?? null,
      status: r.status ?? null,
      revisionNo: r.revisionNo ?? 0,
      fiscalYear: r.fiscalYear ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  fundRequests: {
    model: prisma.fundRequest,
    idField: 'frID',
    mapIn: (r) => ({
      frID: r.frID,
      frDate: r.frDate ? new Date(r.frDate) : null,
      technicianID: r.technicianID ?? null,
      amount: r.amount ?? null,
      status: r.status ?? null,
      poolID: r.poolID ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  fundPools: {
    model: prisma.fundPool,
    idField: 'poolID',
    mapIn: (r) => ({
      poolID: r.poolID,
      technicianID: r.technicianID ?? null,
      openedDate: r.openedDate ? new Date(r.openedDate) : null,
      closedDate: r.closedDate ? new Date(r.closedDate) : null,
      openingAmt: r.openingAmt ?? null,
      spentAmt: r.spentAmt ?? null,
      balanceAmt: r.balanceAmt ?? null,
      status: r.status ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  arInvoices: {
    model: prisma.arInvoice,
    idField: 'arID',
    mapIn: (r) => ({
      arID: r.arID,
      invoiceNo: r.invoiceNo ?? null,
      invoiceDate: r.invoiceDate ? new Date(r.invoiceDate) : null,
      partyID: r.partyID ?? null,
      partyName: r.partyName ?? null,
      invoiceAmt: r.invoiceAmt ?? null,
      receivedAmt: r.receivedAmt ?? null,
      balanceAmt: r.balanceAmt ?? null,
      ageDays: r.ageDays ?? null,
      status: r.status ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  projectExpenses: {
    model: prisma.projectExpense,
    idField: 'peID',
    mapIn: (r) => ({
      peID: r.peID,
      peDate: r.peDate ? new Date(r.peDate) : null,
      technicianID: r.technicianID ?? null,
      projectRef: r.projectRef ?? null,
      category: r.category ?? null,
      amount: r.amount ?? null,
      poolID: r.poolID ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  workLogs: {
    model: prisma.workLog,
    idField: 'wlID',
    mapIn: (r) => ({
      wlID: r.wlID,
      technicianID: r.technicianID ?? null,
      projectRef: r.projectRef ?? null,
      weekStartDate: r.weekStartDate ? new Date(r.weekStartDate) : null,
      status: r.status ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  payslips: {
    model: prisma.payslip,
    idField: 'payslipID',
    mapIn: (r) => ({
      payslipID: r.payslipID,
      staffID: r.staffID,
      periodMonth: Number(r.periodMonth),
      periodYear:  Number(r.periodYear),
      gross: r.gross ?? null,
      net: r.net ?? null,
      pfAmt: r.pfAmt ?? null,
      esicAmt: r.esicAmt ?? null,
      ptAmt: r.ptAmt ?? null,
      tdsAmt: r.tdsAmt ?? null,
      status: r.status ?? null,
      approvedAt: r.approvedAt ? new Date(r.approvedAt) : null,
      approvedBy: r.approvedBy ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },

  // — petty cash
  pettyCashOffices: {
    model: prisma.pettyCashOffice,
    idField: 'officeID',
    mapIn: (r) => ({
      officeID: r.officeID,
      officeName: r.officeName,
      custodianStaffID: r.custodianStaffID ?? null,
      imprestLimit: r.imprestLimit ?? null,
      currentBalance: r.currentBalance ?? null,
      active: r.active ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  pettyCashTransactions: {
    model: prisma.pettyCashTransaction,
    idField: 'txnID',
    mapIn: (r) => ({
      txnID: r.txnID,
      officeID: r.officeID,
      txnType: r.txnType,
      txnDate: r.txnDate ? new Date(r.txnDate) : null,
      amount: r.amount ?? null,
      category: r.category ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  pettyCashStatements: {
    model: prisma.pettyCashStatement,
    idField: 'stmtID',
    mapIn: (r) => ({
      stmtID: r.stmtID,
      officeID: r.officeID,
      periodMonth: Number(r.periodMonth),
      periodYear:  Number(r.periodYear),
      verifiedBy: r.verifiedBy ?? null,
      verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
      postedToTally: !!r.postedToTally,
      data: r,
    }),
    mapOut: defaultMapOut,
  },

  // — compliance
  gstCashLedgerSnapshots: {
    model: prisma.gstCashLedgerSnapshot,
    idField: 'snapshotID',
    mapIn: (r) => ({
      snapshotID: r.snapshotID,
      snapshotDate: r.snapshotDate ? new Date(r.snapshotDate) : null,
      periodMonth: r.periodMonth != null ? Number(r.periodMonth) : null,
      periodYear:  r.periodYear  != null ? Number(r.periodYear)  : null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  companyDocuments: {
    model: prisma.companyDocument,
    idField: 'docID',
    mapIn: (r) => ({
      docID: r.docID,
      docName: r.docName,
      docCategory: r.docCategory ?? null,
      certNo: r.certNo ?? null,
      issuer: r.issuer ?? null,
      holderType: r.holderType ?? null,
      holderName: r.holderName ?? null,
      issueDate: r.issueDate ? new Date(r.issueDate) : null,
      expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
      isLifetime: !!r.isLifetime,
      renewalReminderAcknowledged: !!r.renewalReminderAcknowledged,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
};

// ── Special-case: settings (single JSON doc, not an array) ───────

async function getSettings() {
  const rows = await prisma.setting.findMany();
  // Legacy shape: settings.json was a single object. Rebuild it.
  const merged = {};
  for (const row of rows) {
    merged[row.key] = row.data;
  }
  return merged;
}

async function saveSettings(obj, userEmail) {
  const now = new Date();
  const keys = Object.keys(obj || {});
  await prisma.$transaction(async (tx) => {
    for (const key of keys) {
      await tx.setting.upsert({
        where: { key },
        create: { key, data: obj[key], updatedBy: userEmail, updatedAt: now },
        update: { data: obj[key], updatedBy: userEmail, updatedAt: now },
      });
    }
  });
}

// ── Special-case: auditLog (append-only) ─────────────────────────

async function getAuditTail(limit = 500) {
  const rows = await prisma.auditLog.findMany({
    orderBy: { ts: 'desc' },
    take: limit,
  });
  return rows.reverse().map(r => ({
    ts:         r.ts.toISOString(),
    userEmail:  r.userEmail,
    userName:   r.userName,
    action:     r.action,
    collection: r.collection,
    recordId:   r.recordId,
    before:     r.before,
    after:      r.after,
    ip:         r.ip,
  }));
}

async function appendAuditRows(rows, userEmail) {
  if (!Array.isArray(rows) || !rows.length) return;
  // Only insert rows whose `ts` is newer than the newest we already have.
  // This preserves append-only semantics even if the client re-sends the tail.
  const latest = await prisma.auditLog.findFirst({
    orderBy: { ts: 'desc' },
  });
  const cutoff = latest ? latest.ts.getTime() : 0;

  const toInsert = rows.filter(r => {
    if (!r || !r.ts) return false;
    return new Date(r.ts).getTime() > cutoff;
  }).map(r => ({
    ts:         r.ts ? new Date(r.ts) : new Date(),
    userEmail:  r.userEmail || userEmail || null,
    userName:   r.userName  || null,
    action:     r.action    || 'UNKNOWN',
    collection: r.collection || null,
    recordId:   r.recordId   || null,
    before:     r.before     ?? null,
    after:      r.after      ?? null,
    ip:         r.ip         ?? null,
  }));

  if (toInsert.length) {
    await prisma.auditLog.createMany({ data: toInsert });
  }
}

// ════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════

// GET /api/data/:collection
router.get('/:collection', async (req, res) => {
  const name = req.params.collection;
  const cfg  = COLLECTIONS[name];

  try {
    if (name === 'settings') {
      const merged = await getSettings();
      return res.json(merged);
    }
    if (name === 'auditLog') {
      const tail = await getAuditTail(500);
      return res.json(tail);
    }
    if (!cfg || !cfg.model) return res.status(404).json({ error: 'UNKNOWN_COLLECTION' });

    const rows = await cfg.model.findMany();
    const mapOut = cfg.mapOut || defaultMapOut;
    res.json(rows.map(mapOut));
  } catch (err) {
    console.error(`GET /api/data/${name} failed:`, err);
    res.status(500).json({ error: 'READ_FAILED', detail: err.message });
  }
});

// GET /api/data/:collection/meta
// Lightweight: version count + max updatedAt. Used by the client's
// concurrency polling instead of fetching the full file.
router.get('/:collection/meta', async (req, res) => {
  const name = req.params.collection;
  const cfg  = COLLECTIONS[name];

  try {
    if (name === 'settings') {
      const latest = await prisma.setting.findFirst({ orderBy: { updatedAt: 'desc' } });
      return res.json({ modifiedTime: latest?.updatedAt?.toISOString() || null });
    }
    if (name === 'auditLog') {
      const latest = await prisma.auditLog.findFirst({ orderBy: { ts: 'desc' } });
      return res.json({ modifiedTime: latest?.ts?.toISOString() || null });
    }
    if (!cfg || !cfg.model) return res.status(404).json({ error: 'UNKNOWN_COLLECTION' });

    const latest = await cfg.model.findFirst({ orderBy: { updatedAt: 'desc' } });
    const count  = await cfg.model.count();
    res.json({
      modifiedTime: latest?.updatedAt?.toISOString() || null,
      recordCount:  count,
    });
  } catch (err) {
    console.error(`GET /api/data/${name}/meta failed:`, err);
    res.status(500).json({ error: 'META_FAILED', detail: err.message });
  }
});

// POST /api/data/:collection    body = full array (or object for settings)
// Overwrites the collection to match the client's payload.
// This mirrors current Drive-JSON semantics; Phase 2 adds fine-grained ops.
router.post('/:collection', async (req, res) => {
  const name = req.params.collection;
  const cfg  = COLLECTIONS[name];
  const payload = req.body;
  const userEmail = req.user?.email;

  try {
    if (name === 'settings') {
      await saveSettings(payload, userEmail);
      return res.json({ ok: true });
    }
    if (name === 'auditLog') {
      await appendAuditRows(Array.isArray(payload) ? payload : [], userEmail);
      return res.json({ ok: true });
    }
    if (!cfg || !cfg.model) return res.status(404).json({ error: 'UNKNOWN_COLLECTION' });
    if (!Array.isArray(payload)) return res.status(400).json({ error: 'EXPECTED_ARRAY' });

    const idField = cfg.idField;
    const mapIn   = cfg.mapIn;
    const now     = new Date();

    // Full-collection overwrite: upsert everything by id, delete the rest.
    // Runs in a transaction to preserve atomicity.
    await prisma.$transaction(async (tx) => {
      const seenIds = new Set();

      for (const rec of payload) {
        if (!rec || !rec[idField]) continue; // skip malformed
        const key = String(rec[idField]);
        seenIds.add(key);

        const row = mapIn(rec);
        row.lastModifiedBy = userEmail;
        row.updatedAt      = now;
        row.version        = { increment: 1 };

        await tx[cfg.model.$name || camelize(cfg.model)].upsert({
          where: { [idField]: key },
          create: { ...row, version: 1, createdBy: userEmail, createdAt: now },
          update: row,
        });

        await tx.changeEvent.create({
          data: {
            collection: name,
            recordId:   key,
            operation:  'UPSERT',
            userEmail,
          },
        });
      }

      // Delete rows that were removed by the client
      const existing = await tx[cfg.model.$name || camelize(cfg.model)].findMany({
        select: { [idField]: true },
      });
      const toDelete = existing
        .map(r => r[idField])
        .filter(id => !seenIds.has(String(id)));

      if (toDelete.length) {
        await tx[cfg.model.$name || camelize(cfg.model)].deleteMany({
          where: { [idField]: { in: toDelete } },
        });
        for (const id of toDelete) {
          await tx.changeEvent.create({
            data: { collection: name, recordId: String(id), operation: 'DELETE', userEmail },
          });
        }
      }
    }, { timeout: 30_000 });

    res.json({ ok: true, count: payload.length });
  } catch (err) {
    console.error(`POST /api/data/${name} failed:`, err);
    res.status(500).json({ error: 'WRITE_FAILED', detail: err.message });
  }
});

// Fallback helper: extract the underlying model name for tx[...] access.
// Prisma's tx object is proxied differently than the top-level client.
function camelize(model) {
  // model.$name is available in Prisma 5.x; keep a fallback for older builds.
  const name = model.$name || model?.constructor?.name || '';
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export default router;
