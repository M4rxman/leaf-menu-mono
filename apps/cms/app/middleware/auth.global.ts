// Signed out -> /login (/forgot and /reset are open). Temporary password -> /password until it is replaced.
const OPEN = ['/login', '/forgot', '/reset']

export default defineNuxtRouteMiddleware(async (to) => {
  const { me, refresh } = useAuth()
  const user = me.value ?? await refresh()
  if (!user) return OPEN.includes(to.path) ? undefined : navigateTo('/login')
  if (to.path === '/reset') return
  if (to.path === '/login') return navigateTo('/')
  if (user.mustChangePassword && to.path !== '/password') return navigateTo('/password')
})
