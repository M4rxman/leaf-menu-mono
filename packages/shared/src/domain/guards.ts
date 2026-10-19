// Small request rules kept out of the Nitro handlers so they can be unit-tested.

/** CSRF (plan §9): state-changing requests must carry our own Origin. GET/HEAD/OPTIONS change nothing. */
export function originAllowed(method: string, origin: string | null | undefined, siteOrigin: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true
  return origin === siteOrigin
}

/** A dish id from a URL segment: plain digits only, no sign, exponent, hex, spaces or leading zero. */
export function parseDishId(raw: string | null | undefined): number | null {
  return raw && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null
}
