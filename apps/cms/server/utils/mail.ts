import type { H3Event } from 'h3'

/** The reset page. The token sits in the URL fragment: browsers never send it to a server or in a Referer header. */
export function resetLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/admin/reset#token=${encodeURIComponent(token)}`
}

/** Runs after the response, so the answer takes the same time whether or not a mail is sent. Failures are logged without the message. */
export function sendAfterResponse(event: H3Event, job: () => Promise<void>) {
  const run = job().catch(e => console.error('mail failed:', (e as { code?: string }).code ?? 'unknown'))
  const wait = (event.context.cloudflare as { context?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined)?.context?.waitUntil
  if (wait) wait.call((event.context.cloudflare as { context: object }).context, run)
}

export const resetMail = (link: string) => ({
  subject: 'Reset your Chilly Menu password',
  text: `Someone asked to reset the password for this account.\n\nOpen this link within 30 minutes to choose a new one:\n${link}\n\nIf it was not you, ignore this email: nothing changes and the link stops working.`
})

export const changedMail = () => ({
  subject: 'Your Chilly Menu password was changed',
  text: 'The password for your account was just changed and every session was signed out.\n\nIf it was not you, ask the Chilly Menu admin to reset your account now.'
})

/** Queues the reset link mail. Without config it logs and sends nothing; the caller answers the same either way. */
export function queueResetMail(event: H3Event, to: { email: string, token: string }) {
  const base = publicBaseUrl(event)
  const mail = mailer(event)
  if (!base || !mail) return console.error('password reset requested but mail is not configured (PUBLIC_BASE_URL, EMAIL + MAIL_FROM)')
  sendAfterResponse(event, () => mail.send({ to: to.email, ...resetMail(resetLink(base, to.token)) }))
}

export function queueChangedMail(event: H3Event, email: string) {
  const mail = mailer(event)
  if (mail) sendAfterResponse(event, () => mail.send({ to: email, ...changedMail() }))
}
