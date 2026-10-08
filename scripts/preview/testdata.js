// Testdata med innhold. Tomme lister skjuler feil i listevisning, sortering
// og gruppering - det er der de fleste feilene bor. Deterministisk, så bildet
// er det samme hver gang.

let frø = 42
const rnd = n => { frø = (frø * 16807) % 2147483647; return frø % n }
const velg = a => a[rnd(a.length)]
const iso = d => d.toISOString().slice(0, 10)
const dager = n => { const d = new Date('2026-09-28T12:00:00'); d.setDate(d.getDate() + n); return d }

const base = { onboarded: true, is_admin: false, is_test: false, lang: 'no', theme: 'light',
  home_city: null, plan_settings: { entry: 350, hotel: 1200, kmRate: 3.5, maxGap: 2 } }
export const LOPERE = [
  { id: 'a1', full_name: 'Ida Moen', birth_year: 2009, gender: 'W', fis_code: '6535001', link_code: 'k1' },
  { id: 'a2', full_name: 'Jonas Berg', birth_year: 2008, gender: 'M', fis_code: '6535002', link_code: 'k2' },
  { id: 'a3', full_name: 'Sara Vik', birth_year: 2009, gender: 'W', fis_code: null, link_code: 'k3' },
  { id: 'lukas', full_name: 'Lukas Røkke', birth_year: 2009, gender: 'M', fis_code: '6535004', link_code: 'k4' }
].map(p => ({ ...base, role: 'athlete', team_id: 'ntg', ...p }))
export const TRENER = { ...base, id: 'oscar', full_name: 'Oscar Andersson', role: 'coach', team_id: 'ntg', link_code: 'x' }

export const TEAM = { id: 'ntg', name: 'NTG Lillehammer', club: 'NTG', owner_id: 'oscar', invite_code: 'H6U6Z8',
  parent_team_id: null, coaches_see_all: false, created_at: '2026-09-28' }

export const VENUES = [
  { id: 1, name: 'Hafjell', country: 'NOR', lat: 61.23, lng: 10.45 },
  { id: 2, name: 'Kvitfjell', country: 'NOR', lat: 61.47, lng: 10.14 },
  { id: 3, name: 'Trysil', country: 'NOR', lat: 61.30, lng: 12.27 },
  { id: 4, name: 'Åre', country: 'SWE', lat: 63.40, lng: 13.08 },
  { id: 5, name: 'Levi', country: 'FIN', lat: 67.80, lng: 24.81 },
  { id: 6, name: 'Geilo', country: 'NOR', lat: 60.53, lng: 8.21 }
]

const KAT = ['FIS', 'NC', 'ENL', 'EC', 'CIT']
const GRENER = ['SL', 'GS', 'SG', 'DH']
export const RACES = Array.from({ length: 40 }, (_, i) => {
  const v = velg(VENUES)
  const s = -20 + i * 6 + rnd(3)
  return {
    id: 1000 + i, fis_event_id: 50000 + i, start_date: iso(dager(s)), end_date: iso(dager(s + 1 + rnd(2))),
    venue_id: v.id, place: v.name, host_nation: v.country, organiser_nation: v.country,
    category: velg(KAT), events: `${velg(GRENER)}, ${velg(GRENER)}`, gender: velg(['M', 'W', 'M/W']),
    note: i % 7 === 0 ? 'Påmelding via klubb' : null, season: '2027', created_at: '2026-08-01',
    isonen_id: i % 3 === 0 ? 'iso' + i : null, isonen_title: i % 3 === 0 ? `Renn ${i}` : null,
    signup_deadline: iso(dager(s - 3)) + 'T23:59:00+02:00', max_attendees: i % 5 === 0 ? 120 : null,
    venue: v
  }
})

const STATUS = ['wish', 'planned', 'unavailable', 'entered']
export const TEAM_RACES = RACES.filter((_, i) => i % 2 === 0).map((r, i) => ({
  id: 'tr' + i, team_id: 'ntg', race_id: r.id, coach_note: i % 4 === 0 ? 'Felles reise fra Lillehammer' : null,
  entry_deadline: r.signup_deadline.slice(0, 10), travel_info: null, created_by: 'oscar',
  created_at: '2026-09-01', race: r
}))

