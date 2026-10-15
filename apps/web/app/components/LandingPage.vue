<script setup lang="ts">
import { landing } from '~/content/landing'

const props = defineProps<{ lang: 'en' | 'pt' }>()
const c = landing[props.lang]
const { site } = useAppConfig()

useHead({ htmlAttrs: { lang: c.htmlLang } })
useSeoMeta({
  title: `${site.name}: ${c.title}`,
  description: c.description,
  ogTitle: `${site.name}: ${c.title}`,
  ogDescription: c.description
})
const mailto = `mailto:${site.email}?subject=${encodeURIComponent(`${site.name}: ${c.getMenu}`)}`
const button = 'min-h-11 inline-flex items-center rounded-card px-5 font-semibold'
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pb-16">
    <header class="flex items-center justify-between py-4">
      <span class="text-lg font-bold text-brand">{{ site.name }}</span>
      <NuxtLink :to="c.otherLang.to" class="min-h-11 inline-flex items-center px-2 text-sm underline">
        {{ c.otherLang.label }}
      </NuxtLink>
    </header>

    <main>
      <section class="py-12">
        <h1 class="text-4xl font-bold">
          {{ c.heroTitle }}
        </h1>
        <p class="mt-4 text-lg text-ink/80">
          {{ c.heroText }}
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <NuxtLink to="/r/demo" :class="[button, 'bg-brand text-white']">
            {{ c.seeDemo }}
          </NuxtLink>
          <a :href="mailto" :class="[button, 'border border-ink/20']">{{ c.getMenu }}</a>
        </div>
      </section>

      <section class="py-8">
        <h2 class="text-2xl font-semibold">
          {{ c.howTitle }}
        </h2>
        <ol class="mt-4 grid gap-4 sm:grid-cols-3">
          <li v-for="(s, i) in c.steps" :key="s.title" class="rounded-card border border-ink/10 p-4">
            <span class="text-sm font-semibold text-brand">{{ i + 1 }}</span>
            <h3 class="font-semibold">
              {{ s.title }}
            </h3>
            <p class="text-sm text-ink/70">
              {{ s.text }}
            </p>
          </li>
        </ol>
      </section>

      <section class="py-8">
        <h2 class="text-2xl font-semibold">
          {{ c.featuresTitle }}
        </h2>
        <ul class="mt-4 space-y-2">
          <li v-for="f in c.features" :key="f" class="flex gap-2">
            <Icon name="i-lucide-check" class="mt-1 size-4 shrink-0 text-brand" />
            <span>{{ f }}</span>
          </li>
        </ul>
      </section>

      <section class="py-8">
        <h2 class="text-2xl font-semibold">
          {{ c.notTitle }}
        </h2>
        <p class="mt-2 text-ink/80">
          {{ c.notText }}
        </p>
      </section>

      <section class="my-8 rounded-card border border-ink/10 p-6">
        <h2 class="text-2xl font-semibold">
          {{ c.demoTitle }}
        </h2>
        <p class="mt-2 text-ink/80">
          {{ c.demoText }}
        </p>
        <NuxtLink to="/r/demo" :class="[button, 'mt-4 bg-brand text-white']">
          {{ c.seeDemo }}
        </NuxtLink>
      </section>

      <section class="py-8">
        <h2 class="text-2xl font-semibold">
          {{ c.contactTitle }}
        </h2>
        <p class="mt-2 text-ink/80">
          {{ c.contactText }}
        </p>
        <a :href="mailto" :class="[button, 'mt-4 border border-ink/20']">{{ site.email }}</a>
      </section>
    </main>

    <footer class="border-t border-ink/10 pt-6 text-sm text-ink/60">
      {{ site.name }}
    </footer>
  </div>
</template>
