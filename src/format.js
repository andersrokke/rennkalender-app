// Number formatting that follows the interface language.
const LOCALE = { no: 'nb-NO', sv: 'sv-SE', en: 'en-GB' }
export const localeFor = lang => LOCALE[lang] || LOCALE.no

// FIS points and race points always carry exactly two decimals: 15 reads as
// 15,00 and 25.3 as 25,30, so values line up and none looks like a count.
export function fisPoints(v, lang, dash = '–') {
  if (v == null || v === '') return dash
  const n = Number(v)
  if (!Number.isFinite(n)) return dash
  return n.toLocaleString(localeFor(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Cup points are whole numbers and must not gain decimals.
export function wholeNumber(v, lang, dash = '') {
  if (v == null || v === '') return dash
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString(localeFor(lang), { maximumFractionDigits: 0 }) : dash
}

export const dateTime = (v, lang) =>
  new Date(v).toLocaleString(localeFor(lang), { dateStyle: 'short', timeStyle: 'short' })
