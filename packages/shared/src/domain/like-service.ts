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

  /** Like or unlike. Null if the dish can't be liked. No device (never liked anything) can only "unlike", a no-op. */
  async set(dishId: number, deviceId: string | null, liked: boolean): Promise<LikeResult | null> {
    const dish = await this.store.findLikeable(dishId)
    if (!dish) return null
    if (!deviceId) return { slug: dish.slug, dishId, liked: false, count: await this.store.currentCount(dishId) }
    return { slug: dish.slug, dishId, liked, count: await this.store.setLiked(dishId, deviceId, liked) }
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
