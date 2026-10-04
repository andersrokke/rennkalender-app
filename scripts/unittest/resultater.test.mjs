// Resultathistorikken, testet uten å tegne noe. Kjøres med: npm run test:unit
import { lagTabell, sorterLag, sesongKort } from '../../src/resultater.js'
import { sesongFelt, sorterOppsummering, perManed } from '../../src/resultater.js'
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
sjekk('filter på flere sesonger', filtrer(R, { sesong: [2023, 2024] }).length === 6 && filtrer(R, { sesong: [2024] }).length === 3)
sjekk('tom sesongliste er alle sesonger', filtrer(R, { sesong: [] }).length === 6)
sjekk('sesong og gren som lister virker sammen', filtrer(R, { sesong: [2024], gren: ['GS', 'SG'] }).length === 2)
sjekk('filter på flere grener', filtrer(R, { gren: ['GS', 'SG'] }).length === 4)
sjekk('tom grenliste er alle grener', filtrer(R, { gren: [] }).length === 6)
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

sjekk('prosent fullført i nøkkeltall', n.prosent === 67 && nokkeltall([]).prosent === null)
sjekk('prosent per sesong og gren', ps.find(x => x.sesong === 2023 && x.gren === 'GS').prosent === 50)
const so = sorterOppsummering(ps, 'prosent', 'opp')
sjekk('oppsummering sortert på prosent: lavest først', so[0].prosent === 0 && so.at(-1).prosent === 100)
sjekk('oppsummering sortert på gren: SL først, så nyeste sesong', sorterOppsummering(ps, 'gren', 'opp')[0].gren === 'SL'
  && sorterOppsummering(ps, 'gren', 'opp')[0].sesong === 2024)
sjekk('oppsummering på beste poeng: uten poeng sist', sorterOppsummering(ps, 'bestePoeng', 'opp').at(-1).bestePoeng === null
  && sorterOppsummering(ps, 'bestePoeng', 'ned').at(-1).bestePoeng === null)
sjekk('oppsummering standard: nyeste sesong først', sorterOppsummering(ps)[0].sesong === 2024)
const pm = perManed(R)
sjekk('per måned: eldste først, én rad per måned', pm.length === 6 && pm[0].nokkel === '2023-07' && pm[0].navn === 'jul 23')
sjekk('per måned: utkjøring telles', pm.find(x => x.nokkel === '2024-02').ute === 1 && pm.find(x => x.nokkel === '2024-02').prosent === 0)
sjekk('per måned: fullført gir 100 %', pm.find(x => x.nokkel === '2024-12').prosentTekst === '100 %')

const D = berik([rad('2025-01-10', 'Slalom', '4', 50), rad('2025-01-11', 'Slalom', 'DNS1', null), rad('2025-01-12', 'Slalom', 'DNF1', null), rad('2025-01-13', 'Slalom', 'DNS2', null)])
sjekk('DNS er ikke en start: 1 av 2 fullført, ikke 1 av 4', nokkeltall(D).starter === 2 && nokkeltall(D).ute === 1 && nokkeltall(D).prosent === 50)
sjekk('DNS telles ikke i måneden', perManed(D)[0].starter === 2 && perManed(D)[0].prosent === 50)
sjekk('DNS-rader står fortsatt i lista', D.length === 4 && D[1].dns && !D[2].dns)

const LAG = [{ id: 'a', full_name: 'Ida', fis_code: '1' }, { id: 'b', full_name: 'Jonas', fis_code: '2' }, { id: 'c', full_name: 'Åse', fis_code: '3' }]
const PK = { 1: R, 2: berik([rad('2025-01-05', 'Slalom', '2', 30), rad('2025-01-06', 'Slalom', 'DNF1', null)]) }
const lt = lagTabell(LAG, PK, { sesong: 2024 })
sjekk('lagtabell: én rad per løper, også uten resultater', lt.length === 3 && lt[2].starter === 0 && lt[2].prosent === null)
sjekk('lagtabell: filteret gjelder hver løper', lt[0].starter === 3 && lt[1].starter === 2 && lt[1].prosent === 50)
sjekk('lagtabell sortert på navn', sorterLag(lt).map(x => x.navn).join() === 'Ida,Jonas,Åse')
sjekk('lagtabell sortert på beste poeng: lavest først, uten poeng sist', sorterLag(lt, 'bestePoeng', 'opp').map(x => x.navn).join() === 'Jonas,Ida,Åse')
sjekk('lagtabell synkende prosent: uten starter fortsatt sist', sorterLag(lt, 'prosent', 'ned').at(-1).navn === 'Åse' && sorterLag(lt, 'prosent', 'ned')[0].navn === 'Ida')
sjekk('lagtabell med grenfilter', lagTabell(LAG, PK, { gren: ['GS'] })[1].starter === 0)

const sk = sesongKort(sg, ['SL', 'GS', 'DH'], 'beste')
sjekk('sesongkort: ett per gren med data, DH uten data er ute', sk.map(k => k.gren).join() === 'SL,GS')
sjekk('sesongkort: siste sesong og endring fra forrige', sk[1].verdi === 40 && sk[1].sesong === '2024/25' && sk[1].forrige === 55.5 && sk[1].endring === -15.5)
sjekk('sesongkort: hele rekka følger med til kurven', sk[1].serie.length === 2 && sk[1].serie[0].navn === '2023/24')
sjekk('sesongkort: én sesong gir ingen endring', sesongKort([sg[0]], ['SL'])[0].endring === null)

const felt = sesongFelt(pt)
sjekk('sesongfelt: ett per sesong, annenhver skygget', felt.length === 2 && !felt[0].skygge && felt[1].skygge)
sjekk('sesongfelt: skille ved 1. juli, ikke for første', felt[0].skille === null && felt[1].skille === Date.UTC(2024, 6, 1))
sjekk('sesongfelt: klippet til dataene', felt[0].fra === pt[0].t && felt[1].til === pt.at(-1).t)
sjekk('sesongfelt på tomt utvalg', sesongFelt([]).length === 0)

const sg = sesongGraf(R)
sjekk('sesonggraf: eldste sesong først', sg.length === 2 && sg[0].navn === '2023/24')
sjekk('sesonggraf: beste og snitt per gren', sg[1].beste_GS === 40 && sg[1].snitt_SL === 48.2)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
