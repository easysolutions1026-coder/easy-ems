SELECT tbl, cnt FROM (
  SELECT 'AppUser' as tbl, COUNT(*) as cnt FROM "AppUser" UNION ALL
  SELECT 'AuditLog', COUNT(*) FROM "AuditLog" UNION ALL
  SELECT 'BankAccount', COUNT(*) FROM "BankAccount" UNION ALL
  SELECT 'BankReconciliation', COUNT(*) FROM "BankReconciliation" UNION ALL
  SELECT 'CompanyDocument', COUNT(*) FROM "CompanyDocument" UNION ALL
  SELECT 'DirectorExpense', COUNT(*) FROM "DirectorExpense" UNION ALL
  SELECT 'Expense', COUNT(*) FROM "Expense" UNION ALL
  SELECT 'FundPool', COUNT(*) FROM "FundPool" UNION ALL
  SELECT 'FundRequest', COUNT(*) FROM "FundRequest" UNION ALL
  SELECT 'GstCashLedgerSnapshot', COUNT(*) FROM "GstCashLedgerSnapshot" UNION ALL
  SELECT 'Party', COUNT(*) FROM "Party" UNION ALL
  SELECT 'PaymentRequest', COUNT(*) FROM "PaymentRequest" UNION ALL
  SELECT 'Payslip', COUNT(*) FROM "Payslip" UNION ALL
  SELECT 'PettyCashOffice', COUNT(*) FROM "PettyCashOffice" UNION ALL
  SELECT 'PettyCashStatement', COUNT(*) FROM "PettyCashStatement" UNION ALL
  SELECT 'PettyCashTransaction', COUNT(*) FROM "PettyCashTransaction" UNION ALL
  SELECT 'ProjectExpense', COUNT(*) FROM "ProjectExpense" UNION ALL
  SELECT 'Setting', COUNT(*) FROM "Setting" UNION ALL
  SELECT 'Staff', COUNT(*) FROM "Staff" UNION ALL
  SELECT 'Transaction', COUNT(*) FROM "Transaction" UNION ALL
  SELECT 'WorkLog', COUNT(*) FROM "WorkLog" UNION ALL
  SELECT 'ArInvoice', COUNT(*) FROM "ArInvoice"
) t ORDER BY tbl;