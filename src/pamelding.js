// Foreldrenes påmeldingsoversikt, regnet ut uten React. En rad er ett barns
// ene renn slik barnas_pamelding() gir det.

const DOGN = 864e5

// Hvor påmeldingen står. «bekreftet» er det eneste som er sett på
// deltakerlista; «merket» er at løperen selv har sagt at hun er påmeldt.
export function pameldt(r) {
  if (r.pa_lista) return 'bekreftet'
  if (r.status === 'entered') return 'merket'
  return 'nei'
}

// Hele dager igjen til fristen, rundet opp: 0 er i dag, negativt er passert.
export function dagerIgjen(frist, na = Date.now()) {
  if (!frist) return null
  return Math.ceil((new Date(frist).getTime() - na) / DOGN)
}

// Gruppa raden hører til i oversikten.
//   haster  - ikke påmeldt, fristen er innen sju dager
//   utgatt  - ikke påmeldt, fristen er passert
//   kommer  - ikke påmeldt, fristen er lenger unna
//   ukjent  - ikke påmeldt, ingen frist kjent ennå
//   pameldt - bekreftet på lista eller merket av løperen
export function gruppeFor(r, na = Date.now()) {
  if (pameldt(r) !== 'nei') return 'pameldt'
  const d = dagerIgjen(r.frist, na)
  if (d == null) return 'ukjent'
  if (new Date(r.frist).getTime() < na) return 'utgatt'
  return d <= 7 ? 'haster' : 'kommer'
}

export const GRUPPER = ['haster', 'utgatt', 'kommer', 'ukjent', 'pameldt']

// Radene delt i grupper. Med frist sorteres det på fristen, ellers på rennets
// dato - det som brenner først står øverst.
export function ordne(rader, na = Date.now()) {
  const ut = Object.fromEntries(GRUPPER.map(g => [g, []]))
  rader.forEach(r => ut[gruppeFor(r, na)].push({ ...r, dager: dagerIgjen(r.frist, na), pameldt: pameldt(r) }))
  const tid = r => r.frist ? new Date(r.frist).getTime() : Infinity
  for (const g of GRUPPER) {
    ut[g].sort((a, b) => (g === 'ukjent' || g === 'pameldt' ? 0 : tid(a) - tid(b))
      || a.start_date.localeCompare(b.start_date) || (a.athlete_name || '').localeCompare(b.athlete_name || '', 'nb'))
  }
  return ut
}

// Hvor et renn meldes på, og når fristen er - slik det vises under hvert renn
// i kalenderen.
//   Norske og svenske renn meldes på i iSonen. Er rennet funnet der, går
//   lenka rett til arrangementet og fristen er iSonens.
//   Renn i andre land meldes på av trener eller klubb gjennom Skiforbundet,
//   med frist 20 dager før start.
// Svenske renn som ikke er åpnet i iSonen ennå, viser forbundets frist til
// iSonens er kjent.
export const ISONEN = 'https://isonen.no'
export const isonenLenke = id => id ? `${ISONEN}/event/${id}/` : ISONEN
export function pameldingInfo(r) {
  const iIsonen = r.host_nation === 'NOR' || r.host_nation === 'SWE'
  const forbundsfrist = () => {
    const d = new Date(r.start_date + 'T23:59:00')
    d.setDate(d.getDate() - 20)
    return d.toISOString()
  }
  if (r.signup_deadline) return { frist: r.signup_deadline, kilde: 'isonen', lenke: isonenLenke(r.isonen_id), apnet: !!r.isonen_id, iIsonen: true }
  if (r.isonen_id) return { frist: null, kilde: null, lenke: isonenLenke(r.isonen_id), apnet: true, iIsonen: true }
  if (r.host_nation === 'NOR') return { frist: null, kilde: null, lenke: ISONEN, apnet: false, iIsonen: true }
  return { frist: forbundsfrist(), kilde: 'forbund', lenke: iIsonen ? ISONEN : null, apnet: false, iIsonen }
}
