<script setup lang="ts">
import { menuPath } from '@chilly/shared/paths'
import { languageName } from '@chilly/shared/langs'

defineProps<{ slug: string, langs: string[], current: string }>()
</script>

<template>
  <nav v-if="langs.length > 1" :aria-label="$t('guest.language')" class="flex flex-wrap gap-1">
    <a
      v-for="l in langs"
      :key="l"
      :href="menuPath(slug, l)"
      :lang="l"
      :hreflang="l"
      :aria-current="l === current ? 'true' : undefined"
      class="min-h-11 inline-flex items-center justify-center rounded-card px-3 text-sm font-medium"
      :class="l === current ? 'bg-brand text-white' : 'text-ink/70 hover:bg-ink/5'"
    >
      {{ languageName(l) }}
    </a>
  </nav>
</template>
