-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "userID" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "pinHash" TEXT,
    "pinExpiry" TIMESTAMP(3),
    "pinPeriodDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userEmail" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "collection" TEXT,
    "recordId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "partyID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "partyType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT,
    "parentCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "accountID" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNo" TEXT,
    "ifsc" TEXT,
    "balance" DECIMAL(15,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "reconID" TEXT NOT NULL,
    "accountID" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "openingBal" DECIMAL(15,2),
    "closingBal" DECIMAL(15,2),
    "status" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "staffID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "staffType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "email" TEXT,
    "phone" TEXT,
    "joinDate" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "txnID" TEXT NOT NULL,
    "txnCategory" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3),
    "partyID" TEXT,
    "partyName" TEXT,
    "totalAmount" DECIMAL(15,2),
    "status" TEXT,
    "revisionNo" INTEGER NOT NULL DEFAULT 0,
    "fiscalYear" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "exID" TEXT NOT NULL,
    "billType" TEXT,
    "billDate" TIMESTAMP(3),
    "partyID" TEXT,
    "partyName" TEXT,
    "totalAmount" DECIMAL(15,2),
    "balanceAmount" DECIMAL(15,2),
    "status" TEXT,
    "gstClaimable" BOOLEAN NOT NULL DEFAULT false,
    "tdsApplicable" BOOLEAN NOT NULL DEFAULT false,
    "fiscalYear" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorExpense" (
    "id" TEXT NOT NULL,
    "deID" TEXT NOT NULL,
    "directorName" TEXT,
    "expenseDate" TIMESTAMP(3),
    "amount" DECIMAL(15,2),
    "reimbursed" BOOLEAN NOT NULL DEFAULT false,
    "reimburseDate" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DirectorExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "prID" TEXT NOT NULL,
    "prDate" TIMESTAMP(3),
    "billIDs" JSONB,
    "requestedAmt" DECIMAL(15,2),
    "approvedAmt" DECIMAL(15,2),
    "disbursedAmt" DECIMAL(15,2),
    "status" TEXT,
    "revisionNo" INTEGER NOT NULL DEFAULT 0,
    "fiscalYear" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundRequest" (
    "id" TEXT NOT NULL,
    "frID" TEXT NOT NULL,
    "frDate" TIMESTAMP(3),
    "technicianID" TEXT,
    "amount" DECIMAL(15,2),
    "status" TEXT,
    "poolID" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundPool" (
    "id" TEXT NOT NULL,
    "poolID" TEXT NOT NULL,
    "technicianID" TEXT,
    "openedDate" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "openingAmt" DECIMAL(15,2),
    "spentAmt" DECIMAL(15,2),
    "balanceAmt" DECIMAL(15,2),
    "status" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FundPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArInvoice" (
    "id" TEXT NOT NULL,
    "arID" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "partyID" TEXT,
    "partyName" TEXT,
    "invoiceAmt" DECIMAL(15,2),
    "receivedAmt" DECIMAL(15,2),
    "balanceAmt" DECIMAL(15,2),
    "ageDays" INTEGER,
    "status" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ArInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectExpense" (
    "id" TEXT NOT NULL,
    "peID" TEXT NOT NULL,
    "peDate" TIMESTAMP(3),
    "technicianID" TEXT,
    "projectRef" TEXT,
    "category" TEXT,
    "amount" DECIMAL(15,2),
    "poolID" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "wlID" TEXT NOT NULL,
    "technicianID" TEXT,
    "projectRef" TEXT,
    "weekStartDate" TIMESTAMP(3),
    "status" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "payslipID" TEXT NOT NULL,
    "staffID" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "gross" DECIMAL(15,2),
    "net" DECIMAL(15,2),
    "pfAmt" DECIMAL(15,2),
    "esicAmt" DECIMAL(15,2),
    "ptAmt" DECIMAL(15,2),
    "tdsAmt" DECIMAL(15,2),
    "status" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashOffice" (
    "id" TEXT NOT NULL,
    "officeID" TEXT NOT NULL,
    "officeName" TEXT NOT NULL,
    "custodianStaffID" TEXT,
    "imprestLimit" DECIMAL(15,2),
    "currentBalance" DECIMAL(15,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PettyCashOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashTransaction" (
    "id" TEXT NOT NULL,
    "txnID" TEXT NOT NULL,
    "officeID" TEXT NOT NULL,
    "txnType" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3),
    "amount" DECIMAL(15,2),
    "category" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PettyCashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashStatement" (
    "id" TEXT NOT NULL,
    "stmtID" TEXT NOT NULL,
    "officeID" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "postedToTally" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PettyCashStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstCashLedgerSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotID" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3),
    "periodMonth" INTEGER,
    "periodYear" INTEGER,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GstCashLedgerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "docID" TEXT NOT NULL,
    "docName" TEXT NOT NULL,
    "docCategory" TEXT,
    "certNo" TEXT,
    "issuer" TEXT,
    "holderType" TEXT,
    "holderName" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "isLifetime" BOOLEAN NOT NULL DEFAULT false,
    "renewalReminderAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "lastModifiedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncedId" TEXT,
    "status" TEXT,
    "errorMsg" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChangeEvent" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collection" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "userEmail" TEXT,

    CONSTRAINT "ChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_userID_key" ON "AppUser"("userID");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AppUser_email_idx" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AppUser_role_idx" ON "AppUser"("role");

