import type { H3Event } from 'h3'

/**
 * The URL the client really requested. On Workers that is `request.url`. Nitro's own `getRequestURL` only knows
 * https if Cloudflare sends `x-forwarded-proto` (its request shim compares the protocol to 'https' while the Workers
 * entry passes 'https:'), which would make the Origin check reject every like and drop the cookie's Secure flag.
 * Falls back to `getRequestURL` under `nuxt dev`, where there is no Workers request.
 */
export function siteUrl(event: H3Event): URL {
  const request = (event.context.cloudflare as { request?: { url: string } } | undefined)?.request
  return request ? new URL(request.url) : getRequestURL(event)
}
