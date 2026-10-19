import { hashPassword, verifyPassword } from './password.ts'
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

export type PasswordResult = 'ok' | 'wrong_current' | 'too_short'

export class AuthService {
  private readonly store: AuthStore
  private readonly now: () => number
  private dummy?: Promise<string>

  constructor(store: AuthStore, now: () => number = () => Math.floor(Date.now() / 1000)) {
    this.store = store
    this.now = now
  }

  async login(email: string, password: string, ip: string): Promise<LoginResult> {
    const keys = [`email:${email.trim().toLowerCase()}`, `ip:${ip}`]
    const since = this.now() - FAILURE_WINDOW
    for (const key of keys)
      if (await this.store.failureCount(key, since) >= MAX_FAILURES) return { ok: false, reason: 'throttled' }

    const found = await this.store.findByEmail(email.trim())
    // Unknown email still pays for one hash, so both failures take the same time and give the same answer.
    this.dummy ??= hashPassword('not-a-real-password')
    const ok = await verifyPassword(password, found?.passwordHash ?? await this.dummy)
    if (!found || !ok) {
      for (const key of keys) await this.store.recordFailure(key, this.now())
      return { ok: false, reason: 'invalid' }
    }

    await this.store.clearFailures(keys[0]!)
    const token = newToken()
    const maxAge = SESSION_SECONDS
    await this.store.createSession(await sha256(token), found.id, this.now() + maxAge)
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

  /** Other sessions of the user are deleted; the current one stays. */
  async changePassword(user: AuthUser, token: string, current: string, next: string): Promise<PasswordResult> {
    const row = await this.store.findById(user.id)
    if (!row || !await verifyPassword(current, row.passwordHash)) return 'wrong_current'
    if ([...next].length < MIN_PASSWORD) return 'too_short'
    await this.store.setPassword(user.id, await hashPassword(next), false)
    await this.store.deleteSessions(user.id, await sha256(token))
    return 'ok'
  }
}
