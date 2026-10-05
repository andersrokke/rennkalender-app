// Vær på renndagen: stedsmatch mot FIS sin skrivemåte, nedkoking av timeverdier
// og gruppering mot resultat. Kjøres med: npm run test:unit
import { skjelett, finnSted, dagsvaer } from '../../supabase/functions/race-weather/sted.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }

const STEDER = [
  { name: 'Ål', country: 'NOR', lat: 60.6, lng: 8.5 }, { name: 'Åre', country: 'SWE', lat: 63.4, lng: 13.1 },
  { name: 'Tärnaby', country: 'SWE', lat: 65.7, lng: 15.3 }, { name: 'Jølster', country: 'NOR', lat: 61.5, lng: 6.3 },
  { name: 'Hafjell', country: 'NOR', lat: 61.2, lng: 10.4 }, { name: 'Are', country: 'EST', lat: 58.5, lng: 24.6 },
  { name: 'Uten koordinater', country: 'NOR', lat: null, lng: null }
]
sjekk('FIS-skrivemåte og norsk gir samme skjelett', skjelett('Aal') === skjelett('Ål') && skjelett('Taernaby') === skjelett('Tärnaby')
  && skjelett('Jolster') === skjelett('Jølster') && skjelett('Kaabdalis') === skjelett('Kåbdalis') && skjelett('Saelen') === skjelett('Sälen'))
sjekk('Aal finner Ål', finnSted('Aal', 'NOR', STEDER)?.name === 'Ål')
sjekk('Are i Sverige er Åre, ikke Are i et annet land', finnSted('Are', 'SWE', STEDER)?.name === 'Åre')
sjekk('stedsnavn med tillegg finner stedet', finnSted('Hafjell Olympiabakken', 'NOR', STEDER)?.name === 'Hafjell')
sjekk('ukjent sted gir ingenting', finnSted('Coronet Peak', 'NZL', STEDER) === null && finnSted('', 'NOR', STEDER) === null)
sjekk('sted uten koordinater brukes ikke', finnSted('Uten koordinater', 'NOR', STEDER) === null)
sjekk('et kort navn slår ikke til inne i et annet ord', finnSted('Alta', 'NOR', STEDER) === null)

const time = Array.from({ length: 24 }, (_, h) => `2025-01-18T${String(h).padStart(2, '0')}:00`)
const d = dagsvaer({ time,
  temperature_2m: time.map((_, h) => -10 + h * 0.5), precipitation: time.map((_, h) => h === 10 ? 1.2 : 0),
  snowfall: time.map((_, h) => h === 10 ? 0.8 : 0), wind_speed_10m: time.map(() => 4), cloud_cover: time.map(() => 80),
  weather_code: time.map((_, h) => h === 11 ? 71 : 3) })
sjekk('morgen kl. 09 og middag kl. 12', d.temp_morgen === -5.5 && d.temp_middag === -4)
sjekk('min og maks gjelder renndagen, ikke natten', d.temp_min === -6.5 && d.temp_max === -2.5)
sjekk('nedbør, snø, vind, skyer og kode', d.nedbor_mm === 1.2 && d.sno_cm === 0.8 && d.vind_ms === 4 && d.sky_pct === 80 && d.vaerkode === 71)
sjekk('tomt svar gir ingenting', dagsvaer(null) === null && dagsvaer({ time: [] }) === null)
sjekk('manglende enkeltverdier velter ikke', dagsvaer({ time, temperature_2m: time.map((_, h) => h === 9 ? null : 1) }).temp_morgen === null)

// Gruppering mot resultat. Importeres dynamisk: vaer.js drar inn supabase-klienten.
const kilde = (await import('node:fs')).readFileSync(new URL('../../src/vaer.js', import.meta.url), 'utf8')
  .replace("import { supabase } from './supabase'", 'const supabase = null')
const { vaertype, tempgruppe, dagstemp, vaerGrupper, TEMPGRUPPER } = await import('data:text/javascript,' + encodeURIComponent(kilde))
sjekk('snø går foran alt, så regn, så vind', vaertype({ sno_cm: 1, nedbor_mm: 3, vind_ms: 12 }) === 'sno'
  && vaertype({ sno_cm: 0, nedbor_mm: 3, vind_ms: 12 }) === 'regn' && vaertype({ sno_cm: 0, nedbor_mm: 0, vind_ms: 12 }) === 'vind')
sjekk('sol, delvis og skyet etter skydekke', vaertype({ sky_pct: 10 }) === 'sol' && vaertype({ sky_pct: 50 }) === 'delvis' && vaertype({ sky_pct: 90 }) === 'skyet')
sjekk('uten vær: ingen type og ingen gruppe', vaertype(null) === null && tempgruppe(null) === null && dagstemp(null) === null)
sjekk('temperaturgrupper', tempgruppe({ temp_middag: -12 }) === 'kaldt' && tempgruppe({ temp_middag: -5 }) === 'kjolig' && tempgruppe({ temp_middag: 1 }) === 'mildt')
const R = [
  { vaer: { temp_middag: -12 }, plass: 5, poeng: 40 }, { vaer: { temp_middag: -10 }, plass: null, poeng: null },
  { vaer: { temp_middag: -9 }, plass: 9, poeng: 60 }, { vaer: { temp_middag: 2 }, plass: 3, poeng: 30 },
  { vaer: { temp_middag: 2 }, dns: true, plass: null }, { vaer: null, plass: 1, poeng: 10 }
]
const g = vaerGrupper(R, tempgruppe, TEMPGRUPPER)
sjekk('starter, fullført og snitt per gruppe', g.length === 2 && g[0].gruppe === 'kaldt' && g[0].starter === 3 && g[0].fullfort === 2
  && g[0].andel === 67 && g[0].snittPoeng === 50 && g[0].bestePoeng === 40)
sjekk('DNS og renn uten vær holdes utenfor', g[1].gruppe === 'mildt' && g[1].starter === 1)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
