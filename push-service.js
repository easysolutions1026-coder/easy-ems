import webpush from 'web-push';
webpush.setVapidDetails(
  'mailto:admin@imsetech.com',          // your email
  'BJKPctkYlzveOIrbSNSLR5sas_e_oa5OIbg3Dlgu_YvcV7lhWKUPL_MKGZJQZjoNZSWNDkITlLcjoT5-hq46Hs4',          // from Step 9
  'heaadxWkIE942er4wixPCBsm7sEE3dlvRb-x5XwQEOo'          // from Step 9
);

// Store subscriptions (replace with database in production)
const subscriptions = new Map();

// Handle push API routes
function handlePushRoutes(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const data = JSON.parse(body);

    if (req.url === '/api/push/subscribe' && req.method === 'POST') {
      subscriptions.set(data.technicianId, data.subscription);
      console.log('Subscription saved for:', data.technicianId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));

    } else if (req.url === '/api/push/test' && req.method === 'POST') {
      sendPushToTechnician(data.technicianId, {
        title: 'IMSE Field App',
        body: 'Test notification — push is working!',
        tag: 'test'
      }).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    }
  });
}

// Send push to one technician
async function sendPushToTechnician(technicianId, payload) {
  const sub = subscriptions.get(technicianId);
  if (!sub) {
    console.log('No subscription for:', technicianId);
    return false;
  }
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    console.log('Push sent to:', technicianId);
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      subscriptions.delete(technicianId);
    }
    throw err;
  }
}

// Send push to ALL technicians
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

// Ready-made alert functions you can call from anywhere
async function notifyJobAssigned(technicianId, jobTitle) {
  await sendPushToTechnician(technicianId, {
    title: 'New Job Assigned',
    body: 'You have been assigned: ' + jobTitle,
    tag: 'job-assigned',
    url: '/field_app.html'
  });
}

async function notifyFundApproved(technicianId, amount) {
  await sendPushToTechnician(technicianId, {
    title: 'Fund Request Approved',
    body: 'Your request of Rs.' + amount + ' has been approved',
    tag: 'fund-approved',
    url: '/field_app.html'
  });
}

async function notifyUrgentAll(message) {
  await sendPushToAll({
    title: 'Urgent Alert',
    body: message,
    tag: 'urgent'
  });
}

export { setupPushRoutes, sendPushToTechnician, sendPushToAll, notifyJobAssigned, notifyFundApproved, notifyUrgentAll };