// Google OAuth token verification
// Uses tokeninfo endpoint - single call, returns email + aud + scope

const TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const CACHE_TTL_MS   = 5 * 60 * 1000;

const cache = new Map();

export async function verifyGoogleToken(accessToken) {
  const now = Date.now();

  const cached = cache.get(accessToken);
  if (cached && cached.expiresAt > now) {
    return cached.claims;
  }

  const res = await fetch(`${TOKEN_INFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    throw new Error(`Google tokeninfo returned ${res.status}`);
  }
  const info = await res.json();

  if (info.error) throw new Error(info.error_description || info.error);

  // Token audience must match our OAuth client (if configured)
  const expectedAud = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (expectedAud && info.aud && info.aud !== expectedAud) {
    throw new Error(`Token audience mismatch: got ${info.aud}`);
  }

  // The tokeninfo response gives us email when the token has userinfo.email scope
  // If email is missing, extract the user from the sub (Google user ID)
  // and use that as the identifier
  const email = info.email || null;

  const claims = {
    email: email,           // may be null if scope not granted
    name:  email || info.sub,
    hd:    info.hd || null,
    sub:   info.sub,
    aud:   info.aud,
  };

  const googleExp = info.expires_in ? (now + Number(info.expires_in) * 1000 - 30_000) : (now + CACHE_TTL_MS);
  cache.set(accessToken, { claims, expiresAt: Math.min(googleExp, now + CACHE_TTL_MS) });

  return claims;
}

setInterval(() => {
  const now = Date.now();
  for (const [tok, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(tok);
  }
}, CACHE_TTL_MS).unref?.();