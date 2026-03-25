import i18n from '@/i18n'

const I18N_PREFIX = 'i18n:'

export function resolveI18nText(value: string, options?: Record<string, unknown>): string {
  if (!value.startsWith(I18N_PREFIX)) return value
  const key = value.slice(I18N_PREFIX.length)
  return options ? i18n.t(key, options) : i18n.t(key)
}
