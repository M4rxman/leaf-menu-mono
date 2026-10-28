<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { me, refresh } = useAuth()
const state = reactive({ current: '', next: '' })
const error = ref('')
const done = ref(false)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/password', { method: 'POST', body: state })
    await refresh()
    done.value = true
    state.current = state.next = ''
    if (!me.value?.mustChangePassword) await navigateTo('/')
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
        Change password
      </h1>
    </template>
    <UAlert
      v-if="me?.mustChangePassword"
      class="mb-4"
      color="warning"
      variant="subtle"
      description="You are using a temporary password. Choose your own to continue."
    />
    <UForm :state class="space-y-4" @submit="submit">
      <UFormField label="Current password" name="current">
        <UInput v-model="state.current" type="password" autocomplete="current-password" required class="w-full" />
      </UFormField>
      <UFormField label="New password" name="next" help="At least 12 characters">
        <UInput v-model="state.next" type="password" autocomplete="new-password" required minlength="12" class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
      <UAlert v-if="done" color="success" variant="subtle" description="Password changed." role="status" />
      <UButton type="submit" block :loading="busy">
        Change password
      </UButton>
    </UForm>
  </UCard>
</template>
