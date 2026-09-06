import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import RaceBrowser from './components/RaceBrowser.jsx'
import CoachSeason from './components/CoachSeason.jsx'
import Athletes from './components/Athletes.jsx'
import MySeason from './components/MySeason.jsx'
import Settings from './components/Settings.jsx'
import NoTeam from './components/NoTeam.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [team, setTeam] = useState(null)
  const [tab, setTab] = useState(null)

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

  const reload = () => loadProfile(session.user.id)

  if (session === undefined) return <div className="page muted">Laster …</div>
  if (!session) return <Auth />
  if (!profile) return <div className="page muted">Henter profil …</div>
  if (!profile.onboarded) return <Onboarding profile={profile} onDone={reload} />

  const isCoach = profile.role === 'coach' || team?.owner_id === profile.id
  const tabs = isCoach
    ? [['season', 'Lagets sesong'], ['athletes', 'Løpere'], ['races', 'Alle renn'], ['settings', 'Lag og profil']]
    : [['mine', 'Min sesong'], ['races', 'Alle renn'], ['settings', 'Profil']]
  const active = tab || tabs[0][0]

  return (
    <>
      <header className="topbar">
        <h1>Rennkalender 2026/27{team && <small>{team.name}</small>}</h1>
        <nav>{tabs.map(([k, l]) => <button key={k} className={active === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="spacer" />
        <span className="who">{profile.full_name} · {isCoach ? 'trener' : profile.role === 'parent' ? 'forelder' : 'løper'}</span>
        <button className="btn small" onClick={() => supabase.auth.signOut()}>Logg ut</button>
      </header>
      {active === 'season' && (team ? <CoachSeason profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'athletes' && (team ? <Athletes profile={profile} team={team} /> : <NoTeam profile={profile} onDone={reload} />)}
      {active === 'mine' && <MySeason profile={profile} team={team} />}
      {active === 'races' && <RaceBrowser profile={profile} team={team} isCoach={isCoach} />}
      {active === 'settings' && <Settings profile={profile} team={team} isCoach={isCoach} onChange={reload} />}
    </>
  )
}
