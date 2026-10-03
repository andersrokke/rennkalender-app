// Slår opp koordinater for stedene i FIS-kalenderen og skriver dem som SQL.
// Kjøres for hånd når et nytt land legges til: node scripts/geokod-steder.mjs AUT GER ...
// Edge-funksjonen fis-calendar slår opp nye steder selv, men kartoppslaget
// svarer ikke alltid derfra, så de kjente stedene legges inn på forhånd.
import { lesKalender } from '../supabase/functions/fis-calendar/parse.js'

const UA = { 'user-agent': 'Mozilla/5.0 Rennkalender/1.0 (public FIS data)' }
const ISO2 = { AUT: 'at', GER: 'de', SUI: 'ch', FRA: 'fr', ITA: 'it' }
const vent = ms => new Promise(f => setTimeout(f, ms))
const land = process.argv.slice(2)
const steder = new Map()
for (const n of land) {
  const html = await (await fetch(`https://www.fis-ski.com/DB/alpine-skiing/calendar-results.html?sectorcode=AL&seasoncode=2027&categorycode=&nationcode=${n}&seasonmonth=X-2027&saveselection=-1`, { headers: UA })).text()
  lesKalender(html).filter(x => x.host === n).forEach(x => steder.set(x.place, n))
}
const ut = []
for (const [sted, n] of steder) {
  const forsok = [sted, ...sted.split(/[|\/,(]| - /).map(d => d.replace(/\)/g, '').trim())].filter((q, i, a) => q.length > 2 && a.indexOf(q) === i)
  let k = null
  for (const q of forsok.slice(0, 3)) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${ISO2[n]}&q=${encodeURIComponent(q)}`, { headers: UA })
    const d = r.ok ? await r.json() : []
    await vent(1100)
    if (d[0]) { k = { lat: +(+d[0].lat).toFixed(4), lng: +(+d[0].lon).toFixed(4), treff: d[0].display_name }; break }
  }
  ut.push({ sted, n, ...k })
  console.error(sted, n, k ? `${k.lat},${k.lng}  ${k.treff.slice(0, 70)}` : 'IKKE FUNNET')
}
console.log(JSON.stringify(ut))
