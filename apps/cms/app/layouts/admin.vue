<script setup lang="ts">
const { me, logout } = useAuth()
</script>

<template>
  <div>
    <header v-if="me" class="flex items-center justify-between gap-3 border-b border-default px-4 py-2">
      <NuxtLink to="/" class="font-semibold">
        Chilly Menu
      </NuxtLink>
      <nav class="flex items-center gap-2">
        <span class="hidden text-sm text-muted sm:inline">{{ me.email }}</span>
        <UButton to="/password" variant="ghost" color="neutral" size="sm">
          Password
        </UButton>
        <UButton variant="outline" color="neutral" size="sm" @click="logout">
          Sign out
        </UButton>
      </nav>
    </header>
    <main class="mx-auto max-w-3xl p-6">
      <slot />
    </main>
  </div>
</template>
