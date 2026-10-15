<script setup lang="ts">
import { menuPath } from '@chilly/shared/paths'
import { uiLocale } from '@chilly/shared/langs'

definePageMeta({ layout: 'guest', key: route => route.fullPath })

const route = useRoute()
const slug = route.params.slug as string
const lang = route.params.lang as string

// Device-specific: forward the cookie to the API and never let anything cache the page.
const cacheControl = useResponseHeader('cache-control')
if (import.meta.server) cacheControl.value = 'private, no-store'
const { data, error } = await useFetch(`/api/menu/${slug}`, {
  query: { lang, favorites: '1' }, headers: useRequestHeaders(['cookie']), key: `favorites:${slug}:${lang}`
})
if (error.value) throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: 'Menu not found', fatal: true })
if (data.value?.kind === 'redirect') {
  await navigateTo(`${menuPath(data.value.slug, data.value.lang)}/favorites`, { redirectCode: data.value.permanent ? 301 : 302 })
}
const menu = computed(() => (data.value?.kind === 'ok' ? data.value.menu : null))
if (menu.value) await useI18n().setLocale(uiLocale(menu.value.lang))

useHead(() => ({
  htmlAttrs: { lang: menu.value?.lang, dir: menu.value?.dir },
  title: menu.value?.name,
  meta: [{ name: 'robots', content: 'noindex' }],
  script: [{ src: '/menu.js', defer: true }]
}))
</script>

<template>
  <main v-if="menu" class="mx-auto max-w-2xl px-4 pb-16 pt-6" :data-likes-url="`/api/r/${menu.slug}/likes`">
    <NuxtLink :to="menuPath(menu.slug, menu.lang)" class="min-h-11 inline-flex items-center gap-1 text-sm font-medium">
      <Icon name="i-lucide-arrow-left" class="size-4 rtl:rotate-180" /> {{ $t('guest.backToMenu') }}
    </NuxtLink>
    <h1 class="mb-3 text-2xl font-bold">
      {{ $t('guest.favorites') }}
    </h1>
    <p v-if="!menu.categories.length" class="text-ink/70">
      {{ $t('guest.noFavorites') }}
    </p>
    <section v-for="c in menu.categories" :key="c.id" class="pt-4">
      <h2 class="mb-3 text-xl font-semibold" :lang="c.nameLang">
        {{ c.name }}
      </h2>
      <div class="space-y-3">
        <DishCard v-for="d in c.dishes" :key="d.id" :dish="d" :lang="menu.lang" liked />
      </div>
    </section>
  </main>
</template>
