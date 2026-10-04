// Favoritt-tabellen. Kjøres med: npm run test:unit
import { klargjor, filtrerFav, sorterFav, rangering } from '../../src/favoritter.js'

let feil = 0
const sjekk = (navn, ok) => { console.log((ok ? 'OK    ' : 'FEIL  ') + navn); if (!ok) feil++ }
const R = klargjor([
  { fis_code: '1', navn: 'Lukas', gender: 'M', sl: '47.49', gs: '46.27', sg: null, egen: true, favoritt: false },
  { fis_code: '2', navn: 'Ida', gender: 'W', sl: '60.10', gs: null, sg: null, egen: true, favoritt: true },
  { fis_code: '3', navn: 'Åge', gender: 'M', sl: '31.00', gs: '52.00', sg: '80', egen: false, favoritt: true },
  { fis_code: '4', navn: 'Berit', gender: 'W', sl: null, gs: '40.00', sg: null, egen: false, favoritt: true }
])
sjekk('poeng blir tall, tomt blir null', R[0].sl === 47.49 && R[0].sg === null)
sjekk('filter på egne', filtrerFav(R, { hvem: 'egne' }).map(r => r.navn).join() === 'Lukas,Ida')
sjekk('filter på favoritter tar ikke med egne som også følges', filtrerFav(R, { hvem: 'favoritter' }).map(r => r.navn).join() === 'Åge,Berit')
sjekk('filter på kjønn', filtrerFav(R, { kjonn: 'W' }).length === 2)
sjekk('sortert på navn, norsk alfabet', sorterFav(R).map(r => r.navn).join() === 'Berit,Ida,Lukas,Åge')
sjekk('sortert på SL: best først, uten poeng sist', sorterFav(R, 'sl').map(r => r.navn).join() === 'Åge,Lukas,Ida,Berit')
sjekk('synkende SL: uten poeng fortsatt sist', sorterFav(R, 'sl', 'ned').map(r => r.navn).join() === 'Ida,Lukas,Åge,Berit')
const rg = rangering(R, 'gs')
sjekk('rangering i utvalget: lavest poeng er nummer 1', rg['4'] === 1 && rg['1'] === 2 && rg['3'] === 3 && rg['2'] === undefined)
sjekk('tom tabell kaster ikke', sorterFav(klargjor(null)).length === 0)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
