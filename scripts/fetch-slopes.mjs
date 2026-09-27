// Henter nedfarter fra OpenStreetMap og skriver supabase/slopes.sql.
//
//   node scripts/fetch-slopes.mjs
//
// Bakkeregisteret er grunnlaget for at treningsloggen kan svare på «hva slags
// bakke var dette» uten at løperen må skrive det. OSM kjenner navn og
// vanskelighetsgrad på nedfartene - Familiebakken på Kvitfjell er «easy»,
// Nedre Olympiabakke på Hafjell er «advanced» - og det er nettopp det skillet
// en trener spør om.
//
// Overpass tåler ikke mange anlegg i samme spørring (dispatcheren timer ut),
// så skriptet går ett anlegg om gangen med pause mellom. Det tar noen minutter
// og skal kjøres sjelden.
//
// Fila er ikke en migrasjon - den skrives om hver gang skriptet kjøres, og
// migrasjoner skal ligge stille. Den kjøres inn i databasen for hånd, i
// SQL-editoren eller med psql. Alle radene er upserts, så den er trygg å
// kjøre om igjen og et delvis uttrekk legger seg oppå det som alt står der.
//
// Data: © OpenStreetMap-bidragsytere, ODbL. Attribusjonen må stå i appen.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'

// Flere instanser: den offentlige hovedinstansen svarer med jevne mellomrom
// «Dispatcher_Client ... timeout» på helt gyldige spørringer. Da byttes det
// til neste i stedet for å gi opp anlegget.
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
]
const UA = 'Rennkalender/0.1 (bakkeregister for treningslogg)'
const PAUSE_MS = 2500
const TIMEOUT_MS = 60000
const TRIES = ENDPOINTS.length

// Anlegg vi henter fra. Koordinatene er slått opp i Nominatim, OSM sin egen
// geokoder, og ikke gjettet: halvparten av de første gjetningene lå 5-9 km
// unna anlegget, og ga da tomme eller tynne treff.
// Legg til nye her og kjør skriptet på nytt; det er idempotent.
const RESORTS = [
  ['Hafjell', 61.225, 10.448, 6000],
  ['Kvitfjell', 61.465, 10.140, 6000],
  ['Trysil', 61.300, 12.270, 9000],
  ['Hemsedal', 60.870, 8.550, 6000],
  ['Geilo', 60.534, 8.206, 6000],
  ['Norefjell', 60.2177, 9.5655, 6000],
  ['Oppdal', 62.600, 9.700, 7000],
  ['Myrkdalen', 60.905, 6.510, 5000],
  ['Voss Resort', 60.6535, 6.4199, 5000],
  ['Gaustablikk', 59.8802, 8.7338, 5000],
  ['Vassfjellet', 63.233, 10.350, 4000],
  ['Skeikampen', 61.3505, 10.0852, 5000],
  ['Beitostølen', 61.2487, 8.9063, 5000],
  ['Ål skisenter', 60.640, 8.560, 4000],
  ['Oslo Vinterpark', 59.985, 10.670, 4000],
  ['Kongsberg skisenter', 59.640, 9.620, 4000],
  ['Bjorli', 62.258, 8.200, 5000],
  ['Strandafjellet', 62.2880, 6.8277, 5000],
  ['Hovden', 59.550, 7.360, 5000],
  ['Rauland', 59.720, 8.090, 5000],
  ['Røldal', 59.8265, 6.7327, 5000],
  ['Narvikfjellet', 68.4283, 17.4562, 5000],
  ['Sogndal skisenter', 61.2903, 6.9839, 5000],
  ['Sirdal', 58.9153, 6.8656, 6000]
]

const DIFFICULTIES = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride']
const sleep = ms => new Promise(r => setTimeout(r, ms))
const q = s => "'" + String(s).replace(/'/g, "''") + "'"

// Overpass svarer av og til med en HTML-feilside i stedet for JSON, og kan
// henge helt. Uten tidsavbrudd stopper hele kjøringen på ett anlegg, så hver
// forespørsel får en frist og ett nytt forsøk.
async function fetchResort(name, lat, lon, radius) {
  // Bounding box og ikke around: Overpass regner avstand for hvert element
  // innenfor omsluttende boks uansett, så around koster det samme som boksen
  // pluss avstandsregningen. På 6-9 km radius ble det minutter per anlegg.
  const dLat = radius / 111320
  const dLon = radius / (111320 * Math.cos(lat * Math.PI / 180))
  const bbox = `${(lat - dLat).toFixed(5)},${(lon - dLon).toFixed(5)},${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)}`
  const data = `[out:json][timeout:60];way["piste:type"="downhill"]["name"](${bbox});out center tags;`
  let last
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length]
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      const text = await res.text()
      if (!text.trimStart().startsWith('{')) {
        const why = (text.match(/runtime error[^<]{0,80}/i) || [`HTTP ${res.status}`])[0]
        throw new Error(why.trim())
      }
      return JSON.parse(text).elements || []
    } catch (err) {
      last = err
      if (attempt < TRIES - 1) await sleep(PAUSE_MS)
    }
  }
  throw last
}

