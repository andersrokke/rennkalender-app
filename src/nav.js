// The bottom bar has four slots but the app has five or six tabs, so the
// mapping between them is explicit rather than implied by the pane state.
// Keeping it here makes it testable without rendering the whole app.

// Which tab a bottom-bar button should open. 'map' and 'filter' never change
// the tab — they switch the pane or open the filter sheet.
export function tabForNav(key, { isParent = false } = {}) {
  // «Min plan» is no longer its own tab: the plan lives inside «Min sesong»,
  // and a guardian's equivalent is «Mine barn».
  if (key === 'plan') return isParent ? 'children' : 'mine'
  if (key === 'list') return 'races'
  return null
}

// Which bottom-bar button should read as active for a given tab and pane.
export function navForState(activeTab, pane, { isParent = false } = {}) {
  if (pane === 'map') return 'map'
  if (activeTab === 'mine' || activeTab === 'next' || activeTab === 'training'
    || (isParent && activeTab === 'children')) return 'plan'
  return 'list'
}

// Hvem man er i appen akkurat nå. Rollen bestemmer, og bare den: å eie et lag
// gjør ingen til trener i en annen modus. Basen følger samme regel -
// is_coach_of krever rollen trener i tillegg til eierskapet.
export function rolleFlagg(profile) {
  return { isCoach: profile.role === 'coach', isParent: profile.role === 'parent' }
}

// Fanene for en profil, som nøkler. En forelder ser barna sine, rennkalenderen
// og profilen - aldri trenerens eller løperens skjermer, uansett hva kontoen
// ellers eier. Administratorfanen kommer i tillegg, først når man ikke har lag.
export function fanerFor(profile, harLag) {
  const { isCoach, isParent } = rolleFlagg(profile)
  const base = isParent
    ? ['children', 'pamelding', 'kidraces', 'kiddev', 'races', 'settings', 'feedback']
    : isCoach
      ? ['training', 'season', 'matrix', 'athletes', 'races', 'dev', 'settings', 'feedback']
      : ['training', 'next', 'mine', 'races', 'dev', 'steder', 'settings', 'feedback']
  if (!profile.is_admin) return base
  return harLag ? [...base, 'admin'] : ['admin', ...base]
}
