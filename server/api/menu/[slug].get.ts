export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const { lang } = getQuery(event)
  const result = await menuService(event).getMenu(slug, typeof lang === 'string' ? lang : undefined)
  if (result.kind === 'notfound') throw createError({ statusCode: 404, statusMessage: 'Menu not found' })
  return result
})
