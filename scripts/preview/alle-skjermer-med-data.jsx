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
  ['Trener: RaceBrowser', <RaceBrowser profile={TRENER} team={TEAM} isCoach readOnly={false} />],
  ['Trener: Development', <Development profile={TRENER} team={TEAM} isCoach />],
  ['Forelder: Children', <Children profile={forelder} />]
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
