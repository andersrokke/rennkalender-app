// Finn koordinatene til et sted slik FIS skriver det.
//
// FIS bruker bare a-z: «Aal» er Ål, «Are» er Åre, «Taernaby» er Tärnaby og
// «Jolster» er Jølster. Begge skrivemåter kokes ned til samme skjelett, så
// de møtes uansett hvilken vei omskrivingen gikk.
export function skjelett(s) {
  return String(s || '').toLowerCase()
    .replace(/[åäæ]/g, 'a').replace(/[öø]/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/aa|ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

// steder: [{ name, country, lat, lng }]. Nasjonen må stemme når begge har en.
export function finnSted(place, nation, steder) {
  const p = skjelett(place)
  if (!p) return null
  const kandidater = steder.filter(s => s.lat != null && s.lng != null
    && (!nation || !s.country || String(s.country).trim() === nation))
  const lik = kandidater.find(s => skjelett(s.name) === p)
  if (lik) return lik
  // «Hafjell Olympiabakken» er Hafjell: stedsnavnet står først, som hele ord.
  const forst = kandidater
    .filter(s => { const n = skjelett(s.name); return n.length >= 3 && (p.startsWith(n + ' ') || n.startsWith(p + ' ')) })
    .sort((a, b) => skjelett(b.name).length - skjelett(a.name).length)[0]
  return forst || null
}

const snitt = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null
const r1 = v => v == null ? null : Math.round(v * 10) / 10

// Koker et døgn med timeverdier ned til det som sier noe om renndagen.
// hourly: { time: ['2025-01-18T00:00', ...], temperature_2m: [...], ... }
export function dagsvaer(hourly) {
  if (!hourly?.time?.length) return null
  const time = hourly.time.map(t => Number(t.slice(11, 13)))
  const kl = (felt, fra, til) => (hourly[felt] || []).filter((v, i) => v != null && time[i] >= fra && time[i] <= til)
  const pa = (felt, h) => { const i = time.indexOf(h); const v = i < 0 ? null : hourly[felt]?.[i]; return v ?? null }
  const temp = kl('temperature_2m', 7, 15)
  if (!temp.length) return null
  return {
    temp_morgen: r1(pa('temperature_2m', 9)), temp_middag: r1(pa('temperature_2m', 12)),
    temp_min: r1(Math.min(...temp)), temp_max: r1(Math.max(...temp)),
    nedbor_mm: r1(kl('precipitation', 7, 15).reduce((s, x) => s + x, 0)),
    sno_cm: r1(kl('snowfall', 7, 15).reduce((s, x) => s + x, 0)),
    vind_ms: r1(snitt(kl('wind_speed_10m', 8, 14))),
    sky_pct: (v => v == null ? null : Math.round(v))(snitt(kl('cloud_cover', 8, 14))),
    vaerkode: pa('weather_code', 11)
  }
}
