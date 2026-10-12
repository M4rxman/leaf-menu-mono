<script setup lang="ts">
definePageMeta({ layout: 'guest' })
</script>

<template>
  <main class="p-6">
    <h1 class="text-2xl font-semibold">
      Leaf Menu
    </h1>
    <p class="text-ink/70">
      Menus live at /r/{slug}. Try <NuxtLink class="text-brand underline" to="/r/demo">/r/demo</NuxtLink>.
    </p>
  </main>
</template>
