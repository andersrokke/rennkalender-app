// Theme is stored on the profile; the attribute drives the palette in styles.css.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
}
export function applyLang(lang) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'no'
}

// The filter sheet is tracked on <html> only, so every caller (the mobile tab
// bar, the sheet's own "Ferdig" button, the resize handler) agrees on state.
export function setSheet(on) {
  document.documentElement.dataset.sheet = on ? 'on' : 'off'
}
