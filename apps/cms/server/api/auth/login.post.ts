export default defineEventHandler(async (event) => {
  const { email, password } = await readStrings(event, 'email', 'password')
  const ip = getRequestHeader(event, 'cf-connecting-ip') ?? ''
  const result = await authService(event).login(email, password, ip)
  if (!result.ok) {
    if (result.reason === 'throttled') fail(429, 'rate_limited', 'Too many attempts. Try again in 15 minutes.')
    fail(401, 'invalid_credentials', 'Wrong email or password')
  }
  setSessionCookie(event, result.token, result.maxAge)
  setResponseStatus(event, 204)
})
