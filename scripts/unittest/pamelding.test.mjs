// Foreldrenes påmeldingsoversikt. Kjøres med: npm run test:unit
import { pameldt, dagerIgjen, gruppeFor, ordne } from '../../src/pamelding.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }
const NA = Date.parse('2026-11-01T12:00:00Z')
const om = dager => new Date(NA + dager * 864e5).toISOString()
const rad = (o = {}) => ({ athlete_name: 'Lukas', place: 'Geilo', start_date: '2026-12-10', status: 'planned', frist: null, pa_lista: false, ...o })

sjekk('på deltakerlista er bekreftet', pameldt(rad({ pa_lista: true })) === 'bekreftet')
sjekk('løperens eget «påmeldt» er merket, ikke bekreftet', pameldt(rad({ status: 'entered' })) === 'merket')
sjekk('ellers ikke påmeldt', pameldt(rad({ status: 'wish' })) === 'nei' && pameldt(rad({ status: null })) === 'nei')

sjekk('dager igjen rundes opp', dagerIgjen(om(2.2), NA) === 3 && dagerIgjen(om(0.3), NA) === 1)
sjekk('uten frist er dager ukjent', dagerIgjen(null, NA) === null)
sjekk('passert frist gir null eller negativt', dagerIgjen(om(-0.5), NA) <= 0 && dagerIgjen(om(-3), NA) === -3)

sjekk('frist innen sju dager haster', gruppeFor(rad({ frist: om(3) }), NA) === 'haster' && gruppeFor(rad({ frist: om(6.9) }), NA) === 'haster')
sjekk('frist om to uker kommer', gruppeFor(rad({ frist: om(14) }), NA) === 'kommer')
sjekk('passert frist uten påmelding er utgått', gruppeFor(rad({ frist: om(-1) }), NA) === 'utgatt')
sjekk('uten frist er ukjent', gruppeFor(rad(), NA) === 'ukjent')
sjekk('påmeldt haster aldri, heller ikke rett før fristen', gruppeFor(rad({ frist: om(1), pa_lista: true }), NA) === 'pameldt'
  && gruppeFor(rad({ frist: om(-2), status: 'entered' }), NA) === 'pameldt')
sjekk('et renn fra lagets plan uten svar fra løperen følges også', gruppeFor(rad({ status: null, frist: om(2) }), NA) === 'haster')

const o = ordne([
  rad({ place: 'A', frist: om(5) }), rad({ place: 'B', frist: om(1) }), rad({ place: 'C', frist: om(20) }),
  rad({ place: 'D' , start_date: '2027-01-05' }), rad({ place: 'E', start_date: '2026-12-01' }), rad({ place: 'F', pa_lista: true })
], NA)
sjekk('det som haster er sortert på frist, nærmest først', o.haster.map(r => r.place).join() === 'B,A')
sjekk('ukjent frist er sortert på rennets dato', o.ukjent.map(r => r.place).join() === 'E,D')
sjekk('hver rad får dager og påmeldingsstatus', o.haster[0].dager === 1 && o.pameldt[0].pameldt === 'bekreftet')
sjekk('alle rader havner i nøyaktig én gruppe', Object.values(o).flat().length === 6)
sjekk('tom liste gir tomme grupper', Object.values(ordne([], NA)).every(g => g.length === 0))

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
