// Leseren for HC Timing-eksporten. Navnene her er oppdiktet.
import { csvLinje, tidTilMs, lesHcTiming, lesBrower, lesTidtaking, erBrower, foreslaLoper, foreslaKoblinger } from '../../src/hctiming.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }

const HODE = 'RANK,STA#,RUN#,BIB#,NAME,"INTER 1","INTER 1 DIFF","INTER 1 DSQ","INTER 1 RANK","INTER 2","INTER 2 DIFF","INTER 2 DSQ","INTER 2 RANK","SECTION IM1-IM2","SECTION IM1-IM2 DIFF","SECTION IM1-IM2 RANK",FINISH,"FINISH DIFF","FINISH DSQ","SECTION IM2-FINISH","SECTION IM2-FINISH DIFF","SECTION IM2-FINISH RANK",COMMENT'
const KOMMA = ['"sep=,"', 'Ranking', HODE,
  '1,5,1,11,"TESTESEN Kari","12,39","\'+0,00",,1,"34,93","\'+0,00",,1,"22,54","\'+0,00",1,"46,32","\'+0,00",,"11,39","\'+0,00",1,',
  '2,13,2,13,"PROEVE Ola Nordmann","13,28","\'+0,89",,6,"36,43","\'+1,50",,4,"23,15","\'+0,61",3,"48,11","\'+1,79",,"11,68","\'+0,29",2,',
  '3,21,1,100,"NO BIB INPUT @START","13,51","\'+1,12",,11,"36,35","\'+1,42",,2,"22,84","\'+0,30",2,"48,28","\'+1,96",,"11,93","\'+0,54",7,',
  ',14,2,24,"TESTESEN Kari","13,53","\'+1,14",,12,DNF,,,,,,,DNF,,,,,,',
  ',29,2,32,"OEVELSE Aase",DNF,,,,DNF,,,,,,,DNF,,,,,,', ''].join('\r\n')
const PUNKTUM = KOMMA.replace(/"(\d+),(\d+)"/g, '$1.$2').replace(/"'\+(\d+),(\d+)"/g, "'+$1.$2")

sjekk('CSV-linje med komma inne i anførselstegn', JSON.stringify(csvLinje('1,"a,b",,"c ""d"""')) === '["1","a,b","","c \\"d\\""]')
sjekk('tid med komma', tidTilMs('46,32') === 46320)
sjekk('tid med punktum', tidTilMs('46.32') === 46320)
sjekk('tid over ett minutt', tidTilMs('1:02,45') === 62450 && tidTilMs('61,92') === 61920)
sjekk('tusendeler', tidTilMs('12,345') === 12345 && tidTilMs('12,3') === 12300)
sjekk('DNF og tomt er ingen tid', tidTilMs('DNF') === null && tidTilMs('') === null && tidTilMs("'+0,89") === null)

for (const [navn, fil] of [['komma', KOMMA], ['punktum', PUNKTUM]]) {
  const r = lesHcTiming(fil)
  sjekk(`${navn}: fila leses uten feil, fem løp og to mellomtider`, r.feil === null && r.rader.length === 5 && r.mellomtider === 2)
  const a = r.rader[0]
  sjekk(`${navn}: navn, startnummer og løpsnummer`, a.source_name === 'TESTESEN Kari' && a.bib === '11' && a.run_no === 1)
  sjekk(`${navn}: mellomtidene er kumulative millisekunder`, JSON.stringify(a.splits_ms) === '[12390,34930]' && a.run_time_ms === 46320 && a.status === 'OK')
  sjekk(`${navn}: løp uten startnummer er merket ukjent`, r.rader[2].ukjent && !a.ukjent)
  const dnf = r.rader[3]
  sjekk(`${navn}: brutt løp har ingen totaltid, men mellomtiden som rakk`, dnf.status === 'DNF' && dnf.run_time_ms === null && dnf.splits_ms[0] === 13530 && dnf.splits_ms[1] === null)
  sjekk(`${navn}: brutt før første mellomtid`, r.rader[4].status === 'DNF' && r.rader[4].splits_ms.every(v => v === null))
  sjekk(`${navn}: plassering og startrekkefølge følger med`, a.extra.rank === '1' && a.extra.sta === '5')
}
sjekk('ukjent fil gir feil i stedet for tomme rader', lesHcTiming('navn;tid\nKari;12').feil === 'ukjent' && lesHcTiming('').feil === 'ukjent')
sjekk('mellomtid etter måltid gir ikke en gyldig tid', lesHcTiming(['x', HODE, '1,1,1,1,"A B","50,00",,,1,"60,00",,,1,,,,"46,32",,,,,,'].join('\n')).rader[0].run_time_ms === null)
sjekk('disket løp', lesHcTiming([HODE, '1,1,1,1,"A B","12,00",,,1,"30,00",,,1,,,,"46,32",,DSQ,,,,'].join('\n')).rader[0].status === 'DSQ')

