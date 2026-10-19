// PBKDF2-SHA256 over WebCrypto, no library (plan §9). Stored as `pbkdf2-sha256$iterations$salt$hash` (base64),
// so the iteration count can be raised later and old hashes still verify.

// ponytail: 100k is the most Workers' PBKDF2 accepts; raise only if that cap moves.
const ITERATIONS = 100_000

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, salt, hash] = stored.split('$')
  const iterations = Number(iter)
  if (algo !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false
  const expected = unb64(hash)
  const actual = await derive(password, unb64(salt), iterations)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!
  return diff === 0
}
