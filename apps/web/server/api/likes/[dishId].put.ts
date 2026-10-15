export default defineEventHandler(async (event) => {
  const { result, error } = await applyLike(event, true)
  return error ?? { dishId: result!.dishId, liked: result!.liked, count: result!.count }
})
