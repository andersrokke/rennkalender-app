import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fetchFromFis } from '../fis'
import { berik, nokkeltall, FORSTE_SESONG } from '../resultater'
import { godeSteder } from '../anbefalt'
import { fisPoints } from '../format'

// Første skjerm etter registrering, og Hjem så lenge planen er tom:
// «Dette er deg». Appen viser at den kjenner løperen før hun har gjort noe:
// starter, beste plassering, FIS-poeng, stedene hun gjør det best, og
// kommende renn der - med ett trykk for å legge dem i sesongen.
//
// Med hent=true hentes resultatene fra FIS først (rett etter registrering);
// ellers brukes det som alt ligger i basen.
export default function Velkommen({ profile, team, hent = false, onDone, onGo }) {
  const t = useT()
  const [steg, setSteg] = useState(hent && profile.fis_code ? 'henter' : 'klar')
  const [feil, setFeil] = useState(null)
  const [res, setRes] = useState(null)
  const [renn, setRenn] = useState([])
  const [poeng, setPoeng] = useState(null)
  const [lagRenn, setLagRenn] = useState(0)
  const [lagtTil, setLagtTil] = useState(new Set())
  const idag = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const fornavn = (profile.full_name || '').split(' ')[0]

  useEffect(() => {
    let av = false
    ;(async () => {
      if (hent && profile.fis_code) {
        const r = await fetchFromFis(profile.fis_code)
        if (av) return
        if (r.error) setFeil(r.error)
      }
      if (!profile.fis_code) { setSteg('klar'); return }
      const [{ data: fr }, { data: k }, { data: p }, { data: tr }] = await Promise.all([
        supabase.from('fis_results').select('fis_race_id, race_date, place, nation, discipline, category, position, fis_points')
          .eq('fis_code', profile.fis_code).gte('race_date', `${FORSTE_SESONG}-07-01`),
        supabase.from('races').select('id, fis_event_id, place, host_nation, start_date, end_date, events, category, gender').gte('end_date', idag).order('start_date'),
        supabase.from('fis_list_athletes').select('sl, gs, sg, dh').eq('fis_code', profile.fis_code).maybeSingle(),
        team ? supabase.from('team_races').select('id', { count: 'exact', head: true }).eq('team_id', team.id) : Promise.resolve({ data: null })
      ])
      if (av) return
      setRes(berik(fr || [])); setRenn(k || []); setPoeng(p || null)
      setSteg('klar')
    })()
    return () => { av = true }
  }, [profile.fis_code, hent, idag, team?.id])

  useEffect(() => {
    if (!team) return
    supabase.from('team_races').select('id', { count: 'exact', head: true }).eq('team_id', team.id).then(({ count }) => setLagRenn(count || 0))
  }, [team?.id])

  const n = useMemo(() => nokkeltall(res || []), [res])
  const sterke = useMemo(() => {
    if (!res?.length) return []
    const { rader } = godeSteder(res, renn, { idag, kjonn: profile.gender || null })
    // Ett renn per sted, de sterkeste først, maks tre.
    const sett = new Set(), ut = []
    for (const x of rader) { if (x.dom === 'sterkt' || (x.dom === 'vanlig' && ut.length < 2)) { const k = x.renn.place; if (!sett.has(k)) { sett.add(k); ut.push(x) } } if (ut.length >= 3) break }
    return ut
  }, [res, renn, idag, profile.gender])
  const dato = d => new Date(d + 'T12:00:00Z').toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'short', timeZone: 'UTC' })

  async function leggTil(r) {
    const { error } = await supabase.from('athlete_races').upsert(
      { athlete_id: profile.id, race_id: r.id, team_id: team?.id ?? null, status: 'wish', updated_at: new Date().toISOString(), answered_at: new Date().toISOString() },
      { onConflict: 'athlete_id,race_id' })
    if (error) return alert(error.message)
    setLagtTil(s => new Set(s).add(r.id))
  }

  if (steg === 'henter') return (
    <div className="page vk">
      <div className="vk-henter">
        <div className="vk-spinner" aria-hidden="true" />
        <h2>{t('vkFetching').replace('{n}', fornavn)}</h2>
        <p className="muted">{t('vkFetchingSub')}</p>
      </div>
    </div>
  )

  const harData = !!res?.length

  return (
    <div className="page vk">
      <div className="vk-hode">
        <span className="vk-merke">{t('vkTag')}</span>
        <h2>{harData ? t('vkTitle').replace('{n}', fornavn) : t('vkTitleEmpty').replace('{n}', fornavn)}</h2>
        <p className="muted">{harData ? t('vkSub') : profile.fis_code ? t('vkNoResults') : t('vkNoCode')}</p>
        {feil && <p className="error">{feil}</p>}
      </div>

      {harData && (
        <div className="vk-tall">
          <div><b>{n.starter}</b><span>{t('vkStarts')}</span></div>
          <div><b>{n.prosent == null ? '–' : n.prosent + ' %'}</b><span>{t('finished')}</span></div>
          <div><b>{n.bestePlass ?? '–'}</b><span>{t('vkBestPlace')}</span></div>
          <div><b>{n.pall}</b><span>{t('vkPodiums')}</span></div>
          {poeng && (poeng.sl != null || poeng.gs != null) && (
            <div className="vk-poeng"><b>{[['SL', poeng.sl], ['GS', poeng.gs], ['SG', poeng.sg], ['DH', poeng.dh]].filter(([, v]) => v != null).map(([g, v]) => `${g} ${fisPoints(v, t.lang)}`).join(' · ')}</b><span>{t('vkPointsNow')}</span></div>
          )}
        </div>
      )}

      {sterke.length > 0 && (
        <div className="card">
          <h3>{t('vkStrongTitle')}</h3>
          <p className="muted">{t('vkStrongSub')}</p>
          <ul className="vk-renn">
            {sterke.map(x => (
              <li key={x.renn.id}>
                <div className="nar">{dato(x.renn.start_date)}</div>
                <div className="hva">
                  <b>{x.renn.place}</b> <span className="muted">{x.renn.events}{x.renn.category ? ` · ${x.renn.category}` : ''}</span>
                  <div className="muted vk-hist">{x.dom === 'sterkt' ? t('vkStrongHere') : t('vkRacedHere')}: {x.starter} {t('vkStartsHere')}{x.bestePlass ? ` · ${t('vkBest')} ${x.bestePlass}.` : ''}{x.bestePoeng != null ? ` · ${fisPoints(x.bestePoeng, t.lang)} ${t('vkPts')}` : ''}</div>
                </div>
                <button type="button" className={`btn small ${lagtTil.has(x.renn.id) ? '' : 'primary'}`} disabled={lagtTil.has(x.renn.id)} onClick={() => leggTil(x.renn)}>
                  {lagtTil.has(x.renn.id) ? t('vkAdded') : t('vkAdd')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card vk-neste">
        <h3>{t('vkNextTitle')}</h3>
        <div className="vk-valg">
          {team && <button type="button" onClick={() => onGo?.('mine')}><b>{t('mine')}</b><span>{lagRenn ? t('vkTeamPlans').replace('{n}', lagRenn) : t('vkTeamNoPlan')}</span></button>}
          <button type="button" onClick={() => onGo?.('races')}><b>{t('races')}</b><span>{t('vkGoRaces')}</span></button>
          {harData && <button type="button" onClick={() => onGo?.('dev')}><b>{t('dev')}</b><span>{t('vkGoDev')}</span></button>}
          {!profile.fis_code && <button type="button" onClick={() => onGo?.('settings')}><b>{t('settingsTab')}</b><span>{t('vkGoCode')}</span></button>}
        </div>
        {onDone && <button type="button" className="btn primary vk-ferdig" onClick={onDone}>{t('vkDone')}</button>}
      </div>
    </div>
  )
}
