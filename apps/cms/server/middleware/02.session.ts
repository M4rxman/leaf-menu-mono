// Loads the signed-in user for API calls. Handlers decide what to do without one (requireUser).
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return
  const token = sessionToken(event)
  if (!token) return
  const user = await authService(event).authenticate(token)
  if (user) {
    event.context.user = user
    event.context.sessionToken = token
  }
})
