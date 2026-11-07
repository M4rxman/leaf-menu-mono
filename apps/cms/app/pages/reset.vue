<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// The link carries the token in the #fragment (never sent to a server). Take it and clear the address bar.
const token = ref(new URLSearchParams(location.hash.slice(1)).get('token') ?? '')
if (token.value) history.replaceState(null, '', location.pathname + location.search)

const next = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset', { method: 'POST', body: { token: token.value, next: next.value } })
    useAuth().me.value = null
    await navigateTo('/login?reset=1')
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
        Choose a new password
      </h1>
    </template>
    <UAlert
      v-if="!token" color="error" variant="subtle" role="alert"
      description="This link is incomplete. Ask for a new one."
    />
    <UForm v-else :state="{ next }" class="space-y-4" @submit="submit">
      <UFormField label="New password" name="next" hint="At least 12 characters">
        <UInput v-model="next" type="password" autocomplete="new-password" minlength="12" required class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
      <UButton type="submit" block :loading="busy">
        Set password
      </UButton>
    </UForm>
    <p class="mt-4 text-center text-sm">
      <ULink to="/forgot">
        Ask for a new link
      </ULink>
    </p>
  </UCard>
</template>