export const ATHLETE_RACES = []
for (const p of LOPERE) for (const tr of TEAM_RACES) if (rnd(3) > 0) ATHLETE_RACES.push({
  id: `ar-${p.id}-${tr.race_id}`, athlete_id: p.id, race_id: tr.race_id, team_id: 'ntg',
  status: velg(STATUS), athlete_note: rnd(5) === 0 ? 'Kan bare lørdag' : null, coach_note: null,
  updated_at: '2026-09-10', assigned_by: 'oscar', assigned_at: '2026-09-10', race: tr.race
})

export const SLOPES = [
  { id: 1, resort: 'Hafjell', name: 'Kjusløypa', difficulty: 'advanced', indoor: false },
  { id: 2, resort: 'Hafjell', name: 'Familiebakken', difficulty: 'easy', indoor: false },
  { id: 3, resort: 'Kvitfjell', name: 'Olympiabakken', difficulty: 'expert', indoor: false },
  { id: 4, resort: 'SNØ Lørenskog', name: 'Racing', difficulty: 'intermediate', indoor: true }
]
const FORE = ['ice', 'salted', 'hard', 'grippy', 'soft', 'slush', 'powder', 'artificial']
const VAER = ['sun', 'cloudy', 'flat_light', 'snow', 'fog', 'rain', 'wind']
// Én tidtakingsøkt fra Brower: åtte løp på Lukas, noen på de andre, og to
// uten kobling.
export const TIMING_IMPORTS = [{ id: 'ti1', team_id: 'ntg', session_date: '2026-09-27', discipline: 'GS', venue: 'Hafjell', note: 'Brower', rows_total: 14, rows_mapped: 12 }]
export const TIMING_RUNS = []
{
  let id = 1
  const legg = (aid, navn, bib, tider) => tider.forEach((ms, i) => TIMING_RUNS.push({
    id: 'tr' + id++, import_id: 'ti1', team_id: 'ntg', athlete_id: aid, source_name: navn, bib, run_no: i + 1,
    run_time_ms: ms, run_time_text: ms == null ? '0' : String(ms / 1000), status: ms == null ? 'DNF' : 'OK', splits_ms: [], extra: {},
    athlete: aid ? { id: aid, full_name: LOPERE.find(l => l.id === aid)?.full_name } : null
  }))
  legg('lukas', 'Lukas', '2', [29351, 28972, 28633, 28508, 28366, 28684, 28307, 27562])
  legg('a1', 'Ida', '13', [29712, 29775, null, 29530])
  legg(null, '#30', '30', [28854, 28504])
}
export const SESSIONS = []
let sid = 0
for (const p of LOPERE) for (let i = 0; i < 45; i++) {
  const s = velg(SLOPES); const gren = velg(['SL', 'GS', 'SG', 'DH', 'FREE', 'COND'])
  const planlagt = i < 3
  SESSIONS.push({
    id: ++sid, athlete_id: p.id, team_id: 'ntg', date: iso(dager(planlagt ? 1 + i : -rnd(120))),
    discipline: gren, runs: gren === 'COND' ? null : 4 + rnd(16), gates: gren === 'COND' ? null : 18 + rnd(40),
    snow: velg(FORE), weather: s.indoor ? 'indoor' : velg(VAER), temp_c: s.indoor ? -3 : -12 + rnd(14),
    minutes: 60 + rnd(120), rpe: 3 + rnd(7), note: rnd(6) === 0 ? 'Bra flyt i dag' : null, venue: null,
    slope_id: s.id, slope: s, start_time: planlagt ? '08:00:00' : null, end_time: planlagt ? '10:00:00' : null,
    planned: planlagt, created_by: planlagt ? 'oscar' : p.id
  })
}

export const SIGNUPS = RACES.map(r => ({ id: r.id, race_id: r.id, counted_at: '2026-09-27T05:00:00Z',
  participants: 20 + rnd(90), teams: 5 + rnd(20) }))

