// ══════════════════════════════════════════════════════════════════
// PAYSLIP COMPUTATION MODULE — Server-side port of the main app's
// computeOfficeSalary, calcTechWage, calcTechDeductions and all
// helper functions. This is the SINGLE SOURCE OF TRUTH for salary
// computation; the field app calls it via /api/tech/payslip-compute
// and renders the result without any local salary logic.
//
// Ported from: frontend/index.html (main app)
// ══════════════════════════════════════════════════════════════════

// ── Constants ────────────────────────────────────────────────────
const ATT_ORDER = ['', 'Working', 'StandBy', 'Outstation', 'Anchorage', 'Sailing', 'ApprovedLeave', 'UnApprovedLeave', 'NotWell'];
const ENGAGED_TYPES = ['Working', 'Outstation', 'Anchorage', 'Sailing'];
const LEAVE_STATUSES = ['Leave', 'Casual Leave', 'Sick Leave', 'Earned Leave', 'Comp Off'];
const HALF_DAY_STATUSES = ['Half Day', 'Half Day-Afternoon'];

// ── PF Amendment ─────────────────────────────────────────────────
const PF_AMENDMENT_YEAR = 2026, PF_AMENDMENT_MONTH = 9;

function _isPostPFAmendment(m, y) {
  return y > PF_AMENDMENT_YEAR || (y === PF_AMENDMENT_YEAR && m >= PF_AMENDMENT_MONTH);
}

// ── Statutory helpers ────────────────────────────────────────────

function _calcPT(month, gross, gender) {
  const threshold = (gender === 'Female') ? 25000 : 10000;
  if (gross <= threshold) return 0;
  return month === 2 ? 300 : 200;
}

function _calcOfficePF(basic, hra, da, med, cv, gp, bonus, pfPct, periodMonth, periodYear) {
  const g = basic + hra + da + med + cv + gp + bonus;
  const r = (parseFloat(pfPct) || 12) / 100;
  const m = +(periodMonth || new Date().getMonth() + 1);
  const y = +(periodYear || new Date().getFullYear());
  if (!_isPostPFAmendment(m, y)) {
    const cap = 15000;
    return { pfGross: g, pfAmt: g > cap ? +(cap * r).toFixed(2) : +(g * r).toFixed(2), pfCapped: g > cap };
  }
  return { pfGross: g, pfAmt: +(g * r).toFixed(2), pfCapped: false };
}

function _calcTechPF(basic, fixedAllowance, pfPct) {
  const g = basic + fixedAllowance;
  const r = (parseFloat(pfPct) || 12) / 100;
  return { pfGross: +g.toFixed(2), pfAmt: +(g * r).toFixed(2), pfCapped: false };
}

function _calcESIC(basis, esicPct) {
  const roundedBasis = Math.round(basis);
  if (roundedBasis > 21000) return 0;
  return Math.ceil(roundedBasis * (parseFloat(esicPct) || 0.75) / 100);
}

// ── Loan helpers ─────────────────────────────────────────────────

function loanDerivedFields(loan) {
  const log = Array.isArray(loan.deductionLog) ? loan.deductionLog : [];
  const deductedCount = log.length;
  const deductedTotal = log.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const reps = Array.isArray(loan.manualRepayments) ? loan.manualRepayments : [];
  const manualRepaidCount = reps.length;
  const manualRepaidTotal = reps.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const principal = parseFloat(loan.principal) || 0;
  const balance = +(principal - deductedTotal - manualRepaidTotal).toFixed(2);
  const installments = parseInt(loan.installments) || 1;
  const installmentsRemaining = Math.max(0, installments - deductedCount);
  return { deductedCount, deductedTotal, balance, installmentsRemaining, manualRepaidCount, manualRepaidTotal };
}

