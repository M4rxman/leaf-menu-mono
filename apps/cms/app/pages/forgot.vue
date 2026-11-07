<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const email = ref('')
const error = ref('')
const sent = ref(false)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/forgot', { method: 'POST', body: { email: email.value } })
    sent.value = true
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
        Reset your password
      </h1>
    </template>
    <UAlert
      v-if="sent" color="success" variant="subtle" role="status"
      description="If that email has an account, a reset link is on its way. It works for 30 minutes."
    />
    <UForm v-else :state="{ email }" class="space-y-4" @submit="submit">
      <UFormField label="Email" name="email">
        <UInput v-model="email" type="email" autocomplete="username" required class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
      <UButton type="submit" block :loading="busy">
        Send reset link
      </UButton>
    </UForm>
    <p class="mt-4 text-center text-sm">
      <ULink to="/login">
        Back to sign in
      </ULink>
    </p>
  </UCard>
</template>
