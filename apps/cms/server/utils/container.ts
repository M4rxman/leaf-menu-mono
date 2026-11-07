import type { H3Event } from 'h3'
import { AuthService } from '@chilly/shared/domain/auth-service'
import { d1Db } from '@chilly/shared/infra/d1-db'
import type { D1Like } from '@chilly/shared/infra/d1-db'
import { D1AuthStore } from '@chilly/shared/infra/d1-auth-store'
import { CloudflareMailer, ConsoleMailer } from '@chilly/shared/infra/cf-mailer'
import type { SendEmailLike } from '@chilly/shared/infra/cf-mailer'
import type { Mailer } from '@chilly/shared/domain/ports'

interface Env {
  DB?: D1Like
  PASSWORD_PEPPER?: string
  EMAIL?: SendEmailLike
  MAIL_FROM?: string
  MAIL_LOG?: string
  /** Origin for links in mail (https://host). Config only: never derived from the Host header. */
  PUBLIC_BASE_URL?: string
}

// Composition root: the only place that knows about Cloudflare bindings.
const env = (event: H3Event) => (event.context.cloudflare?.env ?? {}) as Env

function db(event: H3Event) {
  const { DB } = env(event)
  if (!DB) throw createError({ statusCode: 500, statusMessage: 'D1 binding DB is missing' })
  return d1Db(DB)
}

function passwordPepper(event: H3Event): string {
  const { PASSWORD_PEPPER } = env(event)
  if (!PASSWORD_PEPPER) throw createError({ statusCode: 500, statusMessage: 'PASSWORD_PEPPER is missing (.dev.vars / wrangler secret)' })
  return PASSWORD_PEPPER
}

export const authService = (event: H3Event): AuthService => new AuthService(new D1AuthStore(db(event)), passwordPepper(event))

export const publicBaseUrl = (event: H3Event) => env(event).PUBLIC_BASE_URL

/** null = mail is not configured: the caller logs and sends nothing. */
export function mailer(event: H3Event): Mailer | null {
  const { EMAIL, MAIL_FROM, MAIL_LOG } = env(event)
  if (EMAIL && MAIL_FROM) return new CloudflareMailer(EMAIL, MAIL_FROM)
  return MAIL_LOG === '1' ? new ConsoleMailer() : null
}
