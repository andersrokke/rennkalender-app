// Gjengir hver skjerm i appen, for hver rolle, med tomme svar fra basen og en
// krasjfanger rundt hver. Kjøres før hver push:
//
//   cp scripts/preview/alle-skjermer.jsx src/preview-main.jsx
//   cp scripts/preview/preview.html preview.html
//   -> åpne /preview.html i dev-serveren, les window.__feil
//
// Grunnen til at den finnes: to konstanter forsvant i en opprydding, bygget
// klaget ikke, og hver løper fikk hvit skjerm på første fane i en time.
// Bygget sjekker syntaks. Denne sjekker at skjermene faktisk kommer opp.
import { Component } from 'react'
import { createRoot } from 'react-dom/client'
import TrainingLog from '../../src/components/TrainingLog.jsx'
import NextRace from '../../src/components/NextRace.jsx'
import MySeason from '../../src/components/MySeason.jsx'
import Development from '../../src/components/Development.jsx'
import Settings from '../../src/components/Settings.jsx'
import Feedback from '../../src/components/Feedback.jsx'
import CoachSeason from '../../src/components/CoachSeason.jsx'
import SeasonMatrix from '../../src/components/SeasonMatrix.jsx'
import Athletes from '../../src/components/Athletes.jsx'
import RaceBrowser from '../../src/components/RaceBrowser.jsx'
import Admin from '../../src/components/Admin.jsx'
import Children from '../../src/components/Children.jsx'
import ChildRaces from '../../src/components/ChildRaces.jsx'
import ChildDev from '../../src/components/ChildDev.jsx'
import GoodVenues from '../../src/components/GoodVenues.jsx'
import Pamelding from '../../src/components/Pamelding.jsx'
import NoTeam from '../../src/components/NoTeam.jsx'
import Onboarding from '../../src/components/Onboarding.jsx'
import Auth from '../../src/components/Auth.jsx'
import MobileNav from '../../src/components/MobileNav.jsx'
import InstallPrompt from '../../src/components/InstallPrompt.jsx'
import { LangContext } from '../../src/i18n'
import '../../src/styles.css'

const real = window.fetch
window.fetch = async (u, o) => {
  const url = String(u?.url || u)
  const svar = v => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } })
  if (url.includes('/rest/v1/') || url.includes('/auth/v1/') || url.includes('/functions/v1/')) {
    const enkelt = (o?.headers?.Accept || o?.headers?.accept || '').includes('object')
    if (/rpc\/admin_(overview|ops|activity)/.test(url)) return svar({})
    if (url.includes('/rpc/head_overview')) return svar(null)
    return svar(enkelt ? null : [])
  }
  return real(u, o)
}

window.__feil = []
// Telles inne i siden, fra før første render. Fanens egen konsollbuffer
// overlever navigering og blander gamle meldinger med nye - den kan ikke
// brukes til å svare på «kom det noe nytt denne gangen».
window.__konsoll = { error: [], warn: [] }
for (const niva of ['error', 'warn']) {
  const opprinnelig = console[niva].bind(console)
  console[niva] = (...a) => {
    const tekst = a.map(x => (typeof x === 'string' ? x : (x?.message || String(x)))).join(' ')
    if (!/^__MARKER/.test(tekst)) window.__konsoll[niva].push(tekst.slice(0, 220))
    opprinnelig(...a)
  }
}
// Elementer som stikker ut av kortet sitt uten å ligge i noe rullbart.
// Ignorerer position:fixed (bunnark, skalert emulator) og alt under
// overflow:hidden (Leaflet klipper kartet selv). Leses som window.__overflow.
window.__maalOverflow = () => {
  const ut = []
  for (const el of document.querySelectorAll('.card *')) {
    const kort = el.closest('.card'); if (!kort) continue
    const r = el.getBoundingClientRect(), k = kort.getBoundingClientRect()
    if (r.width === 0 || r.right <= k.right + 2) continue
    if (getComputedStyle(el).position === 'fixed') continue
    let a = el.parentElement, fanget = false
    while (a && a !== kort.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o === 'auto' || o === 'scroll' || o === 'hidden') { fanget = true; break }
      a = a.parentElement
    }
    if (fanget) continue
    let n = kort, skjerm = '?'
    while (n && n !== document.body) { if (n.previousElementSibling?.matches?.('p[style]')) { skjerm = n.previousElementSibling.textContent; break } n = n.parentElement }
    ut.push({ skjerm, klasse: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 50), utenfor: Math.round(r.right - k.right) })
  }
  // Én rad per klasse per skjerm, verste først
  const sett = new Map()
  for (const u of ut) { const id = u.skjerm + '|' + u.klasse; if (!sett.has(id) || sett.get(id).utenfor < u.utenfor) sett.set(id, u) }
  return (window.__overflow = [...sett.values()].sort((a, b) => b.utenfor - a.utenfor))
}

