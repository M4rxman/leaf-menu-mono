<script setup lang="ts">
defineProps<{ categories: { id: number, name: string }[] }>()
</script>

<template>
  <nav :aria-label="$t('guest.categories')" class="sticky top-0 z-10 overflow-x-auto bg-surface/95 backdrop-blur">
    <ul class="flex gap-2 px-4 py-2">
      <li v-for="c in categories" :key="c.id">
        <a
          :href="`#cat-${c.id}`"
          class="min-h-11 inline-flex items-center whitespace-nowrap rounded-card px-3 text-sm font-medium text-ink/80 hover:bg-ink/5"
        >{{ c.name }}</a>
      </li>
    </ul>
  </nav>
</template>
