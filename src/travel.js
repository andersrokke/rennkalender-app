import { days } from './util'

// Home bases from the prototype, including the ski high schools (NTG,
// skigymnas, skidgymnasium, urheilulukio): key -> [lat, lng, label]
export const HOMES = {
  kolbotn: [59.81, 10.80, "Kolbotn"],
  geilo: [60.53, 8.21, "Geilo (NTG)"],
  hafjell: [61.23, 10.45, "Hafjell/Lillehammer (NTG)"],
  baerum: [59.89, 10.52, "Bærum (NTG)"],
  tromso_ntg: [69.65, 18.96, "Tromsø (NTG)"],
  oppdal: [62.59, 9.69, "Oppdal (skigymnas)"],
  voss: [60.63, 6.42, "Voss (skigymnas)"],
  narvik_sg: [68.44, 17.42, "Narvik (skigymnas)"],
  trysil: [61.31, 12.27, "Trysil (skigymnas)"],
  hovden: [59.55, 7.35, "Hovden (skigymnas)"],
  sirdal: [58.90, 6.88, "Sirdal (skigymnas)"],
  hemsedal: [60.86, 8.54, "Hemsedal"],
  bardufoss: [69.06, 18.51, "Bardufoss"],
  meraker: [63.42, 11.75, "Meråker"],
  jarpen: [63.35, 13.47, "Järpen/Åre (skidgymnasium)"],
  malung: [60.68, 13.71, "Malung/Sälen (skidgymnasium)"],
  tarnaby_sg: [65.72, 15.30, "Tärnaby (skidgymnasium)"],
  gallivare_sg: [67.12, 20.65, "Gällivare (skidgymnasium)"],
  vuokatti: [64.13, 28.30, "Vuokatti/Sotkamo (urheilulukio)"],
  oslo: [59.91, 10.75, "Oslo"],
  drammen: [59.74, 10.20, "Drammen"],
  asker: [59.83, 10.44, "Asker/Bærum"],
  lillestrom: [59.96, 11.05, "Lillestrøm"],
  hamar: [60.79, 11.07, "Hamar"],
  lillehammer: [61.12, 10.47, "Lillehammer"],
  gjovik: [60.80, 10.69, "Gjøvik"],
  kongsberg: [59.67, 9.65, "Kongsberg"],
  tonsberg: [59.27, 10.41, "Tønsberg"],
  skien: [59.21, 9.61, "Skien"],
  kristiansand: [58.15, 8.00, "Kristiansand"],
  stavanger: [58.97, 5.73, "Stavanger"],
  bergen: [60.39, 5.32, "Bergen"],
  alesund: [62.47, 6.15, "Ålesund"],
  molde: [62.74, 7.16, "Molde"],
  trondheim: [63.43, 10.40, "Trondheim"],
  bodo: [67.28, 14.40, "Bodø"],
  narvik: [68.44, 17.42, "Narvik"],
  tromso: [69.65, 18.96, "Tromsø"],
  stockholm: [59.33, 18.07, "Stockholm"],
  goteborg: [57.71, 11.97, "Göteborg"],
  are: [63.40, 13.08, "Åre"],
  sundsvall: [62.39, 17.31, "Sundsvall"],
  umea: [63.83, 20.26, "Umeå"],
  lulea: [65.58, 22.15, "Luleå"],
  helsinki: [60.17, 24.94, "Helsinki"],
  rovaniemi: [66.50, 25.73, "Rovaniemi"]
}

export const DEFAULT_HOME = 'kolbotn'
export const DEFAULT_PLAN = { kmRate: 3.5, hotel: 1200, entry: 350, lift: 300, maxGap: 2, joins: [], splits: [] }
export const TRIP_COLORS = ['#FFB547', '#FF7A59', '#F55FA1', '#B08CFF', '#4D8DFF', '#2ECC8F', '#E6D64A']

export const homeLL = key => {
  const h = HOMES[key] || HOMES[DEFAULT_HOME]
  return [h[0], h[1]]
}
export const homeLabel = key => (HOMES[key] || HOMES[DEFAULT_HOME])[2]
export const raceLL = r => r.venue ? [r.venue.lat, r.venue.lng] : null

