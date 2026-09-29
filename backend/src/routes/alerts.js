// ════════════════════════════════════════════════════════════════
// IMSE Alert System — API Routes
// File: backend/src/routes/alerts.js
// ════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { prisma } from '../db/prisma.js';

const router = Router();

// ── GET /api/data/alerts — list all alerts (office side) ──────
router.get('/', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        recipients: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    res.json(alerts);
  } catch (err) {
    console.error('[alerts] list error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/data/alerts/:id — single alert with responses ───
router.get('/:id', async (req, res) => {
  try {
    const alert = await prisma.alert.findUnique({
      where: { alertID: req.params.id },
      include: {
        recipients: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!alert) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(alert);
  } catch (err) {
    console.error('[alerts] get error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/data/alerts — create and send an alert ──────────
router.post('/', async (req, res) => {
  try {
    const { type, title, message, broadcast, projectRef, recipients, data: extraData } = req.body || {};

    if (!type || !title || !message) {
      return res.status(400).json({ error: 'MISSING_FIELDS', detail: 'type, title, message required' });
    }

    if (!broadcast && (!recipients || !recipients.length)) {
      return res.status(400).json({ error: 'MISSING_FIELDS', detail: 'recipients required for non-broadcast alerts' });
    }

    const alertID = 'ALR' + Date.now();

    // If broadcast, fetch all active technicians
    let recipientList = recipients || [];
    if (broadcast) {
      const techs = await prisma.staff.findMany({
        where: { status: 'Active' },
        select: { staffID: true, name: true, staffType: true }
      });
      recipientList = techs
        .filter(r => (r.staffType || '').toLowerCase().includes('tech'))
        .map(r => ({ staffID: r.staffID, staffName: r.name }));
    }

    const alert = await prisma.alert.create({
      data: {
        alertID,
        type,
        title,
        message,
        broadcast: !!broadcast,
        projectRef: projectRef || null,
        createdBy: req.user?.email || 'unknown',
        createdByName: req.user?.name || 'Unknown',
        data: extraData || {},
        recipients: {
          create: recipientList.map(r => ({
            staffID: r.staffID,
            staffName: r.staffName || r.name || '',
            response: 'sent'
          }))
        }
      },
      include: { recipients: true }
    });

    console.log(`[alerts] Created ${alertID}: "${title}" → ${recipientList.length} recipient(s)`);
    res.json({ ok: true, alert });
  } catch (err) {
    console.error('[alerts] create error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── PATCH /api/data/alerts/:id — update alert status ──────────
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const alert = await prisma.alert.update({
      where: { alertID: req.params.id },
      data: { status },
      include: { recipients: true }
    });
    res.json({ ok: true, alert });
  } catch (err) {
    console.error('[alerts] update error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── DELETE /api/data/alerts/:id — delete an alert ─────────────
router.delete('/:id', async (req, res) => {
  try {
    await prisma.alert.delete({
      where: { alertID: req.params.id }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[alerts] delete error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ════════════════════════════════════════════════════════════════
// TECHNICIAN ENDPOINTS — no Google auth, PIN-based
// These are mounted separately at /api/tech/alerts
// ════════════════════════════════════════════════════════════════

// GET /api/tech/alerts — get alerts for a specific technician
export async function getTechAlerts(req, res) {
  try {
    const { staffID } = req.query;
    if (!staffID) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const recipients = await prisma.alertRecipient.findMany({
      where: { staffID },
      orderBy: { createdAt: 'desc' },
      include: {
        alert: true
      }
    });

    // Return only active alerts
    const alerts = recipients
      .filter(r => r.alert.status === 'active')
      .map(r => ({
        alertID: r.alert.alertID,
        type: r.alert.type,
        title: r.alert.title,
        message: r.alert.message,
        createdBy: r.alert.createdByName,
        createdAt: r.alert.createdAt,
        data: r.alert.data,
        myResponse: r.response,
        myRemarks: r.remarks,
        respondedAt: r.respondedAt
      }));

    res.json(alerts);
  } catch (err) {
    console.error('[tech/alerts] list error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// POST /api/tech/alerts/respond — technician responds to an alert
export async function respondToAlert(req, res) {
  try {
    const { staffID, pin, alertID, response, remarks } = req.body || {};

    if (!staffID || !pin || !alertID || !response) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    // Verify PIN
    const row = await prisma.staff.findUnique({ where: { staffID } });
    if (!row || row.status !== 'Active') {
      return res.status(404).json({ error: 'STAFF_NOT_FOUND' });
    }
    const staff = row.data || {};
    const storedPin = String(staff.pin || staff.techPin || '');
    if (storedPin !== String(pin)) {
      return res.status(401).json({ error: 'INVALID_PIN' });
    }

    // Find the alert
    const alert = await prisma.alert.findUnique({
      where: { alertID }
    });
    if (!alert) return res.status(404).json({ error: 'ALERT_NOT_FOUND' });

    // Update the recipient's response
    const updated = await prisma.alertRecipient.updateMany({
      where: {
        alertId: alert.id,
        staffID: staffID
      },
      data: {
        response,
        remarks: remarks || null,
        respondedAt: new Date()
      }
    });

    if (updated.count === 0) {
      return res.status(404).json({ error: 'NOT_A_RECIPIENT' });
    }

    console.log(`[alerts] ${staffID} responded "${response}" to ${alertID}`);
    res.json({ ok: true, response, alertID });
  } catch (err) {
    console.error('[tech/alerts] respond error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

export default router;
