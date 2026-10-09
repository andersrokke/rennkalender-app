// Hvor har løperen kjørt bra før, og går det renn der igjen? Kobler
// resultathistorikken fra FIS mot kommende renn i kalenderen. Ren utregning,
// testet i scripts/unittest/anbefalt.test.mjs.

// FIS skriver stedsnavn uten nordiske tegn i resultatene («Jolster», «Aal»,
// «Klaeppen»), kalenderen med («Jølster», «Ål», «Kläppen»).
export function stedNokkel(navn) {
  return String(navn || '').toLowerCase()
    .replace(/å/g, 'aa').replace(/[äæ]/g, 'ae').replace(/ø/g, 'o').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
// FIS skriver ö både som «o» og «oe», og ø/å på flere måter. To navn er samme
// sted når de er like, eller det ene er det andre pluss flere ord
// («Hafjell Olympiabakken» er Hafjell). «Vass» er ikke «Vassfjellet».
const varianter = n => [n, n.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/aa/g, 'a')]
export function sammeSted(a, b) {
  const x = stedNokkel(a), y = stedNokkel(b)
  if (!x || !y) return false
  return varianter(x).some(p => varianter(y).some(q =>
    p === q || p.startsWith(q + ' ') || q.startsWith(p + ' ')))
}

export const grenerIRenn = events => [...new Set(String(events || '').match(/SL|GS|SG|DH|AC/g) || [])]

const snitt = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const rund = v => v == null ? null : Math.round(v * 100) / 100

// Snittpoeng per sesong og gren. Poengene bedrer seg fra år til år, så et
// resultat måles mot snittet samme sesong - ikke mot dagens nivå.
export function sesongsnitt(resultater) {
  const m = new Map()
  resultater.forEach(r => {
    if (r.plass == null || r.poeng == null) return
    const k = `${r.sesong}|${r.gren}`
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(r.poeng)
  })
  return new Map([...m.entries()].map(([k, xs]) => [k, snitt(xs)]))
}

// Grensen for «bedre/svakere enn vanlig», i FIS-poeng mot eget sesongsnitt.
export const TERSKEL = 3

// Én rad per kommende renn der løperen har historikk i en av rennets grener.
// resultater er beriket (berik i resultater.js); renn er rader fra races.
export function godeSteder(resultater, renn, { idag, kjonn = null } = {}) {
  const snittAv = sesongsnitt(resultater)
  const ut = []
  let utenHistorikk = 0
  renn.forEach(r => {
    if (idag && r.end_date < idag) return
    if (kjonn && r.gender && !String(r.gender).split(/[\s/]+/).includes(kjonn)) return
    const grener = grenerIRenn(r.events)
    const her = resultater.filter(x => sammeSted(x.place, r.place) && (!grener.length || grener.includes(x.gren)))
    // «Startet ikke» er ikke en start på stedet.
    const startet = her.filter(x => !x.dns && !x.trening)
    if (!startet.length) { utenHistorikk++; return }
    const ferdig = startet.filter(x => x.plass != null)
    const medPoeng = ferdig.filter(x => x.poeng != null)
    const avvik = medPoeng.map(x => {
      const s = snittAv.get(`${x.sesong}|${x.gren}`)
      return s == null ? null : x.poeng - s
    }).filter(v => v != null)
    const mot = rund(snitt(avvik))
    const dom = !ferdig.length ? 'ingen' : mot == null ? 'vanlig' : mot <= -TERSKEL ? 'sterkt' : mot >= TERSKEL ? 'svakt' : 'vanlig'
    ut.push({
      renn: r, grener, dom, motSnitt: mot,
      starter: startet.length, fullfort: ferdig.length, prosent: Math.round(ferdig.length / startet.length * 100),
      bestePoeng: medPoeng.length ? Math.min(...medPoeng.map(x => x.poeng)) : null,
      snittPoeng: rund(snitt(medPoeng.map(x => x.poeng))),
      bestePlass: ferdig.length ? Math.min(...ferdig.map(x => x.plass)) : null,
      // Ett enkelt godt renn er ikke et mønster.
      tyntGrunnlag: ferdig.length < 2,
      historikk: [...her].sort((a, b) => b.race_date.localeCompare(a.race_date))
    })
  })
  const orden = { sterkt: 0, vanlig: 1, svakt: 2, ingen: 3 }
  // Et sted med bare ett fullført renn står etter de med flere, i samme gruppe.
  ut.sort((a, b) => orden[a.dom] - orden[b.dom]
    || Number(a.tyntGrunnlag) - Number(b.tyntGrunnlag)
    || (a.motSnitt ?? 0) - (b.motSnitt ?? 0)
    || a.renn.start_date.localeCompare(b.renn.start_date))
  return { rader: ut, utenHistorikk }
}
