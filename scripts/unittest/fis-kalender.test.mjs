// Leseren av FIS-kalenderen, testet mot et utsnitt av den ekte siden.
import { readFileSync } from 'node:fs'
import { lesDatoer, lesKalender } from '../../supabase/functions/fis-calendar/parse.js'

let feil = 0
const lik = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }

sjekk('samme måned', lik(lesDatoer('08-11 Dec 2026'), { start: '2026-12-08', end: '2026-12-11' }))
sjekk('over månedsskifte, med linjeskift', lik(lesDatoer('28 Jan-<br>04 Feb 2027'), { start: '2027-01-28', end: '2027-02-04' }))
sjekk('over nyttår uten årstall på starten', lik(lesDatoer('30 Dec- 02 Jan 2027'), { start: '2026-12-30', end: '2027-01-02' }))
sjekk('over nyttår med årstall på starten', lik(lesDatoer('30 Dec 2026-<br>02 Jan 2027'), { start: '2026-12-30', end: '2027-01-02' }))
sjekk('én dag', lik(lesDatoer('08 Dec 2026'), { start: '2026-12-08', end: '2026-12-08' }))
sjekk('uleselig dato gir null', lesDatoer('TBA') === null && lesDatoer('') === null)
sjekk('ukjent måned gir null', lesDatoer('08-11 Xyz 2026') === null)

const rader = lesKalender(readFileSync(new URL('./fixtures/fis-kalender-fec.html', import.meta.url), 'utf8'))
sjekk('to arrangementer i utsnittet', rader.length === 2)
const alp = rader.find(r => r.fis_event_id === 63786)
sjekk('Alpensia leses riktig', !!alp && lik(alp, { fis_event_id: 63786, start_date: '2027-01-28', end_date: '2027-02-04',
  place: 'Alpensia Resort', nation: 'KOR', category: 'FEC', events: '8xSL', gender: 'W M', cancelled: false }))
const wan = rader.find(r => r.fis_event_id === 64468)
sjekk('Wanlong leses riktig', !!wan && wan.start_date === '2026-12-08' && wan.end_date === '2026-12-11'
  && wan.nation === 'CHN' && wan.events === '4xGS 4xSL')
sjekk('tom side gir ingen rader', lesKalender('<html></html>').length === 0)
sjekk('avlyst renn merkes', lesKalender(readFileSync(new URL('./fixtures/fis-kalender-fec.html', import.meta.url), 'utf8')
  .replace('title="Not cancelled"', 'title="Cancelled"')).some(r => r.cancelled))

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
