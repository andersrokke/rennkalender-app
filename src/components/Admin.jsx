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

export default function Admin({ profile }) {
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
      {fane === 'brukere' && <Brukere rader={d.brukere} meg={profile.id} t={t} onEndret={last} />}
      {fane === 'lag' && <Lag rader={d.lag} t={t} />}
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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function inviter(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('admin_invite_coach', {
      p_email: epost.trim(), p_note: notat.trim() || null
    })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setEpost(''); setNotat(''); setMsg({ text: t('adInviteSent').replace('{e}', epost.trim()) })
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

function Brukere({ rader, meg, t, onEndret }) {
  const [travel, setTravel] = useState(null)

  const kall = async (fn, args) => {
    setTravel(JSON.stringify(args))
    const { error } = await supabase.rpc(fn, args)
    setTravel(null)
    if (error) alert(error.message); else onEndret()
  }

  if (!rader) return <div className="card muted">{t('adLoading')}</div>
  return (
    <div className="card">
      <h2>{t('adTab_brukere')} <span className="muted">({rader.length})</span></h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>{t('adName')}</th><th>{t('adEmail')}</th><th>{t('adRole')}</th>
              <th>{t('adTeam')}</th><th className="n">{t('adSessions')}</th>
              <th>{t('adLastIn')}</th><th>{t('adActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rader.map(u => (
              <tr key={u.id} className={u.is_test ? 'ad-test' : ''}>
                <td>
                  {u.full_name || '–'}
                  {u.is_admin && <span className="ad-merke admin">{t('adAdmin')}</span>}
                  {!u.onboarded && <span className="ad-merke">{t('adUnfinished')}</span>}
                </td>
                <td className="ad-epost">{u.email}<br /><span className="muted">{u.provider || 'e-post'}</span></td>
                <td>
                  <select value={u.role} aria-label={t('adRole')}
                    onChange={e => kall('admin_set_role', { p_user: u.id, p_role: e.target.value })}>
                    {ROLLER.map(r => <option key={r} value={r}>{t('adRole_' + r)}</option>)}
                  </select>
                </td>
                <td>{u.team_name || '–'}</td>
                <td className="n">{u.okter}</td>
                <td>{siden(u.last_sign_in_at, t)}</td>
                <td>
                  <div className="ad-handlinger">
                    <button type="button" className="btn small"
                      disabled={!!travel}
                      onClick={() => kall('admin_set_admin', { p_user: u.id, p_on: !u.is_admin })}>
                      {u.is_admin ? t('adDemote') : t('adPromote')}
                    </button>
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
  )
}

function Lag({ rader, t }) {
  if (!rader) return <div className="card muted">{t('adLoading')}</div>
  if (!rader.length) return <div className="card"><p className="muted">{t('adNoTeams')}</p></div>
  return (
    <div className="card">
      <h2>{t('adTab_lag')} <span className="muted">({rader.length})</span></h2>
      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr><th>{t('adTeam')}</th><th>{t('adOwner')}</th><th className="n">{t('adAthletes')}</th>
              <th className="n">{t('adRaces')}</th><th>{t('adCode')}</th><th>{t('adCreated')}</th></tr>
          </thead>
          <tbody>
            {rader.map(l => (
              <tr key={l.id}>
                <td>{l.name}{l.club && <><br /><span className="muted">{l.club}</span></>}</td>
                <td>{l.owner_name || '–'}<br /><span className="muted">{l.owner_email}</span></td>
                <td className="n">{l.lopere}</td>
                <td className="n">{l.renn}</td>
                <td><code className="ad-kode">{l.invite_code}</code></td>
                <td>{dt(l.created_at)}</td>
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
