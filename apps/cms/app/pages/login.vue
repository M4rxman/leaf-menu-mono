<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { refresh } = useAuth()
const state = reactive({ email: '', password: '' })
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: state })
    await refresh()
    await navigateTo('/')
  }
  catch (e) {
    error.value = apiMessage(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard class="mx-auto mt-16 max-w-sm">
    <template #header>
      <h1 class="text-lg font-semibold">
        Sign in
      </h1>
    </template>
    <UForm :state class="space-y-4" @submit="submit">
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="username" required class="w-full" />
      </UFormField>
      <UFormField label="Password" name="password">
        <UInput v-model="state.password" type="password" autocomplete="current-password" required class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
      <UButton type="submit" block :loading="busy">
        Sign in
      </UButton>
    </UForm>
  </UCard>
</template>
