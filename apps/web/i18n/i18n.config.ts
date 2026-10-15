import { ukPlural } from '@chilly/shared/plural'

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  // Chrome falls back to English for languages we have no file for; that is expected, not a warning.
  missingWarn: false,
  fallbackWarn: false,
  pluralRules: { uk: (choice: number) => ukPlural(choice) }
}))