// Number of starts for one athlete, as in the prototype: "4xGS 4xSL" -> 8,
// "GS SL" -> 2. A race run for both genders is halved, since an athlete only
// starts in their own class.
export function starts(r) {
  const ev = r.events || ''
  const tot = (ev.match(/(\d+)x/g) || []).reduce((a, m) => a + parseInt(m), 0)
    || (ev.match(/SL|GS|SG|DH/g) || []).length
  return r.gender === 'W M' ? Math.max(1, Math.round(tot / 2)) : tot
}

// Great-circle distance in km.
function haversine(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180
  const dLat = toR(b[0] - a[0]), dLon = toR(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
// Driving distance is estimated as straight line x 1.3, as in the prototype.
export const roadKm = (a, b) => Math.round(haversine(a, b) * 1.3)
export const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5)
export const nok = n => Math.round(n).toLocaleString('nb-NO')

// Distance from home to a race, for the "412 km fra hjem" label.
export function kmFromHome(race, home) {
  const ll = raceLL(race)
  return ll ? roadKm(homeLL(home), ll) : null
}

// Chain races into round trips from home. Races within maxGap days continue
// the current trip; `joins` forces a race onto the previous trip and `splits`
// forces a new trip, so the athlete can override the automatic chaining.
export function buildTrips(races, home, settings, homeText = 'Hjem') {
  const s = { ...DEFAULT_PLAN, ...(settings || {}) }
  const joins = new Set(s.joins || []), splits = new Set(s.splits || [])
  const sel = races.filter(raceLL).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const out = []
  let cur = null
  sel.forEach(r => {
    const prev = cur && cur.races[cur.races.length - 1]
    const gapOk = cur && dayDiff(prev.end_date, r.start_date) <= s.maxGap
    if (cur && !splits.has(r.id) && (gapOk || joins.has(r.id))) {
      cur.legs.push({ from: prev.place, to: r.place, km: roadKm(raceLL(prev), raceLL(r)) })
      cur.races.push(r)
    } else {
      if (cur) out.push(cur)
      cur = { races: [r], legs: [{ from: homeText, to: r.place, km: roadKm(homeLL(home), raceLL(r)) }] }
    }
  })
  if (cur) out.push(cur)

  out.forEach(t => {
    const last = t.races[t.races.length - 1]
    t.legs.push({ from: last.place, to: homeText, km: roadKm(raceLL(last), homeLL(home)) })
    t.km = t.legs.reduce((a, l) => a + l.km, 0)
    t.hours = Math.round(t.km / 70 * 10) / 10
    t.raceDays = t.races.reduce((a, r) => a + days(r), 0)
    t.starts = t.races.reduce((a, r) => a + starts(r), 0)
    t.nights = dayDiff(t.races[0].start_date, last.end_date) + 1
    t.daysAway = t.nights + 1
    // Entry fee and lift pass are charged per start, not per race day.
    t.cost = {
      drive: Math.round(t.km * s.kmRate), stay: t.nights * s.hotel,
      fees: t.starts * s.entry, lift: t.starts * s.lift
    }
    t.cost.total = t.cost.drive + t.cost.stay + t.cost.fees + t.cost.lift
    t.points = [homeLL(home), ...t.races.map(raceLL), homeLL(home)]
  })
  return out
}

export const tripTotals = ts => ts.reduce((a, t) => ({
  km: a.km + t.km, hours: a.hours + t.hours, nights: a.nights + t.nights, days: a.days + t.daysAway,
  starts: a.starts + t.starts, drive: a.drive + t.cost.drive, stay: a.stay + t.cost.stay,
  fees: a.fees + t.cost.fees, lift: a.lift + t.cost.lift, cost: a.cost + t.cost.total
}), { km: 0, hours: 0, nights: 0, days: 0, starts: 0, drive: 0, stay: 0, fees: 0, lift: 0, cost: 0 })