export const FIS_POINTS = LOPERE.filter(p => p.fis_code).flatMap(p =>
  Array.from({ length: 6 }, (_, i) => ({ fis_code: p.fis_code, list_id: 500 + i, list_label: `${i % 3 + 1}th FIS points list ${2024 + Math.floor(i / 3)}/${2025 + Math.floor(i / 3)}`,
    season: '2027', discipline: velg(GRENER), points: 60 + rnd(80), rank: 100 + rnd(900), base_list: i === 0,
    fetched_at: '2026-09-20' })))

export const FIS_RESULTS = LOPERE.filter(p => p.fis_code).flatMap(p =>
  Array.from({ length: 30 }, (_, i) => { const ute = i % 7 === 3; return ({ fis_code: p.fis_code, fis_race_id: 70000 + i, race_date: `${2025 - Math.floor(i / 10)}-${['11', '12', '12', '11', '12'][i % 5]}-${String(3 + (i * 7) % 24).padStart(2, '0')}`.replace(/^(\d+)/, y => i % 2 ? String(+y + 1) : y).replace(/-(11|12)-/, m => i % 2 ? ['-01-', '-02-', '-03-'][i % 3] : m),
    place: velg(VENUES).name, discipline: velg(GRENER), nation: 'NOR', category: i % 5 ? 'FIS' : 'NJR', category_name: 'FIS',
    position: ute ? 'DNF1' : String(1 + rnd(40)), fis_points: ute ? null : 50 + rnd(60) + i, cup_points: null, fetched_at: '2026-09-20' }) }))

