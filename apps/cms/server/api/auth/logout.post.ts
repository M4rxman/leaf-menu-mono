export default defineEventHandler(async (event) => {
  await authService(event).logout(sessionToken(event))
  clearSessionCookie(event)
  setResponseStatus(event, 204)
})
