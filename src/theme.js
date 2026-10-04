// Theme is stored on the profile; the attribute drives the palette in styles.css.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
}
// Utseendet. Det nye er standard for alle (satt på <html> i index.html, så
// siden ikke blinker i det gamle først). ?look=gammel henter tilbake det
// forrige i denne nettleseren, ?look=ny slår det nye på igjen.
export function applyLook() {
  let look = null
  try {
    const valg = new URLSearchParams(location.search).get('look')
    if (valg === 'ny' || valg === 'gammel') localStorage.setItem('rk-look', valg)
    look = localStorage.getItem('rk-look')
  } catch { /* privat vindu uten lagring: da gjelder standarden */ }
  if (look === 'gammel') delete document.documentElement.dataset.look
  else document.documentElement.dataset.look = 'ny'
}
export function applyLang(lang) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'no'
}

// The filter sheet is tracked on <html> only, so every caller (the mobile tab
// bar, the sheet's own "Ferdig" button, the resize handler) agrees on state.
export function setSheet(on) {
  document.documentElement.dataset.sheet = on ? 'on' : 'off'
}
