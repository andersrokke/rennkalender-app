import { days } from './util'

// Home bases, as in the prototype: key -> [lat, lng, label]
export const HOMES = {
  kolbotn: [59.81, 10.80, 'Kolbotn'], oslo: [59.91, 10.75, 'Oslo'], drammen: [59.74, 10.20, 'Drammen'],
  asker: [59.83, 10.44, 'Asker/Bærum'], lillestrom: [59.96, 11.05, 'Lillestrøm'], hamar: [60.79, 11.07, 'Hamar'],
  lillehammer: [61.12, 10.47, 'Lillehammer'], gjovik: [60.80, 10.69, 'Gjøvik'], kongsberg: [59.67, 9.65, 'Kongsberg'],
  tonsberg: [59.27, 10.41, 'Tønsberg'], skien: [59.21, 9.61, 'Skien'], kristiansand: [58.15, 8.00, 'Kristiansand'],
  stavanger: [58.97, 5.73, 'Stavanger'], bergen: [60.39, 5.32, 'Bergen'], alesund: [62.47, 6.15, 'Ålesund'],
  molde: [62.74, 7.16, 'Molde'], trondheim: [63.43, 10.40, 'Trondheim'], bodo: [67.28, 14.40, 'Bodø'],
  narvik: [68.44, 17.42, 'Narvik'], tromso: [69.65, 18.96, 'Tromsø'],
  stockholm: [59.33, 18.07, 'Stockholm'], goteborg: [57.71, 11.97, 'Göteborg'], are: [63.40, 13.08, 'Åre'],
  sundsvall: [62.39, 17.31, 'Sundsvall'], umea: [63.83, 20.26, 'Umeå'], lulea: [65.58, 22.15, 'Luleå'],
  helsinki: [60.17, 24.94, 'Helsinki'], rovaniemi: [66.50, 25.73, 'Rovaniemi']
}
export const DEFAULT_HOME = 'kolbotn'
export const DEFAULT_PLAN = { kmRate: 3.5, hotel: 1200, entry: 350, maxGap: 2 }
export const TRIP_COLORS = ['#FFB547', '#FF7A59', '#F55FA1', '#B08CFF', '#4D8DFF', '#2ECC8F', '#E6D64A']

export const homeLL = key => {
  const h = HOMES[key] || HOMES[DEFAULT_HOME]
  return [h[0], h[1]]
}
export const homeLabel = key => (HOMES[key] || HOMES[DEFAULT_HOME])[2]
export const raceLL = r => r.venue ? [r.venue.lat, r.venue.lng] : null

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

// Chain races into trips: if the next race starts within maxGap days of the
// previous one ending, travel on instead of going home first.
export function buildTrips(races, home, settings, homeText = 'Hjem') {
  const s = { ...DEFAULT_PLAN, ...(settings || {}) }
  const sel = races.filter(raceLL).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const out = []
  let cur = null
  sel.forEach(r => {
    const prev = cur && cur.races[cur.races.length - 1]
    if (cur && dayDiff(prev.end_date, r.start_date) <= s.maxGap) {
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
    t.nights = dayDiff(t.races[0].start_date, last.end_date) + 1
    t.daysAway = t.nights + 1
    t.cost = { drive: Math.round(t.km * s.kmRate), stay: t.nights * s.hotel, fees: t.raceDays * s.entry }
    t.cost.total = t.cost.drive + t.cost.stay + t.cost.fees
    t.points = [homeLL(home), ...t.races.map(raceLL), homeLL(home)]
  })
  return out
}

export const tripTotals = ts => ts.reduce((a, t) => ({
  km: a.km + t.km, hours: a.hours + t.hours, nights: a.nights + t.nights, days: a.days + t.daysAway,
  drive: a.drive + t.cost.drive, stay: a.stay + t.cost.stay, fees: a.fees + t.cost.fees, cost: a.cost + t.cost.total
}), { km: 0, hours: 0, nights: 0, days: 0, drive: 0, stay: 0, fees: 0, cost: 0 })