function computeLoanDeductions(st, month, year, availableNet) {
  const out = [];
  const loans = (st && st.loans) || [];
  let runningAvailable = availableNet;
  for (const loan of loans) {
    if (loan.status !== 'Active') continue;
    const firstM = parseInt(loan.firstDeductMonth) || 0;
    const firstY = parseInt(loan.firstDeductYear) || 0;
    const periodKey = year * 12 + month;
    const startKey = firstY * 12 + firstM;
    if (periodKey < startKey) {
      out.push({ loan: { loanID: loan.loanID, remarks: loan.remarks }, deductionAmount: 0, deferred: false, reason: 'not yet due' });
      continue;
    }
    // EMI Pause
    if (loan.pauseUntil || loan.pauseFrom) {
      const pauseFromStr = loan.pauseFrom || loan.pauseUntil;
      const pauseToStr = loan.pauseUntil || loan.pauseFrom;
      const [fY, fM] = pauseFromStr.split('-').map(Number);
      const [pY, pM] = pauseToStr.split('-').map(Number);
      const fromKey = fY * 12 + fM;
      const pauseKey = pY * 12 + pM;
      if (periodKey >= fromKey && periodKey <= pauseKey) {
        out.push({
          loan: { loanID: loan.loanID, remarks: loan.remarks }, deductionAmount: 0, deferred: false,
          reason: 'EMI paused ' + pauseFromStr + ' → ' + pauseToStr + (loan.pauseReason ? ' — ' + loan.pauseReason : '')
        });
        continue;
      }
    }
    // Already deducted?
    const alreadyLogged = (loan.deductionLog || []).some(d =>
      parseInt(d.month) === month && parseInt(d.year) === year
    );
    if (alreadyLogged) {
      const logged = (loan.deductionLog || []).find(d =>
        parseInt(d.month) === month && parseInt(d.year) === year
      );
      out.push({ loan: { loanID: loan.loanID, remarks: loan.remarks }, deductionAmount: parseFloat(logged.amount) || 0, deferred: false, reason: 'already recorded' });
      continue;
    }
    const { balance } = loanDerivedFields(loan);
    if (balance <= 0.01) continue;
    const emi = parseFloat(loan.emi) || 0;
    const idealDeduction = Math.min(emi, balance);
    if (runningAvailable < idealDeduction) {
      out.push({
        loan: { loanID: loan.loanID, remarks: loan.remarks }, deductionAmount: 0, deferred: true,
        reason: `insufficient net pay (need ₹${idealDeduction.toFixed(2)}, available ₹${runningAvailable.toFixed(2)})`
      });
      continue;
    }
    runningAvailable -= idealDeduction;
    out.push({ loan: { loanID: loan.loanID, remarks: loan.remarks }, deductionAmount: idealDeduction, deferred: false, reason: '' });
  }
  return out;
}

// ── Period date helpers ──────────────────────────────────────────

function getOfficePeriodDates(year, month) {
  const pm = month === 1 ? 12 : month - 1, py = month === 1 ? year - 1 : year;
  const start = new Date(py, pm - 1, 26), end = new Date(year, month - 1, 25);
  const d = [];
  for (let x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) d.push(new Date(x));
  return d;
}

function getTechWagePeriodDates(year, month) {
  const pm = month === 1 ? 12 : month - 1, py = month === 1 ? year - 1 : year;
  const start = new Date(py, pm - 1, 26), end = new Date(year, month - 1, 25);
  const d = [];
  for (let x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) d.push(new Date(x));
  return d;
}

// ── Leave helpers ────────────────────────────────────────────────

function _monthsFromAnchor(anchorY, anchorM, y, m) {
  return (y - anchorY) * 12 + (m - anchorM) + 1;
}

function _sumLeaveTaken(st, startMs, endMs) {
  let total = 0;
  const breakdown = {};
  [...LEAVE_STATUSES, ...HALF_DAY_STATUSES].forEach(s => breakdown[s] = 0);
  (st.attendance || []).forEach(a => {
    if (!a.date) return;
    const [ay, am, ad] = a.date.split('-').map(Number);
    const t = new Date(ay, am - 1, ad).getTime();
    if (t < startMs || t > endMs) return;
    if (LEAVE_STATUSES.includes(a.status)) { total += 1; breakdown[a.status] = (breakdown[a.status] || 0) + 1; }
    if (HALF_DAY_STATUSES.includes(a.status)) { total += 0.5; breakdown[a.status] = (breakdown[a.status] || 0) + 0.5; }
  });
  return { total: +total.toFixed(1), breakdown };
}

function _sumEncashments(st, startMs, endMs) {
  let total = 0;
  (st.leaveEncashments || []).forEach(e => {
    if (!e.date) return;
    const [ey, em, ed] = e.date.split('-').map(Number);
    const t = new Date(ey, em - 1, ed).getTime();
    if (t < startMs || t > endMs) return;
    total += +(e.days || 0);
  });
  return +total.toFixed(1);
}

