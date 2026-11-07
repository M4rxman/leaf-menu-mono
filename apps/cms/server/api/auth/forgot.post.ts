// Same 204 for a known and an unknown email; only the throttle answers differently, and it is keyed on the input.
export default defineEventHandler(async (event) => {
  const { email } = await readStrings(event, 'email')
  const ip = getRequestHeader(event, 'cf-connecting-ip') ?? ''
  const result = await authService(event).requestReset(email, ip)
  if (result === 'throttled') fail(429, 'rate_limited', 'Too many attempts. Try again in 15 minutes.')
  if (result) queueResetMail(event, result)
  setResponseStatus(event, 204)
})
