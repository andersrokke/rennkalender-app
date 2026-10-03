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
  return rader.filter(r =>
    (sesong === 'alle' || r.sesong === Number(sesong)) &&
    (gren === 'alle' || r.gren === gren) &&
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

// Graf 1: hvert fullførte renn med poeng, eldste først, én nøkkel per gren.
export function poengOverTid(rader) {
  return rader.filter(r => r.poeng != null && r.plass != null)
    .sort((a, b) => a.race_date.localeCompare(b.race_date))
    .map(r => ({ t: Date.parse(r.race_date + 'T12:00:00Z'), dato: r.race_date, sted: r.place, gren: r.gren,
      plass: r.plass, [r.gren]: r.poeng, ['plass_' + r.gren]: r.plass }))
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
