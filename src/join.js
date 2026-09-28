// Lagkoden fra en delt lenke: /?lag=9f3de3b9f0bd
//
// Den legges i localStorage med én gang siden går opp, ikke først når
// onboardingen trenger den. Grunnen er Google-innlogging: da forlater
// nettleseren siden og kommer tilbake på origin uten spørringen, og koden
// ville vært borte. Nå overlever den turen.

const NOKKEL = 'rk-lagkode'

export function fangLagkode() {
  let kode = ''
  try { kode = new URLSearchParams(location.search).get('lag') || '' } catch { /* ingen URL */ }
  if (!kode) return hentLagkode()
  try { localStorage.setItem(NOKKEL, kode) } catch { /* privat vindu */ }
  // Koden ut av adresselinja: den hører ikke hjemme i historikken eller i en
  // skjermdeling, og den er tatt vare på nå.
  try { history.replaceState(null, '', location.pathname) } catch { /* ignorert */ }
  return kode
}

export function hentLagkode() {
  try { return localStorage.getItem(NOKKEL) || '' } catch { return '' }
}

export function glemLagkode() {
  try { localStorage.removeItem(NOKKEL) } catch { /* ignorert */ }
}