// Ruter en PostgREST-forespørsel til riktig testdata. Joins er lagt inn på
// radene på forhånd (race.venue, slope), slik select=*,race:races(*,venue:venues(*))
// forventer dem. Enkle eq/in-filtre i spørringen respekteres.
export function svarPa(url, o) {
  const u = new URL(url)
  // supabase-js sender et Headers-objekt, ikke et vanlig objekt; uten .get()
  // ble .single() besvart med en liste.
  const hode = o?.headers
  const enkelt = String((typeof hode?.get === 'function' ? hode.get('Accept') : hode?.Accept || hode?.accept) || '').includes('object')
  const m = u.pathname.match(/\/rest\/v1\/([a-z_]+)/)
  const rpc = u.pathname.match(/\/rpc\/([a-z_]+)/)
  const filt = rader => {
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'order' || k === 'limit') continue
      const eq = String(v).match(/^eq\.(.*)$/)
      if (eq) rader = rader.filter(r => String(r[k]) === eq[1])
      const inn = String(v).match(/^in\.\((.*)\)$/)
      if (inn) { const s = new Set(inn[1].split(',').map(x => x.replace(/^"|"$/g, ''))); rader = rader.filter(r => s.has(String(r[k]))) }
      const gte = String(v).match(/^gte\.(.*)$/)
      if (gte) rader = rader.filter(r => String(r[k]) >= gte[1])
      // Development bruker not.is.null for å holde løpere uten FIS-kode ute.
      // Uten dette i mocken kom de med, og ga «unique key»-advarsler som
      // ikke finnes i appen.
      if (String(v) === 'is.null') rader = rader.filter(r => r[k] == null)
      if (String(v) === 'not.is.null') rader = rader.filter(r => r[k] != null)
    }
    return rader
  }
  if (rpc) {
    const fn = rpc[1]
    if (fn === 'barnas_pamelding') {
      const om = d => new Date(Date.now() + d * 864e5).toISOString()
      const r = (i, o) => ({ athlete_id: 'lukas', athlete_name: 'Lukas Røkke', race_id: 900 + i, host_nation: 'NOR', category: 'FIS', events: '4xSL',
        start_date: iso(dager(10 + i * 9)), end_date: iso(dager(11 + i * 9)), status: 'planned', i_lagets_plan: i % 2 === 0, frist: null, frist_kilde: null,
        pa_lista: false, lista_kjent: false, isonen_id: null, fis_event_id: 60000 + i, ...o })
      return [r(0, { place: 'Oslo Indoor Skiing Arena', frist: om(0.6), frist_kilde: 'isonen' }), r(1, { place: 'Geilo', frist: om(4), frist_kilde: 'trener', status: 'wish' }),
        r(2, { place: 'Bjorli', frist: om(-2), frist_kilde: 'isonen', status: null }), r(3, { place: 'Trysil', frist: om(19), frist_kilde: 'isonen' }),
        r(4, { place: 'Levi', host_nation: 'FIN' }), r(5, { place: 'Kvitfjell', frist: om(3), frist_kilde: 'isonen', pa_lista: true, lista_kjent: true }),
        r(6, { place: 'Duved', host_nation: 'SWE', status: 'entered' })]
    }
    // Én rad per løper og renn i lagets plan, også der løperen ikke har svart.
    if (fn === 'team_race_athletes') return LOPERE.flatMap(p => TEAM_RACES.slice(0, 9).map((tr, i) => {
      const ar = ATHLETE_RACES.find(x => x.athlete_id === p.id && x.race_id === tr.race_id)
      return { athlete_id: p.id, full_name: p.full_name, birth_year: p.birth_year, gender: p.gender, race_id: tr.race_id,
        status: ar?.status ?? (i % 4 === 1 ? 'planned' : null), assigned: (!!ar && i % 3 === 0 && ar.status !== 'unavailable') || (!ar && i % 4 === 1),
        answered: !!ar, athlete_note: ar?.athlete_note ?? null, coach_note: i === 2 ? 'Vi tar Hafjell uka etter.' : null, declined: i === 4 && !!ar }
    }))
    if (fn === 'favoritt_tabell') return [
      { fis_code: '6535001', navn: 'Ida Moen', club: 'NTG', nation: 'NOR', birth_year: 2009, gender: 'W', sl: 62.1, gs: 55.4, sg: null, dh: null, egen: true, favoritt: false },
      { fis_code: '6535004', navn: 'Lukas Røkke', club: 'NTG', nation: 'NOR', birth_year: 2009, gender: 'M', sl: 47.49, gs: 46.27, sg: 88.2, dh: 120.5, egen: true, favoritt: false },
      { fis_code: '422999', navn: 'Henrik Kristoffersen', club: 'Rælingen', nation: 'NOR', birth_year: 1994, gender: 'M', sl: 0.0, gs: 1.2, sg: null, dh: null, egen: false, favoritt: true },
      { fis_code: '507001', navn: 'Elsa Lindqvist', club: 'Åre SLK', nation: 'SWE', birth_year: 2008, gender: 'W', sl: 41.3, gs: 60.0, sg: 71.9, dh: null, egen: false, favoritt: true }]
    if (fn === 'fis_sok') return [{ fis_code: '990001', first_name: 'Åse Marie', last_name: 'Bråthen', club: 'Geilo IL', nation: 'NOR', birth_year: 2008, gender: 'W', sl: 41.2, gs: 55 }]
    if (fn === 'min_foreldrekode') return 'K7RF2M'
    if (fn === 'my_children') return [{ athlete_id: 'lukas', full_name: 'Lukas Røkke', team_name: 'NTG Lillehammer', club: 'NTG', fis_code: '6535004', races: 7, race_days: 12 }]
    if (/^admin_(overview|ops|activity)$/.test(fn)) return { brukere: 5, jobber: [], varsler: [], uker: [] }
    if (fn === 'admin_users') return [
      { id: 'anders', email: 'anders@example.com', full_name: 'Anders Røkke', role: 'athlete', is_admin: true, onboarded: true, team_id: null, last_sign_in_at: '2026-10-02T10:00:00Z', okter: 0 },
      { id: 'oscar', email: 'oscar@ntg.no', full_name: 'Oscar Andersson', role: 'coach', is_admin: false, onboarded: true, team_id: 'ntg', team_name: 'NTG Lillehammer', hus_id: 'ntg', hus_navn: 'NTG Lillehammer', pa_huset: true, skigymnas: true, eier_av: 'NTG Lillehammer', last_sign_in_at: '2026-10-01T08:00:00Z', okter: 0 },
      { id: 'kari', email: 'kari@ntg.no', full_name: 'Kari Lie', role: 'coach', is_admin: false, onboarded: true, team_id: 'g2', team_name: 'Teknikk', hus_id: 'ntg', hus_navn: 'NTG Lillehammer', pa_huset: false, skigymnas: true, eier_av: 'Teknikk', last_sign_in_at: null, okter: 0 },
      { id: 'lukas', email: 'lukas@example.com', full_name: 'Lukas Røkke', role: 'athlete', is_admin: false, onboarded: true, team_id: 'ntg', team_name: 'NTG Lillehammer', hus_id: 'ntg', hus_navn: 'NTG Lillehammer', pa_huset: true, skigymnas: true, foresatte: 'Anders Røkke', last_sign_in_at: '2026-10-02T16:00:00Z', okter: 3 },
      { id: 'ida', email: 'ida@example.com', full_name: 'Ida Moen', role: 'athlete', is_admin: false, onboarded: true, team_id: 'g2', team_name: 'Teknikk', hus_id: 'ntg', hus_navn: 'NTG Lillehammer', pa_huset: false, skigymnas: true, last_sign_in_at: '2026-09-30T16:00:00Z', okter: 12 },
      { id: 'mor', email: 'mor@example.com', full_name: 'Mor Moen', role: 'parent', is_admin: false, onboarded: true, team_id: null, barn: 'Ida Moen', last_sign_in_at: '2026-09-29T16:00:00Z', okter: 0 }
    ]
    if (fn === 'admin_teams') return [
      { id: 'geilo', name: 'NTG Geilo', owner_id: null, invite_code: 'A2B3C4', lopere: 2, renn: 0, parent_team_id: null, is_school: true, created_at: '2026-10-03' },
      { id: 'ntg', name: 'NTG Lillehammer', owner_id: 'oscar', owner_name: 'Oscar Andersson', owner_email: 'oscar@ntg.no', invite_code: 'H6U6Z8', lopere: 1, renn: 4, parent_team_id: null, is_school: true, created_at: '2026-09-28' },
      { id: 'g2', name: 'Teknikk', owner_id: 'kari', owner_name: 'Kari Lie', owner_email: 'kari@ntg.no', invite_code: 'K7RF2M', lopere: 1, renn: 2, parent_team_id: 'ntg', parent_name: 'NTG Lillehammer', is_school: false, created_at: '2026-10-01' }
    ]
    if (fn === 'skigymnas') return ['NTG Bærum', 'NTG Geilo', 'NTG Lillehammer', 'Wang Toppidrett'].map((name, i) => ({ id: 's' + i, name }))
    if (fn === 'ledige_lopere') return [{ id: 'v1', full_name: 'Nora Lie', birth_year: 2009, fis_code: '6535009' }, { id: 'v2', full_name: 'Emil Dahl', birth_year: 2008, fis_code: null }]
    if (fn === 'mine_grupper') return [{ id: 'ntg', name: 'NTG Lillehammer', parent_team_id: null, er_hus: true, eier_er_meg: true, eier_navn: 'Oscar Andersson', lopere: 4 }, { id: 'g2', name: 'Teknikk', parent_team_id: 'ntg', er_hus: false, eier_er_meg: false, eier_navn: 'Kari Lie', lopere: 6 }]
    if (fn === 'head_overview' || fn === 'predicted_start') return null
    return enkelt ? null : []
  }
  if (!m) return enkelt ? null : []
  const alle = {
    races: RACES, venues: VENUES, teams: [TEAM], profiles: [...LOPERE, TRENER],
    athlete_races: ATHLETE_RACES, team_races: TEAM_RACES, training_sessions: SESSIONS, slopes: SLOPES, timing_imports: TIMING_IMPORTS, timing_runs: TIMING_RUNS,
    race_signups: SIGNUPS, race_signup_latest: SIGNUPS, fis_points: FIS_POINTS, fis_results: FIS_RESULTS,
    fis_athletes: LOPERE.filter(p => p.fis_code).map(p => ({ fis_code: p.fis_code, competitor_id: 'c' + p.id,
      name: p.full_name, club: 'NTG', nation: 'NOR', birth_year: p.birth_year, updated_at: '2026-09-20' }))
  }
  const data = filt(alle[m[1]] || [])
  return enkelt ? (data[0] ?? null) : data
}
