// Koblingen mellom resultathistorikk og kommende renn. Kjøres med: npm run test:unit
import { stedNokkel, sammeSted, grenerIRenn, sesongsnitt, godeSteder } from '../../src/anbefalt.js'
import { berik } from '../../src/resultater.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }

sjekk('Jølster er Jolster', sammeSted('Jølster', 'Jolster'))
sjekk('Ål er Aal', sammeSted('Ål', 'Aal'))
sjekk('Kläppen er Klaeppen', sammeSted('Kläppen', 'Klaeppen'))
sjekk('Björnrike er både Bjornrike og Bjoernrike', sammeSted('Björnrike', 'Bjornrike') && sammeSted('Björnrike', 'Bjoernrike'))
sjekk('Hafjell Olympiabakken er Hafjell', sammeSted('Hafjell Olympiabakken', 'Hafjell'))
sjekk('Vass er ikke Vassfjellet', !sammeSted('Vass', 'Vassfjellet'))
sjekk('Åre er ikke Arvidsjaur', !sammeSted('Åre', 'Arvidsjaur'))
sjekk('tomt navn matcher ingenting', !sammeSted('', 'Geilo') && !sammeSted(null, null))
sjekk('store og små bokstaver', stedNokkel('GEILO') === 'geilo')
sjekk('grener leses av «2xGS 2xSL»', JSON.stringify(grenerIRenn('2xGS 2xSL')) === '["GS","SL"]')
sjekk('grener leses av «SL, SL»', JSON.stringify(grenerIRenn('SL, SL')) === '["SL"]')

const rad = (race_date, place, discipline, position, fis_points) => ({ race_date, place, discipline, position, fis_points, category: 'FIS' })
const R = berik([
  rad('2024-01-10', 'Geilo', 'Slalom', '5', 50),       // 23/24 SL: snitt (50+70+90)/3 = 70
  rad('2024-02-10', 'Oppdal', 'Slalom', '9', 70),
  rad('2024-03-10', 'Voss', 'Slalom', '20', 90),
  rad('2025-01-10', 'Geilo', 'Slalom', '3', 40),       // 24/25 SL: snitt (40+60)/2 = 50
  rad('2025-02-10', 'Oppdal', 'Slalom', '12', 60),
  rad('2025-02-11', 'Oppdal', 'Slalom', 'DNF1', null),
  rad('2025-03-01', 'Aal', 'Giant Slalom', 'DNF1', null),
  rad('2025-03-05', 'Geilo', 'Giant Slalom', '8', 55)  // GS, skal ikke telle for et SL-renn
])
sjekk('sesongsnitt per sesong og gren', sesongsnitt(R).get('2023|SL') === 70 && sesongsnitt(R).get('2024|SL') === 50)

const renn = (place, events, start_date, gender = 'W M') => ({ id: place + start_date, place, events, start_date, end_date: start_date, gender, category: 'FIS' })
const { rader, utenHistorikk } = godeSteder(R, [
  renn('Geilo', '2xSL', '2027-01-10'),
  renn('Oppdal', '2xSL', '2027-02-10'),
  renn('Voss', '2xSL', '2027-03-10'),
  renn('Ål', '2xGS', '2027-03-01'),
  renn('Narvik', '2xSL', '2027-03-20'),
  renn('Geilo', '2xSL', '2026-01-01'),                 // passert
  renn('Geilo', '2xSL', '2027-01-20', 'W')             // ikke for herrer
], { idag: '2026-10-04', kjonn: 'M' })

sjekk('passerte renn og feil kjønn er ute', rader.length === 4 && utenHistorikk === 1)
const geilo = rader[0]
sjekk('sterkeste sted først', geilo.renn.place === 'Geilo' && geilo.dom === 'sterkt')
sjekk('Geilo: 15 poeng bedre enn sesongsnittet', geilo.motSnitt === -15)
sjekk('Geilo: bare rennets grener teller', geilo.starter === 2 && geilo.bestePoeng === 40 && geilo.bestePlass === 3)
const oppdal = rader.find(x => x.renn.place === 'Oppdal')
sjekk('Oppdal: svakere enn snittet, og utkjøringen teller i prosenten', oppdal.dom === 'svakt' && oppdal.motSnitt === 5 && oppdal.prosent === 67)
const voss = rader.find(x => x.renn.place === 'Voss')
sjekk('Voss: ett renn er tynt grunnlag', voss.tyntGrunnlag && voss.dom === 'svakt')
const aal = rader.find(x => x.renn.place === 'Ål')
sjekk('Ål: aldri fullført står sist', aal.dom === 'ingen' && rader.at(-1) === aal && aal.prosent === 0)
sjekk('historikken følger med, nyeste først', geilo.historikk.length === 2 && geilo.historikk[0].race_date === '2025-01-10')
const tynt = godeSteder(berik([
  rad('2025-01-10', 'Geilo', 'Slalom', '3', 40), rad('2025-01-11', 'Geilo', 'Slalom', '4', 44),
  rad('2025-02-10', 'Voss', 'Slalom', '1', 20), rad('2025-03-10', 'Oppdal', 'Slalom', '30', 96), rad('2025-03-11', 'Oppdal', 'Slalom', '30', 100)
]), [renn('Voss', '2xSL', '2027-01-05'), renn('Geilo', '2xSL', '2027-01-10')], { idag: '2026-10-04' }).rader
sjekk('to sterke steder: det med flere renn står foran det med ett', tynt[0].renn.place === 'Geilo' && tynt[1].renn.place === 'Voss' && tynt[1].tyntGrunnlag)
const medDns = godeSteder(berik([rad('2025-01-10', 'Geilo', 'Slalom', '3', 40), rad('2025-01-11', 'Geilo', 'Slalom', 'DNS1', null),
  rad('2025-02-10', 'Voss', 'Slalom', 'DNS1', null)]), [renn('Geilo', '2xSL', '2027-01-10'), renn('Voss', '2xSL', '2027-01-12')], { idag: '2026-10-04' })
sjekk('DNS teller ikke som start på stedet', medDns.rader.length === 1 && medDns.rader[0].starter === 1 && medDns.rader[0].prosent === 100 && medDns.utenHistorikk === 1)
sjekk('uten kjønn tas alle renn med', godeSteder(R, [renn('Geilo', '2xSL', '2027-01-20', 'W')], { idag: '2026-10-04' }).rader.length === 1)
sjekk('uten resultater: ingen rader, alt uten historikk', godeSteder([], [renn('Geilo', '2xSL', '2027-01-10')], { idag: '2026-10-04' }).utenHistorikk === 1)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
