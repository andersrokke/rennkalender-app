import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fmt, fisUrl } from '../util'
import { ordne, GRUPPER } from '../pamelding'

// Påmelding for foreldre: alle barnas kommende renn på én side, ordnet etter
// hva som haster. Fristen kommer fra iSonen, eller fra treneren når iSonen
// ikke har den. «På deltakerlista» er det eneste som er bekreftet utenfra.
export default function Pamelding({ profile, onChange }) {
  const t = useT()
  const [rader, setRader] = useState(null)
  const [varsler, setVarsler] = useState(profile.entry_alerts !== false)
  const [lagrer, setLagrer] = useState(false)

  useEffect(() => {
    supabase.rpc('barnas_pamelding').then(({ data }) => setRader(data || []))
  }, [])

  const grupper = useMemo(() => ordne(rader || []), [rader])
  const flereBarn = new Set((rader || []).map(r => r.athlete_id)).size > 1

  async function settVarsler(pa) {
    setVarsler(pa); setLagrer(true)
    const { error } = await supabase.from('profiles').update({ entry_alerts: pa }).eq('id', profile.id)
    setLagrer(false)
    if (error) { setVarsler(!pa); alert(error.message) } else onChange?.()
  }

  const klokke = d => new Date(d).toLocaleString(t.lang === 'en' ? 'en-GB' : 'nb-NO',
    { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const igjen = r => r.dager == null ? null
    : new Date(r.frist) < new Date() ? t('pmPassed')
    : r.dager <= 1 ? t('pmTomorrowOrToday') : `${r.dager} ${t('pmDaysLeft')}`

  if (rader === null) return <div className="page muted">{t('loading')}</div>

  return (
    <div className="page">
      <div className="card">
        <h2>{t('pmTitle')}</h2>
        <p className="muted">{t('pmSub')}</p>
        <label className="pm-bryter">
          <input type="checkbox" id="pm-varsler" checked={varsler} disabled={lagrer} onChange={e => settVarsler(e.target.checked)} />
          <span><b>{t('pmAlerts')}</b><br /><span className="muted">{t('pmAlertsSub')}</span></span>
        </label>
        {rader.length > 0 && (
          <div className="kpis">
            <div className="kpi pm-tall haster"><b>{grupper.haster.length + grupper.utgatt.length}</b><span>{t('pmK_haster')}</span></div>
            <div className="kpi pm-tall"><b>{grupper.kommer.length}</b><span>{t('pmK_kommer')}</span></div>
            <div className="kpi pm-tall"><b>{grupper.ukjent.length}</b><span>{t('pmK_ukjent')}</span></div>
            <div className="kpi pm-tall ok"><b>{grupper.pameldt.length}</b><span>{t('pmK_pameldt')}</span></div>
          </div>
        )}
      </div>

      {rader.length === 0 && <div className="card"><p className="muted">{t('pmEmpty')}</p></div>}

      {GRUPPER.filter(g => grupper[g].length).map(g => (
        <div className={`card pm-gruppe ${g}`} key={g}>
          <h2>{t('pmG_' + g)} <span className="muted">({grupper[g].length})</span></h2>
          <p className="muted">{t('pmGSub_' + g)}</p>
          <div className="pm-liste">
            {grupper[g].map(r => (
              <div className="pm-rad" key={r.athlete_id + '-' + r.race_id}>
                <div className="pm-hoved">
                  <div className="gv-dato">{fmt(r)}{flereBarn && <> · {r.athlete_name}</>}</div>
                  <b>{r.place} <span className="muted">{r.host_nation}</span></b>
                  <div className="muted">{r.category} · {r.events}{r.i_lagets_plan ? ` · ${t('teamPlanBadge')}` : ''}</div>
                </div>
                <div className="pm-status">
                  <span className={`gv-dom ${r.pameldt === 'bekreftet' ? 'sterkt' : r.pameldt === 'merket' ? 'vanlig' : g === 'haster' || g === 'utgatt' ? 'ingen' : 'svakt'}`}>
                    {t('pmS_' + r.pameldt)}
                  </span>
                  {r.frist ? (
                    <div className="pm-frist">
                      <b>{igjen(r)}</b>
                      <span className="muted">{t('deadline')} {klokke(r.frist)}{r.frist_kilde === 'trener' ? ` · ${t('pmFromCoach')}` : ''}</span>
                    </div>
                  ) : <div className="pm-frist"><span className="muted">{t('pmNoDeadline')}</span></div>}
                  <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                    {r.host_nation === 'NOR' && r.pameldt !== 'bekreftet' && <a href="https://isonen.no" target="_blank" rel="noreferrer">{t('pmOpenIsonen')} ↗</a>}
                    {fisUrl(r) && <a href={fisUrl(r)} target="_blank" rel="noreferrer">FIS-side ↗</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {rader.length > 0 && <p className="muted" style={{ padding: '0 4px', fontSize: 13 }}>{t('pmFoot')}</p>}
    </div>
  )
}
