// Theme is stored on the profile; the attribute drives the palette in styles.css.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
}
// Det nye utseendet er et forsøk som slås på per nettleser: åpne appen med
// ?look=ny for å se det, ?look=gammel for å gå tilbake. Valget huskes i
// nettleseren. Uten valg ser alle det vanlige utseendet.
export function applyLook() {
  let look = null
  try {
    const valg = new URLSearchParams(location.search).get('look')
    if (valg === 'ny' || valg === 'gammel') localStorage.setItem('rk-look', valg)
    look = localStorage.getItem('rk-look')
  } catch { /* privat vindu uten lagring: da gjelder det vanlige utseendet */ }
  if (look === 'ny') document.documentElement.dataset.look = 'ny'
  else delete document.documentElement.dataset.look
}
export function applyLang(lang) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'no'
}

// The filter sheet is tracked on <html> only, so every caller (the mobile tab
// bar, the sheet's own "Ferdig" button, the resize handler) agrees on state.
export function setSheet(on) {
  document.documentElement.dataset.sheet = on ? 'on' : 'off'
}
