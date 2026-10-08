// Hvor står løper og trener om et renn? Samme svar vises til trener, løper og
// forelder, så ingen må gjette hva den andre mener.
//
//   rad: { status, assigned, answered }
//     status   - løperens valg: wish | planned | entered | unavailable | null
//     assigned - treneren har satt løperen opp
//     answered - løperen har selv svart (en tildeling alene er ikke et svar)
//     declined - treneren har sagt nei
export const AVTALER = ['venterTrener', 'venterLoper', 'avtalt', 'pameldt', 'trenerNei', 'kanIkke']

export function avtale(r) {
  if (!r || (r.status == null && !r.assigned && !r.declined)) return 'ingen'
  if (r.status === 'unavailable') return 'kanIkke'
  if (r.status === 'entered') return 'pameldt'
  if (r.declined) return 'trenerNei'
  if (r.assigned) return r.answered ? 'avtalt' : 'venterLoper'
  return r.status ? 'venterTrener' : 'ingen'
}

// En rad rett fra athlete_races, slik løper og forelder leser den.
export const avtaleFraRad = ar => avtale(ar && { status: ar.status, assigned: !!ar.assigned_by, answered: !!ar.answered_at, declined: !!ar.coach_declined_at })

// Hvem må gjøre noe nå?
export const venterPa = kode => kode === 'venterTrener' ? 'trener' : kode === 'venterLoper' ? 'loper' : null
