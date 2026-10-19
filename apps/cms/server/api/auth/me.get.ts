export default defineEventHandler((event) => {
  const { id, email, role, restaurantId, mustChangePassword } = requireUser(event)
  return { id, email, role, restaurantId, mustChangePassword }
})
