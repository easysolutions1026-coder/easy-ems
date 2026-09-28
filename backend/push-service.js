// ════════════════════════════════════════════════════════════════
// IMSE Field App — Push Notification Service
// Express + ES modules version
// ════════════════════════════════════════════════════════════════

import webpush from 'web-push';

// ── STEP 1: Replace these with your actual VAPID keys ─────────
// Generate them by running:  npx web-push generate-vapid-keys
webpush.setVapidDetails(
  'mailto:admin@imsetech.com',
  'BJKPctkYlzveOIrbSNSLR5sas_e_oa5OIbg3Dlgu_YvcV7lhWKUPL_MKGZJQZjoNZSWNDkITlLcjoT5-hq46Hs4',
  'heaadxWkIE942er4wixPCBsm7sEE3dlvRb-x5XwQEOo'
);

// ── Subscription store (replace with Prisma/Cloud SQL later) ──
const subscriptions = new Map();  // staffID → push subscription object

// ── Express routes ────────────────────────────────────────────
function setupPushRoutes(app) {

  // Save subscription from technician's device
  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, technicianId } = req.body || {};
    if (!subscription || !technicianId) {
      return res.status(400).json({ error: 'Missing subscription or technicianId' });
    }
    subscriptions.set(technicianId, subscription);
    console.log(`[push] Subscription saved for: ${technicianId}`);
    res.json({ success: true });
  });

  // Test endpoint — send a test notification
  app.post('/api/push/test', async (req, res) => {
    const { technicianId } = req.body || {};
    if (!technicianId) {
      return res.status(400).json({ error: 'Missing technicianId' });
    }
    try {
      await sendPushToTechnician(technicianId, {
        title: 'IMSE Field App',
        body: 'Test notification — push is working!',
        tag: 'test'
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ── Send to one technician ────────────────────────────────────
async function sendPushToTechnician(technicianId, payload) {
  const sub = subscriptions.get(technicianId);
  if (!sub) {
    console.log(`[push] No subscription for: ${technicianId}`);
    return false;
  }
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    console.log(`[push] Sent to ${technicianId}: ${payload.body}`);
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      subscriptions.delete(technicianId);
      console.log(`[push] Removed expired subscription: ${technicianId}`);
    }
    throw err;
  }
}

// ── Send to ALL technicians ───────────────────────────────────
async function sendPushToAll(payload) {
  for (const [techId, sub] of subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        subscriptions.delete(techId);
      }
    }
  }
}

// ── Ready-made alert functions ────────────────────────────────

async function notifyJobAssigned(technicianId, jobTitle) {
  await sendPushToTechnician(technicianId, {
    title: 'New Job Assigned',
    body: 'You have been assigned: ' + jobTitle,
    tag: 'job-assigned',
    url: '/field'
  });
}

async function notifyFundApproved(technicianId, amount) {
  await sendPushToTechnician(technicianId, {
    title: 'Fund Request Approved',
    body: 'Your request of Rs.' + amount + ' has been approved',
    tag: 'fund-approved',
    url: '/field'
  });
}

async function notifyUrgentAll(message) {
  await sendPushToAll({
    title: 'Urgent Alert',
    body: message,
    tag: 'urgent',
    url: '/field'
  });
}

export {
  setupPushRoutes,
  sendPushToTechnician,
  sendPushToAll,
  notifyJobAssigned,
  notifyFundApproved,
  notifyUrgentAll
};
