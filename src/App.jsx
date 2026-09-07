import { useEffect, useState, useCallback } from 'react'
import { LangContext, I18N } from './i18n'
import { applyTheme, applyLang, setSheet } from './theme'
import { supabase } from './supabase'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import RaceBrowser from './components/RaceBrowser.jsx'
import CoachSeason from './components/CoachSeason.jsx'
import Athletes from './components/Athletes.jsx'
import MySeason from './components/MySeason.jsx'
import Settings from './components/Settings.jsx'
import NoTeam from './components/NoTeam.jsx'
import Planner from './components/Planner.jsx'
import MobileNav from './components/MobileNav.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [team, setTeam] = useState(null)
  const [tab, setTab] = useState(null)
  const [pane, setPane] = useState('list')
  const [planCount, setPlanCount] = useState(0)

  const loadProfile = useCallback(async uid => {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(p)
    if (p?.team_id) {
      const { data: t } = await supabase.from('teams').select('*').eq('id', p.team_id).single()
      setTeam(t)
    } else setTeam(null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setTimeout(() => setSession(s), 0))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session?.user) loadProfile(session.user.id); else setProfile(null) }, [session, loadProfile])

  const lang = profile?.lang === 'en' ? 'en' : 'no'
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
    setProfile(p => ({ ...p, ...patch }))
    await supabase.from('profiles').update(patch).eq('id', profile.id)
  }

  if (session === undefined) return <div className="page muted">{I18N.no.loading}</div>
  if (!session) return <Auth />
  if (!profile) return <div className="page muted">{I18N.no.loadingProfile}</div>
  if (!profile.onboarded) return (
    <LangContext.Provider value={lang}><Onboarding profile={profile} onDone={reload} /></LangContext.Provider>
  )

  const isCoach = profile.role === 'coach' || team?.owner_id === profile.id
  const d = I18N[lang]
  const tabs = isCoach
    ? [['season', d.season], ['athletes', d.athletes], ['races', d.races], ['plan', d.plan], ['settings', d.settingsTabCoach]]
    : [['mine', d.mine], ['races', d.races], ['plan', d.plan], ['settings', d.settingsTab]]
  const active = tab || tabs[0][0]

  const pickPane = k => {
    if (k === 'filter') return setSheet(true)
    if (k === 'plan') { setTab('plan'); setPane('list'); }
    else if (k === 'list') { if (active === 'plan') setTab(isCoach ? 'races' : 'mine'); setPane('list') }
    else setPane('map')
    scrollTo({ top: 0 })
  }
  const navActive = active === 'plan' ? 'plan' : pane

  const Seg = ({ opts, value, onPick }) => (
    <div className="seg">{opts.map(([v, l]) =>
      <button key={v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{l}</button>)}</div>
  )

  return (
    <LangContext.Provider value={lang}>
      <header className="topbar">
        <h1>{d.appTitle}{team && <small>{team.name}</small>}</h1>
        <nav>{tabs.map(([k, l]) => <button key={k} className={active === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="spacer" />
        <Seg opts={[['no', 'NO'], ['en', 'EN']]} value={lang} onPick={v => setPref({ lang: v })} />
        <Seg opts={[['light', '☀'], ['dark', '☾']]} value={theme} onPick={v => setPref({ theme: v })} />
        <span className="who">{profile.full_name} · {isCoach ? d.coach : profile.role === 'parent' ? d.parent : d.athlete}</span>
        <button className="btn small" onClick={() => supabase.auth.signOut()}>{d.signOut}</button>
      </header>
      <InstallPrompt />
      {active === 'season' && (team ? <CoachSeason profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'athletes' && (team ? <Athletes profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'mine' && <MySeason profile={profile} team={team} />}
      {active === 'races' && <RaceBrowser profile={profile} team={team} isCoach={isCoach} />}
      {active === 'plan' && <Planner profile={profile} onChange={reload} />}
      {active === 'settings' && <Settings profile={profile} team={team} isCoach={isCoach} onChange={reload} />}
      <div className="scrim" onClick={() => setSheet(false)} />
      <MobileNav active={navActive} onPick={pickPane} planCount={planCount} />
    </LangContext.Provider>
  )
}
