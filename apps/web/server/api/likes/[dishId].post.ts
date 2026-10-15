import { canonicalLang } from '@chilly/shared/langs'
import { menuPath } from '@chilly/shared/paths'

// No-JS fallback: the ♡ form posts here and we redirect back to the dish.
export default defineEventHandler(async (event) => {
  const form = await readBody<{ liked?: string, lang?: string }>(event)
  const { result, error } = await applyLike(event, form?.liked === '1')
  if (error) return error
  const lang = canonicalLang(form?.lang ?? '') ?? undefined
  return sendRedirect(event, `${menuPath(result!.slug, lang)}#dish-${result!.dishId}`, 303)
})
