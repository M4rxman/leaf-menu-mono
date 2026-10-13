<script setup lang="ts">
import { menuPath } from '#shared/paths'
import { uiLocale } from '#shared/langs'

definePageMeta({ layout: 'guest', key: route => route.fullPath }) // refetch when the language changes

const route = useRoute()
const slug = route.params.slug as string
const lang = route.params.lang as string

const { data, error } = await useFetch(`/api/menu/${slug}`, { query: { lang } })
if (error.value) throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: 'Menu not found', fatal: true })
if (data.value?.kind === 'redirect') {
  await navigateTo(menuPath(data.value.slug, data.value.lang), { redirectCode: data.value.permanent ? 301 : 302 })
}
const menu = computed(() => (data.value?.kind === 'ok' ? data.value.menu : null))

// Chrome language: the guest's language if we ship a file for it, else English (falls back on its own).
if (menu.value) await useI18n().setLocale(uiLocale(menu.value.lang))

useHead(() => ({ htmlAttrs: { lang: menu.value?.lang, dir: menu.value?.dir }, title: menu.value?.name }))
const info = computed(() => menu.value?.info as { address?: string, tagline?: string } | undefined)
</script>

<template>
  <main v-if="menu" class="mx-auto max-w-2xl pb-16">
    <header class="px-4 pt-6">
      <div class="flex items-start justify-between gap-2">
        <h1 class="text-2xl font-bold">
          {{ menu.name }}
        </h1>
        <LangSwitch :slug="menu.slug" :langs="menu.langs" :current="menu.lang" />
      </div>
      <p v-if="info?.tagline" class="text-ink/70">
        {{ info.tagline }}
      </p>
      <p v-if="menu.about" class="mt-2 text-sm">
        {{ menu.about }}
      </p>
      <p v-if="info?.address" class="mt-2 flex items-center gap-1 text-sm text-ink/70">
        <Icon name="i-lucide-map-pin" class="size-4" /> {{ info.address }}
      </p>
    </header>

    <CategoryTabs :categories="menu.categories" class="mt-4" />

    <section v-for="c in menu.categories" :id="`cat-${c.id}`" :key="c.id" class="scroll-mt-14 px-4 pt-6">
      <h2 class="mb-3 text-xl font-semibold">
        {{ c.name }}
      </h2>
      <div v-if="c.dishes.length" class="space-y-3">
        <DishCard v-for="d in c.dishes" :key="d.id" :dish="d" />
      </div>
    </section>
  </main>
</template>