function _calcOfficeLeave(st, year, month) {
  const lpM = +(st.leavePerMonth ?? 2);
  const opening = +(st.leaveOpening || 0);
  const carried = +(st.carriedLeave || 0);
  const anchorY = +st.leaveOpeningYear || year;
  const anchorM = +st.leaveOpeningMonth || month;

  if ((year < anchorY) || (year === anchorY && month < anchorM)) {
    return {
      lpM, carried, opening, balanceBF: 0,
      available: +(opening + carried).toFixed(1),
      leaveTaken: 0, lopDays: 0,
      nextBalance: +(opening + carried).toFixed(1),
      breakdown: {},
      _ledger: { anchorY, anchorM, monthsFromAnchor: 0, totalAccrued: 0, totalTaken: 0, totalEncashed: 0, beforeAnchor: true }
    };
  }

  const monthsThru = _monthsFromAnchor(anchorY, anchorM, year, month);
  let runningBalance = opening + carried;
  let cumAccrued = 0, cumTaken = 0, cumEncashed = 0, cumLOP = 0;
  let thisAvailable = 0, thisLeaveTaken = 0, thisLopDays = 0, thisBreakdown = {};
  let thisEncashed = 0, thisBalanceBF = 0;

  for (let step = 0; step < monthsThru; step++) {
    const iAbs = (anchorY * 12 + (anchorM - 1)) + step;
    const iY = Math.floor(iAbs / 12);
    const iM = (iAbs % 12) + 1;
    const _ppPM = iM === 1 ? 12 : iM - 1;
    const _ppPY = iM === 1 ? iY - 1 : iY;
    const ppStart = new Date(_ppPY, _ppPM - 1, 26).getTime();
    const ppEnd = new Date(iY, iM - 1, 25, 23, 59, 59).getTime();

    const takenObj = _sumLeaveTaken(st, ppStart, ppEnd);
    const encashedI = _sumEncashments(st, ppStart, ppEnd);
    const availableI = +(runningBalance + lpM - encashedI).toFixed(1);
    const lopI = +Math.max(0, takenObj.total - availableI).toFixed(1);
    const nextI = +Math.max(0, availableI - takenObj.total).toFixed(1);

    cumAccrued += lpM;
    cumTaken += takenObj.total;
    cumEncashed += encashedI;
    cumLOP += lopI;

    if (step === monthsThru - 1) {
      thisAvailable = availableI;
      thisLeaveTaken = takenObj.total;
      thisLopDays = lopI;
      thisBreakdown = takenObj.breakdown;
      thisEncashed = encashedI;
      const isAnchor = (iY === anchorY && iM === anchorM);
      thisBalanceBF = isAnchor ? 0 : +runningBalance.toFixed(1);
    }
    runningBalance = nextI;
  }

  return {
    lpM, carried, opening, balanceBF: thisBalanceBF,
    available: thisAvailable, leaveTaken: thisLeaveTaken, lopDays: thisLopDays,
    nextBalance: runningBalance, breakdown: thisBreakdown,
    _ledger: {
      anchorY, anchorM, monthsFromAnchor: monthsThru,
      totalAccrued: +cumAccrued.toFixed(1), totalTaken: +cumTaken.toFixed(1),
      totalEncashed: +cumEncashed.toFixed(1), totalLOP: +cumLOP.toFixed(1),
      thisAccrual: lpM, thisEncashed, beforeAnchor: false, settlementModel: 'monthly'
    }
  };
}

function computeLeaveForMonth(st, year, month) { return _calcOfficeLeave(st, year, month); }

// ── Late Arrival Summary ─────────────────────────────────────────

