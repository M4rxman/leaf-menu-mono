import type { H3Event } from 'h3'
import { newDeviceId, signDevice, verifyDevice } from '@chilly/shared/domain/device'

const COOKIE = 'chilly_device'

/** The device id from a valid signed cookie, else null. Never sets anything. */
export async function readDevice(event: H3Event): Promise<string | null> {
  return verifyDevice(getCookie(event, COOKIE), deviceSecret(event))
}

/** Existing device id, or a new one with its cookie set. Call only when the guest actually likes something. */
export async function ensureDevice(event: H3Event): Promise<string> {
  const existing = await readDevice(event)
  if (existing) return existing
  const id = newDeviceId()
  setCookie(event, COOKIE, await signDevice(id, deviceSecret(event)), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 31536000, path: '/'
  })
  return id
}
