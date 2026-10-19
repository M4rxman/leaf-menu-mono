import type { AuthStore, AuthUser, Db } from '../domain/ports.ts'

interface UserRow {
  id: number
  email: string
  role: AuthUser['role']
  restaurant_id: number | null
  must_change_password: number
}

const USER_COLS = 'u.id, u.email, u.role, u.restaurant_id, u.must_change_password'

const toUser = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  role: r.role,
  restaurantId: r.restaurant_id,
  mustChangePassword: r.must_change_password === 1
})

/** All SQL for accounts and sessions. */
export class D1AuthStore implements AuthStore {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  private async withHash(where: string, param: unknown) {
    const r = await this.db.first<UserRow & { password_hash: string }>(
      `SELECT ${USER_COLS}, u.password_hash FROM users u WHERE ${where}`, param)
    return r ? { ...toUser(r), passwordHash: r.password_hash } : null
  }

  findByEmail(email: string) {
    return this.withHash('u.email = ?', email) // column is COLLATE NOCASE
  }

  findById(id: number) {
    return this.withHash('u.id = ?', id)
  }

  async createSession(sessionId: string, userId: number, expiresAt: number) {
    await this.db.run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', sessionId, userId, expiresAt)
  }

  async sessionUser(sessionId: string, now: number) {
    const r = await this.db.first<UserRow & { expires_at: number }>(
      `SELECT ${USER_COLS}, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
      sessionId, now)
    return r ? { user: toUser(r), expiresAt: r.expires_at } : null
  }

  async extendSession(sessionId: string, expiresAt: number) {
    await this.db.run('UPDATE sessions SET expires_at = ? WHERE id = ?', expiresAt, sessionId)
  }

  async deleteSession(sessionId: string) {
    await this.db.run('DELETE FROM sessions WHERE id = ?', sessionId)
  }

  async deleteSessions(userId: number, keep?: string) {
    await this.db.run('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?', userId, keep ?? null)
  }

  async setPassword(userId: number, passwordHash: string, mustChange: boolean) {
    await this.db.run('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?',
      passwordHash, mustChange ? 1 : 0, userId)
  }

  async failureCount(key: string, since: number) {
    return (await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM login_failures WHERE key = ? AND at > ?', key, since))?.n ?? 0
  }

  async recordFailure(key: string, at: number) {
    await this.db.run('INSERT INTO login_failures (key, at) VALUES (?, ?)', key, at)
  }

  async clearFailures(key: string) {
    await this.db.run('DELETE FROM login_failures WHERE key = ?', key)
  }
}
