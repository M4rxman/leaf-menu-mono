import { originAllowed } from '@chilly/shared/domain/guards'

// CSRF: every state-changing request must come from our own origin (plan §9).
export default defineEventHandler((event) => {
  if (!originAllowed(event.method, getRequestHeader(event, 'origin'), siteUrl(event).origin))
    fail(403, 'bad_origin', 'Requests must come from this site')
})
