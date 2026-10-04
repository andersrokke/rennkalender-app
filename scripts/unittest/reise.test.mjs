// Reisekost: lagets renn dekkes av skigymnaset, egne renn betaler man selv.
import { buildTrips, tripTotals, raceMode } from '../../src/travel.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }
const renn = (id, place, start, end, lat, lng) => ({ id, place, start_date: start, end_date: end, events: '2xSL', venue: { lat, lng } })
const GEILO = renn(1, 'Geilo', '2026-12-10', '2026-12-11', 60.53, 8.2)
const AARE = renn(2, 'Åre', '2027-01-20', '2027-01-21', 63.4, 13.08)
const SATS = { kmRate: 4, hotel: 1000, entry: 300, lift: 200, maxGap: 2 }
const lag = new Set([1])

sjekk('renn i lagets plan reiser man til med laget', raceMode(undefined, GEILO, lag) === 'bus')
sjekk('eget renn kjører man til selv', raceMode(undefined, AARE, lag) === 'car')
sjekk('løperens eget valg går foran', raceMode({ travel_mode: 'car' }, GEILO, lag) === 'car' && raceMode({ travel_mode: 'bus' }, AARE, lag) === 'bus')
sjekk('uten lagoversikt er alt egen bil, som før', raceMode(undefined, GEILO) === 'car')

const [lagtur, egentur] = buildTrips([GEILO, AARE], 'kolbotn', SATS, 'Hjem', {}, lag)
sjekk('lagets tur: reisen er dekket, overnattingen betales', lagtur.mode === 'bus' && lagtur.cost.drive === 0 && lagtur.cost.flight === 0 && lagtur.cost.stay === lagtur.nights * 1000 && lagtur.nights > 0)
sjekk('lagets tur: startkontingent og heiskort betales per start', lagtur.cost.fees === lagtur.starts * 300 && lagtur.cost.lift === lagtur.starts * 200 && lagtur.cost.total === lagtur.cost.stay + lagtur.cost.fees + lagtur.cost.lift)
sjekk('egen tur: kjøring og overnatting betales', egentur.mode === 'car' && egentur.cost.drive > 0 && egentur.cost.stay === egentur.nights * 1000)
const selv = buildTrips([GEILO], 'kolbotn', SATS, 'Hjem', { 1: { travel_mode: 'car' } }, lag)[0]
sjekk('velger løperen egen bil til et lagrenn, betaler hun selv', selv.mode === 'car' && selv.cost.drive > 0 && selv.cost.stay > 0)
sjekk('summen teller turene med laget', tripTotals([lagtur, egentur]).busTrips === 1)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
