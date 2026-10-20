export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { current, next } = await readStrings(event, 'current', 'next')
  const result = await authService(event).changePassword(user, event.context.sessionToken!, current, next)
  if (result === 'throttled') fail(429, 'rate_limited', 'Too many attempts. Try again in 15 minutes.')
  if (result === 'wrong_current') fail(422, 'wrong_password', 'Current password is wrong')
  if (result === 'too_short') fail(422, 'password_too_short', 'The new password needs at least 12 characters')
  setResponseStatus(event, 204)
})