// OSM deler ofte én nedfart i flere ways med samme navn. For en nedtrekksliste
// vil vi ha én rad per bakke, så de slås sammen: midtpunktet er snittet, og
// vanskelighetsgraden er den som går igjen oftest.
function merge(rows) {
  const by = new Map()
  for (const r of rows) {
    const key = r.resort + '\u0000' + r.name
    const g = by.get(key) || { ...r, lats: [], lngs: [], diffs: [], ids: [] }
    if (r.lat != null) { g.lats.push(r.lat); g.lngs.push(r.lng) }
    if (r.difficulty) g.diffs.push(r.difficulty)
    g.ids.push(r.osm_way_id)
    by.set(key, g)
  }
  return [...by.values()].map(g => {
    const counts = {}
    g.diffs.forEach(d => { counts[d] = (counts[d] || 0) + 1 })
    const difficulty = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
    return {
      resort: g.resort,
      name: g.name,
      difficulty,
      lat: avg(g.lats),
      lng: avg(g.lngs),
      osm_way_id: Math.min(...g.ids),
      segments: g.ids.length
    }
  }).sort((a, b) => a.resort.localeCompare(b.resort, 'nb') || a.name.localeCompare(b.name, 'nb'))
}

// node scripts/fetch-slopes.mjs Norefjell "Voss Resort"
// henter bare de anleggene. Den genererte SQL-en er en upsert, så et utvalg
// legger seg oppå det som alt står i basen. Uten argumenter hentes alle.
const only = process.argv.slice(2)
const todo = only.length
  ? RESORTS.filter(r => only.some(o => o.toLowerCase() === r[0].toLowerCase()))
  : RESORTS
if (only.length && !todo.length) {
  console.error('Fant ingen anlegg som matcher: ' + only.join(', '))
  process.exit(1)
}

const all = []
const failed = []
for (const [name, lat, lon, radius] of todo) {
  try {
    const els = await fetchResort(name, lat, lon, radius)
    for (const e of els) {
      const t = e.tags || {}
      const d = (t['piste:difficulty'] || '').toLowerCase()
      all.push({
        resort: name,
        name: t.name.trim(),
        difficulty: DIFFICULTIES.includes(d) ? d : null,
        lat: e.center?.lat ?? null,
        lng: e.center?.lon ?? null,
        osm_way_id: e.id
      })
    }
    console.log(`${name.padEnd(22)} ${String(els.length).padStart(4)} nedfarter`)
  } catch (err) {
    failed.push(name)
    console.log(`${name.padEnd(22)} FEIL: ${err.message}`)
  }
  await sleep(PAUSE_MS)
}

// Et delvis uttrekk skal legge seg til, ikke erstatte. Uten dette ville
// «hent Norefjell» skrevet en slopes.sql med bare Norefjell i, og de andre
// anleggene forsvunnet fra repoet selv om de står trygt i databasen.
const OUT = new URL('../supabase/slopes.sql', import.meta.url)
function keepOthers(fetched) {
  if (!only.length || !existsSync(OUT)) return []
  const skip = new Set(fetched)
  return readFileSync(OUT, 'utf8').split('\n')
    .filter(l => l.startsWith('  ('))
    .map(l => l.replace(/,$/, ''))
    .filter(l => {
      const m = /^ {2}\(\d+, '((?:[^']|'')*)'/.exec(l)
      return m && !skip.has(m[1].replace(/''/g, "'"))
    })
}

const rows = merge(all)
const fresh = rows.map(r =>
  `  (${r.osm_way_id}, ${q(r.resort)}, ${q(r.name)}, ${r.difficulty ? q(r.difficulty) : 'null'}, ` +
  `${r.lat?.toFixed(6) ?? 'null'}, ${r.lng?.toFixed(6) ?? 'null'}, ${r.segments})`)
const lines = [...keepOthers(todo.map(r => r[0])), ...fresh]
  .sort((a, b) => a.localeCompare(b, 'nb'))

const sql = `-- Bakkeregister, generert av scripts/fetch-slopes.mjs ${new Date().toISOString().slice(0, 10)}.
-- Ikke rediger for hånd: kjør skriptet på nytt.
--
-- Data: © OpenStreetMap-bidragsytere, ODbL (opendatacommons.org/licenses/odbl).
-- ${lines.length} nedfarter. Sist hentet: ${todo.map(r => r[0]).join(', ')}.

insert into public.slopes (osm_way_id, resort, name, difficulty, lat, lng, segments) values
${lines.join(',\n')}
on conflict (resort, name) do update set
  osm_way_id = excluded.osm_way_id,
  difficulty = excluded.difficulty,
  lat = excluded.lat,
  lng = excluded.lng,
  segments = excluded.segments,
  updated_at = now();
`
writeFileSync(OUT, sql)
console.log(`\n${rows.length} nye bakker fra ${all.length} OSM-ways, ${lines.length} totalt -> supabase/slopes.sql`)
if (failed.length) console.log(`Hentet ikke: ${failed.join(', ')} - kjør på nytt for disse.`)
