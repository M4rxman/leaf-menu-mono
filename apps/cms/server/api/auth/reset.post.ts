export default defineEventHandler(async (event) => {
  const { token, next } = await readStrings(event, 'token', 'next')
  const ip = getRequestHeader(event, 'cf-connecting-ip') ?? ''
  const result = await authService(event).resetPassword(token, next, ip)
  if (!result.ok) {
    if (result.reason === 'throttled') fail(429, 'rate_limited', 'Too many attempts. Try again in 15 minutes.')
    if (result.reason === 'too_short') fail(422, 'password_too_short', 'The new password needs at least 12 characters')
    fail(410, 'reset_link_invalid', 'This link is invalid, expired or already used. Ask for a new one.')
  }
  queueChangedMail(event, result.email)
  clearSessionCookie(event) // this browser may hold a session that was just revoked
  setResponseStatus(event, 204)
})
