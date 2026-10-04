// Reisekost: lagets renn dekkes av skigymnaset, egne renn betaler man selv.
import { buildTrips, tripTotals, raceMode, raceNights } from '../../src/travel.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }
const renn = (id, place, start, end, lat, lng, nat) => ({ id, place, start_date: start, end_date: end, events: '2xSL', host_nation: nat, venue: { lat, lng } })
const GEILO = renn(1, 'Geilo', '2026-12-10', '2026-12-11', 60.53, 8.2, 'NOR')
const AARE = renn(2, 'Åre', '2027-01-20', '2027-01-21', 63.4, 13.08, 'SWE')
const SATS = { kmRate: 4, hotel: 1000, entry: 300, lift: 200, maxGap: 2 }
const lag = new Set([1])

sjekk('renn i lagets plan reiser man til med laget', raceMode(undefined, GEILO, lag) === 'bus')
sjekk('eget renn kjører man til selv', raceMode(undefined, AARE, lag) === 'car')
sjekk('løperens eget valg går foran', raceMode({ travel_mode: 'car' }, GEILO, lag) === 'car' && raceMode({ travel_mode: 'bus' }, AARE, lag) === 'bus')
sjekk('uten lagoversikt er alt egen bil, som før', raceMode(undefined, GEILO) === 'car')

const [lagtur, egentur] = buildTrips([GEILO, AARE], 'kolbotn', SATS, 'Hjem', {}, lag)
sjekk('lagets tur: reisen er dekket, overnattingen betales', lagtur.mode === 'bus' && lagtur.cost.drive === 0 && lagtur.cost.flight === 0 && lagtur.cost.stay === lagtur.nights * 1000 && lagtur.nights > 0)
sjekk('norsk renn: startkontingent 350 kr per start, uansett sats', lagtur.cost.fees === lagtur.starts * 350)
sjekk('renn i utlandet: forelderens sats per start', egentur.cost.fees === egentur.starts * 300)
sjekk('heiskort per dag i bakken, ikke per start', lagtur.liftDays === 2 && lagtur.cost.lift === 2 * 200)
sjekk('lagets tur: summen er overnatting, startkontingent og heiskort', lagtur.cost.total === lagtur.cost.stay + lagtur.cost.fees + lagtur.cost.lift)
const medTrening = buildTrips([GEILO], 'kolbotn', SATS, 'Hjem', { 1: { training_days: 3 } }, lag)[0]
sjekk('treningsdager i forkant gir heiskort og netter, ikke starter', medTrening.liftDays === 5 && medTrening.cost.lift === 5 * 200
  && medTrening.nights === lagtur.nights + 3 && medTrening.starts === lagtur.starts && medTrening.mode === 'bus')
sjekk('netter med overstyring pluss treningsdager', raceNights(GEILO, { nights_override: 4, training_days: 2 }) === 6)
const fly = buildTrips([GEILO], 'kolbotn', SATS, 'Hjem', { 1: { travel_mode: 'flight', flight_cost: 2400 } }, lag)[0]
sjekk('fly betales selv, også til et lagrenn', fly.mode === 'flight' && fly.cost.flight === 2400 && fly.cost.total >= 2400)
sjekk('en rad uten valgt reisemåte følger laget', buildTrips([GEILO], 'kolbotn', SATS, 'Hjem', { 1: { flight_cost: null, travel_mode: null } }, lag)[0].mode === 'bus')
sjekk('egen tur: kjøring og overnatting betales', egentur.mode === 'car' && egentur.cost.drive > 0 && egentur.cost.stay === egentur.nights * 1000)
const selv = buildTrips([GEILO], 'kolbotn', SATS, 'Hjem', { 1: { travel_mode: 'car' } }, lag)[0]
sjekk('velger løperen egen bil til et lagrenn, betaler hun selv', selv.mode === 'car' && selv.cost.drive > 0 && selv.cost.stay > 0)
sjekk('summen teller turene med laget', tripTotals([lagtur, egentur]).busTrips === 1)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
