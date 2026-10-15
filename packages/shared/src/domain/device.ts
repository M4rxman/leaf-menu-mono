// Anonymous device id for likes: cookie value "{uuid}.{hmac}", signed so guests can't invent ids.
const enc = new TextEncoder()

const key = (secret: string, usage: KeyUsage) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])

const toB64Url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

export const newDeviceId = (): string => crypto.randomUUID()

export async function signDevice(id: string, secret: string): Promise<string> {
  return `${id}.${toB64Url(await crypto.subtle.sign('HMAC', await key(secret, 'sign'), enc.encode(id)))}`
}

/** The device id if the signature is valid, else null. Constant-time (subtle.verify). */
export async function verifyDevice(cookie: string | undefined, secret: string): Promise<string | null> {
  const dot = cookie?.lastIndexOf('.') ?? -1
  if (!cookie || dot < 1) return null
  const id = cookie.slice(0, dot)
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret, 'verify'), fromB64Url(cookie.slice(dot + 1)), enc.encode(id))
    return ok ? id : null
  } catch {
    return null // malformed base64
  }
}
