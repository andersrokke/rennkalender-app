import { useEffect, useState, useCallback } from 'react'
import { LangContext, I18N, detectLang, setLang as saveLang } from './i18n'
import { applyTheme, applyLang, setSheet } from './theme'
import { tabForNav, navForState, rolleFlagg, fanerFor } from './nav'
import { supabase } from './supabase'
import { PROFIL_FELT } from './profil'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import RaceBrowser from './components/RaceBrowser.jsx'
import CoachSeason from './components/CoachSeason.jsx'
import Athletes from './components/Athletes.jsx'
import MySeason from './components/MySeason.jsx'
import NextRace from './components/NextRace.jsx'
import TrainingLog from './components/TrainingLog.jsx'
import Timing from './components/Timing.jsx'
import Feedback from './components/Feedback.jsx'
import Admin from './components/Admin.jsx'
import { PassordSkjema } from './components/Passord.jsx'
import { fangLagkode, fangForeldrekode } from './join'
import Settings from './components/Settings.jsx'
import NoTeam from './components/NoTeam.jsx'
import Development from './components/Development.jsx'
import Children from './components/Children.jsx'
import ChildRaces from './components/ChildRaces.jsx'
import ChildDev from './components/ChildDev.jsx'
import GoodVenues from './components/GoodVenues.jsx'
import Pamelding from './components/Pamelding.jsx'
import FavTab from './components/FavTab.jsx'
import ChildNext from './components/ChildNext.jsx'
import Personvern from './components/Personvern.jsx'
import SeasonMatrix from './components/SeasonMatrix.jsx'
import MobileNav from './components/MobileNav.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'

