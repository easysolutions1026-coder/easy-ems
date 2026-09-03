/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * IMSE EASY EMS â€” API Shim (Phase 0)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * This shim lets the EXISTING index.html and field_app.html talk to
 * the new Postgres-backed REST API without changing any of the app's
 * 40,000+ lines of business logic.
 *
 * How it works
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   The current app calls four Drive functions:
 *     - loadFileFromDrive(fileName)   [index.html]
 *     - saveFileToDrive(fileName, d)  [index.html]
 *     - readFile(fileId)              [field_app.html]
 *     - writeFile(fileId, data)       [field_app.html]
 *
 *   We monkey-patch all four AFTER the app defines them, so on first
 *   invocation the shim intercepts the call and routes it to
 *   /api/data/:collection instead of Drive.
 *
 *   For field_app.html, we map file IDs â†’ collection names using a
 *   lookup table (populated on first sign-in from the app's file-ID
 *   cache) so `readFile('abc123')` still works.
 *
 * How to enable
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   Include this ONE line in the <head> of both HTML files, after the
 *   Google API scripts and after your existing app code has defined
 *   its four Drive functions. In practice, add this at the very end
 *   of the </body> tag so it runs LAST:
 *
 *     <script src="/shim/api-shim.js"></script>
 *
 *   Or set window.EMS_SHIM_CONFIG BEFORE the tag to override defaults:
 *
 *     <script>window.EMS_SHIM_CONFIG = { apiBase: 'https://ems-api.example.com' };</script>
 *     <script src="/shim/api-shim.js"></script>
 *
 * How to disable (fallback to Drive)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   Simply remove the <script> tag. The existing Drive code path is
 *   untouched. No data migration required to revert.
 *
 * Rollout strategy (Phase 1)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   Toggle via a query string:
 *     - https://your-app/?backend=drive    â†’ old behavior (default while testing)
 *     - https://your-app/?backend=api      â†’ new backend
 *   This lets you flip individual users over gradually.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

