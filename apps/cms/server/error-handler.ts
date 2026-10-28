// fallow-ignore-file unused-file -- loaded by Nitro through nitro.errorHandler in nuxt.config.ts
import type { NitroErrorHandler } from 'nitropack'

/** Plan §8: every API error is `{ "error": { "code", "message" } }`, whoever threw it. Pages keep Nitro's own handling. */
const handler: NitroErrorHandler = async (error, event, { defaultHandler }) => {
  if (!event.path.startsWith('/api/')) {
    const res = await defaultHandler(error, event)
    setResponseStatus(event, res.status, res.statusText)
    setResponseHeaders(event, res.headers)
    return send(event, typeof res.body === 'string' ? res.body : JSON.stringify(res.body))
  }
  const status = error.statusCode || 500
  const body = (error.data as { error?: { code: string, message: string } } | undefined)?.error
    ?? { code: status >= 500 ? 'server_error' : `http_${status}`, message: status >= 500 ? 'Server error' : error.message }
  setResponseStatus(event, status)
  setResponseHeader(event, 'content-type', 'application/json')
  return send(event, JSON.stringify({ error: body }))
}

export default handler
