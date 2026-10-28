// Auth responses (session state, errors, Set-Cookie) must never sit in a browser, proxy or CDN cache.
export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/')) setResponseHeader(event, 'cache-control', 'no-store')
})
