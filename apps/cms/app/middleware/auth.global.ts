// Signed out -> /login. Temporary password -> /password until it is replaced.
export default defineNuxtRouteMiddleware(async (to) => {
  const { me, refresh } = useAuth()
  const user = me.value ?? await refresh()
  if (!user) return to.path === '/login' ? undefined : navigateTo('/login')
  if (to.path === '/login') return navigateTo('/')
  if (user.mustChangePassword && to.path !== '/password') return navigateTo('/password')
})
