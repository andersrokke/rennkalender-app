import { useEffect, useState, useCallback } from 'react'
import { LangContext, I18N, detectLang, setLang as saveLang } from './i18n'
import { applyTheme, applyLang, setSheet } from './theme'
import { tabForNav, navForState, rolleFlagg, fanerFor } from './nav'
import { supabase } from './supabase'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import RaceBrowser from './components/RaceBrowser.jsx'
import CoachSeason from './components/CoachSeason.jsx'
import Athletes from './components/Athletes.jsx'
import MySeason from './components/MySeason.jsx'
import NextRace from './components/NextRace.jsx'
import TrainingLog from './components/TrainingLog.jsx'
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
import SeasonMatrix from './components/SeasonMatrix.jsx'
import MobileNav from './components/MobileNav.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [team, setTeam] = useState(null)
  const [tab, setTab] = useState(null)
  const [pane, setPane] = useState('list')
  const [planCount, setPlanCount] = useState(0)
  const [recovery, setRecovery] = useState(false)
  // Lagene treneren er trener for. Er det flere, vises en velger i toppen.
  const [grupper, setGrupper] = useState([])

  const loadProfile = useCallback(async uid => {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single()
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
    children: d.children, kidraces: d.kidraces, kiddev: d.kiddev, steder: d.steder, races: d.races, feedback: d.fbTab, admin: d.adTab,
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
    if (k === 'filter') return setSheet(true)
    if (k === 'map') setPane('map')
    else {
      // «Renn» means the race list, so it has to switch tab as well as pane —
      // otherwise the label and the content disagree.
      const next = tabForNav(k, { isParent })
      if (next) setTab(next)
      setPane('list')
    }
    scrollTo({ top: 0 })
  }
  const navActive = navForState(active, pane, { isParent })

  const Seg = ({ opts, value, onPick }) => (
    <div className="seg">{opts.map(([v, l]) =>
      <button key={v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{l}</button>)}</div>
  )

  return (
    <LangContext.Provider value={lang}>
      <header className="topbar">
        <h1>{d.appTitle}{team && !isParent && grupper.length < 2 && <small>{team.name}</small>}</h1>
        {team && isCoach && grupper.length > 1 && (
          <select className="gruppevelger" value={team.id} aria-label={d.groupPick}
            onChange={async e => {
              const { error } = await supabase.rpc('bytt_gruppe', { p_team: e.target.value })
              if (error) alert(error.message); else reload()
            }}>
            {grupper.map(g => <option key={g.id} value={g.id}>{g.er_hus ? `${g.name} · ${d.groupHouse}` : g.name}</option>)}
          </select>
        )}
        <nav>{tabs.map(([k, l]) => <button key={k} className={active === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="spacer" />
        <Seg opts={[['no', 'NO'], ['en', 'EN']]} value={lang} onPick={v => setPref({ lang: v })} />
        <Seg opts={[['light', '☀'], ['dark', '☾']]} value={theme} onPick={v => setPref({ theme: v })} />
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
      <InstallPrompt />
      {active === 'season' && (team ? <CoachSeason profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'matrix' && (team ? <SeasonMatrix team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'athletes' && (team ? <Athletes profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {/* Egen fane, oeverst: loggen foeres ofte, og laa foer tre skjermlengder
          nede i «Min utvikling». En foresatt ser oekter, men foerer ingen. */}
      {active === 'training' && <div className="page"><TrainingLog profile={profile} team={team} isCoach={isCoach} /></div>}
      {active === 'next' && <NextRace profile={profile} team={team} onOpenRace={() => setTab('mine')} />}
      {active === 'mine' && <MySeason profile={profile} team={team} />}
      {active === 'races' && <RaceBrowser profile={profile} team={team} isCoach={isCoach} readOnly={isParent} />}
      {active === 'children' && <Children profile={profile} />}
      {active === 'kidraces' && <ChildRaces />}
      {active === 'kiddev' && <ChildDev />}
      {active === 'steder' && <GoodVenues fisCode={profile.fis_code} gender={profile.gender} />}
      {active === 'dev' && <Development profile={profile} team={team} isCoach={isCoach} />}
      {active === 'feedback' && <Feedback profile={profile} />}
      {active === 'admin' && <Admin profile={profile} />}
      {active === 'settings' && <Settings profile={profile} team={team} isCoach={isCoach} onChange={reload} />}
      <div className="scrim" onClick={() => setSheet(false)} />
      <MobileNav active={navActive} onPick={pickPane} planCount={planCount} />
    </LangContext.Provider>
  )
}