const LOPERE = [{ id: 'a', full_name: 'Kari Testesen' }, { id: 'b', full_name: 'Ola Nordmann Prøve' }, { id: 'c', full_name: 'Åse Øvelse' }, { id: 'd', full_name: 'Kari Annen' }]
sjekk('etternavn først i fila, fornavn først i appen', foreslaLoper('TESTESEN Kari', LOPERE) === 'a')
sjekk('mellomnavn og OE for Ø', foreslaLoper('PROEVE Ola Nordmann', LOPERE) === 'b')
sjekk('AA for Å og OE for Ø', foreslaLoper('OEVELSE Aase', LOPERE) === 'c')
sjekk('bare fornavn til felles er ikke nok', foreslaLoper('KARI', LOPERE) === null && foreslaLoper('NILSEN Kari', LOPERE) === null)
sjekk('ukjent navn gir ingen forslag', foreslaLoper('NO BIB INPUT @START', LOPERE) === null)
sjekk('to mulige løpere gir ingen forslag', foreslaLoper('TESTESEN Kari', [...LOPERE, { id: 'e', full_name: 'Kari Testesen' }]) === null)

const N = [
  { navn: 'TESTESEN Kari', bibs: ['11', '11'] }, { navn: 'PROEVE Ola Nordmann', bibs: ['13'] }, { navn: 'KALLENAVN Kalle', bibs: ['7'] },
  { navn: 'HELT Ny', bibs: ['44'] }, { navn: 'BYTTET Nummer', bibs: ['5', '6'] }, { navn: 'NO BIB INPUT @START', bibs: ['100'], ukjent: true }, { navn: 'TESTESEN Kari Annen', bibs: ['11'] }
]
const F = foreslaKoblinger(N, { lopere: LOPERE, kjente: { 'KALLENAVN Kalle': 'c', 'HELT Ny': 'borte' }, sisteBib: { 11: 'd', 44: 'd', 5: 'd', 100: 'd' } })
sjekk('husket kobling går foran alt', F['KALLENAVN Kalle'].id === 'c' && F['KALLENAVN Kalle'].grunn === 'husket')
sjekk('navnetreff når navnet ikke er sett før', F['TESTESEN Kari'].id === 'a' && F['TESTESEN Kari'].grunn === 'navn' && F['PROEVE Ola Nordmann'].id === 'b')
sjekk('husket kobling til en som ikke er på laget lenger brukes ikke', F['HELT Ny'].id === 'd' && F['HELT Ny'].grunn === 'bib')
sjekk('startnummeret fra sist brukes når navnet ikke gir noe', F['HELT Ny'].grunn === 'bib')
sjekk('to ulike startnummer på samme navn gir ikke forslag på nummer', F['BYTTET Nummer'].id === null && F['BYTTET Nummer'].grunn === 'ukjent')
sjekk('løp uten startnummer får aldri forslag', F['NO BIB INPUT @START'].id === null && F['NO BIB INPUT @START'].grunn === 'utenBib')
sjekk('en løper foreslås ikke to ganger', Object.values(F).filter(x => x.id === 'd').length === 1 && Object.values(F).filter(x => x.id === 'a').length === 1)
sjekk('uten noe å gå på er alt ukjent', Object.values(foreslaKoblinger(N)).every(x => x.id === null))

