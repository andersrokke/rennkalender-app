// Leseren for HC Timing-eksporten. Navnene her er oppdiktet.
import { csvLinje, tidTilMs, lesHcTiming, foreslaLoper, foreslaKoblinger } from '../../src/hctiming.js'

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

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
