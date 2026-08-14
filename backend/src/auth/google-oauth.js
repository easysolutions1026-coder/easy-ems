// ════════════════════════════════════════════════════════════════════
// Google OAuth token verification
// ────────────────────────────────────────────────────────────────────
// The browser (existing index.html) already obtains a Google access
// token via GIS (Google Identity Services) with Drive + Sheets scopes.
// It sends that token in the Authorization header on every /api/* call.
//
// This module verifies the token by calling Google's tokeninfo endpoint
// on the first request, then caches the result for a short window to
// avoid a network call per request.
// ════════════════════════════════════════════════════════════════════

const TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

const cache = new Map(); // token → { claims, expiresAt }

export async function verifyGoogleToken(accessToken) {
  const now = Date.now();

  // Cache hit?
  const cached = cache.get(accessToken);
  if (cached && cached.expiresAt > now) {
    return cached.claims;
  }

  const res = await fetch(`${TOKEN_INFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    throw new Error(`Google tokeninfo returned ${res.status}`);
  }
  const info = await res.json();

  // Sanity checks
  if (info.error) throw new Error(info.error_description || info.error);
  if (!info.email) throw new Error('Token has no email claim');
  if (info.email_verified !== 'true' && info.email_verified !== true) {
    throw new Error('Email not verified by Google');
  }

  // Optional: enforce this token was issued to OUR client ID
  const expectedAud = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (expectedAud && info.aud && info.aud !== expectedAud) {
    throw new Error(`Token audience mismatch: got ${info.aud}`);
  }

  const claims = {
    email: info.email,
    name:  info.name || info.email,
    hd:    info.hd || null, // Workspace hosted-domain claim (e.g. "imse.org.in")
    sub:   info.sub,
    aud:   info.aud,
  };

  // Cache until 30 seconds before Google's expiry, capped at CACHE_TTL_MS
  const googleExp = info.expires_in ? (now + Number(info.expires_in) * 1000 - 30_000) : (now + CACHE_TTL_MS);
  cache.set(accessToken, { claims, expiresAt: Math.min(googleExp, now + CACHE_TTL_MS) });

  return claims;
}

// Housekeeping — evict expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [tok, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(tok);
  }
}, CACHE_TTL_MS).unref?.();
