/**
 * Reads access-token claims WITHOUT verifying the signature. Only for decisions
 * the API re-checks anyway: whether a token is worth sending, and which admin
 * menu items to show. Authorization always happens in the API.
 */
export interface AccessClaims {
  sub: string;
  typ: 'ADMIN' | 'CUSTOMER';
  role?: string;
  exp: number;
}

export function readClaims(token: string | undefined): AccessClaims | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AccessClaims>;
    if (typeof json.sub !== 'string' || typeof json.exp !== 'number') return null;
    return json as AccessClaims;
  } catch {
    return null;
  }
}

/** Fresh enough to send: refresh a little early so a request never races expiry. */
export function isFresh(token: string | undefined, skewSeconds = 30): boolean {
  const claims = readClaims(token);
  return claims !== null && claims.exp - skewSeconds > Date.now() / 1000;
}
