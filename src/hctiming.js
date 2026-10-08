// Leser CSV-eksporten fra HC Timing («Ranking») til rader appen kan lagre i
// timing_runs. Ren utregning, testet i scripts/unittest/hctiming.test.mjs.
//
// Fila ser slik ut:
//   "sep=,"
//   Ranking
//   RANK,STA#,RUN#,BIB#,NAME,"INTER 1",...,"INTER 2",...,FINISH,...,COMMENT
//   1,5,1,11,"ETTERNAVN Fornavn","12,39","'+0,00",,1,"34,93",...
//
// Tidene er kumulative fra start, i sekunder, med komma eller punktum som
// desimaltegn avhengig av hvordan fila er eksportert. Det er samme
// konvensjon som splits_ms i basen: mellomtidene er løpende, ikke per seksjon.

// Én linje CSV med anførselstegn, uten å ta inn et bibliotek for det.
export function csvLinje(linje, skille = ',') {
  const ut = []; let cur = '', q = false
  for (let i = 0; i < linje.length; i++) {
    const c = linje[i]
    if (q) { if (c === '"') { if (linje[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === skille) { ut.push(cur); cur = '' }
    else cur += c
  }
  ut.push(cur)
  return ut.map(x => x.trim())
}

// «46,32», «46.32», «1:02,45» -> millisekunder. Alt annet (DNF, tomt) -> null.
export function tidTilMs(v) {
  const s = String(v ?? '').replace(/^'/, '').trim()
  const m = /^(?:(\d+):)?(\d{1,3})[.,](\d{1,3})$/.exec(s) || /^(?:(\d+):)?(\d{1,3})$/.exec(s)
  if (!m) return null
  const min = m[1] ? +m[1] : 0, sek = +m[2], brok = m[3] ? +(m[3] + '00').slice(0, 3) : 0
  return (min * 60 + sek) * 1000 + brok
}

const STATUSORD = /^(DNF|DSQ|DNS|DQ)\d?$/i

export function lesHcTiming(tekst) {
  const linjer = String(tekst || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.trimEnd()).filter(l => l !== '')
  let skille = ','
  const sep = /^"?sep=(.)"?$/i.exec(linjer[0] || '')
  if (sep) { skille = sep[1]; linjer.shift() }
  // Overskriftsraden er den første som har både et navn og en måltid.
  const hi = linjer.findIndex(l => /(^|[,;\t])"?NAME"?([,;\t]|$)/i.test(l) && /FINISH/i.test(l))
  if (hi < 0) return { feil: 'ukjent', rader: [], mellomtider: 0, hoder: [] }
  const hoder = csvLinje(linjer[hi], skille).map(h => h.toUpperCase())
  const kol = navn => hoder.indexOf(navn)
  const iNavn = kol('NAME'), iMal = kol('FINISH'), iBib = kol('BIB#'), iRun = kol('RUN#'), iSta = kol('STA#'), iRank = kol('RANK'), iKomm = kol('COMMENT')
  // Mellomtidene: «INTER 1», «INTER 2» ... i den rekkefølgen de står.
  const inter = hoder.map((h, i) => (/^INTER \d+$/.test(h) ? i : -1)).filter(i => i >= 0)
  const dsq = hoder.map((h, i) => (/ DSQ$/.test(h) ? i : -1)).filter(i => i >= 0)

  const rader = []
  for (const linje of linjer.slice(hi + 1)) {
    const c = csvLinje(linje, skille)
    const navn = c[iNavn]
    if (!navn) continue
    const malTekst = c[iMal] || ''
    const total = tidTilMs(malTekst)
    const mellom = inter.map(i => tidTilMs(c[i]))
    // Løpet er bare gyldig hvis mellomtidene stiger og ender før måltiden.
    const gyldige = mellom.filter(v => v != null)
    const stiger = gyldige.every((v, i) => i === 0 || v > gyldige[i - 1]) && (total == null || !gyldige.length || gyldige[gyldige.length - 1] < total)
    const disket = dsq.some(i => (c[i] || '').trim() !== '')
    const ord = [malTekst, ...inter.map(i => c[i] || '')].map(x => x.trim()).find(x => STATUSORD.test(x))
    const status = disket ? 'DSQ' : total != null ? 'OK' : ord ? ord.toUpperCase().replace(/\d$/, '') : 'DNF'
    rader.push({
      source_name: navn,
      bib: iBib >= 0 ? (c[iBib] || null) : null,
      run_no: iRun >= 0 && /^\d+$/.test(c[iRun] || '') ? +c[iRun] : null,
      run_time_ms: status === 'OK' && stiger ? total : null,
      run_time_text: malTekst || null,
      status: status === 'OK' && !stiger ? 'FEIL' : status,
      // Fullførte løp får alle mellomtidene; brutte løp de som rakk å bli tatt.
      splits_ms: mellom,
      extra: { sta: iSta >= 0 ? c[iSta] || null : null, rank: iRank >= 0 ? c[iRank] || null : null, kommentar: iKomm >= 0 ? c[iKomm] || null : null },
      // Uten startnummer lagt inn ved start vet ikke tidtakeren hvem som kjørte.
      ukjent: /NO BIB INPUT/i.test(navn)
    })
  }
  return { feil: null, rader, mellomtider: inter.length, hoder, kilde: 'HC Timing' }
}

// Brower Timing eksporterer én økt per fil, med «>» som skilletegn:
//   sep=>
//   SESSION
//   Team Name>NTG
//   Date>09/27/26
//   Snow conditions>Hard
//   ...
//   Bib#>Name>YOB>Class>Gender>Start Time>Finish Time>Split 1>Split 2>Split 3>Status>SEQ>Run#
//   94>Hugo>2008>U21>Male>4:56:45.382 PM>28,63>0>0>0>>81>8
// Navnet er bare fornavnet, og en rad uten navn er et startnummer tidtakeren
// ikke har satt navn på. Finish Time er løpets tid i sekunder; 0 betyr ingen
// tid. Mellomtidene er løpende fra start, 0 betyr ikke tatt.
const BROWER_FORE = { hard: 'hard', ice: 'ice', icy: 'ice', soft: 'soft', slush: 'slush', powder: 'powder', salted: 'salted', salt: 'salted' }
const BROWER_GREN = { sl: 'SL', slalom: 'SL', gs: 'GS', 'giant slalom': 'GS', sg: 'SG', 'super g': 'SG', 'super-g': 'SG', dh: 'DH', downhill: 'DH' }

export function erBrower(tekst) {
  const topp = String(tekst || '').slice(0, 200)
  return /^\ufeff?"?sep=>"?\s*\r?\n\s*SESSION/i.test(topp)
}

export function lesBrower(tekst) {
  const linjer = String(tekst || '').replace(/^\ufeff/, '').split(/\r?\n/).map(l => l.trimEnd())
  const hi = linjer.findIndex(l => /^Bib#>/i.test(l) && />Name>/i.test(l) && />Finish Time>/i.test(l))
  if (hi < 0) return { feil: 'ukjent', rader: [], mellomtider: 0, hoder: [] }
  // Hodet: nøkkel>verdi, fram til kolonneraden.
  const okt = {}
  for (const l of linjer.slice(0, hi)) {
    const m = /^([^>]+)>(.*)$/.exec(l)
    if (m) okt[m[1].trim().toLowerCase()] = m[2].trim()
  }
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(okt.date || '')
  const dato = dm ? `${dm[3].length === 2 ? '20' + dm[3] : dm[3]}-${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}` : null
  const hoder = linjer[hi].split('>').map(h => h.trim().toUpperCase())
  const kol = navn => hoder.indexOf(navn)
  const iBib = kol('BIB#'), iNavn = kol('NAME'), iMal = kol('FINISH TIME'), iStatus = kol('STATUS'), iRun = kol('RUN#'), iSeq = kol('SEQ'), iStart = kol('START TIME')
  const inter = hoder.map((h, i) => (/^SPLIT \d+$/.test(h) ? i : -1)).filter(i => i >= 0)
  const ms = v => { const x = tidTilMs(v); return x ? x : null }   // 0 er «ingen tid»

  const rader = []
  for (const linje of linjer.slice(hi + 1)) {
    if (!linje.trim()) continue
    const c = linje.split('>').map(x => x.trim())
    const bib = c[iBib] || null
    const navn = c[iNavn] || ''
    if (!navn && !bib) continue
    const total = ms(c[iMal])
    const mellom = inter.map(i => ms(c[i]))
    const gyldige = mellom.filter(v => v != null)
    const stiger = gyldige.every((v, i) => i === 0 || v > gyldige[i - 1]) && (total == null || !gyldige.length || gyldige[gyldige.length - 1] < total)
    const ord = (c[iStatus] || '').toUpperCase()
    const status = total != null ? (stiger ? 'OK' : 'FEIL') : STATUSORD.test(ord) ? ord.replace(/\d$/, '') : 'DNF'
    rader.push({
      // Uten navn kjennes løpet bare på startnummeret; det er nok til å huske
      // hvem som hadde det sist.
      source_name: navn || `#${bib}`,
      bib,
      run_no: iRun >= 0 && /^\d+$/.test(c[iRun] || '') ? +c[iRun] : null,
      run_time_ms: status === 'OK' ? total : null,
      run_time_text: c[iMal] && c[iMal] !== '0' ? c[iMal] : null,
      status,
      splits_ms: mellom.filter(v => v != null).length ? mellom : [],
      extra: { seq: iSeq >= 0 ? c[iSeq] || null : null, start: iStart >= 0 ? c[iStart] || null : null },
      ukjent: false
    })
  }
  // Eldste løp først, slik HC Timing-lista også leses.
  rader.sort((a, b) => (+a.extra.seq || 0) - (+b.extra.seq || 0))
  return {
    feil: null, rader, mellomtider: rader.some(r => r.splits_ms.length) ? inter.length : 0, hoder, kilde: 'Brower',
    okt: {
      dato, lag: okt['team name'] || null, navn: okt['start list name'] || null, nr: okt['session #'] || null,
      bakke: okt.hill || null, gren: BROWER_GREN[(okt.event || '').toLowerCase()] || null,
      fore: BROWER_FORE[(okt['snow conditions'] || '').toLowerCase()] || null, vaer: okt.weather || null
    }
  }
}

// Kjenner igjen fila og leser den med riktig leser.
export function lesTidtaking(tekst) {
  return erBrower(tekst) ? lesBrower(tekst) : lesHcTiming(tekst)
}

// «ETTERNAVN Fornavn Mellomnavn» fra fila mot «Fornavn Mellomnavn Etternavn» i
// appen. Tidtakeren skriver ofte uten nordiske tegn (OE for Ø, AA for Å).
const ren = s => String(s || '').toLowerCase()
  .replace(/å/g, 'aa').replace(/[äæ]/g, 'ae').replace(/[øö]/g, 'oe').replace(/ü/g, 'ue')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()
const varianter = s => { const a = ren(s); return [a, a.replace(/aa/g, 'a').replace(/oe/g, 'o').replace(/ae/g, 'a').replace(/ue/g, 'u')] }
const ordsett = s => new Set(s.split(' ').filter(Boolean))

// Foreslår hvilken løper et navn i fila hører til. Krever at alle ordene i det
// korteste navnet finnes i det andre, og minst to ord - ett felles fornavn er
// ikke nok til å koble noens tider til en annen.
// Brower skriver bare fornavnet. Da godtas ett ord, men bare som fornavnet
// til nøyaktig én løper på laget.
export function foreslaLoper(kildenavn, lopere) {
  const treff = lopere.filter(l => varianter(kildenavn).some(a => varianter(l.full_name).some(b => {
    const x = ordsett(a), y = ordsett(b)
    if (x.size === 1) { const o = [...x][0]; return o.length >= 3 && b.split(' ')[0] === o }
    const [kort, lang] = x.size <= y.size ? [x, y] : [y, x]
    return kort.size >= 2 && [...kort].every(o => lang.has(o))
  })))
  // Flere mulige er ikke et forslag.
  return treff.length === 1 ? treff[0].id : null
}

// Forslag til hvem hvert navn i fila er, så treneren bare må se over.
// Rekkefølgen er fra sikrest til svakest:
//   husket - treneren har koblet akkurat dette navnet før
//   navn   - navnet stemmer entydig med én løper på laget
//   bib    - løperen hadde dette startnummeret sist det ble lastet opp
// Et startnummer kan ha byttet eier, så det brukes bare når navnet ikke gir
// noe, og aldri for en løper som alt er funnet på en sikrere måte.
//
//   navn:     [{ navn, bibs: ['7'], ukjent }]
//   lopere:   [{ id, full_name }]
//   kjente:   { 'ETTERNAVN Fornavn': athlete_id }      fra timing_aliases
//   sisteBib: { '7': athlete_id }                      fra forrige opplastinger
export function foreslaKoblinger(navn, { lopere = [], kjente = {}, sisteBib = {} } = {}) {
  const paLaget = new Set(lopere.map(l => l.id))
  const ut = {}, brukt = new Set()
  const sett = (n, id, grunn) => { ut[n.navn] = { id, grunn }; brukt.add(id) }
  for (const n of navn) {
    const id = kjente[n.navn]
    if (id && paLaget.has(id)) sett(n, id, 'husket')
  }
  for (const n of navn) {
    if (ut[n.navn] || n.ukjent) continue
    const id = foreslaLoper(n.navn, lopere)
    if (id && !brukt.has(id)) sett(n, id, 'navn')
  }
  for (const n of navn) {
    if (ut[n.navn] || n.ukjent) continue
    // Bare når alle løpene til navnet har samme startnummer.
    const bibs = [...new Set(n.bibs || [])]
    const id = bibs.length === 1 ? sisteBib[bibs[0]] : null
    if (id && paLaget.has(id) && !brukt.has(id)) sett(n, id, 'bib')
  }
  for (const n of navn) if (!ut[n.navn]) ut[n.navn] = { id: null, grunn: n.ukjent ? 'utenBib' : 'ukjent' }
  return ut
}
