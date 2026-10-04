// Favoritt-tabellen: løpere man følger satt opp mot egne løpere. Ren
// utregning, testet i scripts/unittest/favoritter.test.mjs.

const tall = v => v == null || v === '' ? null : Number(v)

// Gjør radene fra favoritt_tabell() klare: poeng som tall, og avstand til den
// beste egne løperen i hver gren (negativt = favoritten er bedre).
export function klargjor(rader) {
  const ut = (rader || []).map(r => ({ ...r, sl: tall(r.sl), gs: tall(r.gs), sg: tall(r.sg), dh: tall(r.dh) }))
  return ut
}

export function filtrerFav(rader, { hvem = 'alle', kjonn = 'alle' } = {}) {
  return rader.filter(r =>
    (hvem === 'alle' || (hvem === 'egne' ? r.egen : r.favoritt && !r.egen)) &&
    (kjonn === 'alle' || r.gender === kjonn))
}

// Sortert på en valgfri kolonne. Uten verdi står sist uansett retning; ved
// likhet avgjør navnet.
export function sorterFav(rader, kol = 'navn', retning = 'opp') {
  const f = retning === 'ned' ? -1 : 1
  return [...rader].sort((a, b) => {
    const x = a[kol], y = b[kol]
    const xt = x == null || x === '', yt = y == null || y === ''
    if (xt !== yt) return xt ? 1 : -1
    const c = xt ? 0 : typeof x === 'number' && typeof y === 'number' ? (x - y) * f : String(x).localeCompare(String(y), 'nb') * f
    return c || String(a.navn).localeCompare(String(b.navn), 'nb')
  })
}

// Plasseringen i utvalget for en gren: 1 er best (lavest poeng). Løpere uten
// poeng i grenen får ingen plass.
export function rangering(rader, gren) {
  const med = rader.filter(r => r[gren] != null).sort((a, b) => a[gren] - b[gren])
  return Object.fromEntries(med.map((r, i) => [r.fis_code, i + 1]))
}
