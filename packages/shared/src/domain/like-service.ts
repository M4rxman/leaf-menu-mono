import type { LikeStore } from './ports.ts'

export interface LikeResult {
  slug: string
  dishId: number
  liked: boolean
  count: number
}

export class LikeService {
  private readonly store: LikeStore

  constructor(store: LikeStore) {
    this.store = store
  }

  /**
   * Like or unlike. Null if the dish can't be liked. No device (never liked anything) can only "unlike", a no-op.
   * The device may be a function so it is resolved (and a cookie issued) only after the dish is known to be likeable.
   */
  async set(dishId: number, device: string | null | (() => Promise<string | null>), liked: boolean): Promise<LikeResult | null> {
    const dish = await this.store.findLikeable(dishId)
    if (!dish) return null
    const deviceId = typeof device === 'function' ? await device() : device
    if (!deviceId) return { slug: dish.slug, dishId, liked: false, count: await this.store.currentCount(dishId) }
    return { slug: dish.slug, dishId, liked, count: await this.store.setLiked(dishId, deviceId, liked) }
  }

  /** Menu slug of a likeable dish (for redirects after a failed form post). */
  async slugOf(dishId: number): Promise<string | null> {
    return (await this.store.findLikeable(dishId))?.slug ?? null
  }

  /** Counts for every dish of the venue plus the ones this device liked (for the page script). */
  async venueLikes(slug: string, deviceId: string | null) {
    const [counts, liked] = await Promise.all([
      this.store.counts(slug),
      deviceId ? this.store.likedDishIds(slug, deviceId) : Promise.resolve([] as number[])
    ])
    return { counts, liked }
  }

  likedDishIds(slug: string, deviceId: string | null): Promise<number[]> {
    return deviceId ? this.store.likedDishIds(slug, deviceId) : Promise.resolve([])
  }
}