// Brower: én økt per fil, fornavn, og rader uten navn.
const BROWER = ['sep=>', 'SESSION', 'Team Name>Testlaget', 'Start List Name>Trening', 'Session #>7', 'Date>09/27/26', 'Time>3:03 PM', 'Event>GS', 'Hill>Testbakken', 'Snow conditions>Hard', 'Weather>', '',
  'Bib#>Name>YOB>Class>Gender>Start Time>Finish Time>Split 1>Split 2>Split 3>Status>SEQ>Run#',
  '2>Kari>2007>U21>Female>4:54:46.125 PM>27,562>0>0>0>>8>2',
  '30>>>>>4:54:05.393 PM>28,675>0>0>0>>7>2',
  '9>Ola>2009>U18>Male>4:53:35.247 PM>0>0>0>0>DNF>6>2',
  '2>Kari>2007>U21>Female>3:28:58.663 PM>29,351>13,2>0>0>>3>1',
  '9>Ola>2009>U18>Male>3:28:00.592 PM>29,227>0>0>0>>2>1'].join('\n')
sjekk('Brower kjennes igjen på sep=> og SESSION', erBrower(BROWER) && !erBrower(KOMMA))
const b = lesBrower(BROWER)
sjekk('Brower: hodet gir dato, bakke, gren og føre', b.okt.dato === '2026-09-27' && b.okt.bakke === 'Testbakken' && b.okt.gren === 'GS' && b.okt.fore === 'hard' && b.okt.lag === 'Testlaget')
sjekk('Brower: fem løp, eldste først', b.rader.length === 5 && b.rader[0].extra.seq === '2' && b.rader[0].run_no === 1 && b.kilde === 'Brower')
sjekk('Brower: tida leses med komma som desimal', b.rader.find(r => r.source_name === 'Kari' && r.run_no === 2).run_time_ms === 27562)
sjekk('Brower: 0 i mål med DNF er brutt løp', b.rader.find(r => r.source_name === 'Ola' && r.run_no === 2).status === 'DNF' && b.rader.find(r => r.source_name === 'Ola' && r.run_no === 2).run_time_ms === null)
sjekk('Brower: rad uten navn heter startnummeret', b.rader.some(r => r.source_name === '#30' && r.bib === '30' && !r.ukjent && r.run_time_ms === 28675))
sjekk('Brower: mellomtid 0 er ikke tatt, en tatt mellomtid beholdes', b.rader.find(r => r.source_name === 'Kari' && r.run_no === 1).splits_ms[0] === 13200 && b.rader.find(r => r.source_name === 'Kari' && r.run_no === 2).splits_ms.length === 0)
sjekk('lesTidtaking velger riktig leser', lesTidtaking(BROWER).kilde === 'Brower' && lesTidtaking(KOMMA).kilde === 'HC Timing')
sjekk('fornavn alene kobles når bare én på laget heter det', foreslaLoper('Ola', LOPERE) === 'b' && foreslaLoper('ola', LOPERE) === 'b' && foreslaLoper('Aase', LOPERE) === 'c')
sjekk('fornavn alene kobles ikke når det er tvetydig eller for kort', foreslaLoper('Kari', LOPERE) === null && foreslaLoper('Ola', [...LOPERE, { id: 'z', full_name: 'Ola Annen' }]) === null && foreslaLoper('Al', LOPERE) === null)
sjekk('startnummer uten navn kobles via startnummeret fra sist', foreslaKoblinger([{ navn: '#30', bibs: ['30'] }], { lopere: LOPERE, sisteBib: { 30: 'b' } })['#30'].id === 'b')

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
