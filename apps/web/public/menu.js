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
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const pressed = form.querySelector('button').getAttribute('aria-pressed') === 'true'
      fetch(form.action, { method: pressed ? 'DELETE' : 'PUT', credentials: 'same-origin' })
        .then(r => (r.ok ? r.json() : Promise.reject(r)))
        .then(d => paint(form, d.liked, d.count))
        .catch(() => form.submit()) // let the server answer (429 page, etc.)
    })
  }
})()
