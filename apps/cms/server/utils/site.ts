import type { H3Event } from 'h3'

/**
 * The URL the client really requested. On Workers that is `request.url`; Nitro's `getRequestURL` can report http
 * behind Cloudflare (same reason as apps/web/server/utils/site.ts). Falls back to it under `nuxt dev`.
 */
export function siteUrl(event: H3Event): URL {
  const request = (event.context.cloudflare as { request?: { url: string } } | undefined)?.request
  return request ? new URL(request.url) : getRequestURL(event)
}
