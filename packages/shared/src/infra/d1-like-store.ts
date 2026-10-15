import type { Db, LikeStore, RateLimiter } from '../domain/ports.ts'

const LIVE_DISH = `d.is_visible = 1 AND d.deleted_at IS NULL AND c.is_visible = 1 AND c.deleted_at IS NULL AND r.deleted_at IS NULL`
const FROM_DISH = `FROM dishes d JOIN categories c ON c.id = d.category_id JOIN restaurants r ON r.id = d.restaurant_id`

/** All SQL for likes. dishes.likes is kept right by the likes_ai / likes_ad triggers. */
export class D1LikeStore implements LikeStore {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async findLikeable(dishId: number) {
    return this.db.first<{ slug: string }>(`SELECT r.slug ${FROM_DISH} WHERE d.id = ? AND ${LIVE_DISH}`, dishId)
  }

  async setLiked(dishId: number, deviceId: string, liked: boolean) {
    if (liked) await this.db.run('INSERT OR IGNORE INTO likes (dish_id, device_id) VALUES (?, ?)', dishId, deviceId)
    else await this.db.run('DELETE FROM likes WHERE dish_id = ? AND device_id = ?', dishId, deviceId)
    return this.currentCount(dishId)
  }

  async currentCount(dishId: number) {
    return (await this.db.first<{ likes: number }>('SELECT likes FROM dishes WHERE id = ?', dishId))?.likes ?? 0
  }

  async counts(slug: string) {
    const rows = await this.db.all<{ id: number, likes: number }>(
      `SELECT d.id, d.likes ${FROM_DISH} WHERE r.slug = ? AND ${LIVE_DISH}`, slug)
    return Object.fromEntries(rows.map(r => [r.id, r.likes]))
  }

  async likedDishIds(slug: string, deviceId: string) {
    const rows = await this.db.all<{ dish_id: number }>(
      `SELECT l.dish_id ${FROM_DISH} JOIN likes l ON l.dish_id = d.id WHERE r.slug = ? AND l.device_id = ? AND ${LIVE_DISH}`, slug, deviceId)
    return rows.map(r => r.dish_id)
  }
}

/** Cloudflare Rate Limiting binding (wrangler.toml [[ratelimits]]). */
export function cfRateLimiter(binding: { limit(o: { key: string }): Promise<{ success: boolean }> }): RateLimiter {
  return { allow: async key => (await binding.limit({ key })).success }
}
