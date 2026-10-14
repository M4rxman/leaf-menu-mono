<script setup lang="ts">
import type { DishView } from '../../server/domain/types'

defineProps<{ dish: DishView }>()
</script>

<template>
  <article class="flex gap-3 rounded-card border border-ink/10 p-3" :class="{ 'opacity-60': dish.isSoldOut }">
    <div
      class="flex size-20 shrink-0 items-center justify-center rounded-card bg-ink/5 text-ink/30"
      role="img"
      :aria-label="dish.photoAlt || dish.name"
    >
      <Icon name="i-lucide-utensils" class="size-6" />
    </div>
    <div class="min-w-0 flex-1">
      <h3 class="font-semibold" :lang="dish.nameLang">
        {{ dish.name }}
      </h3>
      <p v-if="dish.description" class="text-sm text-ink/70" :lang="dish.descriptionLang">
        {{ dish.description }}
      </p>
      <p class="mt-1 font-medium">
        {{ dish.price }}
        <span v-if="dish.isSoldOut" class="ms-2 text-sm font-normal text-ink/70">{{ $t('guest.soldOut') }}</span>
      </p>
    </div>
    <!-- Display only for now; the interactive LikeButton comes with the likes API. -->
    <div class="flex items-start gap-1 text-sm text-ink/70" :aria-label="$t('guest.likes', dish.likes)">
      <Icon name="i-lucide-heart" class="size-4" />
      <span>{{ dish.likes }}</span>
    </div>
  </article>
</template>
