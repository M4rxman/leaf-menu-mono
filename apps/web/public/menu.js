// Hearts only (plan §4). The page works without this: each ♡ is a form post that redirects back.
(() => {
  const root = document.querySelector('[data-likes-url]')
  if (!root) return
  const forms = [...document.querySelectorAll('form[data-heart]')]

  const paint = (form, liked, count) => {
    form.querySelector('button').setAttribute('aria-pressed', String(liked))
    form.elements.liked.value = liked ? '0' : '1'
    if (count != null) form.querySelector('[data-count]').textContent = count
  }

  fetch(root.dataset.likesUrl, { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .then((s) => {
      if (!s) return
      const liked = new Set(s.liked)
      for (const f of forms) paint(f, liked.has(Number(f.dataset.dish)), s.counts[f.dataset.dish])
    })
    .catch(() => {})

  for (const form of forms) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const pressed = form.querySelector('button').getAttribute('aria-pressed') === 'true'
      let res
      try {
        res = await fetch(form.action, { method: pressed ? 'DELETE' : 'PUT', credentials: 'same-origin' })
      } catch {
        return form.submit() // network error: let the browser try the form post
      }
      // 429 / 404: keep the current state and the scroll position.
      if (res.ok) {
        const d = await res.json()
        paint(form, d.liked, d.count)
      }
    })
  }
})()
