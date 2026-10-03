// Fanelogikken, testet uten å tegne appen. Kjøres med: npm run test:unit
//
// Finnes fordi modusbyttet en gang bare byttet en etikett: en administrator
// som eide et lag og valgte «forelder», fikk trenerens faner likevel.
import { fanerFor, rolleFlagg } from '../../src/nav.js'

let feil = 0
const lik = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }
const TRENER = ['training', 'season', 'matrix', 'athletes', 'races', 'dev', 'settings', 'feedback']
const LOPER = ['training', 'next', 'mine', 'races', 'dev', 'settings', 'feedback']
const FORELDER = ['children', 'kidraces', 'kiddev', 'races', 'settings', 'feedback']
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

// Vanlige brukere.
sjekk('forelder uten admin: nøyaktig foreldrefanene', lik(fanerFor({ role: 'parent' }, false), FORELDER))
sjekk('løper: nøyaktig løperfanene', lik(fanerFor({ role: 'athlete' }, true), LOPER))
sjekk('trener: nøyaktig trenerfanene', lik(fanerFor({ role: 'coach' }, true), TRENER))
sjekk('ingen uten admin får admin-fanen', ['parent', 'athlete', 'coach'].every(r => !fanerFor({ role: r }, true).includes('admin')))
sjekk('rollen alene bestemmer flaggene', lik(rolleFlagg({ role: 'parent' }), { isCoach: false, isParent: true })
  && lik(rolleFlagg({ role: 'coach' }), { isCoach: true, isParent: false })
  && lik(rolleFlagg({ role: 'athlete' }), { isCoach: false, isParent: false }))

console.log(feil ? `\n${feil} FEILET` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
