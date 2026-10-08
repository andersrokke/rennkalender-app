import { avtale, avtaleFraRad, venterPa } from '../../src/avtale.js'
let feil = 0
const sjekk = (navn, ok) => { console.log(`${ok ? 'OK  ' : 'FEIL'}  ${navn}`); if (!ok) feil++ }

sjekk('ingen rad er ingen avtale', avtale(null) === 'ingen' && avtale({ status: null, assigned: false }) === 'ingen')
sjekk('løper ønsker, trener har ikke svart', avtale({ status: 'wish', assigned: false, answered: true }) === 'venterTrener')
sjekk('løper skal kjøre, trener har ikke svart', avtale({ status: 'planned', assigned: false, answered: true }) === 'venterTrener')
sjekk('trener har satt opp, løper har ikke svart', avtale({ status: 'planned', assigned: true, answered: false }) === 'venterLoper')
sjekk('trener har satt opp en løper uten rad', avtale({ status: null, assigned: true }) === 'venterLoper')
sjekk('begge har sagt ja', avtale({ status: 'planned', assigned: true, answered: true }) === 'avtalt' && avtale({ status: 'wish', assigned: true, answered: true }) === 'avtalt')
sjekk('påmeldt går foran alt annet enn kan ikke', avtale({ status: 'entered', assigned: false }) === 'pameldt')
sjekk('kan ikke står, også når trener har satt opp', avtale({ status: 'unavailable', assigned: true, answered: true }) === 'kanIkke')
sjekk('rad fra basen leses likt', avtaleFraRad({ status: 'planned', assigned_by: 'x', answered_at: null }) === 'venterLoper' && avtaleFraRad({ status: 'wish', assigned_by: null, answered_at: 'x' }) === 'venterTrener' && avtaleFraRad(undefined) === 'ingen')
sjekk('trener har sagt nei: står over ønske og tildeling, under kan ikke og påmeldt',
  avtale({ status: 'wish', assigned: false, answered: true, declined: true }) === 'trenerNei' && avtale({ status: 'unavailable', declined: true }) === 'kanIkke'
  && avtale({ status: 'entered', declined: true }) === 'pameldt' && avtaleFraRad({ status: 'wish', coach_declined_at: 'x', answered_at: 'x' }) === 'trenerNei')
sjekk('hvem som må svare', venterPa('venterTrener') === 'trener' && venterPa('venterLoper') === 'loper' && venterPa('avtalt') === null)

console.log(feil ? `\n${feil} feil` : '\nAlt gikk gjennom')
process.exit(feil ? 1 : 0)
