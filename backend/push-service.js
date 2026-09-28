// ════════════════════════════════════════════════════════════════
// IMSE Field App — Push Notification Service
// Express + ES modules version
// ════════════════════════════════════════════════════════════════

let webpush = null;
let pushReady = false;
const subscriptions = new Map();

// Lazy init — only runs when first push route is hit or a notification is sent
function ensurePushReady() {
  if (pushReady) return true;
  try {
    // Dynamic import already done at setupPushRoutes time
    if (!webpush) return false;

    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    const privateKey = process.env.VAPID_PRIVATE_KEY || '';

    if (!publicKey || !privateKey) {
      console.warn('[push] VAPID keys not set — push notifications disabled');
      return false;
    }

    webpush.setVapidDetails(
      'mailto:admin@imsetech.com',
      publicKey,
      privateKey
    );
    pushReady = true;
    console.log('[push] VAPID configured — push notifications enabled');
    return true;
  } catch (err) {
    console.error('[push] VAPID setup failed:', err.message);
    return false;
  }
}

// ── Express routes ────────────────────────────────────────────
async function setupPushRoutes(app) {
  try {
    const wp = await import('web-push');
    webpush = wp.default || wp;
    console.log('[push] web-push loaded');
  } catch (err) {
    console.warn('[push] web-push not available:', err.message);
    // Server still starts — push just won't work
  }

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

  // Test endpoint
  app.post('/api/push/test', async (req, res) => {
    const { technicianId } = req.body || {};
    if (!technicianId) {
      return res.status(400).json({ error: 'Missing technicianId' });
    }
    try {
      const sent = await sendPushToTechnician(technicianId, {
        title: 'IMSE Field App',
        body: 'Test notification — push is working!',
        tag: 'test'
      });
      res.json({ success: sent });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ── Send to one technician ────────────────────────────────────
async function sendPushToTechnician(technicianId, payload) {
  if (!ensurePushReady()) {
    console.log('[push] Not ready — skipping notification');
    return false;
  }
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
  if (!ensurePushReady()) return;
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
    url: '/imse-ems/field'
  });
}

async function notifyFundApproved(technicianId, amount) {
  await sendPushToTechnician(technicianId, {
    title: 'Fund Request Approved',
    body: 'Your request of Rs.' + amount + ' has been approved',
    tag: 'fund-approved',
    url: '/imse-ems/field'
  });
}

async function notifyUrgentAll(message) {
  await sendPushToAll({
    title: 'Urgent Alert',
    body: message,
    tag: 'urgent',
    url: '/imse-ems/field'
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
