// Resultathistorikken, testet uten å tegne noe. Kjøres med: npm run test:unit
import { sesongAv, sesongNavn, berik, filtrer, sorter, nokkeltall, perSesongOgGren, poengOverTid, sesongGraf } from '../../src/resultater.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }
const rad = (race_date, discipline, position, fis_points, category = 'FIS', place = 'Hafjell') =>
  ({ race_date, discipline, position, fis_points, category, place })

const RAA = [
  rad('2023-06-30', 'Slalom', '5', 80),          // 2022/23 - for gammelt, skal ut
  rad('2023-07-01', 'Slalom', '9', 70),          // første dag i 2023/24
  rad('2023-12-10', 'Giant Slalom', '3', 55.5),
  rad('2024-02-01', 'Giant Slalom', 'DNF1', null),
  rad('2024-12-15', 'Giant Slalom', '1', 40, 'NJR', 'Åre'),
  rad('2025-01-20', 'Slalom', '12', '48.20'),
  rad('2025-03-02', 'Super G', 'DSQ', null)
]
const R = berik(RAA)

sjekk('30. juni hører til forrige sesong', sesongAv('2023-06-30') === 2022)
sjekk('1. juli starter ny sesong', sesongAv('2023-07-01') === 2023)
sjekk('januar hører til sesongen som startet året før', sesongAv('2025-01-20') === 2024)
sjekk('sesongnavn', sesongNavn(2023) === '2023/24')
sjekk('renn før 2023/24 tas ikke med', R.length === 6)
sjekk('grenkode og tall settes', R[1].gren === 'GS' && R[1].plass === 3 && R[1].poeng === 55.5)
sjekk('DNF har ingen plass', R[2].plass === null)
sjekk('poeng som tekst blir tall', R[4].poeng === 48.2)

sjekk('filter på sesong', filtrer(R, { sesong: 2024 }).length === 3)
sjekk('filter på gren', filtrer(R, { gren: 'GS' }).length === 3)
sjekk('filter på kategori', filtrer(R, { kategori: 'NJR' }).length === 1)
sjekk('filter bare fullførte', filtrer(R, { bareFullfort: true }).length === 4)
sjekk('filtre virker sammen', filtrer(R, { sesong: 2023, gren: 'GS', bareFullfort: true }).length === 1)

const paPlass = sorter(R, 'plass', 'opp')
sjekk('sortert på plass: vinner først', paPlass[0].plass === 1)
sjekk('sortert på plass: DNF sist', paPlass.at(-1).plass === null && paPlass.at(-2).plass === null)
sjekk('synkende plass: DNF fortsatt sist', sorter(R, 'plass', 'ned')[0].plass === 12 && sorter(R, 'plass', 'ned').at(-1).plass === null)
sjekk('sortert på poeng: lavest først', sorter(R, 'poeng', 'opp')[0].poeng === 40)
sjekk('sortert på dato synkende', sorter(R, 'dato', 'ned')[0].race_date === '2025-03-02')
sjekk('sortering endrer ikke originalen', R[0].race_date === '2023-07-01')

const n = nokkeltall(R)
sjekk('nøkkeltall: starter, fullført, ute', n.starter === 6 && n.fullfort === 4 && n.ute === 2)
sjekk('nøkkeltall: seire, pall, topp 10', n.seire === 1 && n.pall === 2 && n.topp10 === 3)
sjekk('nøkkeltall: beste poeng er lavest', n.bestePoeng === 40 && n.bestePlass === 1)
sjekk('nøkkeltall: snitt av de med poeng', Math.abs(n.snittPoeng - (70 + 55.5 + 40 + 48.2) / 4) < 1e-9)
sjekk('nøkkeltall på tomt utvalg kaster ikke', nokkeltall([]).bestePoeng === null && nokkeltall([]).starter === 0)

const ps = perSesongOgGren(R)
sjekk('per sesong og gren: nyeste sesong først, SL før GS', ps[0].sesong === 2024 && ps[0].gren === 'SL' && ps[1].gren === 'GS')
sjekk('per sesong og gren: GS 2023/24 har to starter, én fullført', ps.find(x => x.sesong === 2023 && x.gren === 'GS').starter === 2
  && ps.find(x => x.sesong === 2023 && x.gren === 'GS').fullfort === 1)

const pt = poengOverTid(R)
sjekk('poeng over tid: bare fullførte med poeng, eldste først', pt.length === 4 && pt[0].dato === '2023-07-01')
sjekk('poeng over tid: felt per gren', pt[1].GS === 55.5 && pt[1].SL === undefined && pt[1].plass_GS === 3)

const sg = sesongGraf(R)
sjekk('sesonggraf: eldste sesong først', sg.length === 2 && sg[0].navn === '2023/24')
sjekk('sesonggraf: beste og snitt per gren', sg[1].beste_GS === 40 && sg[1].snitt_SL === 48.2)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
