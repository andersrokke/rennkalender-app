import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import Lagkode from './Lagkode.jsx'

// Steg-for-steg for en fersk trener. To ulike veier, fordi det er to ulike
// spørsmål:
//
//   Eier du laget øverst, er du hovedtrener. Da er spørsmålet «hvordan får jeg
//   trenerne mine inn», og løperne er trenernes ansvar, ikke ditt.
//
//   Eier du en gruppe under et lag, er spørsmålet «hvordan får jeg løperne
//   mine inn», og trenerne er allerede på plass.
//
// Å vise begge til begge ville gjort at ingen av dem leste noen av dem.

const dt = s => s ? new Date(s).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : ''

export default function CoachStart({ team, antall }) {
  return team.parent_team_id
    ? <Gruppetrener team={team} antall={antall} />
    : <Hovedtrener team={team} antall={antall} />
}

function Steg({ nr, gjort, tittel, tekst, children }) {
  return (
    <li className={gjort ? 'gjort' : ''}>
      <div className="cs-nr">{gjort ? '✓' : nr}</div>
      <div className="cs-tekst">
        <b>{tittel}</b>
        <p>{tekst}</p>
        {children}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Hovedtreneren: få trenerne inn
// ---------------------------------------------------------------------------
function Hovedtrener({ team, antall }) {
  const t = useT()
  const [epost, setEpost] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [invitasjoner, setInvitasjoner] = useState([])

  const last = () => supabase.rpc('head_invites').then(({ data }) => setInvitasjoner(data || []))
  useEffect(() => { last() }, [team.id])

  async function inviter(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('head_invite_coach', { p_email: epost.trim() })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setMsg({ text: t('csCoachInvited').replace('{e}', epost.trim()) })
    setEpost(''); last()
  }

  const inne = invitasjoner.filter(i => i.sist_innlogget).length

  return (
    <div className="card cs-kort">
      <h2>{t('csHeadTitle')}</h2>
      <p className="muted">{t('csHeadSub')}</p>
      <ol className="cs-steg">
        <Steg nr={1} gjort tittel={t('csHeadStep1')} tekst={t('csHeadStep1b').replace('{lag}', team.name)} />

        <Steg nr={2} gjort={inne > 0} tittel={t('csHeadStep2')} tekst={t('csHeadStep2b')}>
          <form onSubmit={inviter} className="cs-inviter">
            <input type="email" required value={epost} placeholder="trener@klubben.no"
              aria-label={t('csCoachEmail')} onChange={e => setEpost(e.target.value)} />
            <button className="btn primary small" disabled={busy || !epost.trim()}>
              {busy ? t('csSending') : t('csInviteCoach')}
            </button>
          </form>
          {msg && <p className={msg.bad ? 'error' : 'notice'} style={{ margin: '8px 0 0' }}>{msg.text}</p>}

          {invitasjoner.length > 0 && (
            <ul className="cs-liste">
              {invitasjoner.map(i => (
                <li key={i.id}>
                  <span className="cs-epost">{i.email}</span>
                  <span className={`fb-status ${i.sist_innlogget ? 'done' : i.send_error ? 'declined' : 'planned'}`}>
                    {i.sist_innlogget ? (i.gruppe || t('csJoined'))
                      : i.send_error ? t('csFailed') : t('csWaiting')}
                  </span>
                  {!i.sist_innlogget && (
                    <button type="button" className="btn link small"
                      onClick={() => supabase.rpc('head_cancel_invite', { p_id: i.id }).then(last)}>
                      {t('csWithdraw')}
                    </button>
                  )}
                  {i.send_error && <span className="cs-feil">{i.send_error}</span>}
                  {!i.send_error && !i.sist_innlogget && <span className="cs-nar">{dt(i.created_at)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Steg>

        {/* Løperne sto nederst, under «skal du ha løpere også?», som om det
            var en ettertanke. For en hovedtrener uten grupper er det den
            eneste veien løpere kommer inn i det hele tatt. */}
        <Steg nr={3} tittel={t('csHeadStep3')} tekst={t('csHeadStep3b').replace('{n}', antall)}>
          <Lagkode team={team} />
        </Steg>
        <Steg nr={4} tittel={t('csHeadStep4')} tekst={t('csHeadStep4b')} />
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gruppetreneren: få løperne inn
// ---------------------------------------------------------------------------
function Gruppetrener({ team, antall }) {
  const t = useT()

  if (antall > 0) {
    return (
      <div className="card cs-kort">
        <h2>{t('csShareTitle')}</h2>
        <p className="muted">{t('csShareSub').replace('{n}', antall)}</p>
        <Lagkode team={team} />
      </div>
    )
  }

  return (
    <div className="card cs-kort">
      <h2>{t('csTitle')}</h2>
      <p className="muted">{t('csSub')}</p>
      <ol className="cs-steg">
        <Steg nr={1} gjort tittel={t('csStep1')} tekst={t('csStep1b').replace('{lag}', team.name)} />
        <Steg nr={2} tittel={t('csStep2')} tekst={t('csStep2b')}>
          <Lagkode team={team} />
        </Steg>
        <Steg nr={3} tittel={t('csStep3')} tekst={t('csStep3b')} />
        <Steg nr={4} tittel={t('csStep4')} tekst={t('csStep4b')} />
      </ol>
    </div>
  )
}