-- CreateIndex
CREATE INDEX "AuditLog_ts_idx" ON "AuditLog"("ts");

-- CreateIndex
CREATE INDEX "AuditLog_userEmail_ts_idx" ON "AuditLog"("userEmail", "ts");

-- CreateIndex
CREATE INDEX "AuditLog_collection_recordId_idx" ON "AuditLog"("collection", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "Party_partyID_key" ON "Party"("partyID");

-- CreateIndex
CREATE INDEX "Party_name_idx" ON "Party"("name");

-- CreateIndex
CREATE INDEX "Party_gstin_idx" ON "Party"("gstin");

-- CreateIndex
CREATE INDEX "Party_partyType_idx" ON "Party"("partyType");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_accountCode_key" ON "ChartOfAccount"("accountCode");

-- CreateIndex
CREATE INDEX "ChartOfAccount_accountType_idx" ON "ChartOfAccount"("accountType");

-- CreateIndex
CREATE INDEX "ChartOfAccount_parentCode_idx" ON "ChartOfAccount"("parentCode");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_accountID_key" ON "BankAccount"("accountID");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_reconID_key" ON "BankReconciliation"("reconID");

-- CreateIndex
CREATE INDEX "BankReconciliation_accountID_periodYear_periodMonth_idx" ON "BankReconciliation"("accountID", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "BankReconciliation_status_idx" ON "BankReconciliation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_staffID_key" ON "Staff"("staffID");

-- CreateIndex
CREATE INDEX "Staff_status_idx" ON "Staff"("status");

-- CreateIndex
CREATE INDEX "Staff_staffType_idx" ON "Staff"("staffType");

-- CreateIndex
CREATE INDEX "Staff_name_idx" ON "Staff"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txnID_key" ON "Transaction"("txnID");

-- CreateIndex
CREATE INDEX "Transaction_txnCategory_txnDate_idx" ON "Transaction"("txnCategory", "txnDate");

-- CreateIndex
CREATE INDEX "Transaction_partyID_idx" ON "Transaction"("partyID");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_fiscalYear_idx" ON "Transaction"("fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_exID_key" ON "Expense"("exID");

-- CreateIndex
CREATE INDEX "Expense_billType_billDate_idx" ON "Expense"("billType", "billDate");

-- CreateIndex
CREATE INDEX "Expense_partyID_idx" ON "Expense"("partyID");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_fiscalYear_idx" ON "Expense"("fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorExpense_deID_key" ON "DirectorExpense"("deID");

-- CreateIndex
CREATE INDEX "DirectorExpense_directorName_expenseDate_idx" ON "DirectorExpense"("directorName", "expenseDate");

-- CreateIndex
CREATE INDEX "DirectorExpense_reimbursed_idx" ON "DirectorExpense"("reimbursed");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_prID_key" ON "PaymentRequest"("prID");

-- CreateIndex
CREATE INDEX "PaymentRequest_status_prDate_idx" ON "PaymentRequest"("status", "prDate");

-- CreateIndex
CREATE INDEX "PaymentRequest_fiscalYear_idx" ON "PaymentRequest"("fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "FundRequest_frID_key" ON "FundRequest"("frID");

-- CreateIndex
CREATE INDEX "FundRequest_technicianID_frDate_idx" ON "FundRequest"("technicianID", "frDate");

-- CreateIndex
CREATE INDEX "FundRequest_status_idx" ON "FundRequest"("status");

-- CreateIndex
CREATE INDEX "FundRequest_poolID_idx" ON "FundRequest"("poolID");

-- CreateIndex
CREATE UNIQUE INDEX "FundPool_poolID_key" ON "FundPool"("poolID");

-- CreateIndex
CREATE INDEX "FundPool_technicianID_status_idx" ON "FundPool"("technicianID", "status");

-- CreateIndex
CREATE INDEX "FundPool_status_idx" ON "FundPool"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ArInvoice_arID_key" ON "ArInvoice"("arID");

-- CreateIndex
CREATE INDEX "ArInvoice_partyID_idx" ON "ArInvoice"("partyID");

-- CreateIndex
CREATE INDEX "ArInvoice_status_invoiceDate_idx" ON "ArInvoice"("status", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExpense_peID_key" ON "ProjectExpense"("peID");

-- CreateIndex
CREATE INDEX "ProjectExpense_technicianID_peDate_idx" ON "ProjectExpense"("technicianID", "peDate");

-- CreateIndex
CREATE INDEX "ProjectExpense_projectRef_idx" ON "ProjectExpense"("projectRef");

-- CreateIndex
CREATE INDEX "ProjectExpense_poolID_idx" ON "ProjectExpense"("poolID");

-- CreateIndex
CREATE UNIQUE INDEX "WorkLog_wlID_key" ON "WorkLog"("wlID");

-- CreateIndex
CREATE INDEX "WorkLog_technicianID_weekStartDate_idx" ON "WorkLog"("technicianID", "weekStartDate");

-- CreateIndex
CREATE INDEX "WorkLog_projectRef_idx" ON "WorkLog"("projectRef");

-- CreateIndex
CREATE INDEX "WorkLog_status_idx" ON "WorkLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payslipID_key" ON "Payslip"("payslipID");

-- CreateIndex
CREATE INDEX "Payslip_periodYear_periodMonth_idx" ON "Payslip"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Payslip_status_idx" ON "Payslip"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_staffID_periodYear_periodMonth_key" ON "Payslip"("staffID", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashOffice_officeID_key" ON "PettyCashOffice"("officeID");

-- CreateIndex
CREATE INDEX "PettyCashOffice_active_idx" ON "PettyCashOffice"("active");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashTransaction_txnID_key" ON "PettyCashTransaction"("txnID");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_officeID_txnDate_idx" ON "PettyCashTransaction"("officeID", "txnDate");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_txnType_idx" ON "PettyCashTransaction"("txnType");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashStatement_stmtID_key" ON "PettyCashStatement"("stmtID");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashStatement_officeID_periodYear_periodMonth_key" ON "PettyCashStatement"("officeID", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "GstCashLedgerSnapshot_snapshotID_key" ON "GstCashLedgerSnapshot"("snapshotID");

-- CreateIndex
CREATE INDEX "GstCashLedgerSnapshot_periodYear_periodMonth_idx" ON "GstCashLedgerSnapshot"("periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDocument_docID_key" ON "CompanyDocument"("docID");

-- CreateIndex
CREATE INDEX "CompanyDocument_expiryDate_idx" ON "CompanyDocument"("expiryDate");

-- CreateIndex
CREATE INDEX "CompanyDocument_docCategory_idx" ON "CompanyDocument"("docCategory");

-- CreateIndex
CREATE INDEX "CompanyDocument_holderType_holderName_idx" ON "CompanyDocument"("holderType", "holderName");

-- CreateIndex
CREATE INDEX "ChangeEvent_collection_ts_idx" ON "ChangeEvent"("collection", "ts");

-- CreateIndex
CREATE INDEX "ChangeEvent_ts_idx" ON "ChangeEvent"("ts");

