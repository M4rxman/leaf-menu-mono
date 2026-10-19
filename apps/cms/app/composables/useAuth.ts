interface Me {
  id: number
  email: string
  role: 'admin' | 'owner'
  restaurantId: number | null
  mustChangePassword: boolean
}

/** The server's `{ error: { code, message } }` body, as ofetch hands it over. */
export const apiMessage = (e: unknown, fallback = 'Something went wrong') =>
  (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? fallback

export function useAuth() {
  const me = useState<Me | null>('me', () => null)

  async function refresh() {
    me.value = await $fetch<Me>('/api/auth/me').catch(() => null)
    return me.value
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    me.value = null
    await navigateTo('/login')
  }

  return { me, refresh, logout }
}
