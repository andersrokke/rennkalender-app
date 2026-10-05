// Været på renndagen, slik race_weather lagrer det.
import { supabase } from './supabase'

export const vaerNokkel = r => `${r.place}|${r.nation || ''}|${r.race_date}`

// Henter været for en liste resultatrader og legger det på hver rad som .vaer.
export async function medVaer(rader) {
  const steder = [...new Set((rader || []).map(r => r.place).filter(Boolean))]
  if (!steder.length) return rader || []
  const { data } = await supabase.from('race_weather')
    .select('place, nation, race_date, temp_morgen, temp_middag, temp_min, temp_max, nedbor_mm, sno_cm, vind_ms, sky_pct, vaerkode')
    .in('place', steder).eq('funnet', true)
  const { data: fore } = await supabase.from('race_conditions').select('place, nation, race_date, fore, note').in('place', steder)
  const m = new Map((data || []).map(v => [vaerNokkel(v), v]))
  const f = new Map((fore || []).map(v => [vaerNokkel(v), v]))
  return rader.map(r => ({ ...r, vaer: m.get(vaerNokkel(r)) || null, fore: f.get(vaerNokkel(r)) || null }))
}

// Én temperatur for dagen: midt på dagen hvis vi har den, ellers morgenen.
export const dagstemp = v => v ? (v.temp_middag ?? v.temp_morgen ?? v.temp_max ?? null) : null

// Hva slags dag var det? Rekkefølgen er det som merkes mest i bakken.
//   sno | regn | vind | sol | skyet | delvis
export function vaertype(v) {
  if (!v) return null
  if ((v.sno_cm ?? 0) >= 0.5) return 'sno'
  if ((v.nedbor_mm ?? 0) >= 1) return 'regn'
  if ((v.vind_ms ?? 0) >= 8) return 'vind'
  if (v.sky_pct == null) return null
  return v.sky_pct <= 30 ? 'sol' : v.sky_pct >= 75 ? 'skyet' : 'delvis'
}

export const VAERTEGN = { sno: '❄', regn: '☂', vind: '≋', sol: '☀', skyet: '☁', delvis: '⛅' }

// Temperaturgrupper som betyr noe for føret.
//   kaldt: under -8, kjolig: -8 til -2, mildt: over -2
export function tempgruppe(v) {
  const t = dagstemp(v)
  if (t == null) return null
  return t < -8 ? 'kaldt' : t <= -2 ? 'kjolig' : 'mildt'
}

// Resultat per gruppe. rader er berikede resultater med .vaer (se resultater.js).
// DNS holdes utenfor, som i resten av statistikken.
export function vaerGrupper(rader, gruppeAv, rekkefolge, felt = 'vaer') {
  const m = new Map()
  for (const r of rader || []) {
    if (r.dns) continue
    const g = gruppeAv(r[felt])
    if (!g) continue
    const x = m.get(g) || { gruppe: g, starter: 0, fullfort: 0, poeng: [] }
    x.starter++
    if (r.plass != null) { x.fullfort++; if (r.poeng != null) x.poeng.push(r.poeng) }
    m.set(g, x)
  }
  return rekkefolge.filter(g => m.has(g)).map(g => {
    const x = m.get(g)
    return { gruppe: g, starter: x.starter, fullfort: x.fullfort,
      andel: Math.round(100 * x.fullfort / x.starter),
      snittPoeng: x.poeng.length ? x.poeng.reduce((s, p) => s + p, 0) / x.poeng.length : null,
      bestePoeng: x.poeng.length ? Math.min(...x.poeng) : null }
  })
}
export const TEMPGRUPPER = ['kaldt', 'kjolig', 'mildt']
export const VAERTYPER = ['sol', 'delvis', 'skyet', 'sno', 'regn', 'vind']

// Føret føres av løper eller trener. Samme koder som i treningsloggen.
export const FORE = ['ice', 'salted', 'hard', 'grippy', 'soft', 'slush', 'powder', 'artificial']
export async function lagreFore(r, fore, brukerId) {
  const nokkel = { place: r.place, nation: r.nation || '', race_date: r.race_date }
  if (!fore) return supabase.from('race_conditions').delete().match(nokkel)
  return supabase.from('race_conditions').upsert({ ...nokkel, fore, set_by: brukerId, updated_at: new Date().toISOString() })
}
