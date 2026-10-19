import { DUMMY_HASH, hashPassword, verifyPassword } from './password.ts'
import type { AuthStore, AuthUser } from './ports.ts'

export const MIN_PASSWORD = 12
const SESSION_SECONDS = 14 * 86400 // sliding (plan §9)
const EXTEND_AFTER = 86400 // write the new expiry at most once a day
const MAX_FAILURES = 5
const FAILURE_WINDOW = 15 * 60

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
const sha256 = async (s: string) => toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
const newToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

export type LoginResult =
  | { ok: true, token: string, maxAge: number, user: AuthUser }
  | { ok: false, reason: 'invalid' | 'throttled' }

export type PasswordResult = 'ok' | 'wrong_current' | 'too_short' | 'throttled'

export class AuthService {
  private readonly store: AuthStore
  private readonly pepper: string
  private readonly now: () => number

  constructor(store: AuthStore, pepper: string, now: () => number = () => Math.floor(Date.now() / 1000)) {
    this.store = store
    this.pepper = pepper
    this.now = now
  }

  /**
   * Counts this attempt as a failure *before* the password is checked, then looks at the totals (this attempt
   * included). Requests that run in parallel therefore see each other; check-then-write would let them all through.
   * The caller takes the attempt back with `forgetFailure` once the password turns out right.
   */
  private async overLimit(keys: string[], at: number): Promise<boolean> {
    await this.store.purgeFailures(at - FAILURE_WINDOW)
    for (const key of keys) await this.store.recordFailure(key, at)
    for (const key of keys)
      if (await this.store.failureCount(key, at - FAILURE_WINDOW) > MAX_FAILURES) return true
    return false
  }

  async login(email: string, password: string, ip: string): Promise<LoginResult> {
    const at = this.now()
    const emailKey = `email:${email.trim().toLowerCase()}`
    const ipKey = ip ? `ip:${ip}` : null // no address (never on Workers): skip the key, a shared '' key would lock everyone out
    if (await this.overLimit(ipKey ? [emailKey, ipKey] : [emailKey], at)) return { ok: false, reason: 'throttled' }

    const found = await this.store.findByEmail(email.trim())
    // An unknown email verifies against a fixed hash, so it costs the same single PBKDF2 run as a wrong password.
    const ok = await verifyPassword(password, this.pepper, found?.passwordHash ?? DUMMY_HASH)
    if (!found || !ok) return { ok: false, reason: 'invalid' }

    await this.store.clearFailures(emailKey)
    if (ipKey) await this.store.forgetFailure(ipKey, at)
    const token = newToken()
    const maxAge = SESSION_SECONDS
    await this.store.createSession(await sha256(token), found.id, at + maxAge)
    const { passwordHash: _, ...user } = found
    return { ok: true, token, maxAge, user }
  }

  /** The signed-in user for a cookie token, or null. Slides the expiry forward. */
  async authenticate(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null
    const id = await sha256(token)
    const s = await this.store.sessionUser(id, this.now())
    if (!s) return null
    if (s.expiresAt - this.now() < SESSION_SECONDS - EXTEND_AFTER)
      await this.store.extendSession(id, this.now() + SESSION_SECONDS)
    return s.user
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.store.deleteSession(await sha256(token))
  }

  /** Other sessions of the user are deleted; the current one stays. Wrong guesses of the current password are throttled like logins. */
  async changePassword(user: AuthUser, token: string, current: string, next: string): Promise<PasswordResult> {
    const at = this.now()
    const key = `email:${user.email.toLowerCase()}`
    if (await this.overLimit([key], at)) return 'throttled'
    const row = await this.store.findById(user.id)
    if (!row || !await verifyPassword(current, this.pepper, row.passwordHash)) return 'wrong_current'
    await this.store.forgetFailure(key, at)
    if ([...next].length < MIN_PASSWORD) return 'too_short'
    await this.store.setPassword(user.id, await hashPassword(next, this.pepper), false)
    await this.store.deleteSessions(user.id, await sha256(token))
    return 'ok'
  }
}