class Fanger extends Component {
  state = { feil: null }
  static getDerivedStateFromError(e) { return { feil: e } }
  componentDidCatch(e, info) {
    window.__feil.push({ hvor: this.props.navn, melding: String(e?.message || e),
      stack: info?.componentStack?.split('\n').slice(0, 3).join(' | ') })
  }
  render() {
    if (this.state.feil) return <div className="card" style={{ borderLeft: '4px solid red' }}>
      <b>KRASJ i {this.props.navn}:</b> {String(this.state.feil?.message || this.state.feil)}</div>
    return this.props.children
  }
}

const base = { onboarded: true, is_admin: false, is_test: false, lang: 'no', theme: 'light',
  link_code: 'x', fis_code: null, birth_year: 2009, gender: 'M', home_city: null,
  plan_settings: { entry: 350, hotel: 1200, kmRate: 3.5, maxGap: 2 } }
const loper = { ...base, id: 'lukas', full_name: 'Lukas Røkke', role: 'athlete', team_id: 'ntg' }
const trener = { ...base, id: 'oscar', full_name: 'Oscar Andersson', role: 'coach', team_id: 'ntg' }
const admin = { ...trener, id: 'anders', full_name: 'Anders Røkke', is_admin: true, team_id: null }
const forelder = { ...base, id: 'mor', full_name: 'Mor Røkke', role: 'parent', team_id: null }
const team = { id: 'ntg', name: 'NTG Lillehammer', club: null, owner_id: 'oscar', invite_code: 'H6U6Z8',
  parent_team_id: null, coaches_see_all: false, created_at: '2026-09-28' }
const ingen = () => {}

const skjermer = [
  ['Løper: TrainingLog (første fane)', <TrainingLog profile={loper} team={team} isCoach={false} />],
  ['Løper: NextRace', <NextRace profile={loper} team={team} onOpenRace={ingen} />],
  ['Løper: MySeason', <MySeason profile={loper} team={team} />],
  ['Løper: RaceBrowser', <RaceBrowser profile={loper} team={team} isCoach={false} readOnly={false} />],
  ['Løper: Development', <Development profile={loper} team={team} isCoach={false} />],
  ['Løper: Settings', <Settings profile={loper} team={team} isCoach={false} onChange={ingen} />],
  ['Løper: Feedback', <Feedback profile={loper} />],
  ['Løper uten lag: MySeason', <MySeason profile={{ ...loper, team_id: null }} team={null} />],
  ['Trener: TrainingLog', <TrainingLog profile={trener} team={team} isCoach />],
  ['Trener: CoachSeason', <CoachSeason profile={trener} team={team} />],
  ['Trener: SeasonMatrix', <SeasonMatrix team={team} />],
  ['Trener: Athletes', <Athletes team={team} />],
  ['Trener: RaceBrowser', <RaceBrowser profile={trener} team={team} isCoach readOnly={false} />],
  ['Trener: Development', <Development profile={trener} team={team} isCoach />],
  ['Trener: Settings', <Settings profile={trener} team={team} isCoach onChange={ingen} />],
  ['Admin uten lag: NoTeam', <NoTeam profile={admin} onDone={ingen} />],
  ['Admin: Admin', <Admin profile={admin} />],
  ['Forelder: Children', <Children profile={forelder} />],
  ['Forelder: ChildRaces', <ChildRaces />],
  ['Forelder: ChildDev', <ChildDev />],
  ['Forelder: Pamelding', <Pamelding profile={forelder} />],
  ['Løper: GoodVenues', <GoodVenues fisCode="6535004" gender="M" />],
  ['Forelder: RaceBrowser', <RaceBrowser profile={forelder} team={null} isCoach={false} readOnly />],
  ['Forelder: Settings', <Settings profile={forelder} team={null} isCoach={false} onChange={ingen} />],
  ['Onboarding', <Onboarding profile={{ id: 'ny', full_name: '', lang: 'no' }} onDone={ingen} />],
  ['Auth', <Auth />],
  ['App: InstallPrompt', <InstallPrompt />],
  ['App: MobileNav', <MobileNav active="list" onPick={ingen} planCount={3} />]
]

createRoot(document.getElementById('root')).render(
  <LangContext.Provider value="no">
    {skjermer.map(([navn, el]) => (
      <div key={navn} style={{ borderTop: '3px dashed #999', padding: '8px 0' }}>
        <p style={{ margin: '0 16px', fontWeight: 700 }}>▶ {navn}</p>
        <Fanger navn={navn}>{el}</Fanger>
      </div>
    ))}
  </LangContext.Provider>
)
