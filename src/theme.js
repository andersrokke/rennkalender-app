// Theme is stored on the profile; the attribute drives the palette in styles.css.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
}
export function applyLang(lang) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'no'
}
