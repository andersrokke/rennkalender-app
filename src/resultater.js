// Resultathistorikken fra FIS, regnet ut uten React så det kan testes alene.
// En rad er en rad i fis_results: race_date, place, discipline, category,
// position, fis_points.

const LANG = { 'Slalom': 'SL', 'Giant Slalom': 'GS', 'Super G': 'SG', 'Super-G': 'SG',
  'Downhill': 'DH', 'Alpine Combined': 'AC', 'Combined': 'AC' }
export const grenkode = d => LANG[d] || d || '–'
export const fullfort = pos => /^\d+$/.test(String(pos ?? '').trim())

// Første sesong som tas med: 2023/24.
export const FORSTE_SESONG = 2023

// En FIS-sesong går fra juli til juni. Startåret er navnet: 2023 = 2023/24.
// Datoen leses som tekst, ikke som Date, så tidssonen ikke kan flytte et renn
// 1. juli over i forrige sesong.
export function sesongAv(dato) {
  const [y, m] = String(dato).split('-').map(Number)
  return m >= 7 ? y : y - 1
}
export const sesongNavn = s => `${s}/${String(s + 1).slice(2)}`

// Legger på det skjermen trenger: sesong, grenkode, plass og poeng som tall.
export function berik(rader) {
  return (rader || []).filter(r => r.race_date && sesongAv(r.race_date) >= FORSTE_SESONG).map(r => ({
    ...r,
    sesong: sesongAv(r.race_date),
    gren: grenkode(r.discipline),
    plass: fullfort(r.position) ? Number(r.position) : null,
    poeng: r.fis_points == null || r.fis_points === '' ? null : Number(r.fis_points)
  }))
}

export function filtrer(rader, { sesong = 'alle', gren = 'alle', kategori = 'alle', bareFullfort = false } = {}) {
  // Gren kan være én kode, 'alle', eller en liste. Tom liste betyr alle.
  const grener = Array.isArray(gren) ? gren : gren === 'alle' ? [] : [gren]
  return rader.filter(r =>
    (sesong === 'alle' || r.sesong === Number(sesong)) &&
    (!grener.length || grener.includes(r.gren)) &&
    (kategori === 'alle' || r.category === kategori) &&
    (!bareFullfort || r.plass != null))
}

// Sortering med tomme verdier sist uansett retning: et DNF skal ikke havne
// øverst bare fordi man sorterer på plass.
export function sorter(rader, kol, retning = 'opp') {
  const f = retning === 'ned' ? -1 : 1
  const verdi = r => kol === 'dato' ? r.race_date : kol === 'sted' ? r.place : kol === 'gren' ? r.gren
    : kol === 'kategori' ? r.category : kol === 'plass' ? r.plass : kol === 'poeng' ? r.poeng : r.race_date
  return [...rader].sort((a, b) => {
    const x = verdi(a), y = verdi(b)
    const xt = x == null || x === '', yt = y == null || y === ''
    if (xt || yt) return xt && yt ? 0 : xt ? 1 : -1
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nb')
    return c !== 0 ? c * f : b.race_date.localeCompare(a.race_date)
  })
}

const snitt = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const minst = xs => xs.length ? Math.min(...xs) : null

// Nøkkeltall for et utvalg. Lavere FIS-poeng er bedre, så «beste» er minst.
export function nokkeltall(rader) {
  const ferdig = rader.filter(r => r.plass != null)
  const poeng = ferdig.map(r => r.poeng).filter(p => p != null)
  return {
    starter: rader.length,
    fullfort: ferdig.length,
    ute: rader.length - ferdig.length,
    // Andel fullførte i hele prosent; null uten starter, ikke 0.
    prosent: rader.length ? Math.round(ferdig.length / rader.length * 100) : null,
    seire: ferdig.filter(r => r.plass === 1).length,
    pall: ferdig.filter(r => r.plass <= 3).length,
    topp10: ferdig.filter(r => r.plass <= 10).length,
    bestePlass: minst(ferdig.map(r => r.plass)),
    bestePoeng: minst(poeng),
    snittPoeng: snitt(poeng)
  }
}

