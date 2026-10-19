import { onlyDishes } from '@chilly/shared/domain/menu-service'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const { lang, favorites } = getQuery(event)
  const result = await menuService(event).getMenu(slug, typeof lang === 'string' ? lang : '')
  if (result.kind === 'notfound') throw createError({ statusCode: 404, statusMessage: 'Menu not found' })
  if (favorites !== '1' || result.kind !== 'ok') return result
  // Device-specific: never cacheable.
  setResponseHeader(event, 'cache-control', 'private, no-store')
  const liked = await likeService(event).likedDishIds(slug, await readDevice(event))
  return { ...result, menu: onlyDishes(result.menu, liked) }
})
