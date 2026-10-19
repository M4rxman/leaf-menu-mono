<script setup lang="ts">
// A form so ♡ works without JS (303 back to the dish). public/menu.js upgrades it to fetch.
// The HTML is identical for every visitor; menu.js sets the pressed state from /api/r/{slug}/likes.
defineProps<{ dish: { id: number, name: string, likes: number }, lang: string, liked?: boolean }>()
</script>

<template>
  <form method="post" :action="`/api/likes/${dish.id}`" data-heart class="flex items-start" :data-dish="dish.id">
    <input type="hidden" name="lang" :value="lang">
    <input type="hidden" name="liked" :value="liked ? '0' : '1'">
    <button
      type="submit"
      :aria-describedby="`likes-${dish.id}`"
      :aria-pressed="liked ? 'true' : 'false'"
      class="group inline-flex min-h-11 min-w-11 items-center justify-center rounded-card text-ink/70 hover:bg-ink/5 aria-pressed:text-brand"
    >
      <Icon name="i-lucide-heart" class="size-5 group-aria-pressed:fill-current" aria-hidden="true" />
      <span class="sr-only">{{ $t('guest.like', { name: dish.name }) }}</span>
    </button>
    <!-- Unit + number, linked to the button: announced as "Like X, pressed, Likes: 329". menu.js updates [data-count] only. -->
    <span :id="`likes-${dish.id}`" class="min-h-11 inline-flex items-center pe-1 text-sm text-ink/70" aria-live="polite">
      <span class="sr-only">{{ $t('guest.likes') }}:&nbsp;</span><span data-count>{{ dish.likes }}</span>
    </span>
  </form>
</template>
