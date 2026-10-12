<script setup lang="ts">
defineProps<{ slug: string, langs: string[], current: string }>()
</script>

<template>
  <nav v-if="langs.length > 1" aria-label="Language" class="flex gap-1">
    <NuxtLink
      v-for="l in langs"
      :key="l"
      :to="`/r/${slug}/${l}`"
      :aria-current="l === current ? 'true' : undefined"
      class="min-h-11 min-w-11 inline-flex items-center justify-center rounded-card px-2 text-sm font-medium uppercase"
      :class="l === current ? 'bg-brand text-white' : 'text-ink/70 hover:bg-ink/5'"
    >
      {{ l }}
    </NuxtLink>
  </nav>
</template>