function _computeLateSummary(st, periodYear, periodMonth, settings) {
  const isOffice = (st.staffType || 'Office') !== 'Technician';
  const isFlexible = (st.workMode || 'Fixed') === 'Flexible';
  const mode = (isFlexible ? 'Off' : (settings.lateDeductionMode || 'Off'));
  const grace = +(settings.lateGraceMins ?? 15);
  const workdayHrs = +(settings.standardWorkdayHours ?? 8) || 8;

  const pM = periodMonth === 1 ? 12 : periodMonth - 1;
  const pY = periodMonth === 1 ? periodYear - 1 : periodYear;
  const ppStart = new Date(pY, pM - 1, 26).getTime();
  const ppEnd = new Date(periodYear, periodMonth - 1, 25, 23, 59, 59).getTime();

  const inPeriod = (dateStr) => {
    if (!dateStr) return false;
    const t = new Date(dateStr + 'T00:00:00').getTime();
    return t >= ppStart && t <= ppEnd;
  };

  const attn = (st.attendance || []).filter(a => inPeriod(a.date) && a.status !== 'WFH');
  let lateMinutesRaw = 0, lateMinutesNet = 0, lateDays = 0;
  const lateBreakdown = [];

  if (!isFlexible) {
    attn.forEach(a => {
      const raw = +(a.lateMinutes || 0);
      if (raw <= 0) return;
      lateMinutesRaw += raw;
      const net = Math.max(0, raw - grace);
      if (net > 0) lateDays++;
      lateMinutesNet += net;
      lateBreakdown.push({ date: a.date, rawMins: raw, netMins: net });
    });
  }

  const rawHours = lateMinutesNet / 60;
  const lateHoursNet = Math.ceil(rawHours * 4) / 4;
  const dailyWage = +st.dailyWage || 0;
  const hourlyRate = workdayHrs > 0 ? +(dailyWage / workdayHrs).toFixed(2) : 0;
  const expectedDeduction = +(lateHoursNet * hourlyRate).toFixed(2);

  return {
    applies: isOffice && mode !== 'Off',
    deductionMode: mode,
    graceMinutesPerDay: grace,
    standardWorkdayHrs: workdayHrs,
    lateMinutesRaw, lateMinutesNet, lateHoursNet, lateDays,
    dailyWage, hourlyRate, expectedDeduction, lateBreakdown,
    deductFromSalary: isOffice && mode === 'Apply' && expectedDeduction > 0,
    projectedOnly: isOffice && mode === 'Warning' && expectedDeduction > 0,
  };
}

// ── Wage revision lookup ─────────────────────────────────────────

