// ============================================================
// IMSE EASY EMS - Migration Script (Phase 0.5)
// Reads JSON files from /app/data-source and imports into Postgres
// Stops on first error for careful, controlled migration
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DATA_DIR = '/app/data-source';

// ---- Utility: read JSON file, return parsed content ----
async function readJson(filename) {
  const filepath = path.join(DATA_DIR, filename);
  const raw = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(raw);
}

// ---- Utility: safe date parse ----
function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ---- Migration functions per collection ----
// Order matters: smallest/simplest first, dependencies before dependents

const MIGRATIONS = [
  // ---- 1. Settings (key-value, smallest) ----
  {
    name: 'settings',
    file: 'settings.json',
    migrate: async (data) => {
      let count = 0;
      for (const [key, value] of Object.entries(data || {})) {
        await prisma.setting.upsert({
          where: { key },
          create: { key, data: value },
          update: { data: value },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 2. AppUsers (small master data) ----
  {
    name: 'appUsers',
    file: 'appUsers.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array, got ' + typeof arr);
      let count = 0;
      for (const r of arr) {
        if (!r.userID && !r.email) continue;
        const userID = r.userID || r.email;
        // Email must be unique - fall back to synthetic email if empty
        const email = (r.email && r.email.trim()) ? r.email.trim() : `${userID}@local.imse`;
        await prisma.appUser.upsert({
          where: { userID: userID },
          create: {
            userID: userID,
            email: email,
            name: r.name || email,
            role: r.role || 'ViewOnly',
            pinHash: r.pinHash ?? null,
            pinExpiry: parseDate(r.pinExpiry),
            pinPeriodDays: r.pinPeriodDays ?? 30,
            active: r.active ?? true,
            permissions: r.permissions ?? null,
            data: r,
          },
          update: {
            email: email,
            name: r.name || email,
            role: r.role || 'ViewOnly',
            data: r,
          },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 3. BankAccounts (small) ----
  {
    name: 'bankAccounts',
    file: 'bankAccounts.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        const accountID = r.accountID || r.id;
        if (!accountID) continue;
        await prisma.bankAccount.upsert({
          where: { accountID: accountID },
          create: {
            accountID: accountID,
            accountName: r.accountName || 'Unnamed',
            bankName: r.bankName ?? null,
            accountNo: r.accountNo ?? null,
            ifsc: r.ifsc || r.ifscCode || null,
            balance: r.balance != null ? r.balance : null,
            active: r.active ?? r.isActive ?? true,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 4. Parties (small master data) ----
  {
    name: 'parties',
    file: 'parties.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.partyID) continue;
        await prisma.party.upsert({
          where: { partyID: r.partyID },
          create: {
            partyID: r.partyID,
            name: r.name || r.partyName || 'Unnamed',
            gstin: r.gstin ?? null,
            partyType: r.partyType ?? null,
            active: r.active ?? true,
            data: r,
          },
          update: {
            name: r.name || r.partyName || 'Unnamed',
            data: r,
          },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 5. Staff (biggest master - 43 MB) ----
  {
    name: 'staff',
    file: 'staff.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.staffID) continue;
        await prisma.staff.upsert({
          where: { staffID: r.staffID },
          create: {
            staffID: r.staffID,
            name: r.name || 'Unnamed',
            designation: r.designation ?? null,
            staffType: r.staffType ?? null,
            status: r.status ?? 'Active',
            email: r.email ?? null,
            phone: r.phone ?? null,
            joinDate: parseDate(r.joinDate),
            data: r,
          },
          update: {
            name: r.name || 'Unnamed',
            status: r.status ?? 'Active',
            data: r,
          },
        });
        count++;
        if (count % 5 === 0) console.log(`    ...${count} staff processed`);
      }
      return count;
    }
  },

  // ---- 6. Transactions ----
  {
    name: 'transactions',
    file: 'transactions.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.txnID) continue;
        await prisma.transaction.upsert({
          where: { txnID: r.txnID },
          create: {
            txnID: r.txnID,
            txnCategory: r.txnCategory || 'Unknown',
            txnDate: parseDate(r.txnDate),
            partyID: r.partyID ?? null,
            partyName: r.partyName ?? null,
            totalAmount: r.totalAmount ?? null,
            status: r.status ?? null,
            revisionNo: r.revisionNo ?? 0,
            fiscalYear: r.fiscalYear ?? null,
            data: r,
          },
          update: {
            data: r,
          },
        });
        count++;
        if (count % 20 === 0) console.log(`    ...${count} transactions processed`);
      }
      return count;
    }
  },

  // ---- 7. Expenses (290 records) ----
  {
    name: 'expenses',
    file: 'expenses.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        const exID = r.exID || r.expID;
        if (!exID) continue;
        await prisma.expense.upsert({
          where: { exID: exID },
          create: {
            exID: exID,
            billType: r.billType ?? null,
            billDate: parseDate(r.billDate),
            partyID: r.partyID ?? r.companyName ?? null,
            partyName: r.partyName || r.companyName || null,
            totalAmount: r.totalAmount ?? r.totalBillAmt ?? r.billAmount ?? null,
            balanceAmount: r.balanceAmount ?? r.balanceAmt ?? null,
            status: r.status ?? r.payStatus ?? null,
            gstClaimable: !!(r.gstClaimable || r.gstInputClaimable),
            tdsApplicable: !!r.tdsApplicable,
            fiscalYear: r.fiscalYear ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
        if (count % 50 === 0) console.log(`    ...${count} expenses processed`);
      }
      return count;
    }
  },

  // ---- 8. DirectorExpenses ----
  {
    name: 'directorExpenses',
    file: 'directorExpenses.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.deID) continue;
        await prisma.directorExpense.upsert({
          where: { deID: r.deID },
          create: {
            deID: r.deID,
            directorName: r.directorName ?? null,
            expenseDate: parseDate(r.expenseDate),
            amount: r.amount ?? null,
            reimbursed: !!r.reimbursed,
            reimburseDate: parseDate(r.reimburseDate),
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 9. Payment Requests ----
  {
    name: 'paymentRequests',
    file: 'paymentRequests.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.prID) continue;
        await prisma.paymentRequest.upsert({
          where: { prID: r.prID },
          create: {
            prID: r.prID,
            prDate: parseDate(r.prDate),
            billIDs: r.billIDs ?? null,
            requestedAmt: r.requestedAmt ?? null,
            approvedAmt: r.approvedAmt ?? null,
            disbursedAmt: r.disbursedAmt ?? null,
            status: r.status ?? null,
            revisionNo: r.revisionNo ?? 0,
            fiscalYear: r.fiscalYear ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 10. FundRequests ----
  {
    name: 'fundRequests',
    file: 'fundRequests.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        const frID = r.frID || r.requestID;
        if (!frID) continue;
        await prisma.fundRequest.upsert({
          where: { frID: frID },
          create: {
            frID: frID,
            frDate: parseDate(r.frDate || r.requestedDate),
            technicianID: r.technicianID || r.requestedBy || null,
            amount: r.amount ?? r.requestedAmount ?? r.disbursedAmount ?? null,
            status: r.status ?? null,
            poolID: r.poolID ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 11. FundPools ----
  {
    name: 'fundPools',
    file: 'fundPools.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.poolID) continue;
        await prisma.fundPool.upsert({
          where: { poolID: r.poolID },
          create: {
            poolID: r.poolID,
            technicianID: r.technicianID ?? null,
            openedDate: parseDate(r.openedDate),
            closedDate: parseDate(r.closedDate),
            openingAmt: r.openingAmt ?? null,
            spentAmt: r.spentAmt ?? null,
            balanceAmt: r.balanceAmt ?? null,
            status: r.status ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 12. ArInvoices ----
  {
    name: 'arInvoices',
    file: 'arInvoices.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.arID) continue;
        await prisma.arInvoice.upsert({
          where: { arID: r.arID },
          create: {
            arID: r.arID,
            invoiceNo: r.invoiceNo ?? null,
            invoiceDate: parseDate(r.invoiceDate),
            partyID: r.partyID ?? null,
            partyName: r.partyName ?? null,
            invoiceAmt: r.invoiceAmt ?? null,
            receivedAmt: r.receivedAmt ?? null,
            balanceAmt: r.balanceAmt ?? null,
            ageDays: r.ageDays ?? null,
            status: r.status ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 13. ProjectExpenses ----
  {
    name: 'projectExpenses',
    file: 'projectExpenses.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        const peID = r.peID || r.projExpID;
        if (!peID) continue;
        await prisma.projectExpense.upsert({
          where: { peID: peID },
          create: {
            peID: peID,
            peDate: parseDate(r.peDate || r.startDate || r.createdAt),
            technicianID: r.technicianID ?? null,
            projectRef: r.projectRef || r.projectName || null,
            category: r.category ?? null,
            amount: r.amount ?? r.totalFunds ?? null,
            poolID: r.poolID ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 14. WorkLogs ----
  {
    name: 'workLogs',
    file: 'workLogs.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.wlID) continue;
        await prisma.workLog.upsert({
          where: { wlID: r.wlID },
          create: {
            wlID: r.wlID,
            technicianID: r.technicianID ?? null,
            projectRef: r.projectRef ?? null,
            weekStartDate: parseDate(r.weekStartDate),
            status: r.status ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 15. Payslips ----
  {
    name: 'payslips',
    file: 'payslips.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        const payslipID = r.payslipID || r.psID;
        if (!payslipID) continue;
        await prisma.payslip.upsert({
          where: { payslipID: payslipID },
          create: {
            payslipID: payslipID,
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
            approvedAt: parseDate(r.approvedAt),
            approvedBy: r.approvedBy ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 16. PettyCashOffices ----
  {
    name: 'pettyCashOffices',
    file: 'pettyCashOffices.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.officeID) continue;
        await prisma.pettyCashOffice.upsert({
          where: { officeID: r.officeID },
          create: {
            officeID: r.officeID,
            officeName: r.officeName || 'Unnamed',
            custodianStaffID: r.custodianStaffID ?? null,
            imprestLimit: r.imprestLimit ?? null,
            currentBalance: r.currentBalance ?? null,
            active: r.active ?? true,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 17. PettyCashTransactions ----
  {
    name: 'pettyCashTransactions',
    file: 'pettyCashTransactions.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.txnID) continue;
        await prisma.pettyCashTransaction.upsert({
          where: { txnID: r.txnID },
          create: {
            txnID: r.txnID,
            officeID: r.officeID || 'unknown',
            txnType: r.txnType || 'Unknown',
            txnDate: parseDate(r.txnDate),
            amount: r.amount ?? null,
            category: r.category ?? null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 18. PettyCashStatements ----
  {
    name: 'pettyCashStatements',
    file: 'pettyCashStatements.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        const stmtID = r.stmtID || r.statementID;
        if (!stmtID) continue;
        await prisma.pettyCashStatement.upsert({
          where: { stmtID: stmtID },
          create: {
            stmtID: stmtID,
            officeID: r.officeID || 'unknown',
            periodMonth: Number(r.periodMonth) || Number(r.month) || 1,
            periodYear: Number(r.periodYear) || Number(r.year) || 2026,
            verifiedBy: r.verifiedBy ?? null,
            verifiedAt: parseDate(r.verifiedAt),
            postedToTally: !!(r.postedToTally || r.tallyPostedAt),
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 19. GstCashLedgerSnapshots ----
  {
    name: 'gstCashLedgerSnapshots',
    file: 'gstCashLedgerSnapshots.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.snapshotID) continue;
        await prisma.gstCashLedgerSnapshot.upsert({
          where: { snapshotID: r.snapshotID },
          create: {
            snapshotID: r.snapshotID,
            snapshotDate: parseDate(r.snapshotDate),
            periodMonth: r.periodMonth != null ? Number(r.periodMonth) : null,
            periodYear: r.periodYear != null ? Number(r.periodYear) : null,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 20. CompanyDocuments ----
  {
    name: 'companyDocuments',
    file: 'companyDocuments.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        if (!r.docID) continue;
        await prisma.companyDocument.upsert({
          where: { docID: r.docID },
          create: {
            docID: r.docID,
            docName: r.docName || 'Unnamed',
            docCategory: r.docCategory ?? null,
            certNo: r.certNo ?? null,
            issuer: r.issuer ?? null,
            holderType: r.holderType ?? null,
            holderName: r.holderName ?? null,
            issueDate: parseDate(r.issueDate),
            expiryDate: parseDate(r.expiryDate),
            isLifetime: !!r.isLifetime,
            renewalReminderAcknowledged: !!r.renewalReminderAcknowledged,
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 21. BankReconciliations ----
  {
    name: 'bankReconciliations',
    file: 'bankReconciliations.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      let count = 0;
      for (const r of arr) {
        const reconID = r.reconID || r.id;
        if (!reconID) continue;
        // Derive month/year from periodTo (or periodFrom as fallback)
        const periodDate = parseDate(r.periodTo || r.periodFrom);
        const periodMonth = periodDate ? periodDate.getMonth() + 1 : (Number(r.periodMonth) || 1);
        const periodYear = periodDate ? periodDate.getFullYear() : (Number(r.periodYear) || 2026);
        await prisma.bankReconciliation.upsert({
          where: { reconID: reconID },
          create: {
            reconID: reconID,
            accountID: r.accountID || r.bankAccountId || 'unknown',
            periodMonth: periodMonth,
            periodYear: periodYear,
            openingBal: r.openingBal ?? r.openingBalance ?? null,
            closingBal: r.closingBal ?? r.closingBalance ?? null,
            status: r.status ?? (r.verifiedBy ? 'Verified' : null),
            data: r,
          },
          update: { data: r },
        });
        count++;
      }
      return count;
    }
  },

  // ---- 22. AuditLog (append-only, biggest chunk) ----
  {
    name: 'auditLog',
    file: 'auditLog.json',
    migrate: async (arr) => {
      if (!Array.isArray(arr)) throw new Error('Expected array');
      // Skip empty rows, no upsert (createMany for speed)
      const rows = arr.filter(r => r && r.ts).map(r => ({
        ts: parseDate(r.ts) || new Date(),
        userEmail: r.userEmail ?? null,
        userName: r.userName ?? null,
        action: r.action || 'UNKNOWN',
        collection: r.collection ?? null,
        recordId: r.recordId ?? null,
        before: r.before ?? null,
        after: r.after ?? null,
        ip: r.ip ?? null,
      }));
      if (rows.length === 0) return 0;
      // Use createMany in chunks to avoid huge query
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await prisma.auditLog.createMany({ data: chunk });
        inserted += chunk.length;
        if (rows.length > CHUNK) console.log(`    ...${inserted}/${rows.length} audit log rows`);
      }
      return inserted;
    }
  },
];

// ============================================================
// Main runner
// ============================================================
async function main() {
  console.log('=========================================');
  console.log('IMSE EASY EMS - Data Migration');
  console.log('=========================================');
  console.log(`Data source: ${DATA_DIR}`);
  console.log(`Migrations: ${MIGRATIONS.length}`);
  console.log('');

  const results = [];
  const startTime = Date.now();

  for (const m of MIGRATIONS) {
    const stepStart = Date.now();
    process.stdout.write(`[${m.name}] `);
    try {
      const data = await readJson(m.file);
      const count = await m.migrate(data);
      const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
      console.log(`OK  ${count} records  (${elapsed}s)`);
      results.push({ name: m.name, count, ok: true });
    } catch (err) {
      console.log(`FAIL`);
      console.log('');
      console.log('==========================================');
      console.log(`ERROR in "${m.name}" migrating from ${m.file}`);
      console.log('==========================================');
      console.log(err.message);
      if (err.code) console.log(`Prisma code: ${err.code}`);
      if (err.meta) console.log(`Meta:`, JSON.stringify(err.meta, null, 2));
      console.log('');
      console.log('Migration STOPPED. Fix the issue and re-run.');
      console.log(`Successful so far: ${results.filter(r => r.ok).length}/${MIGRATIONS.length}`);
      process.exit(1);
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=========================================');
  console.log(`Migration COMPLETE in ${totalElapsed}s`);
  console.log('=========================================');
  for (const r of results) {
    console.log(`  ${r.name.padEnd(28)} ${String(r.count).padStart(6)} records`);
  }
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());