// Ikonene i sidemenyen. Enkle strekikoner, tegnet i samme rutenett.
const IKON = {
  training: 'M4 19V5m0 14h16M8 15l3-4 3 2 4-6',
  next: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  mine: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4',
  season: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  matrix: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14',
  athletes: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm11.5 9v-1a4 4 0 0 0-3-3.9M15.5 3.2a3.5 3.5 0 0 1 0 6.6',
  races: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3ZM9 4v13M15 7v13',
  dev: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  steder: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  favoritter: 'M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8Z',
  children: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1m2-5h1a3 3 0 0 1 3 3v2',
  pamelding: 'M9 5h6m-6 0a2 2 0 0 0-2 2H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1a2 2 0 0 0-2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4',
  kidraces: 'M5 21V4m0 1h11l-2 3.5 2 3.5H5',
  kiddev: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  kidnext: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  settings: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  feedback: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
  admin: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6Zm-3 9 2 2 4-4'
}
const Ikon = ({ k }) => (
  <svg className="nav-ikon" viewBox="0 0 24 24" aria-hidden="true"><path d={IKON[k] || IKON.races} /></svg>
)

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [team, setTeam] = useState(null)
  // Fanen kan stå i adressen (#races), så en lenke kan peke rett på en skjerm.
  const [tab, setTab] = useState(() => (typeof location !== 'undefined' && location.hash.slice(1)) || null)
  const [pane, setPane] = useState('list')
  const [planCount, setPlanCount] = useState(0)
  const [recovery, setRecovery] = useState(false)
  // Menyen på smale skjermer: lukket til man trykker «Meny».
  const [menyApen, setMenyApen] = useState(false)
  // Lagene treneren er trener for. Er det flere, vises en velger i toppen.
  const [grupper, setGrupper] = useState([])

  const loadProfile = useCallback(async uid => {
    const { data: p } = await supabase.from('profiles').select(PROFIL_FELT).eq('id', uid).single()
    setProfile(p)
    if (p?.role === 'coach') supabase.rpc('mine_grupper').then(({ data }) => setGrupper(data || []))
    else setGrupper([])
    if (p?.team_id) {
      const { data: t } = await supabase.from('teams').select('*').eq('id', p.team_id).single()
      setTeam(t)
    } else setTeam(null)
  }, [])

  useEffect(() => {
    // Lagkoden fra en delt lenke må fanges før noe annet rekker å endre URL-en.
    fangLagkode(); fangForeldrekode()
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      // Kommer man hit fra en tilbakestillingslenke, er man innlogget - men
      // det man ville var å sette et nytt passord, ikke å havne i appen.
      if (e === 'PASSWORD_RECOVERY') setRecovery(true)
      setTimeout(() => setSession(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session?.user) loadProfile(session.user.id); else setProfile(null) }, [session, loadProfile])

  // The login and onboarding screens store the choice in localStorage under
  // 'rk-lang'; the profile wins once it is set. The app's own dictionary only
  // has no/en, so 'sv' reads as Norwegian in here until it gains Swedish.
  const pref = profile?.lang || detectLang()
  const lang = pref === 'en' ? 'en' : 'no'
  const theme = profile?.theme === 'dark' ? 'dark' : 'light'
  useEffect(() => { applyTheme(theme); applyLang(lang) }, [theme, lang])
  useEffect(() => { document.documentElement.dataset.pane = pane }, [pane])
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 820) setSheet(false) }
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  // The sheet lives on <html> alone so the "Ferdig" button inside Filters and
  // the tab bar here cannot drift apart.
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('athlete_races').select('race_id', { count: 'exact', head: true })
      .eq('athlete_id', profile.id).in('status', ['planned', 'entered'])
      .then(({ count }) => setPlanCount(count || 0))
  }, [profile?.id, tab])

  const reload = () => loadProfile(session.user.id)
  const setPref = async patch => {
    if (patch.lang) saveLang(patch.lang)
    setProfile(p => ({ ...p, ...patch }))
    await supabase.from('profiles').update(patch).eq('id', profile.id)
  }

  // Personvernerklæringen er åpen for alle, også uten innlogging.
  if (typeof location !== 'undefined' && location.pathname.replace(/\/$/, '') === '/personvern') return <Personvern />
  if (session === undefined) return <div className="page muted">{I18N.no.loading}</div>
  if (!session) return <Auth />
  if (recovery) return (
    <LangContext.Provider value={lang}>
      <div className="page" style={{ maxWidth: 460, margin: '40px auto' }}>
        <div className="card">
          <h2>{d.pwNewTitle}</h2>
          <p className="muted">{d.pwNewSub}</p>
          <PassordSkjema onLagret={() => setRecovery(false)} knappetekst={d.pwSetAndSignIn} />
        </div>
      </div>
    </LangContext.Provider>
  )
  if (!profile) return <div className="page muted">{I18N.no.loadingProfile}</div>
  if (!profile.onboarded) return (
    <LangContext.Provider value={lang}><Onboarding profile={profile} onDone={reload} /></LangContext.Provider>
  )

  // Rollen bestemmer, og bare den. Før var enhver lageier trener uansett
  // rolle, så en administrator som byttet til forelder fikk trenerens skjermer
  // likevel. Basen følger samme regel: is_coach_of krever rollen trener.
  // Selve utledningen ligger i nav.js, der den kan testes uten å tegne appen.
  const { isCoach, isParent } = rolleFlagg(profile)
  const d = I18N[lang]
  const ETIKETT = {
    children: d.children, kidraces: d.kidraces, kiddev: d.kiddev, kidnext: d.nextTab, favoritter: d.favoritter, pamelding: d.pamelding, steder: d.steder, races: d.races, feedback: d.fbTab, admin: d.adTab,
    training: d.tlTitle, season: d.season, matrix: d.matrix, athletes: d.athletes,
    next: d.nextTab, mine: d.mine, dev: isCoach ? d.devTitleCoach : d.dev,
    // «Lag og profil» bare når treneren faktisk har et lag.
    settings: isCoach && team ? d.settingsTabCoach : d.settingsTab
  }
  const tabs = fanerFor(profile, !!team).map(k => [k, ETIKETT[k]])
  // Aktiv fane må være en fane denne modusen har. Uten sjekken kunne en fane
  // fra forrige modus bli stående, og tegne en skjerm rollen ikke skal se.
  const active = tabs.some(([k]) => k === tab) ? tab : tabs[0][0]

  const pickPane = k => {
    // Hver knapp i bunnen tar deg til en skjerm: kart og filtre til
    // rennkalenderen, «Renn» til lista der, «Min plan» til sesongen.
    const next = tabForNav(k, { isParent })
    if (next) setTab(next)
    setMenyApen(false)
    setPane(k === 'map' ? 'map' : 'list')
    scrollTo({ top: 0 })
    // Filterarket ligger i rennkalenderen, så det åpnes etter at den er tegnet.
    if (k === 'filter') setTimeout(() => setSheet(true), 60)
  }
  const navActive = navForState(active, pane, { isParent })

  const Seg = ({ opts, value, onPick }) => (
    <div className="seg">{opts.map(([v, l]) =>
      <button key={v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{l}</button>)}</div>
  )

  return (
    <LangContext.Provider value={lang}>
      <div className="app-shell">
      <header className={`topbar ${menyApen ? 'apen' : ''}`}>
        <h1><span className="merke" aria-hidden="true" />{d.appTitle}{team && !isParent && grupper.length < 2 && <small>{team.name}</small>}</h1>
        {team && isCoach && grupper.length > 1 && (
          <select className="gruppevelger" value={team.id} aria-label={d.groupPick}
            onChange={async e => {
              const { error } = await supabase.rpc('bytt_gruppe', { p_team: e.target.value })
              if (error) alert(error.message); else reload()
            }}>
            {grupper.map(g => <option key={g.id} value={g.id}>{g.er_hus ? `${g.name} · ${d.groupHouse}` : g.name}</option>)}
          </select>
        )}
        <button type="button" className="meny-knapp" aria-expanded={menyApen} aria-controls="hovedmeny" onClick={() => setMenyApen(v => !v)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{menyApen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
          <span>{menyApen ? d.menuClose : d.menu}</span>
        </button>
        {!menyApen && <span className="meny-her">{ETIKETT[active]}</span>}
        <nav id="hovedmeny">{tabs.map(([k, l]) => (
          <button key={k} className={active === k ? 'on' : ''} aria-current={active === k ? 'page' : undefined} onClick={() => { setTab(k); setPane('list'); setMenyApen(false); scrollTo({ top: 0 }) }}>
            <Ikon k={k} /><span>{l}</span>
          </button>
        ))}</nav>
        <div className="spacer" />
        <div className="side-valg">
          <Seg opts={[['no', 'NO'], ['en', 'EN']]} value={lang} onPick={v => setPref({ lang: v })} />
          <Seg opts={[['light', '☀'], ['dark', '☾']]} value={theme} onPick={v => setPref({ theme: v })} />
        </div>
        {/* Administrator kan se appen som trener, løper eller forelder. Rollen
            byttes på ordentlig, ikke som en maske over: flere funksjoner i basen
            spør om rollen, og en visning som sa noe annet enn basen ville gitt
            feil man ikke kunne forklare. */}
        {profile.is_admin && (
          <span className="modus" title={d.modeTitle}>
            <Seg opts={[['coach', d.coach], ['athlete', d.athlete], ['parent', d.parent]]} value={profile.role}
              onPick={async r => {
                const { error } = await supabase.rpc('admin_set_role', { p_user: profile.id, p_role: r })
                if (error) return alert(error.message)
                setTab(null); reload()
              }} />
          </span>
        )}
        <span className="who">{profile.full_name} · {isCoach ? d.coach : profile.role === 'parent' ? d.parent : d.athlete}</span>
        <button className="btn small" onClick={() => supabase.auth.signOut()}>{d.signOut}</button>
      </header>
      <main className="app-main" data-fane={active}>
      {/* Sidens navn står øverst på skjermene som ikke åpner med et eget
          kort med overskrift - kalenderen, sesongen og matrisa. */}
      {['races', 'season', 'mine', 'matrix', 'next', 'kidnext', 'children'].includes(active) && (
        <div className="side-hode"><h2>{ETIKETT[active]}</h2>{team && !isParent && <span>{team.name}</span>}</div>
      )}
      <InstallPrompt />
      {active === 'season' && (team ? <CoachSeason profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'matrix' && (team ? <SeasonMatrix team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'athletes' && (team ? <Athletes profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {/* Egen fane, oeverst: loggen foeres ofte, og laa foer tre skjermlengder
          nede i «Min utvikling». En foresatt ser oekter, men foerer ingen. */}
      {active === 'training' && <div className="page"><TrainingLog profile={profile} team={team} isCoach={isCoach}
        tidtaking={<Timing profile={profile} team={team} isCoach={isCoach} />} /></div>}
      {active === 'next' && <NextRace profile={profile} team={team} onOpenRace={() => setTab('mine')} />}
      {active === 'mine' && <MySeason profile={profile} team={team} />}
      {active === 'races' && <RaceBrowser profile={profile} team={team} isCoach={isCoach} readOnly={isParent} />}
      {active === 'children' && <Children profile={profile} />}
      {active === 'kidraces' && <ChildRaces />}
      {active === 'kiddev' && <ChildDev />}
      {active === 'kidnext' && <ChildNext onOpenRace={() => setTab('children')} />}
      {active === 'favoritter' && <FavTab profile={profile} isCoach={isCoach} />}
      {active === 'pamelding' && <Pamelding />}
      {active === 'steder' && <GoodVenues fisCode={profile.fis_code} gender={profile.gender} />}
      {active === 'dev' && <Development profile={profile} team={team} isCoach={isCoach} />}
      {active === 'feedback' && <Feedback profile={profile} />}
      {active === 'admin' && <Admin profile={profile} />}
      {active === 'settings' && <Settings profile={profile} team={team} isCoach={isCoach} onChange={reload} />}
      </main>
      </div>
      <div className="scrim" onClick={() => setSheet(false)} />
      <MobileNav active={navActive} onPick={pickPane} planCount={planCount} />
    </LangContext.Provider>
  )
}
