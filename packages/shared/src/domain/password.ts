// PBKDF2-SHA256 over WebCrypto, no library (plan §9). The password is first run through HMAC-SHA256 with a
// Worker secret (the pepper), so a leaked D1 export or backup is useless without that secret. Stored as
// `pbkdf2-sha256-p1$iterations$salt$hash` (base64). The prefix versions the scheme and the iteration count is
// inside, so either can change later and old hashes still verify.

// ponytail: 100k is the most Workers' PBKDF2 accepts; raise only if that cap moves.
export const PBKDF2_ITERATIONS = 100_000
const SCHEME = 'pbkdf2-sha256-p1'

/** Verified against when the email is unknown, so that path costs the same one PBKDF2 run as a wrong password. */
export const DUMMY_HASH = `${SCHEME}$${PBKDF2_ITERATIONS}$m3aZ1xH0cQw8rN5uKd7fBg==$Kf2oV9tYhP4sLq0eXc6JnWb1ZaR8uMdT3yGvA5iNE7k=`

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const utf8 = (s: string) => new TextEncoder().encode(s)

async function derive(password: string, pepper: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey('raw', utf8(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const peppered = await crypto.subtle.sign('HMAC', hmacKey, utf8(password))
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

export async function hashPassword(password: string, pepper: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `${SCHEME}$${iterations}$${b64(salt)}$${b64(await derive(password, pepper, salt, iterations))}`
}

export async function verifyPassword(password: string, pepper: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$')
  const iterations = Number(iter)
  if (scheme !== SCHEME || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false
  const expected = unb64(hash)
  const actual = await derive(password, pepper, unb64(salt), iterations)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!
  return diff === 0
}
