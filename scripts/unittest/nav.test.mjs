// Fanelogikken, testet uten å tegne appen. Kjøres med: npm run test:unit
//
// Finnes fordi modusbyttet en gang bare byttet en etikett: en administrator
// som eide et lag og valgte «forelder», fikk trenerens faner likevel.
import { fanerFor, startFane, rolleFlagg, tabForNav, navForState } from '../../src/nav.js'

let feil = 0
const lik = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }
const TRENER = ['races', 'matrix', 'season', 'athletes', 'training', 'dev', 'favoritter', 'settings', 'feedback']
const LOPER = ['next', 'mine', 'races', 'training', 'dev', 'steder', 'favoritter', 'settings', 'feedback']
const FORELDER = ['kidnext', 'children', 'pamelding', 'kidraces', 'kiddev', 'races', 'settings', 'feedback']
const trenerfaner = ['season', 'matrix', 'athletes']

// Administratoren som eier et lag, i hver av de tre modusene.
const eier = rolle => ({ id: 'a', role: rolle, is_admin: true })
sjekk('admin som forelder: bare foreldrefaner pluss admin', lik(fanerFor(eier('parent'), true), [...FORELDER, 'admin']))
sjekk('admin som forelder: ingen trenerfaner, selv om hun eier et lag',
  !fanerFor(eier('parent'), true).some(f => trenerfaner.includes(f)))
sjekk('admin som forelder: ikke treningslogg, ikke egen sesong',
  !fanerFor(eier('parent'), true).some(f => ['training', 'next', 'mine', 'dev'].includes(f)))
sjekk('admin som løper: løperfaner pluss admin', lik(fanerFor(eier('athlete'), true), [...LOPER, 'admin']))
sjekk('admin som løper: ingen trenerfaner', !fanerFor(eier('athlete'), true).some(f => trenerfaner.includes(f)))
sjekk('admin som trener: trenerfaner pluss admin', lik(fanerFor(eier('coach'), true), [...TRENER, 'admin']))
sjekk('admin uten lag lander på admin', fanerFor(eier('parent'), false)[0] === 'admin')

sjekk('startfane: neste renn for løper og forelder',
  startFane({ role: 'athlete' }, true) === 'next' && startFane({ role: 'parent' }, false) === 'kidnext')
sjekk('startfane: trener lander på lagets sesong når laget har renn, ellers på alle renn',
  startFane({ role: 'coach' }, true, { lagetHarRenn: true }) === 'season' && startFane({ role: 'coach' }, true) === 'races')
sjekk('startfane: admin uten lag lander på admin', startFane(eier('parent'), false) === 'admin')
sjekk('trenerens meny følger arbeidet: alle renn, sesongoppsett, lagets sesong',
  lik(fanerFor({ role: 'coach' }, true).slice(0, 3), ['races', 'matrix', 'season']))

// Vanlige brukere.
sjekk('forelder uten admin: nøyaktig foreldrefanene', lik(fanerFor({ role: 'parent' }, false), FORELDER))
sjekk('løper: nøyaktig løperfanene', lik(fanerFor({ role: 'athlete' }, true), LOPER))
sjekk('trener: nøyaktig trenerfanene', lik(fanerFor({ role: 'coach' }, true), TRENER))
sjekk('ingen uten admin får admin-fanen', ['parent', 'athlete', 'coach'].every(r => !fanerFor({ role: r }, true).includes('admin')))
sjekk('rollen alene bestemmer flaggene', lik(rolleFlagg({ role: 'parent' }), { isCoach: false, isParent: true })
  && lik(rolleFlagg({ role: 'coach' }), { isCoach: true, isParent: false })
  && lik(rolleFlagg({ role: 'athlete' }), { isCoach: false, isParent: false }))

// Bunnmenyen på mobil: hver knapp må føre til en skjerm.
sjekk('kart og filtre tar deg til rennkalenderen', tabForNav('map') === 'races' && tabForNav('filter') === 'races' && tabForNav('list') === 'races')
sjekk('min plan: sesongen for løper og trener, barna for forelder', tabForNav('plan') === 'mine' && tabForNav('plan', { isParent: true }) === 'children')
sjekk('kart er bare markert når man står i rennkalenderen', navForState('races', 'map') === 'map' && navForState('next', 'map') !== 'map')

console.log(feil ? `\n${feil} FEILET` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
