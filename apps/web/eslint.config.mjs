import withNuxt from './.nuxt/eslint.config.mjs'

// Nuxt routes and layouts are named by file (index, guest, admin).
export default withNuxt({
  files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue'],
  rules: { 'vue/multi-word-component-names': 'off' }
})
