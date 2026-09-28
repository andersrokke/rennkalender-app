import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Hovedtrenerens bilde: gruppene i laget, og hvem som ser hverandres.
//
// Vises bare for den som faktisk er hovedtrener - altså eier et lag som har
// grupper under seg. For alle andre svarer head_overview() null, og da
// rendrer denne ingenting. Ingen tom overskrift, ingen «du har ikke tilgang».
//
// Rutenettet er trenere ganger grupper. Egen gruppe står som et merke og ikke
// som en avkrysning: at en trener ser sin egen gruppe er ikke noe noen skal
// kunne skru av.

export default function HeadCoach() {
  const t = useT()
  const [d, setD] = useState(undefined)
  const [busy, setBusy] = useState(null)
  const [feil, setFeil] = useState(null)

  const last = () => supabase.rpc('head_overview').then(({ data }) => setD(data))
  useEffect(() => { last() }, [])

  if (d === undefined || d === null) return null
  // Står bryteren på, gjelder den alle - også trenere som kommer senere.
  // Da er rutenettet bare en visning, ikke noe å klikke i.
  const alle = d.lag?.alle_ser_alt

  async function byttAlle(pa) {
    setBusy('alle'); setFeil(null)
    const { error } = await supabase.rpc('head_set_open', { p_on: pa })
    setBusy(null)
    if (error) return setFeil(error.message)
    last()
  }

  async function giTil(gruppe, trener) {
    if (!trener) return
    setBusy('gi' + gruppe); setFeil(null)
    const { error } = await supabase.rpc('sett_gruppetrener', { p_team: gruppe, p_coach: trener })
    setBusy(null)
    if (error) return setFeil(error.message)
    last()
  }

  async function bytt(trener, gruppe, pa) {
    setBusy(trener + gruppe); setFeil(null)
    const { error } = await supabase.rpc('head_set_access', {
      p_coach: trener, p_team: gruppe, p_on: pa
    })
    setBusy(null)
    if (error) return setFeil(error.message)
    last()
  }

  return (
    <div className="card">
      <h2>{t('hcTitle').replace('{lag}', d.lag?.navn || '')}</h2>
      <p className="muted">{t('hcSub')}</p>

      <div className="ad-scroll">
        <table className="ad-table">
          <thead>
            <tr>
              <th>{t('hcGroup')}</th><th>{t('hcCoach')}</th>
              <th className="n">{t('hcAthletes')}</th><th className="n">{t('hcSessions30')}</th>
            </tr>
          </thead>
          <tbody>
            {d.grupper.map(g => (
              <tr key={g.id}>
                <td>{g.navn}</td>
                <td>
                  {/* Hovedtreneren kan gi gruppa til en annen trener i huset. */}
                  <select value={g.trener_id || ''} aria-label={t('hcCoach')} disabled={busy === 'gi' + g.id}
                    onChange={e => giTil(g.id, e.target.value)}>
                    {!g.trener_id && <option value="">–</option>}
                    {d.trenere.map(tr => <option key={tr.id} value={tr.id}>{tr.navn}</option>)}
                  </select>
                </td>
                <td className="n">{g.lopere}</td>
                <td className="n">{g.okter_30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="hc-h3">{t('hcAccess')}</h3>
      <p className="muted">{t('hcAccessSub')}</p>
      {feil && <p className="error">{feil}</p>}

      <label className="hc-bryter">
        <input type="checkbox" checked={!!alle} disabled={busy === 'alle'}
          onChange={e => byttAlle(e.target.checked)} />
        <span>
          <b>{t('hcOpen')}</b>
          <em>{t('hcOpenSub')}</em>
        </span>
      </label>

      <div className="ad-scroll">
        <table className="ad-table hc-rutenett">
          <thead>
            <tr>
              <th>{t('hcCoach')}</th>
              {d.grupper.map(g => <th key={g.id} className="n">{g.navn}</th>)}
            </tr>
          </thead>
          <tbody className={alle ? 'hc-laast' : ''}>
            {d.trenere.map(tr => (
              <tr key={tr.id}>
                <td>{tr.navn || '–'}</td>
                {d.grupper.map(g => {
                  const egen = tr.egen_gruppe === g.id
                  const pa = egen || alle || (tr.innsyn || []).includes(g.id)
                  return (
                    <td key={g.id} className="n">
                      {egen
                        ? <span className="ad-merke">{t('hcOwn')}</span>
                        : <input type="checkbox" checked={pa}
                            disabled={alle || busy === tr.id + g.id}
                            aria-label={`${tr.navn} – ${g.navn}`}
                            onChange={e => bytt(tr.id, g.id, e.target.checked)} />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