function _getEffectiveWageForPeriod(st, year, month) {
  const revs = (st.wageRevisions || []).slice()
    .filter(r => r.effectiveDate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const refDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const eff = revs.find(r => r.effectiveDate <= refDate);
  if (eff) {
    return {
      basicSalary: +eff.basicSalary || 0,
      hraPct: eff.hraPct ?? st.hraPct ?? 30,
      daPct: eff.daPct ?? st.daPct ?? 65,
      gradePay: +eff.gradePay || +st.gradePay || 0,
      conveyance: +eff.conveyance || +st.conveyance || 0,
      medical: +eff.medical || +st.medical || 0,
      variable: +eff.variable || +st.variable || 0,
      pfPct: eff.pfPct ?? st.pfPct ?? 12,
      tdsMonthly: +eff.tdsMonthly || +st.tdsMonthly || 0,
      techHRAPct: eff.techHRAPct ?? st.techHRAPct ?? 50,
      techDAPct: eff.techDAPct ?? st.techDAPct ?? 65,
      techGPPct: eff.techGPPct ?? st.techGPPct ?? 30,
      techVariable: +eff.techVariable || +st.techVariable || 0,
      techPFPct: eff.techPFPct ?? st.techPFPct ?? 12,
      techESICPct: eff.techESICPct ?? st.techESICPct ?? 0.75,
      techTDS: +eff.techTDS || +st.techTDS || 0,
      standbyPct: eff.standbyPct ?? st.standbyPct ?? 50,
      alPct: eff.alPct ?? st.alPct ?? 50,
      _fromRevision: true,
      _revEffDate: eff.effectiveDate
    };
  }
  return {
    basicSalary: +st.basicSalary || 0,
    hraPct: st.hraPct ?? 30, daPct: st.daPct ?? 65,
    gradePay: +st.gradePay || 0, conveyance: +st.conveyance || 0,
    medical: +st.medical || 0, variable: +st.variable || 0,
    pfPct: st.pfPct ?? 12, tdsMonthly: +st.tdsMonthly || 0,
    techHRAPct: st.techHRAPct ?? 50, techDAPct: st.techDAPct ?? 65,
    techGPPct: st.techGPPct ?? 30, techVariable: +st.techVariable || 0,
    techPFPct: st.techPFPct ?? 12, techESICPct: st.techESICPct ?? 0.75,
    techTDS: +st.techTDS || 0, standbyPct: st.standbyPct ?? 50,
    alPct: st.alPct ?? st.alPct ?? 50,
    _fromRevision: false
  };
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPUTATION FUNCTIONS
// ══════════════════════════════════════════════════════════════════

function computeOfficeSalary(st, op, settings) {
  const w = _getEffectiveWageForPeriod(st, op.periodYear || new Date().getFullYear(), op.periodMonth || (new Date().getMonth() + 1));
  const basic = w.basicSalary, hraPct = +w.hraPct, daPct = +w.daPct;
  const hra = basic * hraPct / 100, da = basic * daPct / 100, gp = +w.gradePay, cv = +w.conveyance, med = +w.medical, vr = +w.variable;
  const bonus = basic / 10;
  const addlA = +op.addlAllowance || 0, gross = basic + hra + da + gp + cv + med + bonus + vr + addlA;
  const pfPct = op.pfPct != null ? +op.pfPct : +(w.pfPct ?? 12);
  const esicPct = op.esicPct != null ? +op.esicPct : +(st.esicPct ?? 0.75);
  const tds = op.tdsAmt != null ? +op.tdsAmt : +(w.tdsMonthly || 0);
  const pf = _calcOfficePF(basic, hra, da, med, cv, gp, bonus, pfPct, op.periodMonth, op.periodYear);
  const grossWithVar = basic + hra + da + gp + cv + med + vr;
  const grossExclVar = grossWithVar;
  const esicWaived = grossWithVar > 21000;
  const esicAmt = esicWaived ? 0 : _calcESIC(grossWithVar, esicPct);
  const gender = st.gender || 'Male';
  const ptAmtAuto = _calcPT(op.periodMonth, gross, gender);
  let ptAmt;
  if (op.ptBase === null || op.ptBase === undefined) {
    ptAmt = ptAmtAuto;
  } else {
    ptAmt = +op.ptBase;
  }
  const ptApplies = ptAmt > 0, isFebruary = op.periodMonth === 2;
  const periodDates = getOfficePeriodDates(op.periodYear || new Date().getFullYear(), op.periodMonth);
  const periodDays = periodDates.length;
  const periodLabel = periodDates[0].toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' – ' + periodDates[periodDates.length - 1].toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const leaveResult = computeLeaveForMonth(st, op.periodYear || new Date().getFullYear(), op.periodMonth);
  const manualLeave = +op.leaveTaken || 0;
  const leaveTakenFinal = op._useManualLeave ? manualLeave : (manualLeave > 0 ? manualLeave : leaveResult.leaveTaken);
  const lpM = leaveResult.lpM;
  const carried = leaveResult.carried;
  let available, lopDays, lbal;
  if (op._useManualLeave || (manualLeave > 0 && manualLeave !== leaveResult.leaveTaken)) {
    available = leaveResult.available;
    lopDays = Math.max(0, leaveTakenFinal - available);
    lbal = Math.max(0, available - leaveTakenFinal);
  } else {
    available = leaveResult.available;
    lopDays = leaveResult.lopDays;
    lbal = leaveResult.nextBalance;
  }
  const lopBase = basic + hra + da + med + gp + cv + bonus;
  const lopA = +(lopDays * (lopBase / periodDays)).toFixed(2);
  const addlD = +op.addlDeduction || 0;
  const lateSummary = _computeLateSummary(st, op.periodYear, op.periodMonth, settings);
  const lateDedAmt = op.lateDedAmt != null
    ? +op.lateDedAmt
    : (lateSummary.deductFromSalary ? lateSummary.expectedDeduction : 0);
  const otherDed = pf.pfAmt + esicAmt + ptAmt + tds + lopA + addlD + lateDedAmt;
  const availableForLoan = gross - otherDed;
  const loanDeductions = computeLoanDeductions(st, op.periodMonth, op.periodYear, availableForLoan);
  const loanTotal = loanDeductions.reduce((s, ld) => s + (parseFloat(ld.deductionAmount) || 0), 0);
  const totD = otherDed + loanTotal;
  const net = gross - totD;
  const _wageRevInfo = w._fromRevision ? { used: true, effDate: w._revEffDate } : { used: false };
  const _revs = (st.wageRevisions || []);
  const _hasRevsButNoMatch = _revs.length > 0 && !w._fromRevision;
  const _noBaselineWarning = _hasRevsButNoMatch ? 'No baseline wage revision found for this period. Payslip uses current salary values which may reflect a later revision.' : '';

  return {
    basic, hra, hraPct, da, daPct, gradePay: gp, conveyance: cv, medical: med, bonus, variable: vr,
    addlAllow: addlA, gross, grossWithVar, grossExclVar,
    pfPct, pfGross: pf.pfGross, pfAmt: pf.pfAmt, pfCapped: pf.pfCapped,
    esicPct, esicAmt, esicWaived,
    ptAmt, ptApplies, isFebruary, gender,
    tdsAmt: tds,
    leavePerMonth: lpM, carriedLeave: carried, leaveOpening: leaveResult.opening || 0,
    available, leaveTaken: leaveTakenFinal, lopDays, lopAmt: lopA, leaveBalance: lbal,
    addlDed: addlD, lateDedAmt, lateSummary,
    loanDeductions, loanTotal, totalDed: totD, netPay: net,
    periodDays, periodLabel, _wageRevInfo, _noBaselineWarning
  };
}

function calcTechWage(state, settings) {
  const { att, basic: basicRaw, hraPct: hPct, daPct: dPct, gradePay: gpPct, variableAllow: varA = 0, periodYear, periodMonth, attendanceRaw } = state;
  const basic = +basicRaw || 0;
  const hra = +(basic * (+hPct || 50) / 100).toFixed(2);
  const da = +(basic * (+dPct || 65) / 100).toFixed(2);
  const gp = +(basic * (+gpPct || 30) / 100).toFixed(2);
  const fixedAllow = +(hra + da + gp).toFixed(2);
  const daysInMonth = 30;
  const dailyWage = daysInMonth > 0 ? +((basic + fixedAllow + (+varA || 0)) / daysInMonth).toFixed(4) : 0;
  const standbyWage = daysInMonth > 0 ? +((basic + fixedAllow) / daysInMonth).toFixed(4) : 0;
  const r = state.rates || {};
  const c = {}; ATT_ORDER.forEach(t => { c[t] = 0; }); att.forEach(t => { if (t) c[t]++; });
  const eng = ENGAGED_TYPES.reduce((s, t) => s + (c[t] || 0), 0), sbd = c.StandBy || 0;
  const wP = +(c.Working * dailyWage).toFixed(2);
  const outP = +(c.Outstation * dailyWage).toFixed(2);
  const ancP = +(c.Anchorage * dailyWage).toFixed(2);
  const salP = +(c.Sailing * dailyWage).toFixed(2);
  const sbyP = +(sbd * standbyWage).toFixed(2);
  const maxPaidSickDays = parseInt(settings?.techMaxPaidSickDays) || 2;
  const nwDays = c.NotWell || 0;
  const nwPaidDays = Math.min(nwDays, maxPaidSickDays);
  const nwP = +(nwPaidDays * standbyWage).toFixed(2);
  const outstPct = (+r.outstationPct || 20) / 100, sailPct = (+r.sailingPct || 30) / 100, ancPct = (+r.anchoragePct || 30) / 100;
  const outA = +(c.Outstation * dailyWage * outstPct).toFixed(2);
  const ancA = +(c.Anchorage * dailyWage * ancPct).toFixed(2);
  const salA = +(c.Sailing * dailyWage * sailPct).toFixed(2);
  const daysIn1520 = Math.max(0, Math.min(eng, 20) - 15);
  const daysAbove20 = Math.max(0, eng - 20);
  const t15 = daysIn1520 > 0 ? +(daysIn1520 * dailyWage * 0.5).toFixed(2) : 0;
  const t20 = daysAbove20 > 0 ? +(daysAbove20 * dailyWage * 0.65).toFixed(2) : 0;
  const daysAbove15 = daysIn1520 + daysAbove20;
  const alDeduct = +((c.ApprovedLeave || 0) * dailyWage * 0.5).toFixed(2);
  const ulMultiplier = settings?.unapprovedAbsenceMultiplier != null ? parseFloat(settings.unapprovedAbsenceMultiplier) : 1;
  const _periodDates = getTechWagePeriodDates(periodYear, periodMonth);
  const _periodDateSet = new Set(_periodDates.map(d => d.toISOString().split('T')[0]));
  const noShowDays = (attendanceRaw || []).filter(a =>
    a.status === 'UnApprovedLeave' && a.noShowPenalty && _periodDateSet.has(a.date)
  ).length;
  const regularULDays = Math.max(0, (c.UnApprovedLeave || 0) - noShowDays);
  const ulDeductRegular = +(regularULDays * dailyWage * ulMultiplier).toFixed(2);
  const ulDeductNoShow = +(noShowDays * dailyWage * 2).toFixed(2);
  const ulDeduct = +(ulDeductRegular + ulDeductNoShow).toFixed(2);

  const otHoursArr = state.otHours || [];
  const attArr = state.att || [];
  let otAmt = 0;
  const otBreakdown = { Working: 0, Outstation: 0, Anchorage: 0, Sailing: 0 };
  const hourlyRate = +(dailyWage / 10).toFixed(4);
  const otRate = +(hourlyRate * 2).toFixed(4);
  otHoursArr.forEach((hrs, i) => {
    const h = parseFloat(hrs) || 0;
    if (h <= 0) return;
    const attType = attArr[i] || '';
    if (!ENGAGED_TYPES.includes(attType)) return;
    const dayOT = +(h * otRate).toFixed(2);
    otAmt += dayOT;
    if (otBreakdown[attType] !== undefined) otBreakdown[attType] += dayOT;
  });
  otAmt = +otAmt.toFixed(2);
  const totalOTHours = otHoursArr.reduce((s, h, i) => {
    const attType = attArr[i] || '';
    return ENGAGED_TYPES.includes(attType) ? s + (parseFloat(h) || 0) : s;
  }, 0);

  const grossBase = wP + outP + ancP + salP + sbyP + nwP + outA + ancA + salA + t15 + t20;
  const travelInGross = +(+state.travelAllow || 4000);
  const gross = +(grossBase - alDeduct - ulDeduct + otAmt + travelInGross).toFixed(2);
  const rows = [
    { sec: 'Wage', name: 'Working days', days: c.Working, rate: +dailyWage.toFixed(2), amt: wP, show: c.Working > 0 },
    { sec: 'Wage', name: 'Outstation days', days: c.Outstation, rate: +dailyWage.toFixed(2), amt: outP, show: c.Outstation > 0 },
    { sec: 'Wage', name: 'Anchorage days', days: c.Anchorage, rate: +dailyWage.toFixed(2), amt: ancP, show: c.Anchorage > 0 },
    { sec: 'Wage', name: 'Sailing days', days: c.Sailing, rate: +dailyWage.toFixed(2), amt: salP, show: c.Sailing > 0 },
    { sec: 'Wage', name: 'Stand By (Standby wage)', days: sbd, rate: +standbyWage.toFixed(2), amt: sbyP, show: sbd > 0 },
    { sec: 'Wage', name: `Not Well — paid (${nwPaidDays} of ${nwDays}d, limit ${maxPaidSickDays}/month)`, days: nwPaidDays, rate: +standbyWage.toFixed(2), amt: nwP, show: nwDays > 0 },
    { sec: 'Allowance', name: `Outstation Allow (${+r.outstationPct || 20}% of Daily Wage)`, days: c.Outstation, rate: +(dailyWage * outstPct).toFixed(2), amt: outA, show: c.Outstation > 0 },
    { sec: 'Allowance', name: `Sailing Allow (${+r.sailingPct || 30}% of Daily Wage)`, days: c.Sailing, rate: +(dailyWage * sailPct).toFixed(2), amt: salA, show: c.Sailing > 0 },
    { sec: 'Allowance', name: `Anchorage Allow (${+r.anchoragePct || 30}% of Daily Wage)`, days: c.Anchorage, rate: +(dailyWage * ancPct).toFixed(2), amt: ancA, show: c.Anchorage > 0 },
    { sec: 'Threshold', name: `Days 16–20 extra (${daysIn1520} days × DW×0.5)`, days: daysIn1520, rate: +(dailyWage * 0.5).toFixed(2), amt: t15, show: daysIn1520 > 0 },
    { sec: 'Threshold', name: `Days 21+ allowance (${daysAbove20} days × DW×0.65)`, days: daysAbove20, rate: +(dailyWage * 0.65).toFixed(2), amt: t20, show: daysAbove20 > 0 },
    { sec: 'Allowance', name: 'Travel Allowance', days: null, rate: travelInGross, amt: travelInGross, show: true },
    { sec: 'Deduct', name: `Approved Leave Deduction (50% × ${c.ApprovedLeave || 0} days)`, days: c.ApprovedLeave || 0, rate: +(dailyWage * 0.5).toFixed(2), amt: -alDeduct, show: (c.ApprovedLeave || 0) > 0 },
    { sec: 'Deduct', name: `Unapproved Leave (${ulMultiplier}× DW × ${regularULDays} days)`, days: regularULDays, rate: +(dailyWage * ulMultiplier).toFixed(2), amt: -ulDeductRegular, show: regularULDays > 0 },
    { sec: 'Deduct', name: `No-Show Penalty (2× DW × ${noShowDays} days)`, days: noShowDays, rate: +(dailyWage * 2).toFixed(2), amt: -ulDeductNoShow, show: noShowDays > 0 },
    { sec: 'OT', name: `OT Ex-Gratia (${totalOTHours.toFixed(1)}h × ${otRate.toFixed(2)}/hr)`, days: null, rate: +otRate.toFixed(2), amt: otAmt, show: otAmt > 0 },
  ].filter(r => r.show);

  return {
    c, eng, sbd, basic, hra, da, gp, fixedAllow, daysInMonth, dailyWage, standbyWage,
    rows, gross, varA: +varA || 0, daysAbove15, daysIn1520, daysAbove20, t15, t20,
    otAmt, otRate, hourlyRate, totalOTHours, otBreakdown
  };
}

function calcTechDeductions(gross, basic, fixedAllowance, exgratia, state, st) {
  const pfPct = state.pfPct != null ? +state.pfPct : 12;
  const esicPct = state.esicPct != null ? +state.esicPct : 0.75;
  const addlDed = +state.addlDeduction || 0;
  const grossForTDS = gross;
  const tdsAuto = +(grossForTDS * 0.01).toFixed(2);
  const tdsManual = (state.tdsAmt !== null && state.tdsAmt !== undefined && state.tdsAmt !== '' && +state.tdsAmt > 0)
    ? +state.tdsAmt : null;
  const tdsAmt = tdsManual !== null ? tdsManual : tdsAuto;
  const tdsIsAuto = tdsManual === null;
  const hasUAN = state.pfOverride === 'yes' || (state.pfOverride !== 'no' && !!(st?.uanNumber?.trim()));
  const pf = hasUAN ? _calcTechPF(basic, fixedAllowance, pfPct) : { pfGross: basic + fixedAllowance, pfAmt: 0, pfCapped: false };
  const esicThreshBasis = +(basic + fixedAllowance + (+state.variableAllow || 0)).toFixed(2);
  const basisForESIC = esicThreshBasis;
  const esicWaived = esicThreshBasis > 21000;
  const esicAmt = esicWaived ? 0 : _calcESIC(basisForESIC, esicPct);
  let ptAmt = 0, ptApplies = false;
  if (state.ptOverride != null && state.ptOverride !== '') {
    ptAmt = +state.ptOverride || 0;
    ptApplies = ptAmt > 0;
  } else {
    ptAmt = _calcPT(state.periodMonth, basisForESIC, 'Male');
    ptApplies = ptAmt > 0;
  }
  const isFebruary = state.periodMonth === 2;
  const otherDed = +(pf.pfAmt + esicAmt + ptAmt + tdsAmt + addlDed).toFixed(2);
  const availableForLoan = (+(gross + (+exgratia || 0)).toFixed(2)) - otherDed;
  const loanDeductions = computeLoanDeductions(st, state.periodMonth, state.periodYear, availableForLoan);
  const loanTotal = +loanDeductions.reduce((s, ld) => s + (parseFloat(ld.deductionAmount) || 0), 0).toFixed(2);
  const totalDed = +(otherDed + loanTotal).toFixed(2);

  return {
    pfPct, pfGross: pf.pfGross, pfAmt: pf.pfAmt, pfCapped: pf.pfCapped, hasUAN,
    esicPct, esicAmt, esicWaived, basisForESIC, esicThreshBasis,
    ptAmt, ptApplies, isFebruary,
    tdsAmt, tdsIsAuto, grossForTDS, tdsAuto, addlDed,
    loanDeductions, loanTotal, totalDed
  };
}

// ══════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════

export {
  computeOfficeSalary,
  calcTechWage,
  calcTechDeductions,
  computeLeaveForMonth,
  _getEffectiveWageForPeriod,
  loanDerivedFields,
  computeLoanDeductions,
  getOfficePeriodDates,
  getTechWagePeriodDates,
  ATT_ORDER,
  ENGAGED_TYPES,
};
