// CSRF: every state-changing request must come from our own origin (plan §9).
export default defineEventHandler((event) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(event.method)) return
  if (getRequestHeader(event, 'origin') !== getRequestURL(event).origin)
    throw createError({ statusCode: 403, statusMessage: 'Bad origin' })
})
