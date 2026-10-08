import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Administratorsiden. Ett sted å se helheten, og de få handlingene som ikke
// hører hjemme noe annet sted: invitere trenere, endre roller, slette brukere.
//
// Alt hentes gjennom admin_*-funksjonene i basen. De leser ting en vanlig
// bruker ikke skal komme til - e-postadresser, cron-historikk, alle lag - og
// sjekker is_admin() selv. Denne skjermen har ingen egne rettigheter; skjuler
// vi fanen, er dataene fortsatt stengt.

const FANER = ['oversikt', 'trenere', 'brukere', 'lag', 'drift', 'aktivitet']
const ROLLER = ['athlete', 'coach', 'parent']

const dt = s => s ? new Date(s).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: '2-digit' }) : '–'
const dtt = s => s ? new Date(s).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'

// «for 3 dager siden» sier mer enn datoen når spørsmålet er om noe har stoppet.
function siden(s, t) {
  if (!s) return t('adNever')
  const min = Math.round((Date.now() - new Date(s)) / 60000)
  if (min < 60) return t('adMinAgo').replace('{n}', min)
  if (min < 1440) return t('adHoursAgo').replace('{n}', Math.round(min / 60))
  return t('adDaysAgo').replace('{n}', Math.round(min / 1440))
}

export default function Admin({ profile, onSeSom = null }) {
  const t = useT()
  const [fane, setFane] = useState('oversikt')
  const [d, setD] = useState({})
  const [feil, setFeil] = useState(null)

  const last = async () => {
    const kall = {
      oversikt: 'admin_overview', brukere: 'admin_users', lag: 'admin_teams',
      drift: 'admin_ops', aktivitet: 'admin_activity', trenere: 'admin_invites'
    }
    const { data, error } = await supabase.rpc(kall[fane])
    if (error) return setFeil(error.message)
    setFeil(null); setD(p => ({ ...p, [fane]: data }))
  }
  useEffect(() => { last() }, [fane])

  return (
    <div className="page">
      <div className="card">
        <h2>{t('adTitle')}</h2>
        <p className="muted">{t('adSub')}</p>
        <div className="ad-tabs">
          {FANER.map(f => (
            <button key={f} className={`chip ${fane === f ? 'on' : ''}`}
              aria-pressed={fane === f} onClick={() => setFane(f)}>{t('adTab_' + f)}</button>
          ))}
        </div>
      </div>

      {feil && <div className="card"><p className="error">{feil}</p></div>}

      {fane === 'oversikt' && <Oversikt o={d.oversikt} t={t} />}
      {fane === 'trenere' && <Trenere rader={d.trenere} t={t} onEndret={last} />}
      {fane === 'brukere' && <Brukere rader={d.brukere} meg={profile.id} t={t} onEndret={last} onSeSom={onSeSom} />}
      {fane === 'lag' && <Lag rader={d.lag} t={t} onEndret={last} />}
      {fane === 'drift' && <Drift o={d.drift} t={t} />}
      {fane === 'aktivitet' && <Aktivitet o={d.aktivitet} t={t} />}
    </div>
  )
}

function Kpi({ tall, tekst, vekt }) {
  return <div className={`ad-kpi ${vekt || ''}`}><b>{tall ?? '–'}</b><span>{tekst}</span></div>
}

function Oversikt({ o, t }) {
  if (!o) return <div className="card muted">{t('adLoading')}</div>
  return (
    <>
      <div className="card">
        <h2>{t('adPeople')}</h2>
        <div className="ad-kpis">
          <Kpi tall={o.brukere} tekst={t('adUsers')} />
          <Kpi tall={o.trenere} tekst={t('adCoaches')} />
          <Kpi tall={o.lopere} tekst={t('adAthletes')} />
          <Kpi tall={o.foreldre} tekst={t('adParents')} />
          <Kpi tall={o.lag} tekst={t('adTeams')} />
        </div>
      </div>
      <div className="card">
        <h2>{t('adNeedsYou')}</h2>
        <div className="ad-kpis">
          <Kpi tall={o.feedback_ny} tekst={t('adNewFeedback')} vekt={o.feedback_ny > 0 ? 'varsel' : ''} />
          <Kpi tall={o.invitasjoner} tekst={t('adOpenInvites')} />
          <Kpi tall={o.ikke_ferdige} tekst={t('adNotOnboarded')} vekt={o.ikke_ferdige > 0 ? 'varsel' : ''} />
        </div>
      </div>
      <div className="card">
        <h2>{t('adUsage')}</h2>
        <div className="ad-kpis">
          <Kpi tall={o.aktive_7d} tekst={t('adActive7')} />
          <Kpi tall={o.okter_30d} tekst={t('adSessions30')} />
          <Kpi tall={o.admins} tekst={t('adAdmins')} />
        </div>
      </div>
    </>
  )
}

