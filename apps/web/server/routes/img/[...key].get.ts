// GET /img/r/{restaurant_id}/dishes/{id}/{uuid}: dish photos from R2. Keys are random, so the bytes never change.
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  if (!key.startsWith('r/') || key.includes('..')) throw createError({ statusCode: 404 })
  const obj = await photos(event).get(key)
  if (!obj) throw createError({ statusCode: 404 })
  setResponseHeaders(event, {
    'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable'
  })
  return obj.body
})
