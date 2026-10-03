// Leser FIS sin kalenderside (calendar-results.html) til rader appen kan lagre.
// Ren JavaScript uten Deno-avhengigheter, så den kan testes med node:
// scripts/unittest/fis-kalender.test.mjs kjører den mot et utsnitt av siden.

const MND = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
const to = n => String(n).padStart(2, '0')
const ren = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()

// «08-11 Dec 2026», «28 Jan- 04 Feb 2027», «30 Dec 2026- 02 Jan 2027», «08 Dec 2026».
// Slutten står alltid fullt ut; starten låner måned og år derfra når de mangler.
export function lesDatoer(tekst) {
  const t = ren(tekst)
  const slutt = /(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})$/.exec(t)
  if (!slutt || !MND[slutt[2]]) return null
  const sd = +slutt[1], sm = MND[slutt[2]], sy = +slutt[3]
  const end = `${sy}-${to(sm)}-${to(sd)}`
  const for_ = t.slice(0, slutt.index).replace(/-\s*$/, '').trim()
  if (!for_) return { start: end, end }
  const s = /^(\d{1,2})(?:\s+([A-Z][a-z]{2}))?(?:\s+(\d{4}))?$/.exec(for_)
  if (!s || (s[2] && !MND[s[2]])) return null
  const d = +s[1], m = s[2] ? MND[s[2]] : sm
  // Uten årstall og med senere måned enn slutten har rennet krysset nyttår.
  const y = s[3] ? +s[3] : m > sm ? sy - 1 : sy
  const start = `${y}-${to(m)}-${to(d)}`
  return start <= end ? { start, end } : null
}

// Én rad per arrangement. Rader som ikke lar seg lese hoppes over - heller et
// manglende renn enn et renn på feil dato.
export function lesKalender(html) {
  const ut = [], sett = new Set()
  const deler = html.replace(/<!--[\s\S]*?-->/g, '').split(/(?=<div class="table-row[^"]*"[^>]*\sid="\d+")/)
  for (const del of deler) {
    const id = /^<div class="table-row[^"]*"[^>]*\sid="(\d+)"/.exec(del)
    if (!id || sett.has(id[1])) continue
    // Datoen står i en egen lenke. Klassen på den skifter med om datoen går
    // over én eller to linjer, så den gjenkjennes på innholdet i stedet.
    const dato = />((?:[^<]|<br\s*\/?>)*\b[A-Z][a-z]{2}\s+\d{4})\s*<\/a>/.exec(del)
    const sted = /<span class="bold clip-xs">([\s\S]*?)<\/span>/.exec(del)
    const nasjon = /country__name-short">([A-Z]{3})</.exec(del)
    const graa = [...del.matchAll(/<span class="gray clip">([\s\S]*?)<\/span>/g)].map(m => ren(m[1]))
    const d = dato && lesDatoer(dato[1])
    if (!d || !sted || !nasjon || graa.length < 2) continue
    const kjonn = [/gender__item_l">\s*W\s*</.test(del) && 'W', /gender__item_m">\s*M\s*</.test(del) && 'M'].filter(Boolean).join(' ')
    sett.add(id[1])
    ut.push({
      fis_event_id: +id[1], start_date: d.start, end_date: d.end, place: ren(sted[1]), host_nation: nasjon[1],
      category: graa[0], events: graa[1], gender: kjonn || 'W M',
      // FIS skriver «Not cancelled» på renn som går; «Cancelled» alene betyr avlyst.
      cancelled: /title="Cancelled"/.test(del)
    })
  }
  return ut
}
