// ============================================================
// Generic data routes - the API surface that api-shim.js uses.
// Phase 0: full-collection GET/POST with upsert-and-prune semantics
// ============================================================

import { Router } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

// ---- Helper: ensure data field always populated ----
function ensureData(rec) {
  // If frontend forgot to put record shape into `data`, wrap it
  return { ...rec, data: rec.data || rec };
}

function defaultMapOut(row) {
  return {
    ...row.data,
    _dbId:           row.id,
    _version:        row.version,
    _createdAt:      row.createdAt?.toISOString?.(),
    _updatedAt:      row.updatedAt?.toISOString?.(),
    _lastModifiedBy: row.lastModifiedBy,
  };
}

// Prod JSON often has empty-string dates ("") that break Prisma's date parser
// and return 500 on writes. This helper returns null for any input that
// isn't a valid Date-parseable value: null, undefined, "", "   ", or a
// string that produces Invalid Date. Use in every mapIn instead of
// `dateOrNull(r.foo)`.
function dateOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'string' && !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ---- Collection registry ----

const COLLECTIONS = {
  appUsers: {
    model: prisma.appUser, idField: 'userID',
    mapIn: (r) => {
      const userID = r.userID || r.email;
      // Email must be unique - fall back to synthetic email if empty
      const email = (r.email && r.email.trim()) ? r.email.trim() : `${userID}@local.imse`;
      return {
        userID: userID,
        email: email,
        name: r.name || email,
        role: r.role || 'ViewOnly',
        pinHash: r.pinHash ?? null,
        pinExpiry: dateOrNull(r.pinExpiry),
        pinPeriodDays: r.pinPeriodDays ?? 30,
        active: r.active ?? true,
        permissions: r.permissions ?? null,
        data: r,
      };
    },
    mapOut: defaultMapOut,
  },
  auditLog: { model: prisma.auditLog, idField: 'id', isAppendOnly: true },
  settings: { isKeyValue: true },
  parties: {
    model: prisma.party, idField: 'partyID',
    mapIn: (r) => ({
      partyID: r.partyID,
      name: r.name || r.partyName || 'Unnamed',
      gstin: r.gstin ?? null,
      partyType: r.partyType ?? null,
      active: r.active ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  chartOfAccounts: {
    model: prisma.chartOfAccount, idField: 'accountCode',
    mapIn: (r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName || 'Unnamed',
      accountType: r.accountType ?? null,
      parentCode: r.parentCode ?? null,
      active: r.active ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  bankAccounts: {
    model: prisma.bankAccount, idField: 'accountID',
    mapIn: (r) => ({
      accountID: r.accountID || r.id,
      accountName: r.accountName || 'Unnamed',
      bankName: r.bankName ?? null,
      accountNo: r.accountNo ?? null,
      ifsc: r.ifsc || r.ifscCode || null,
      balance: r.balance != null ? r.balance : null,
      active: r.active ?? r.isActive ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  bankReconciliations: {
    model: prisma.bankReconciliation, idField: 'reconID',
    mapIn: (r) => {
      const reconID = r.reconID || r.id;
      // Derive month/year from periodTo (or periodFrom as fallback)
      const periodDate = dateOrNull(r.periodTo || r.periodFrom);
      const validDate = periodDate && !isNaN(periodDate.getTime()) ? periodDate : null;
      const periodMonth = validDate ? validDate.getMonth() + 1 : (Number(r.periodMonth) || 1);
      const periodYear = validDate ? validDate.getFullYear() : (Number(r.periodYear) || 2026);
      return {
        reconID: reconID,
        accountID: r.accountID || r.bankAccountId || 'unknown',
        periodMonth: periodMonth,
        periodYear: periodYear,
        openingBal: r.openingBal ?? r.openingBalance ?? null,
        closingBal: r.closingBal ?? r.closingBalance ?? null,
        status: r.status ?? (r.verifiedBy ? 'Verified' : null),
        data: r,
      };
    },
    mapOut: defaultMapOut,
  },
  staff: {
    model: prisma.staff, idField: 'staffID',
    mapIn: (r) => ({
      staffID: r.staffID,
      name: r.name || 'Unnamed',
      designation: r.designation ?? null,
      staffType: r.staffType ?? null,
      status: r.status ?? 'Active',
      email: r.email ?? null,
      phone: r.phone ?? null,
      joinDate: dateOrNull(r.joinDate),
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  transactions: {
    model: prisma.transaction, idField: 'txnID',
    mapIn: (r) => ({
      txnID: r.txnID,
      txnCategory: r.txnCategory || 'Unknown',
      txnDate: dateOrNull(r.txnDate),
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
    model: prisma.expense, idField: 'exID',
    mapIn: (r) => ({
      exID: r.exID || r.expID,
      billType: r.billType ?? null,
      billDate: dateOrNull(r.billDate),
      partyID: r.partyID ?? r.companyName ?? null,
      partyName: r.partyName ?? r.companyName ?? null,
      totalAmount: r.totalAmount ?? r.totalBillAmt ?? r.billAmount ?? null,
      balanceAmount: r.balanceAmount ?? r.balanceAmt ?? null,
      status: r.status ?? r.payStatus ?? null,
      gstClaimable: !!(r.gstClaimable || r.gstInputClaimable),
      tdsApplicable: !!r.tdsApplicable,
      fiscalYear: r.fiscalYear ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  directorExpenses: {
    model: prisma.directorExpense, idField: 'deID',
    mapIn: (r) => ({
      deID: r.deID,
      directorName: r.directorName ?? null,
      expenseDate: dateOrNull(r.expenseDate),
      amount: r.amount ?? null,
      reimbursed: !!r.reimbursed,
      reimburseDate: dateOrNull(r.reimburseDate),
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  paymentRequests: {
    model: prisma.paymentRequest, idField: 'prID',
    mapIn: (r) => ({
      prID: r.prID,
      prDate: dateOrNull(r.prDate),
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
    model: prisma.fundRequest, idField: 'frID',
    mapIn: (r) => ({
      frID: r.frID || r.requestID,
      frDate: dateOrNull(r.frDate || r.requestedDate),
      technicianID: r.technicianID || r.requestedBy || null,
      amount: r.amount ?? r.requestedAmount ?? r.disbursedAmount ?? null,
      status: r.status ?? null,
      poolID: r.poolID ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  fundPools: {
    model: prisma.fundPool, idField: 'poolID',
    mapIn: (r) => ({
      poolID: r.poolID,
      technicianID: r.technicianID ?? null,
      openedDate: dateOrNull(r.openedDate),
      closedDate: dateOrNull(r.closedDate),
      openingAmt: r.openingAmt ?? null,
      spentAmt: r.spentAmt ?? null,
      balanceAmt: r.balanceAmt ?? null,
      status: r.status ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  arInvoices: {
    model: prisma.arInvoice, idField: 'arID',
    mapIn: (r) => ({
      arID: r.arID,
      invoiceNo: r.invoiceNo ?? null,
      invoiceDate: dateOrNull(r.invoiceDate),
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
    model: prisma.projectExpense, idField: 'peID',
    mapIn: (r) => ({
      peID: r.peID || r.projExpID,
      peDate: dateOrNull(r.peDate || r.startDate || r.createdAt),
      technicianID: r.technicianID ?? null,
      projectRef: r.projectRef || r.projectName || null,
      category: r.category ?? null,
      amount: r.amount ?? r.totalFunds ?? null,
      poolID: r.poolID ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  workLogs: {
    model: prisma.workLog, idField: 'wlID',
    mapIn: (r) => {
      // Extract technicianID robustly. Prod's `technicians` field is
      // an array of objects like { name, staffID } — we need the staffID
      // from the first entry, not the whole object (Prisma expects a
      // string or null). Also tolerate a plain-string form and an
      // explicit technicianID for older records.
      let techID = r.technicianID ?? null;
      if (!techID && Array.isArray(r.technicians) && r.technicians.length > 0) {
        const t0 = r.technicians[0];
        if (typeof t0 === 'string') techID = t0;
        else if (t0 && typeof t0 === 'object') techID = t0.staffID ?? t0.id ?? t0.techID ?? null;
      }
      return {
        wlID: r.wlID,
        technicianID: techID,
        // Prod uses `project` (project name), backend expects projectRef.
        projectRef: r.projectRef ?? r.project ?? null,
        // Prod uses `workStartDate`, backend expects weekStartDate.
        weekStartDate: dateOrNull(r.weekStartDate || r.workStartDate),
        status: r.status ?? null,
        data: r,
      };
    },
    mapOut: defaultMapOut,
  },
  payslips: {
    model: prisma.payslip, idField: 'payslipID',
    mapIn: (r) => ({
      payslipID: r.payslipID || r.psID,
      staffID: r.staffID || 'unknown',
      periodMonth: Number(r.periodMonth) || 1,
      periodYear: Number(r.periodYear) || 2026,
      gross: r.gross ?? null,
      net: r.net ?? r.netPay ?? null,
      pfAmt: r.pfAmt ?? null,
      esicAmt: r.esicAmt ?? null,
      ptAmt: r.ptAmt ?? null,
      tdsAmt: r.tdsAmt ?? null,
      status: r.status ?? (r.approved ? 'Approved' : null),
      approvedAt: dateOrNull(r.approvedAt),
      approvedBy: r.approvedBy ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  pettyCashOffices: {
    model: prisma.pettyCashOffice, idField: 'officeID',
    mapIn: (r) => ({
      officeID: r.officeID,
      officeName: r.officeName || 'Unnamed',
      custodianStaffID: r.custodianStaffID ?? null,
      imprestLimit: r.imprestLimit ?? null,
      currentBalance: r.currentBalance ?? null,
      active: r.active ?? true,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  pettyCashTransactions: {
    model: prisma.pettyCashTransaction, idField: 'txnID',
    mapIn: (r) => ({
      txnID: r.txnID,
      officeID: r.officeID || 'unknown',
      txnType: r.txnType || 'Unknown',
      txnDate: dateOrNull(r.txnDate),
      amount: r.amount ?? null,
      category: r.category ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  pettyCashStatements: {
    model: prisma.pettyCashStatement, idField: 'stmtID',
    mapIn: (r) => ({
      stmtID: r.stmtID || r.statementID,
      officeID: r.officeID || 'unknown',
      periodMonth: Number(r.periodMonth) || Number(r.month) || 1,
      periodYear: Number(r.periodYear) || Number(r.year) || 2026,
      verifiedBy: r.verifiedBy ?? null,
      verifiedAt: dateOrNull(r.verifiedAt),
      postedToTally: !!(r.postedToTally || r.tallyPostedAt),
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  gstCashLedgerSnapshots: {
    model: prisma.gstCashLedgerSnapshot, idField: 'snapshotID',
    mapIn: (r) => ({
      snapshotID: r.snapshotID,
      snapshotDate: dateOrNull(r.snapshotDate),
      periodMonth: r.periodMonth != null ? Number(r.periodMonth) : null,
      periodYear: r.periodYear != null ? Number(r.periodYear) : null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  companyDocuments: {
    model: prisma.companyDocument, idField: 'docID',
    mapIn: (r) => ({
      docID: r.docID,
      docName: r.docName || 'Unnamed',
      docCategory: r.docCategory ?? null,
      certNo: r.certNo ?? null,
      issuer: r.issuer ?? null,
      holderType: r.holderType ?? null,
      holderName: r.holderName ?? null,
      issueDate: dateOrNull(r.issueDate),
      expiryDate: dateOrNull(r.expiryDate),
      isLifetime: !!r.isLifetime,
      renewalReminderAcknowledged: !!r.renewalReminderAcknowledged,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  otherIncome: {
    model: prisma.otherIncome, idField: 'incomeID',
    mapIn: (r) => ({
      incomeID: r.incomeID,
      date: dateOrNull(r.date),
      bankAccountId: r.bankAccountId ?? null,
      incomeType: r.incomeType ?? null,
      amount: r.amount != null ? Number(r.amount) : null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  coverLetters: {
    model: prisma.coverLetter, idField: 'letterID',
    mapIn: (r) => ({
      letterID: r.letterID,
      letterDate: dateOrNull(r.letterDate),
      refNo: r.refNo ?? null,
      invoiceID: r.invoiceID ?? null,
      partyID: r.partyID ?? null,
      data: r,
    }),
    mapOut: defaultMapOut,
  },
  returnableToolsLetters: {
    model: prisma.returnableToolsLetter, idField: 'letterID',
    mapIn: (r) => ({
      letterID: r.letterID,
      letterDate: dateOrNull(r.letterDate),
      refNo: r.refNo ?? null,
      staffID: r.staffID ?? null,
      projectID: r.projectID ?? null,
      status: r.status ?? null,
      returnedDate: dateOrNull(r.returnedDate),
      data: r,
    }),
    mapOut: defaultMapOut,
  },
};

// ---- Settings helpers ----
async function getSettings() {
  const rows = await prisma.setting.findMany();
  const merged = {};
  for (const row of rows) merged[row.key] = row.data;
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

// ---- AuditLog helpers ----
async function getAuditTail(limit = 500) {
  const rows = await prisma.auditLog.findMany({ orderBy: { ts: 'desc' }, take: limit });
  return rows.reverse().map(r => ({
    ts: r.ts.toISOString(), userEmail: r.userEmail, userName: r.userName,
    action: r.action, collection: r.collection, recordId: r.recordId,
    before: r.before, after: r.after, ip: r.ip,
  }));
}

async function appendAuditRows(rows, userEmail) {
  if (!Array.isArray(rows) || !rows.length) return;
  const latest = await prisma.auditLog.findFirst({ orderBy: { ts: 'desc' } });
  const cutoff = latest ? latest.ts.getTime() : 0;
  const toInsert = rows.filter(r => r && r.ts && new Date(r.ts).getTime() > cutoff)
    .map(r => ({
      ts: new Date(r.ts),
      userEmail: r.userEmail || userEmail || null,
      userName: r.userName || null,
      action: r.action || 'UNKNOWN',
      collection: r.collection || null,
      recordId: r.recordId || null,
      before: r.before ?? null,
      after: r.after ?? null,
      ip: r.ip ?? null,
    }));
  if (toInsert.length) await prisma.auditLog.createMany({ data: toInsert });
}

// ---- Helper: get Prisma delegate from a model instance ----
function getDelegate(tx, model) {
  const name = model.$name || '';
  const key = name.charAt(0).toLowerCase() + name.slice(1);
  return tx[key] || tx[name];
}

// ============================================================
// ROUTES
// ============================================================

// GET /api/data/:collection - returns full array
router.get('/:collection', async (req, res) => {
  const name = req.params.collection;
  const cfg = COLLECTIONS[name];

  try {
    if (name === 'settings') return res.json(await getSettings());
    if (name === 'auditLog') return res.json(await getAuditTail(500));
    if (!cfg || !cfg.model) return res.status(404).json({ error: 'UNKNOWN_COLLECTION' });

    const rows = await cfg.model.findMany();
    res.json(rows.map(cfg.mapOut || defaultMapOut));
  } catch (err) {
    console.error(`GET /api/data/${name} failed:`, err.message);
    res.status(500).json({ error: 'READ_FAILED', detail: err.message });
  }
});

// GET /api/data/:collection/meta
router.get('/:collection/meta', async (req, res) => {
  const name = req.params.collection;
  const cfg = COLLECTIONS[name];

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
    const count = await cfg.model.count();
    res.json({ modifiedTime: latest?.updatedAt?.toISOString() || null, recordCount: count });
  } catch (err) {
    console.error(`GET /api/data/${name}/meta failed:`, err.message);
    res.status(500).json({ error: 'META_FAILED', detail: err.message });
  }
});

// POST /api/data/:collection - body = full array (or object for settings)
router.post('/:collection', async (req, res) => {
  const name = req.params.collection;
  const cfg = COLLECTIONS[name];
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

    // SAFETY GUARD 1: refuse empty-array writes unless explicitly confirmed.
    // A client sending [] is almost always a bug (empty in-memory state saved
    // back to server). Legitimate "delete all" requires ?confirmWipe=true.
    if (payload.length === 0 && req.query.confirmWipe !== 'true') {
      return res.status(400).json({
        error: 'REFUSED_EMPTY_WRITE',
        hint: 'Empty-array writes are refused to prevent accidental wipes. Add ?confirmWipe=true to force.'
      });
    }

    const idField = cfg.idField;
    const mapIn = cfg.mapIn;
    const now = new Date();

    // Full-collection overwrite via transaction
    await prisma.$transaction(async (tx) => {
      const delegate = getDelegate(tx, cfg.model);
      if (!delegate) throw new Error(`Cannot resolve Prisma delegate for ${name}`);

      const seenIds = new Set();

      for (const rec of payload) {
        if (!rec) continue;
        const rowFields = mapIn(rec);
        const resolvedId = rowFields[idField];
        if (!resolvedId) continue;
        const key = String(resolvedId);
        seenIds.add(key);


        // Build create payload (initial version = 1)
        const createPayload = {
          ...rowFields,
          version: 1,
          createdBy: userEmail,
          createdAt: now,
          updatedAt: now,
          lastModifiedBy: userEmail,
        };

        // Build update payload (increment version, keep other fields)
        // IMPORTANT: version must be updated separately from field sets
        const updatePayload = {
          ...rowFields,
          updatedAt: now,
          lastModifiedBy: userEmail,
        };
        // Remove version from update payload if it exists - handle separately
        delete updatePayload.version;

        await delegate.upsert({
          where: { [idField]: key },
          create: createPayload,
          update: updatePayload,
        });

        // Increment version separately for updates (no-op for new records since version=1 already set)
        await delegate.updateMany({
          where: { [idField]: key },
          data: { version: { increment: 0 } }, // touch only
        }).catch(() => {}); // ignore if not supported

        try {
          await tx.changeEvent.create({
            data: { collection: name, recordId: key, operation: 'UPSERT', userEmail },
          });
        } catch (e) {
          // changeEvent is best-effort
        }
      }

      // Delete rows removed by client
      const existing = await delegate.findMany({ select: { [idField]: true } });
      const toDelete = existing.map(r => r[idField]).filter(id => !seenIds.has(String(id)));

      if (toDelete.length) {
        // SAFETY GUARD 2: refuse bulk deletes above 50% threshold unless confirmed.
        // Prevents accidental wipes when the client sends a partial dataset.
        const existingCount = existing.length;
        const deleteRatio = toDelete.length / existingCount;
        if (deleteRatio > 0.5 && req.query.confirmBulkDelete !== 'true') {
          throw new Error(
            `REFUSED_BULK_DELETE: Would delete ${toDelete.length}/${existingCount} rows ` +
            `(${(deleteRatio * 100).toFixed(0)}%). Add ?confirmBulkDelete=true to proceed.`
          );
        }
        await delegate.deleteMany({ where: { [idField]: { in: toDelete } } });
        for (const id of toDelete) {
          try {
            await tx.changeEvent.create({
              data: { collection: name, recordId: String(id), operation: 'DELETE', userEmail },
            });
          } catch (e) {}
        }
      }
    }, { timeout: 30000 });

    res.json({ ok: true, count: payload.length });
  } catch (err) {
    console.error(`POST /api/data/${name} failed:`, err.message);
    res.status(500).json({ error: 'WRITE_FAILED', detail: err.message });
  }
});

export default router;
