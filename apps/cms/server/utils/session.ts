import type { H3Event } from 'h3'
import type { AuthUser } from '@chilly/shared/domain/ports'

const COOKIE = '__Host-session'

declare module 'h3' {
  interface H3EventContext {
    user?: AuthUser
    sessionToken?: string
  }
}

/** Throws an API error; server/error-handler.ts turns it into the plan §8 body `{ error: { code, message } }`. */
export function fail(statusCode: number, code: string, message: string): never {
  throw createError({ statusCode, statusMessage: code, message, data: { error: { code, message } } })
}

export function setSessionCookie(event: H3Event, token: string, maxAge: number) {
  setCookie(event, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge })
}

export const clearSessionCookie = (event: H3Event) => deleteCookie(event, COOKIE, { path: '/', secure: true })

export const sessionToken = (event: H3Event) => getCookie(event, COOKIE)

export function requireUser(event: H3Event): AuthUser {
  return event.context.user ?? fail(401, 'unauthenticated', 'Sign in first')
}

/** For data routes: signed in and not stuck on the temporary password. */
export function requireReadyUser(event: H3Event): AuthUser {
  const user = requireUser(event)
  if (user.mustChangePassword) fail(403, 'password_change_required', 'Change your password first')
  return user
}

/** Reads a JSON body as an object of strings; anything else is a 400. */
export async function readStrings<K extends string>(event: H3Event, ...keys: K[]): Promise<Record<K, string>> {
  const body = await readBody(event).catch(() => null)
  const out = {} as Record<K, string>
  for (const k of keys) {
    const v = (body as Record<string, unknown> | null)?.[k]
    if (typeof v !== 'string' || v.length > 1000) fail(400, 'validation_failed', `${k} is required`)
    out[k] = v
  }
  return out
}