function Trenere({ rader, t, onEndret }) {
  const [epost, setEpost] = useState('')
  const [notat, setNotat] = useState('')
  const [lag, setLag] = useState('')
  const [lagene, setLagene] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // Bare lag som kan være forelder, altså de som ikke selv ligger under noe.
  useEffect(() => {
    supabase.rpc('admin_teams').then(({ data }) =>
      setLagene((data || []).filter(l => !l.parent_team_id)))
  }, [])

  async function inviter(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('admin_invite_coach', {
      p_email: epost.trim(), p_note: notat.trim() || null, p_parent_team: lag || null
    })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setEpost(''); setNotat(''); setMsg({ text: t('adInviteSent').replace('{e}', epost.trim()) })
    onEndret()
  }

  async function sendIgjen(i) {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('admin_resend_invite', { p_email: i.email })
    setBusy(false)
    setMsg(error ? { bad: true, text: error.message } : { text: t('adInviteSent').replace('{e}', i.email) })
    onEndret()
  }

  async function avbryt(id) {
    await supabase.rpc('admin_cancel_invite', { p_id: id })
    onEndret()
  }

  return (
    <>
      <div className="card">
        <h2>{t('adInviteTitle')}</h2>
        <p className="muted">{t('adInviteSub')}</p>
        <form onSubmit={inviter}>
          <div className="tl-grid">
            <div style={{ gridColumn: 'span 2' }}>
              <label htmlFor="ad-epost">{t('adEmail')}</label>
              <input id="ad-epost" type="email" required value={epost}
                placeholder="trener@klubben.no" onChange={e => setEpost(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ad-lag">{t('adInviteTeam')}</label>
              <select id="ad-lag" value={lag} onChange={e => setLag(e.target.value)}>
                <option value="">{t('adInviteTeamNone')}</option>
                {lagene.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="ad-notat">{t('adInviteNote')}</label>
          <input id="ad-notat" value={notat} maxLength={500}
            placeholder={t('adInviteNotePh')} onChange={e => setNotat(e.target.value)} />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={busy || !epost.trim()}>
              {busy ? t('adSending') : t('adSendInvite')}
            </button>
            {msg && <span className={msg.bad ? 'error' : 'notice'} style={{ margin: 0 }}>{msg.text}</span>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>{t('adInvites')} <span className="muted">({rader?.length ?? 0})</span></h2>
        {msg && <p className={msg.bad ? 'error' : 'success'}>{msg.text}</p>}
        {!rader?.length ? <p className="muted">{t('adNoInvites')}</p> : (
          <ul className="fb-list">
            {rader.map(i => {
              const inne = !!i.sist_innlogget
              const status = inne ? 'done' : i.send_error ? 'declined' : i.sent_at ? 'planned' : 'new'
              return (
                <li className="fb-item" key={i.id}>
                  <div className="fb-head">
                    <b>{i.email}</b>
                    <span className={`fb-status ${status}`}>
                      {inne ? t('adAccepted') : i.send_error ? t('adFailed')
                        : i.sent_at ? t('adSent') : t('adQueued')}
                    </span>
                  </div>
                  {i.note && <p className="fb-body">{i.note}</p>}
                  <p className="muted fb-meta">
                    {t('adInvitedBy').replace('{n}', i.invited_by_name || '–')} · {dt(i.created_at)}
                    {inne && <> · {t('adSignedIn')} {dtt(i.sist_innlogget)}</>}
                  </p>
                  {i.send_error && <p className="fb-note" style={{ borderColor: 'var(--danger)' }}>{i.send_error}</p>}
                  {!inne && (
                    <div className="row" style={{ marginTop: 10, gap: 8 }}>
                      <button type="button" className="btn small primary" disabled={busy} onClick={() => sendIgjen(i)}>
                        {t('adResend')}
                      </button>
                      <button type="button" className="btn small" onClick={() => avbryt(i.id)}>
                        {t('adCancelInvite')}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

// Brukerne, gruppert slik de faktisk henger sammen: skigymnas, gruppe, og
// hvem som hører til hvem. Den flate lista svarte på «hvem finnes», ikke på
// «hvem hører til hvor» - og det siste er spørsmålet en administrator har.
const ROLLEORDEN = { coach: 0, athlete: 1, parent: 2 }

function Brukere({ rader, meg, t, onEndret, onSeSom }) {
  const [travel, setTravel] = useState(null)
  const [lag, setLag] = useState([])
  useEffect(() => { supabase.rpc('admin_teams').then(({ data }) => setLag(data || [])) }, [rader])

  const [sendt, setSendt] = useState(null)
  const kall = async (fn, args) => {
    setTravel(JSON.stringify(args))
    const { error } = await supabase.rpc(fn, args)
    setTravel(null)
    if (error) alert(error.message); else onEndret()
    return !error
  }

  if (!rader) return <div className="card muted">{t('adLoading')}</div>

  const hus = new Map()
  for (const u of rader) {
    // Foreldre hører ikke til noe lag: de er koblet til barnet sitt. De får
    // sin egen gruppe i stedet for å stå som «uten lag».
    const forelder = u.role === 'parent' && !u.hus_id
    const k = u.hus_id || (forelder ? '__foreldre' : '__uten')
    if (!hus.has(k)) hus.set(k, { id: u.hus_id, navn: u.hus_navn, skigymnas: u.skigymnas, foreldre: forelder, folk: [] })
    hus.get(k).folk.push(u)
  }
  const ordnet = [...hus.values()].sort((x, y) =>
    (x.id ? 0 : x.foreldre ? 1 : 2) - (y.id ? 0 : y.foreldre ? 1 : 2) || (x.navn || '').localeCompare(y.navn || '', 'nb'))
  for (const h of ordnet) h.folk.sort((x, y) =>
    (ROLLEORDEN[x.role] ?? 9) - (ROLLEORDEN[y.role] ?? 9)
    || Number(y.pa_huset) - Number(x.pa_huset)
    || (x.team_name || '').localeCompare(y.team_name || '', 'nb')
    || (x.full_name || '').localeCompare(y.full_name || '', 'nb'))

  const lagnavn = l => (l.parent_name ? `${l.parent_name} › ${l.name}` : l.name)

  return (
    <>
      <div className="card">
        <h2>{t('adTab_brukere')} <span className="muted">({rader.length})</span></h2>
        <p className="muted">{t('adUsersSub')}</p>
      </div>
      {ordnet.map(h => (
        <div className="card" key={h.id || (h.foreldre ? 'foreldre' : 'uten')}>
          <h2>
            {h.id ? h.navn : h.foreldre ? t('adParentsGroup') : t('adNoTeamGroup')}
            {h.skigymnas && <span className="ad-merke admin">{t('adSchool')}</span>}
            <span className="muted"> ({h.folk.length})</span>
          </h2>
          <div className="ad-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>{t('adName')}</th><th>{t('adRole')}</th><th>{t('adTeam')}</th>
                  <th>{t('adLinks')}</th><th>{t('adLastIn')}</th><th>{t('adActions')}</th>
                </tr>
              </thead>
              <tbody>
                {h.folk.map(u => (
                  <tr key={u.id} className={u.is_test ? 'ad-test' : ''}>
                    <td>
                      {u.full_name || '–'}
                      {u.is_admin && <span className="ad-merke admin">{t('adAdmin')}</span>}
                      {!u.onboarded && <span className="ad-merke">{t('adUnfinished')}</span>}
                      <br /><span className="muted ad-epost">{u.email} · {u.provider || 'e-post'}</span>
                    </td>
                    <td>
                      <select value={u.role} aria-label={t('adRole')}
                        onChange={e => kall('admin_set_role', { p_user: u.id, p_role: e.target.value })}>
                        {ROLLER.map(r => <option key={r} value={r}>{t('adRole_' + r)}</option>)}
                      </select>
                    </td>
                    <td>
                      {u.role === 'parent' && !u.team_id ? <span className="muted">{t('adParentNoTeam')}</span> : <>
                      <select value={u.team_id || ''} aria-label={t('adTeam')}
                        onChange={e => kall('admin_set_team', { p_user: u.id, p_team: e.target.value || null })}>
                        <option value="">{t('adNoTeamOpt')}</option>
                        {lag.map(l => <option key={l.id} value={l.id}>{lagnavn(l)}</option>)}
                      </select>
                      {u.role === 'athlete' && u.pa_huset && u.skigymnas &&
                        <><br /><span className="ad-merke">{t('adNoGroup')}</span></>}
                      </>}
                    </td>
                    <td className="ad-kobling">
                      {u.foresatte && <div>{t('adGuardians')}: {u.foresatte}</div>}
                      {u.barn && <div>{t('adParentOf')}: {u.barn}</div>}
                      {u.eier_av && <div>{t('adOwns')}: {u.eier_av}</div>}
                      {!u.foresatte && !u.barn && !u.eier_av && '–'}
                    </td>
                    <td>{siden(u.last_sign_in_at, t)}</td>
                    <td>
                      <div className="ad-handlinger">
                        <button type="button" className="btn small" disabled={!!travel}
                          onClick={() => kall('admin_set_admin', { p_user: u.id, p_on: !u.is_admin })}>
                          {u.is_admin ? t('adDemote') : t('adPromote')}
                        </button>
                        {onSeSom && u.role === 'athlete' && u.onboarded && (
                          <button type="button" className="btn small" disabled={!!travel} onClick={() => onSeSom(u.id)}>{t('adSeeAs')}</button>
                        )}
                        {u.role === 'coach' && !u.last_sign_in_at && u.email && (
                          <button type="button" className="btn small" disabled={!!travel}
                            onClick={async () => { if (await kall('admin_resend_invite', { p_email: u.email })) setSendt(u.email) }}>
                            {sendt === u.email ? t('adResent') : t('adResend')}
                          </button>
                        )}
                        {u.id !== meg && (
                          <button type="button" className="btn small danger" disabled={!!travel}
                            onClick={() => confirm(t('adDeleteConfirm').replace('{n}', u.full_name || u.email))
                              && kall('admin_delete_user', { p_user: u.id })}>
                            {t('adDelete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}

function Lag({ rader, t, onEndret }) {
  const [trenere, setTrenere] = useState([])
  useEffect(() => {
    supabase.rpc('admin_users').then(({ data }) =>
      setTrenere((data || []).filter(u => u.role === 'coach')))
  }, [rader])

  if (!rader) return <div className="card muted">{t('adLoading')}</div>
  if (!rader.length) return <div className="card"><p className="muted">{t('adNoTeams')}</p></div>
  // Et lag som alt ligger under et annet kan ikke selv bli forelder - det er
  // bare ett nivå - så de filtreres bort fra valgene.
  const mulige = rader.filter(x => !x.parent_team_id)
  const kall = async (fn, args) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) alert(error.message); else onEndret()
  }
  const nyttNavn = l => {
    const n = prompt(t('adRenamePrompt'), l.name)
    if (n && n.trim() && n.trim() !== l.name) kall('admin_rename_team', { p_team: l.id, p_name: n.trim() })
  }
  return (
    <div className="card">
      <h2>{t('adTab_lag')} <span className="muted">({rader.length})</span></h2>
      <p className="muted">{t('adTeamsSub')}</p>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr><th>{t('adTeam')}</th><th>{t('adParent')}</th><th>{t('adOwner')}</th>
              <th className="n">{t('adAthletes')}</th>
              <th>{t('adCode')}</th><th>{t('adActions')}</th></tr>
          </thead>
          <tbody>
            {rader.map(l => (
              <tr key={l.id}>
                <td>
                  {l.parent_team_id && <span className="muted">↳ </span>}{l.name}
                  {l.is_school && <span className="ad-merke admin">{t('adSchool')}</span>}
                </td>
                <td>
                  {l.is_school ? <span className="muted">–</span> : (
                    <select value={l.parent_team_id || ''} aria-label={t('adParent')}
                      onChange={e => kall('admin_set_parent_team', { p_team: l.id, p_parent: e.target.value || null })}>
                      <option value="">{t('adParentNone')}</option>
                      {mulige.filter(x => x.id !== l.id).map(x =>
                        <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {/* Hovedtrener for et skigymnas settes her. Ingen kan ta det selv. */}
                  <select value={l.owner_id || ''} aria-label={t('adOwner')}
                    onChange={e => kall('admin_set_team_owner', { p_team: l.id, p_user: e.target.value || null })}>
                    <option value="">{t('adNoOwner')}</option>
                    {l.owner_id && !trenere.some(x => x.id === l.owner_id) &&
                      <option value={l.owner_id}>{l.owner_name || l.owner_email}</option>}
                    {trenere.map(x => <option key={x.id} value={x.id}>{x.full_name || x.email}</option>)}
                  </select>
                </td>
                <td className="n">{l.lopere}</td>
                <td><code className="ad-kode">{l.invite_code}</code></td>
                <td>
                  <div className="ad-handlinger">
                    <button type="button" className="btn small" onClick={() => nyttNavn(l)}>{t('adRename')}</button>
                    {!l.is_school && (
                      <button type="button" className="btn small danger"
                        onClick={() => confirm(t('adDeleteTeamConfirm').replace('{n}', l.name))
                          && kall('admin_delete_team', { p_team: l.id })}>
                        {t('adDelete')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Drift({ o, t }) {
  if (!o) return <div className="card muted">{t('adLoading')}</div>
  // En jobb som ikke har kjørt på over et døgn er verdt å se på: den hyppigste
  // går hver time, den sjeldneste hver natt.
  const sen = s => !s || (Date.now() - new Date(s)) > 36 * 3600e3
  return (
    <>
      <div className="card">
        <h2>{t('adJobs')}</h2>
        {!o.jobber?.length ? <p className="muted">{t('adNoJobs')}</p> : (
          <div className="ad-scroll">
            <table className="ad-table">
              <thead><tr><th>{t('adJob')}</th><th>{t('adSchedule')}</th><th>{t('adLastRun')}</th><th>{t('adStatus')}</th></tr></thead>
              <tbody>
                {o.jobber.map(j => (
                  <tr key={j.jobb} className={j.status && j.status !== 'succeeded' ? 'ad-feil' : ''}>
                    <td>{j.jobb}{!j.aktiv && <span className="ad-merke">{t('adPaused')}</span>}</td>
                    <td><code className="ad-kode">{j.plan}</code></td>
                    <td className={sen(j.sist) ? 'ad-gammel' : ''}>{dtt(j.sist)}</td>
                    <td>{j.status || '–'}{j.melding && <><br /><span className="muted">{j.melding}</span></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h2>{t('adAlerts')}</h2>
        <p className="muted">{t('adAlertsSub')}</p>
        {!o.varsler?.length ? <p className="muted">{t('adNoAlerts')}</p> : (
          <ul className="fb-list">
            {o.varsler.map((v, i) => (
              <li className="fb-item" key={i}>
                <div className="fb-head">
                  <span className="fb-kind bug">{v.status ?? t('adNoAnswer')}</span>
                  <b>{dtt(v.nar)}</b>
                </div>
                <p className="fb-body">{v.svar}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h2>{t('adFreshness')}</h2>
        <p className="muted">{t('adFreshnessSub')}</p>
        <ul className="ad-liste">
          <li><span>{t('adFisList')}</span><b className={sen(o.fis_liste) ? 'ad-gammel' : ''}>{siden(o.fis_liste, t)}</b></li>
          <li><span>{t('adCupStandings')}</span><b className={sen(o.cupstilling) ? 'ad-gammel' : ''}>{siden(o.cupstilling, t)}</b></li>
          <li><span>{t('adIsonen')}</span><b className={sen(o.isonen) ? 'ad-gammel' : ''}>{siden(o.isonen, t)}</b></li>
        </ul>
        <div className="ad-kpis" style={{ marginTop: 14 }}>
          <Kpi tall={o.renn} tekst={t('adRaces')} />
          <Kpi tall={o.bakker} tekst={t('adSlopes')} />
          <Kpi tall={o.fis_lopere} tekst={t('adFisAthletes')} />
        </div>
      </div>
    </>
  )
}

function Aktivitet({ o, t }) {
  if (!o) return <div className="card muted">{t('adLoading')}</div>
  const uker = o.uker || []
  const topp = Math.max(1, ...uker.map(u => u.okter))
  return (
    <>
      <div className="card">
        <h2>{t('adWeeks')}</h2>
        <p className="muted">{t('adWeeksSub')}</p>
        {!uker.length ? <p className="muted">{t('adNoSessions')}</p> : (
          <div className="ad-stolper">
            {uker.map(u => (
              <div className="ad-stolpe" key={u.uke}>
                <div className="ad-sokyle" style={{ height: `${Math.round((u.okter / topp) * 100)}%` }}
                  title={`${u.okter} økter, ${u.lopere} løpere`} />
                <span className="ad-tall">{u.okter}</span>
                <span className="ad-uke">{dt(u.uke)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <h2>{t('adTab_aktivitet')}</h2>
        <div className="ad-kpis">
          <Kpi tall={o.renn_i_planer} tekst={t('adRacesPlanned')} />
          <Kpi tall={o.planlagte_okter} tekst={t('adPlannedSessions')} />
          <Kpi tall={o.aldri_inne} tekst={t('adNeverIn')} vekt={o.aldri_inne > 0 ? 'varsel' : ''} />
        </div>
      </div>
    </>
  )
}