// Én rad per sesong og gren, nyeste sesong først.
export function perSesongOgGren(rader) {
  const m = new Map()
  rader.forEach(r => {
    const k = `${r.sesong}|${r.gren}`
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(r)
  })
  const ORDEN = ['SL', 'GS', 'SG', 'DH', 'AC']
  const plass = g => { const i = ORDEN.indexOf(g); return i < 0 ? 99 : i }
  return [...m.entries()].map(([k, rs]) => {
    const [sesong, gren] = k.split('|')
    return { sesong: Number(sesong), gren, ...nokkeltall(rs) }
  }).sort((a, b) => b.sesong - a.sesong || plass(a.gren) - plass(b.gren))
}

// Oppsummeringen sortert på en valgfri kolonne. Tomme verdier sist, og ved
// likhet faller den tilbake på nyeste sesong og vanlig grenrekkefølge.
const GRENORDEN = ['SL', 'GS', 'SG', 'DH', 'AC']
const grenplass = g => { const i = GRENORDEN.indexOf(g); return i < 0 ? 99 : i }
export function sorterOppsummering(rader, kol = 'sesong', retning = 'ned') {
  const f = retning === 'ned' ? -1 : 1
  const verdi = r => kol === 'gren' ? grenplass(r.gren) : r[kol]
  return [...rader].sort((a, b) => {
    const x = verdi(a), y = verdi(b)
    const xt = x == null, yt = y == null
    if (xt !== yt) return xt ? 1 : -1
    const c = xt ? 0 : (x - y) * f
    return c || b.sesong - a.sesong || grenplass(a.gren) - grenplass(b.gren)
  })
}

// Måned for måned: hvor mange starter som ble fullført og hvor mange som endte
// med utkjøring. Viser når på sesongen det går bra og når det ryker.
const MND_KORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
export function perManed(rader) {
  const m = new Map()
  rader.forEach(r => {
    const k = r.race_date.slice(0, 7)
    const x = m.get(k) || { nokkel: k, sesong: r.sesong, starter: 0, fullfort: 0, ute: 0,
      navn: `${MND_KORT[+k.slice(5) - 1]} ${k.slice(2, 4)}` }
    x.starter++
    if (r.plass != null) x.fullfort++; else x.ute++
    m.set(k, x)
  })
  return [...m.values()].sort((a, b) => a.nokkel.localeCompare(b.nokkel))
    .map(x => ({ ...x, prosent: Math.round(x.fullfort / x.starter * 100), prosentTekst: `${Math.round(x.fullfort / x.starter * 100)} %` }))
}

// Graf 1: hvert fullførte renn med poeng, eldste først, én nøkkel per gren.
export function poengOverTid(rader) {
  return rader.filter(r => r.poeng != null && r.plass != null)
    .sort((a, b) => a.race_date.localeCompare(b.race_date))
    .map(r => ({ t: Date.parse(r.race_date + 'T12:00:00Z'), dato: r.race_date, sted: r.place, gren: r.gren,
      plass: r.plass, [r.gren]: r.poeng, ['plass_' + r.gren]: r.plass }))
}

// Sesongene i en tidsgraf som felt: fra 1. juli til 1. juli, klippet til
// dataene. Annenhver får bakgrunn, så årene skilles tydelig.
export function sesongFelt(punkter) {
  if (!punkter.length) return []
  const min = punkter[0].t, max = punkter[punkter.length - 1].t
  const sesonger = [...new Set(punkter.map(p => sesongAv(p.dato)))].sort((a, b) => a - b)
  return sesonger.map((s, i) => ({
    sesong: s, navn: sesongNavn(s), skygge: i % 2 === 1,
    fra: Math.max(min, Date.UTC(s, 6, 1)), til: Math.min(max, Date.UTC(s + 1, 6, 1)),
    // Skillelinja står ved sesongstart, bortsett fra for den første.
    skille: i > 0 ? Date.UTC(s, 6, 1) : null
  }))
}

// Graf 2: beste og snitt per sesong, én rad per sesong med felt per gren.
export function sesongGraf(rader) {
  const ut = new Map()
  perSesongOgGren(rader).forEach(x => {
    const rad = ut.get(x.sesong) || { sesong: x.sesong, navn: sesongNavn(x.sesong) }
    if (x.bestePoeng != null) rad['beste_' + x.gren] = Math.round(x.bestePoeng * 100) / 100
    if (x.snittPoeng != null) rad['snitt_' + x.gren] = Math.round(x.snittPoeng * 100) / 100
    ut.set(x.sesong, rad)
  })
  return [...ut.values()].sort((a, b) => a.sesong - b.sesong)
}