(function () {
  'use strict';

  // â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const DEFAULTS = {
    // Backend URL. In Cloud Run production this is your ems-api.imse.in.
    // In local dev, defaults to same-origin.
    apiBase: '',
    // Enable/disable via query string. Change to 'api' to make backend the default.
    defaultMode: 'api',
    // Emit console logs for every intercepted call. Helpful during migration.
    debug: true,
  };

  const cfg = Object.assign({}, DEFAULTS, window.EMS_SHIM_CONFIG || {});
  const qs  = new URLSearchParams(location.search);
  const mode = qs.get('backend') || cfg.defaultMode;

  if (mode !== 'api') {
    console.info('[EMS-shim] backend=drive â€” shim inactive');
    return;
  }

  // â”€â”€ File name â†’ collection mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // Maps the legacy Drive filenames used throughout the app to the
  // REST collection names on the backend.

  const FILE_TO_COLLECTION = {
    'transactions.json':          'transactions',
    'parties.json':               'parties',
    'arInvoices.json':            'arInvoices',
    'settings.json':              'settings',
    'expenses.json':              'expenses',
    'bankAccounts.json':          'bankAccounts',
    'bankReconciliations.json':   'bankReconciliations',
    'chartOfAccounts.json':       'chartOfAccounts',
    'staff.json':                 'staff',
    'projectExpenses.json':       'projectExpenses',
    'workLogs.json':              'workLogs',
    'payslips.json':              'payslips',
    'fundRequests.json':          'fundRequests',
    'fundPools.json':             'fundPools',
    'paymentRequests.json':       'paymentRequests',
    'appUsers.json':              'appUsers',
    'auditLog.json':              'auditLog',
    'pettyCashOffices.json':      'pettyCashOffices',
    'pettyCashTransactions.json': 'pettyCashTransactions',
    'pettyCashStatements.json':   'pettyCashStatements',
    'gstCashLedgerSnapshots.json':'gstCashLedgerSnapshots',
    'companyDocuments.json':      'companyDocuments',
    'directorExpenses.json':      'directorExpenses',
    '_locks.json':                null, // handled specially â€” no-op on the backend
  };

  // File-ID â†’ collection mapping for field_app.html.
  // Populated on first successful call. Persists to localStorage.
  const FILEID_MAP_KEY = 'ems_shim_fileid_map_v1';
  let fileIdToCollection = {};
  try {
    fileIdToCollection = JSON.parse(localStorage.getItem(FILEID_MAP_KEY) || '{}');
  } catch (_) { fileIdToCollection = {}; }

  function saveFileIdMap() {
    try { localStorage.setItem(FILEID_MAP_KEY, JSON.stringify(fileIdToCollection)); }
    catch (_) {}
  }

  // â”€â”€ HTTP helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function getAccessToken() {
    // Try multiple locations - the token might be:
    //  1. On window.accessToken (rare)
    //  2. On gapi.client.getToken().access_token (Google Identity Services)
    //  3. Inside the app's closure - accessible via window.google.accounts.oauth2 token
    if (window.gapi?.client?.getToken?.()?.access_token) {
      return window.gapi.client.getToken().access_token;
    }
    if (typeof window.accessToken === 'string' && window.accessToken) {
      return window.accessToken;
    }
    // Sometimes stored under different names in the app
    if (window._accessToken) return window._accessToken;
    if (window.authToken) return window.authToken;
    return null;
  }

  async function apiCall(method, path, body) {
    const token = getAccessToken();
    if (!token) {
      throw new Error('EMS-shim: no OAuth access token available. Sign in first.');
    }
    const url = (cfg.apiBase || '') + path;
    const headers = { 'Authorization': `Bearer ${token}` };
    let bodyStr;
    if (body != null) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }
    const res = await fetch(url, { method, headers, body: bodyStr });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`EMS-shim ${method} ${path} â†’ ${res.status}: ${text.slice(0, 300)}`);
    }
    // Some endpoints return no body
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return null;
  }

  function log(...args) { if (cfg.debug) console.log('[EMS-shim]', ...args); }

  // â”€â”€ Interception: index.html â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function patchIndexApp() {
    if (typeof window.loadFileFromDrive !== 'function' ||
        typeof window.saveFileToDrive   !== 'function') {
      // App hasn't defined its Drive functions yet. Try again shortly.
      return false;
    }

    const _origLoad = window.loadFileFromDrive;
    const _origSave = window.saveFileToDrive;

    window.loadFileFromDrive = async function(fileName) {
      const collection = FILE_TO_COLLECTION[fileName];
      if (collection === null) {
        // _locks.json â€” no-op, return empty object (concurrency handled server-side)
        log('load(no-op)', fileName);
        return {};
      }
      if (!collection) {
        log('load(passthrough â†’ Drive)', fileName);
        return _origLoad(fileName);
      }
      try {
        log('load â†’', collection);
        const data = await apiCall('GET', `/api/data/${collection}`);
        return data;
      } catch (err) {
        console.error(`[EMS-shim] load ${fileName} failed, falling back to Drive:`, err);
        return _origLoad(fileName);
      }
    };

    window.saveFileToDrive = async function(fileName, fileData) {
      const collection = FILE_TO_COLLECTION[fileName];
      if (collection === null) {
        log('save(no-op)', fileName);
        return { id: 'noop', modifiedTime: new Date().toISOString() };
      }
      if (!collection) {
        log('save(passthrough â†’ Drive)', fileName);
        return _origSave(fileName, fileData);
      }
      try {
        log('save â†’', collection, `(${Array.isArray(fileData) ? fileData.length : '1'} rec)`);
        await apiCall('POST', `/api/data/${collection}`, fileData);
        return { id: collection, modifiedTime: new Date().toISOString(), size: 0 };
      } catch (err) {
        console.error(`[EMS-shim] save ${fileName} failed:`, err);
        throw err;
      }
    };

    console.info('[EMS-shim] index.html patched â€” Drive calls now route to /api/data/*');
    return true;
  }

  // â”€â”€ Interception: field_app.html â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function patchFieldApp() {
    if (typeof window.readFile  !== 'function' ||
        typeof window.writeFile !== 'function') return false;

    const _origRead  = window.readFile;
    const _origWrite = window.writeFile;

    // The field app has a global `fileIDs` object mapping collection
    // names to Drive file IDs. Use it to seed our reverse mapping.
    function seedFromFileIDs() {
      const ids = window.fileIDs;
      if (!ids || typeof ids !== 'object') return;
      let changed = false;
      for (const [key, val] of Object.entries(ids)) {
        if (typeof val === 'string' && val && !fileIdToCollection[val]) {
          // The keys in field_app's fileIDs are already the collection
          // names ("projectExpenses", "workLogs", "staff", etc.)
          fileIdToCollection[val] = key;
          changed = true;
        }
      }
      if (changed) saveFileIdMap();
    }

    window.readFile = async function(fileId) {
      seedFromFileIDs();
      const collection = fileIdToCollection[fileId];
      if (!collection) {
        log('readFile(passthrough â†’ Drive)', fileId);
        return _origRead(fileId);
      }
      try {
        log('readFile â†’', collection);
        return await apiCall('GET', `/api/data/${collection}`);
      } catch (err) {
        console.error(`[EMS-shim] readFile ${collection} failed, falling back:`, err);
        return _origRead(fileId);
      }
    };

    window.writeFile = async function(fileId, data) {
      seedFromFileIDs();
      const collection = fileIdToCollection[fileId];
      if (!collection) {
        log('writeFile(passthrough â†’ Drive)', fileId);
        return _origWrite(fileId, data);
      }
      try {
        log('writeFile â†’', collection, `(${Array.isArray(data) ? data.length : '1'} rec)`);
        await apiCall('POST', `/api/data/${collection}`, data);
      } catch (err) {
        console.error(`[EMS-shim] writeFile ${collection} failed:`, err);
        throw err;
      }
    };

    console.info('[EMS-shim] field_app.html patched â€” readFile/writeFile now route to /api/data/*');
    return true;
  }

  // â”€â”€ Boot: try to patch now, and retry until the app has defined
  //         its Drive functions (they're inside async init).

  let attempts = 0;
  const MAX_ATTEMPTS = 50;

  function tryPatch() {
    const indexOK = patchIndexApp();
    const fieldOK = patchFieldApp();

    // We might be in either page â€” one of the two will patch.
    if (indexOK || fieldOK) return;

    if (++attempts >= MAX_ATTEMPTS) {
      console.warn('[EMS-shim] Gave up waiting for Drive functions to be defined. Shim inactive.');
      return;
    }
    setTimeout(tryPatch, 200);
  }

  // Start after the DOM is done. Some Google scripts define things on
  // load, so we also listen for that.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryPatch);
  } else {
    tryPatch();
  }
  window.addEventListener('load', tryPatch);
})();
