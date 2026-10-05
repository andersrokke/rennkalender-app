// The bottom bar has four slots but the app has five or six tabs, so the
// mapping between them is explicit rather than implied by the pane state.
// Keeping it here makes it testable without rendering the whole app.

// Which tab a bottom-bar button should open. 'map' and 'filter' never change
// the tab — they switch the pane or open the filter sheet.
export function tabForNav(key, { isParent = false } = {}) {
  // «Min plan» is no longer its own tab: the plan lives inside «Min sesong»,
  // and a guardian's equivalent is «Mine barn».
  if (key === 'plan') return isParent ? 'children' : 'mine'
  // Kart og filtre hører til rennkalenderen. Før byttet de ikke fane, så fra
  // «Neste renn» eller «Min utvikling» skjedde det ingenting når man trykket.
  if (key === 'list' || key === 'map' || key === 'filter') return 'races'
  return null
}

// Which bottom-bar button should read as active for a given tab and pane.
export function navForState(activeTab, pane, { isParent = false } = {}) {
  if (pane === 'map' && activeTab === 'races') return 'map'
  if (activeTab === 'mine' || activeTab === 'next' || activeTab === 'training'
    || (isParent && (activeTab === 'children' || activeTab === 'kidnext'))) return 'plan'
  return 'list'
}

// Hvem man er i appen akkurat nå. Rollen bestemmer, og bare den: å eie et lag
// gjør ingen til trener i en annen modus. Basen følger samme regel -
// is_coach_of krever rollen trener i tillegg til eierskapet.
export function rolleFlagg(profile) {
  return { isCoach: profile.role === 'coach', isParent: profile.role === 'parent' }
}

// Menyen for en profil, delt i grupper. Rekkefølgen følger arbeidet: først
// hjem, så rennene, så trening og utvikling, og kontoen til slutt.
// En forelder ser barna sine, rennkalenderen og profilen - aldri trenerens
// eller løperens skjermer, uansett hva kontoen ellers eier.
export function menyGrupper(profile) {
  const { isCoach, isParent } = rolleFlagg(profile)
  const konto = ['settings', 'feedback', ...(profile.is_admin ? ['admin'] : [])]
  if (isParent) return [
    { k: null, faner: ['kidnext'] },
    { k: 'renn', faner: ['children', 'pamelding', 'races'] },
    { k: 'utvikling', faner: ['kiddev'] },
    { k: 'konto', faner: konto }]
  if (isCoach) return [
    { k: null, faner: ['home'] },
    { k: 'renn', faner: ['races', 'matrix', 'season'] },
    { k: 'laget', faner: ['athletes', 'training', 'dev'] },
    { k: 'konto', faner: konto }]
  return [
    { k: null, faner: ['next'] },
    { k: 'renn', faner: ['mine', 'races'] },
    { k: 'utvikling', faner: ['training', 'dev'] },
    { k: 'konto', faner: konto }]
}

// Fanene som en flat liste. Den første er hjem.
export function fanerFor(profile) {
  return menyGrupper(profile).flatMap(g => g.faner)
}

// Fanen man lander på, og den «Hjem» tar deg til. En administrator uten lag
// har ikke noe eget å se, og lander på administrasjonen.
export function startFane(profile, harLag) {
  if (profile.is_admin && !harLag) return 'admin'
  return fanerFor(profile)[0]
}
export const hjemFane = profile => fanerFor(profile)[0]
