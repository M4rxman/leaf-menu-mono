// Per-device state for the menu script; the menu HTML itself is the same for everyone.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'private, no-store')
  return likeService(event).venueLikes(getRouterParam(event, 'slug') ?? '', await readDevice(event))
})
