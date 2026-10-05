import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { useTeamAssign } from './useTeamAssign'
import { avtale } from '../avtale'

// Trenerens startside: hva venter på deg, hva skjer snart, og hvor du går for
// å gjøre noe med det. Tallene er de samme som i Sesongoppsett.
export default function CoachHome({ profile, team, onGo }) {
  const t = useT()
  const { rows, loading } = useTeamAssign(team.id)
  const [races, setRaces] = useState([])
  const [lopere, setLopere] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('team_id', team.id).eq('role', 'athlete')
      .then(({ count }) => setLopere(count || 0))
  }, [team.id])

  const rennIder = [...new Set(rows.map(r => r.race_id))].sort((a, b) => a - b).join(',')
  useEffect(() => {
    if (!rennIder) { setRaces([]); return }
    let av = false
    supabase.from('races').select('id, place, start_date, end_date, events, category, host_nation').in('id', rennIder.split(',').map(Number))
      .then(({ data }) => { if (!av) setRaces((data || []).sort((a, b) => a.start_date.localeCompare(b.start_date))) })
    return () => { av = true }
  }, [rennIder])

  const tall = useMemo(() => {
    const n = k => rows.filter(r => avtale(r) === k).length
    return { deg: n('venterTrener'), loper: n('venterLoper'), avtalt: n('avtalt') + n('pameldt') }
  }, [rows])

  const idag = new Date().toISOString().slice(0, 10)
  const kommende = races.filter(r => (r.end_date || r.start_date) >= idag).slice(0, 4)
  const dato = r => new Date(r.start_date + 'T12:00').toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'short' })
  const paRenn = id => rows.filter(r => r.race_id === id)
  const navn = (id, koder) => paRenn(id).filter(r => koder.includes(avtale(r))).map(r => (r.full_name || '').split(' ')[0])

  if (loading || lopere === null) return <div className="page muted">{t('loading')}</div>

  const fornavn = (profile.full_name || '').split(' ')[0]
  const tomt = lopere === 0 || races.length === 0

  return (
    <div className="page hjem">
      <div className="hjem-hode">
        <h2>{t('hjHello').replace('{n}', fornavn)}</h2>
        <p className="muted">{team.name} · {lopere} {t('athletesWord')} · {races.length} {t('racesN')}</p>
      </div>

      {tomt && (
        <div className="card">
          <h3>{t('hjStartTitle')}</h3>
          <ol className="hjem-steg">
            <li className={lopere > 0 ? 'ferdig' : ''}>
              <b>{t('hjStep1')}</b>
              <span>{t('hjStep1Sub')} {team.invite_code && <code>{team.invite_code}</code>}</span>
              <button type="button" className="btn small" onClick={() => onGo('settings')}>{t('hjStep1Go')}</button>
            </li>
            <li className={races.length > 0 ? 'ferdig' : ''}>
              <b>{t('hjStep2')}</b>
              <span>{t('hjStep2Sub')}</span>
              <button type="button" className="btn small" onClick={() => onGo('races')}>{t('hjStep2Go')}</button>
            </li>
            <li>
              <b>{t('hjStep3')}</b>
              <span>{t('hjStep3Sub')}</span>
              <button type="button" className="btn small" onClick={() => onGo('matrix')}>{t('hjStep3Go')}</button>
            </li>
          </ol>
        </div>
      )}

      {!tomt && (
        <div className="hjem-rute">
          <button type="button" className={`hjem-kort ${tall.deg ? 'venterTrener' : ''}`} onClick={() => onGo('matrix')}>
            <b>{tall.deg}</b>
            <span>{t('hjWaitYou')}</span>
            <small>{tall.deg ? t('hjWaitYouSub') : t('hjNothing')}</small>
          </button>
          <button type="button" className="hjem-kort venterLoper" onClick={() => onGo('matrix')}>
            <b>{tall.loper}</b>
            <span>{t('hjWaitAthlete')}</span>
            <small>{t('hjWaitAthleteSub')}</small>
          </button>
          <button type="button" className="hjem-kort avtalt" onClick={() => onGo('season')}>
            <b>{tall.avtalt}</b>
            <span>{t('hjAgreed')}</span>
            <small>{t('hjAgreedSub')}</small>
          </button>
        </div>
      )}

      {kommende.length > 0 && (
        <div className="card">
          <div className="hjem-tittel">
            <h3>{t('hjNext')}</h3>
            <button type="button" className="btn small" onClick={() => onGo('season')}>{t('hjSeeSeason')}</button>
          </div>
          <ul className="hjem-renn">
            {kommende.map(r => {
              const ja = navn(r.id, ['avtalt', 'pameldt']), venter = navn(r.id, ['venterTrener', 'venterLoper'])
              return (
                <li key={r.id}>
                  <div className="nar">{dato(r)}</div>
                  <div className="hva">
                    <b>{r.place}</b> <span className="muted">{r.events}{r.category ? ` · ${r.category}` : ''}</span>
                    <div className="hvem">
                      {ja.length > 0 && <span className="tag av avtalt">{ja.length} {t('hjGoing')}: {ja.join(', ')}</span>}
                      {venter.length > 0 && <span className="tag av venterTrener">{venter.length} {t('hjOpen')}: {venter.join(', ')}</span>}
                      {!ja.length && !venter.length && <span className="muted">{t('hjNobody')}</span>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>{t('hjShortcuts')}</h3>
        <div className="hjem-snarveier">
          <button type="button" onClick={() => onGo('races')}><b>{t('races')}</b><span>{t('hjGoRaces')}</span></button>
          <button type="button" onClick={() => onGo('matrix')}><b>{t('matrix')}</b><span>{t('hjGoMatrix')}</span></button>
          <button type="button" onClick={() => onGo('season')}><b>{t('season')}</b><span>{t('hjGoSeason')}</span></button>
          <button type="button" onClick={() => onGo('training')}><b>{t('tlTitle')}</b><span>{t('hjGoTraining')}</span></button>
        </div>
      </div>
    </div>
  )
}
