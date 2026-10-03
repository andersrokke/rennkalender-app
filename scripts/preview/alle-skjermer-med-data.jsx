// Samme skjermer som alle-skjermer.jsx, men med testdata som har innhold:
// 40 renn, 20 lagrenn, sesongplaner for fire løpere, 180 økter, FIS-poeng.
// Tomme lister skjuler feil i listevisning, sortering og gruppering.
//
//   cp scripts/preview/alle-skjermer-med-data.jsx src/preview-main.jsx
//   (og testdata.js til src/preview-testdata.js)
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
import Children from '../../src/components/Children.jsx'
import ChildRaces from '../../src/components/ChildRaces.jsx'
import ChildDev from '../../src/components/ChildDev.jsx'
import GoodVenues from '../../src/components/GoodVenues.jsx'
import Admin from '../../src/components/Admin.jsx'
import Onboarding from '../../src/components/Onboarding.jsx'
import { LangContext } from '../../src/i18n'
import { svarPa, LOPERE, TRENER, TEAM } from './testdata.js'
import '../../src/styles.css'

const real = window.fetch
window.fetch = async (u, o) => {
  const url = String(u?.url || u)
  if (url.includes('/rest/v1/') || url.includes('/auth/v1/') || url.includes('/functions/v1/'))
    return new Response(JSON.stringify(svarPa(url, o)), { status: 200, headers: { 'content-type': 'application/json' } })
  return real(u, o)
}

window.__feil = []
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

const lukas = LOPERE.find(p => p.id === 'lukas')
const forelder = { ...TRENER, id: 'mor', full_name: 'Mor Røkke', role: 'parent', team_id: null }
const ingen = () => {}

const skjermer = [
  ['Løper: TrainingLog + statistikk', <TrainingLog profile={lukas} team={TEAM} isCoach={false} />],
  ['Løper: NextRace', <NextRace profile={lukas} team={TEAM} onOpenRace={ingen} />],
  ['Løper: MySeason (kart + reiseplan)', <MySeason profile={lukas} team={TEAM} />],
  ['Løper: RaceBrowser', <RaceBrowser profile={lukas} team={TEAM} isCoach={false} readOnly={false} />],
  ['Løper: Development (FIS-graf)', <Development profile={lukas} team={TEAM} isCoach={false} />],
  ['Løper: Settings', <Settings profile={lukas} team={TEAM} isCoach={false} onChange={ingen} />],
  ['Trener: TrainingLog + gruppestatistikk', <TrainingLog profile={TRENER} team={TEAM} isCoach />],
  ['Trener: CoachSeason', <CoachSeason profile={TRENER} team={TEAM} />],
  ['Trener: SeasonMatrix', <SeasonMatrix team={TEAM} />],
  ['Trener: Athletes', <Athletes team={TEAM} />],
  ['Gruppetrener: Athletes (ventende løpere)', <Athletes team={{ ...TEAM, id: 'g2', name: 'Teknikk', parent_team_id: 'ntg' }} />],
  ['Trener: RaceBrowser', <RaceBrowser profile={TRENER} team={TEAM} isCoach readOnly={false} />],
  ['Trener: Development', <Development profile={TRENER} team={TEAM} isCoach />],
  ['Forelder: Children', <Children profile={forelder} />],
  ['Forelder: ChildRaces', <ChildRaces />],
  ['Forelder: ChildDev', <ChildDev />],
  ['Løper: GoodVenues', <GoodVenues fisCode="6535004" gender="M" />],
  ['Forelder: barnets sesong (med kostnader)', <MySeason profile={lukas} team={TEAM} readOnly forelder={forelder} />],
  ['Admin (klikk gjennom fanene)', <Admin profile={{ id: 'anders', is_admin: true }} />],
  ['Løper uten lag: Settings (skigymnas-velger)', <Settings profile={{ ...lukas, team_id: null }} team={null} isCoach={false} onChange={ingen} />],
  ['Onboarding', <Onboarding profile={{ id: 'ny', full_name: '', lang: 'no' }} onDone={ingen} />]
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
