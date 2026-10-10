import { Fragment, useEffect, useState, useCallback } from 'react'
import { LangContext, I18N, detectLang, setLang as saveLang } from './i18n'
import { applyTheme, applyLang, setSheet } from './theme'
import { tabForNav, navForState, rolleFlagg, fanerFor, startFane, hjemFane, menyGrupper } from './nav'
import CoachHome from './components/CoachHome.jsx'
import { hentLag } from './lag'
import Utvikling from './components/Utvikling.jsx'
import Velkommen from './components/Velkommen.jsx'
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
import ChildDev from './components/ChildDev.jsx'
import Pamelding from './components/Pamelding.jsx'
import ChildNext from './components/ChildNext.jsx'
import Personvern from './components/Personvern.jsx'
import SeasonMatrix from './components/SeasonMatrix.jsx'
import MobileNav from './components/MobileNav.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'

// Ikonene i sidemenyen. Enkle strekikoner, tegnet i samme rutenett.
const HUS = 'M4 11l8-7 8 7M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9'
const IKON = {
  home: HUS,
  training: 'M4 19V5m0 14h16M8 15l3-4 3 2 4-6',
  next: HUS,
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
  kidnext: HUS,
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
  // Gruppa valgt under «Løpere» i menyen: filteret på Løpere-siden.
  const [lopereFilter, setLopereFilter] = useState('alle')

  const loadProfile = useCallback(async uid => {
    const { data: p } = await supabase.from('profiles').select(PROFIL_FELT).eq('id', uid).single()
    setProfile(p)
    if (p?.role === 'coach') supabase.rpc('mine_grupper').then(({ data }) => setGrupper(data || []))
    else setGrupper([])
    if (p?.team_id) {
      const t = await hentLag(p.team_id)
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

  // Rett etter registrering møtes løperen av «Dette er deg», med resultatene hentet.
  // Flagget settes av registreringen. I tillegg: en løper med FIS-kode som
  // aldri er hentet fra FIS, får velkomsten uansett - flagget kan gå tapt
  // mellom faner, og resultatene må inn før appen er verdt noe for henne.
  const [velkommen, setVelkommen] = useState(() => { try { return sessionStorage.getItem('alpinrace.velkommen') === '1' } catch { return false } })
  const ferdigVelkommen = () => { try { sessionStorage.removeItem('alpinrace.velkommen') } catch {} setVelkommen(false); setTab(null) }
  useEffect(() => {
    if (!profile?.onboarded || profile.role !== 'athlete' || !profile.fis_code || velkommen) return
    let av = false
    supabase.from('fis_athletes').select('fis_code').eq('fis_code', profile.fis_code).maybeSingle()
      .then(({ data, error }) => { if (!av && !error && !data) setVelkommen(true) })
    return () => { av = true }
  }, [profile?.id, profile?.fis_code, profile?.onboarded])
  const [som, setSom] = useState(null)
  const [somTeam, setSomTeam] = useState(null)
  async function seSom(id) {
    if (!id) { setSom(null); setSomTeam(null); setTab(null); return }
    const { data: p, error } = await supabase.from('profiles').select(PROFIL_FELT).eq('id', id).single()
    if (error || !p) return alert(I18N[lang].somFail)
    setSomTeam(p.team_id ? await hentLag(p.team_id) : null)
    setSom(p); setTab(null); setMenyApen(false); scrollTo({ top: 0 })
  }

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
  // «Se som»: en administrator kan se appen slik en løper ser den, bare lesing.
  // Det er leseretten treneren alt har som brukes; ingen innlogging byttes,
  // og det som ikke kan leses som trener, vises ikke her heller.
  const vis = som || profile
  const visTeam = som ? somTeam : team
  const { isCoach, isParent } = rolleFlagg(vis)
  const d = I18N[lang]
  const ETIKETT = {
    children: d.kidraces, kidraces: d.kidraces, kiddev: d.kiddev, kidnext: d.hjemTab, favoritter: d.favoritter, pamelding: d.pamelding, steder: d.steder, races: d.races, feedback: d.fbTab, admin: d.adTab,
    training: d.tlTitle, season: d.season, matrix: d.matrix, athletes: d.athletes,
    home: d.hjemTab, next: d.hjemTab, mine: d.mine, dev: isCoach ? d.devTitleCoach : d.dev,
    // «Lag og profil» bare når treneren faktisk har et lag.
    settings: isCoach && visTeam ? d.settingsTabCoach : d.settingsTab
  }
  const tabs = fanerFor(vis, !!visTeam).filter(k => !som || !['settings', 'feedback', 'admin'].includes(k)).map(k => [k, ETIKETT[k]])
  // Aktiv fane må være en fane denne modusen har. Uten sjekken kunne en fane
  // fra forrige modus bli stående, og tegne en skjerm rollen ikke skal se.
  const active = tabs.some(([k]) => k === tab) ? tab : startFane(vis, !!visTeam)

  const gaTil = k => { setTab(k); setPane('list'); setMenyApen(false); scrollTo({ top: 0 }) }

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
        <h1 className="hjem-lenke" role="link" tabIndex={0} title={d.hjemTab} onClick={() => gaTil(hjemFane(vis))}
          onKeyDown={e => { if (e.key === 'Enter') gaTil(hjemFane(vis)) }}><span className="merke" aria-hidden="true" />{d.appTitle}{visTeam && !isParent && grupper.length < 2 && <small>{visTeam.name}</small>}</h1>
        {visTeam && isCoach && grupper.length > 1 && (
          <select className="gruppevelger" value={visTeam.id} aria-label={d.groupPick}
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
        <nav id="hovedmeny">{menyGrupper(vis).map(g => (
          <div className="meny-gruppe" key={g.k || 'hjem'}>
            {g.k && <span className="meny-gruppenavn">{d['mg_' + g.k]}</span>}
            {g.faner.map(k => (
              <Fragment key={k}>
                <button className={active === k ? 'on' : ''} aria-current={active === k ? 'page' : undefined} onClick={() => { if (k === 'athletes') setLopereFilter('alle'); gaTil(k) }}>
                  <Ikon k={k} /><span>{ETIKETT[k]}</span>
                </button>
                {/* Gruppene i huset ligger rett under «Løpere». Hovedtreneren ser alle,
                    en gruppetrener bare sine egne. */}
                {k === 'athletes' && !som && grupper.filter(x => !x.er_hus).length > 0 && (
                  <div className="meny-under">
                    {grupper.filter(x => !x.er_hus).map(x => (
                      <button key={x.id} className={active === 'athletes' && lopereFilter === x.id ? 'on' : ''}
                        onClick={() => { setLopereFilter(x.id); gaTil('athletes') }}>
                        <span>{x.name}</span><small>{x.lopere}</small>
                      </button>
                    ))}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
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
        {profile.is_admin && !som && (
          <span className="modus" title={d.modeTitle}>
            <Seg opts={[['coach', d.coach], ['athlete', d.athlete], ['parent', d.parent]]} value={vis.role}
              onPick={async r => {
                const { error } = await supabase.rpc('admin_set_role', { p_user: profile.id, p_role: r })
                if (error) return alert(error.message)
                setTab(null); reload()
              }} />
          </span>
        )}
        <span className="who">{profile.full_name} · {isCoach ? d.coach : vis.role === 'parent' ? d.parent : d.athlete}</span>
        <button className="btn small" onClick={() => supabase.auth.signOut()}>{d.signOut}</button>
      </header>
      <main className="app-main" data-fane={active}>
      {som && (
        <div className="som-banner" role="status">
          <span>{d.somBanner.replace('{n}', som.full_name || '')}</span>
          <button type="button" className="btn small" onClick={() => seSom(null)}>{d.somExit}</button>
        </div>
      )}
      {/* Sidens navn står øverst på skjermene som ikke åpner med et eget
          kort med overskrift - kalenderen, sesongen og matrisa. */}
      {['races', 'season', 'mine', 'matrix', 'next', 'kidnext', 'children'].includes(active) && (
        <div className="side-hode"><h2>{active === 'next' || active === 'kidnext' ? d.nextTab : ETIKETT[active]}</h2>{visTeam && !isParent && <span>{visTeam.name}</span>}</div>
      )}
      <InstallPrompt />
      {active === 'home' && (visTeam ? <CoachHome profile={vis} team={visTeam} onGo={gaTil} /> : <NoTeam profile={vis} onDone={reload} />)}
      {active === 'season' && (visTeam ? <CoachSeason profile={vis} team={visTeam} /> : <NoTeam profile={vis} onDone={reload} />)}
      {active === 'matrix' && (visTeam ? <SeasonMatrix team={visTeam} /> : <NoTeam profile={vis} onDone={reload} />)}
      {active === 'athletes' && (visTeam ? <Athletes profile={vis} team={visTeam} filter={lopereFilter} onFilter={setLopereFilter} onGrupper={() => supabase.rpc('mine_grupper').then(({ data }) => setGrupper(data || []))} /> : <NoTeam profile={vis} onDone={reload} />)}
      {/* Egen fane, oeverst: loggen foeres ofte, og laa foer tre skjermlengder
          nede i «Min utvikling». En foresatt ser oekter, men foerer ingen. */}
      {active === 'training' && <div className="page"><TrainingLog profile={vis} team={visTeam} isCoach={isCoach} readOnly={!!som}
        tidtaking={<Timing profile={vis} team={visTeam} isCoach={isCoach} />} /></div>}
      {active === 'next' && (velkommen && !som && !isCoach && !isParent
        ? <Velkommen profile={vis} team={visTeam} hent onDone={ferdigVelkommen} onGo={k => { ferdigVelkommen(); gaTil(k) }} />
        : <NextRace profile={vis} team={visTeam} onOpenRace={() => setTab('mine')} tomt={<Velkommen profile={vis} team={visTeam} onGo={gaTil} />} />)}
      {active === 'mine' && <MySeason profile={vis} team={visTeam} readOnly={!!som} />}
      {active === 'races' && <RaceBrowser profile={vis} team={visTeam} isCoach={isCoach} readOnly={isParent} />}
      {active === 'children' && <Children profile={vis} />}
      {active === 'kiddev' && <ChildDev />}
      {active === 'kidnext' && <ChildNext onOpenRace={() => setTab('children')} />}
      {active === 'pamelding' && <Pamelding />}
      {active === 'dev' && <Utvikling profile={vis} team={visTeam} isCoach={isCoach} readOnly={!!som} />}
      {active === 'feedback' && <Feedback profile={vis} />}
      {active === 'admin' && <Admin profile={profile} onSeSom={seSom} />}
      {active === 'settings' && <Settings profile={vis} team={visTeam} isCoach={isCoach} onChange={reload} />}
      </main>
      </div>
      <div className="scrim" onClick={() => setSheet(false)} />
      <MobileNav active={navActive} onPick={pickPane} planCount={planCount} />
    </LangContext.Provider>
  )
}
