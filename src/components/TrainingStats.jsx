import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Statistikk fra treningsloggen.
//
// Loggen har samlet føre, vær, temperatur, porter, minutter og anstrengelse
// hele tiden, men viste tre tall og åtte siste økter. Alt det andre lå der
// uten at noen fikk se det.
//
// Filtrene gjør jobben her, ikke sortering: «vis meg storslalåm på salteføre»
// er spørsmålet en trener har, og det er et utvalg, ikke en rekkefølge.
// Nøkkeltallene regnes av utvalget, så de svarer alltid på det som står på
// skjermen.

const GRENER = ['SL', 'GS', 'SG', 'DH', 'FREE', 'COND']
const FORE = ['ice', 'salted', 'hard', 'grippy', 'soft', 'slush', 'powder', 'artificial']
const VAER = ['sun', 'cloudy', 'flat_light', 'snow', 'fog', 'rain', 'wind', 'indoor']
const PERIODER = [['30', 30], ['90', 90], ['sesong', null], ['alt', 3650]]
const SORTERING = ['dato', 'vurdering', 'runs', 'temp', 'gren']
// Vurderingen i tre bånd, så det er lett å drille ned: 1-3 dårlig, 4-7 ok,
// 8-10 veldig bra. Samme grenser som fargene i skjemaet.
export const BAND = ['daarlig', 'ok', 'bra']
export const band = r => r == null ? null : r <= 3 ? 'daarlig' : r <= 7 ? 'ok' : 'bra'

const iso = d => d.toISOString().slice(0, 10)
// Sesongen følger FIS: 1. juli til 30. juni.
const sesongstart = () => {
  const n = new Date()
  return `${n.getMonth() + 1 >= 7 ? n.getFullYear() : n.getFullYear() - 1}-07-01`
}
const dagerSiden = n => iso(new Date(Date.now() - n * 864e5))
const ukestart = d => {
  const x = new Date(d + 'T12:00:00')
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return iso(x)
}
const fmtDato = s => new Date(s + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
const en = n => (n == null ? '–' : n)

export default function TrainingStats({ athleteId, mates = [], isCoach, nonce = 0 }) {
  const t = useT()
  const [rader, setRader] = useState(null)
  const [periode, setPeriode] = useState('sesong')
  const [grener, setGrener] = useState([])
  const [fore, setFore] = useState([])
  const [vaer, setVaer] = useState([])
  const [bandValg, setBandValg] = useState([])
  const [tempFra, setTempFra] = useState('')
  const [tempTil, setTempTil] = useState('')
  const [sted, setSted] = useState('')
  const [sorter, setSorter] = useState('dato')
  const [alle, setAlle] = useState(false)

  const gruppe = isCoach && alle && mates.length > 0
  const ider = gruppe ? mates.map(m => m.id) : [athleteId]

  useEffect(() => {
    if (!ider.length || !ider[0]) return
    const fra = periode === 'sesong' ? sesongstart()
      : dagerSiden(PERIODER.find(p => p[0] === periode)[1])
    supabase.from('training_sessions')
      .select('id, athlete_id, date, discipline, runs, gates, snow, weather, temp_c, minutes, rpe, rating, note, venue, slope:slopes(resort, name, difficulty)')
      .in('athlete_id', ider).eq('planned', false).gte('date', fra)
      .order('date', { ascending: false }).limit(2000)
      .then(({ data }) => setRader(data || []))
  }, [athleteId, periode, gruppe, mates.length, nonce])

  const navn = useMemo(() => Object.fromEntries(mates.map(m => [m.id, m.full_name])), [mates])

  const valgt = useMemo(() => {
    if (!rader) return []
    const fra = tempFra === '' ? null : Number(tempFra)
    const til = tempTil === '' ? null : Number(tempTil)
    return rader.filter(r =>
      (!grener.length || grener.includes(r.discipline)) &&
      (!fore.length || fore.includes(r.snow)) &&
      (!vaer.length || vaer.includes(r.weather)) &&
      (!bandValg.length || bandValg.includes(band(r.rating))) &&
      (fra == null || (r.temp_c != null && r.temp_c >= fra)) &&
      (til == null || (r.temp_c != null && r.temp_c <= til)) &&
      (!sted || r.slope?.resort === sted || r.venue === sted))
  }, [rader, grener, fore, vaer, bandValg, tempFra, tempTil, sted])

  const steder = useMemo(() => {
    if (!rader) return []
    return [...new Set(rader.map(r => r.slope?.resort || r.venue).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'nb'))
  }, [rader])

  const tall = useMemo(() => {
    const ski = valgt.filter(r => r.discipline !== 'COND')
    const snitt = (arr, f) => {
      const v = arr.map(f).filter(x => x != null)
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
    }
    return {
      dager: new Set(ski.map(r => r.date)).size,
      okter: valgt.length,
      runs: ski.reduce((a, r) => a + (r.runs || 0), 0),
      porter: ski.reduce((a, r) => a + (r.gates || 0), 0),
      timer: Math.round(valgt.reduce((a, r) => a + (r.minutes || 0), 0) / 6) / 10,
      temp: snitt(valgt, r => r.temp_c),
      rpe: snitt(valgt, r => r.rpe),
      vurdering: snitt(valgt, r => r.rating)
    }
  }, [valgt])

  // Runs er målet på mengde i bakken, ikke antall økter: to økter på fem runs
  // er noe annet enn én på tjue.
  const fordeling = (nokkel, verdier) => {
    const sum = {}
    valgt.forEach(r => {
      const k = typeof nokkel === 'function' ? nokkel(r) : r[nokkel]
      if (!k) return
      sum[k] = (sum[k] || 0) + (r.runs || 0)
    })
    const rekke = verdier ? verdier.filter(v => sum[v]) : Object.keys(sum)
    return rekke.map(k => ({ k, n: sum[k] }))
      .sort((a, b) => b.n - a.n)
  }

  const perGren = useMemo(() => fordeling('discipline', GRENER), [valgt])
  const perFore = useMemo(() => fordeling('snow', FORE), [valgt])
  const perSted = useMemo(() => fordeling(r => r.slope?.resort || r.venue).slice(0, 6), [valgt])

  // Hva som funker: snittvurdering per føre, vær, gren og sted, der det finnes
  // minst to vurderte økter. Og de beste øktene, så man finner dem igjen.
  const vurderte = useMemo(() => valgt.filter(r => r.rating != null), [valgt])
  const snittAv = (nokkel, verdier) => {
    const sum = {}, ant = {}
    vurderte.forEach(r => {
      const k = typeof nokkel === 'function' ? nokkel(r) : r[nokkel]
      if (!k) return
      sum[k] = (sum[k] || 0) + r.rating; ant[k] = (ant[k] || 0) + 1
    })
    return (verdier ? verdier.filter(v => ant[v]) : Object.keys(ant)).filter(k => ant[k] >= 2)
      .map(k => ({ k, n: Math.round(sum[k] / ant[k] * 10) / 10, antall: ant[k] })).sort((a, b) => b.n - a.n)
  }
  const funkerFore = useMemo(() => snittAv('snow', FORE), [vurderte])
  const funkerVaer = useMemo(() => snittAv('weather'), [vurderte])
  const funkerGren = useMemo(() => snittAv('discipline', GRENER), [vurderte])
  const funkerSted = useMemo(() => snittAv(r => r.slope?.resort || r.venue).slice(0, 6), [vurderte])
  const beste = useMemo(() => [...vurderte].sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date)).slice(0, 5), [vurderte])
  const perBand = useMemo(() => BAND.map(k => ({ k, n: vurderte.filter(r => band(r.rating) === k).length })).filter(x => x.n), [vurderte])

  const uker = useMemo(() => {
    const sum = {}
    valgt.filter(r => r.discipline !== 'COND').forEach(r => {
      const u = ukestart(r.date)
      sum[u] = (sum[u] || 0) + (r.runs || 0)
    })
    return Object.entries(sum).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
  }, [valgt])

  const sortert = useMemo(() => {
    const v = [...valgt]
    const nullSist = (a, b) => (a == null) - (b == null)
    if (sorter === 'vurdering') v.sort((a, b) => nullSist(a.rating, b.rating) || (b.rating || 0) - (a.rating || 0) || b.date.localeCompare(a.date))
    if (sorter === 'runs') v.sort((a, b) => nullSist(a.runs, b.runs) || (b.runs || 0) - (a.runs || 0))
    if (sorter === 'temp') v.sort((a, b) => nullSist(a.temp_c, b.temp_c) || a.temp_c - b.temp_c)
    if (sorter === 'gren') v.sort((a, b) => GRENER.indexOf(a.discipline) - GRENER.indexOf(b.discipline)
      || b.date.localeCompare(a.date))
    return v.slice(0, 100)
  }, [valgt, sorter])

  const perLoper = useMemo(() => {
    if (!gruppe) return []
    const m = {}
    valgt.forEach(r => {
      const o = m[r.athlete_id] || (m[r.athlete_id] = { dager: new Set(), runs: 0, okter: 0, gren: {} })
      o.okter++
      if (r.discipline !== 'COND') {
        o.dager.add(r.date)
        o.runs += r.runs || 0
        o.gren[r.discipline] = (o.gren[r.discipline] || 0) + (r.runs || 0)
      }
    })
    return mates.map(p => ({ id: p.id, navn: p.full_name, ...(m[p.id] || { dager: new Set(), runs: 0, okter: 0, gren: {} }) }))
      .sort((a, b) => b.runs - a.runs)
  }, [gruppe, valgt, mates])

  const nullstill = () => {
    setGrener([]); setFore([]); setVaer([]); setTempFra(''); setTempTil(''); setSted('')
  }
  const filtrert = grener.length || fore.length || vaer.length || tempFra || tempTil || sted

  if (rader === null) return <div className="card muted">{t('tsLoading')}</div>

  return (
    <>
      <div className="card">
        <h2>{t('tsTitle')}</h2>
        <p className="muted">{t('tsLead')}</p>

        {isCoach && mates.length > 0 && (
          <div className="row" style={{ gap: 6, marginBottom: 12 }}>
            <button type="button" className={`chip ${!alle ? 'on' : ''}`} onClick={() => setAlle(false)}>
              {t('tsOne')}
            </button>
            <button type="button" className={`chip ${alle ? 'on' : ''}`} onClick={() => setAlle(true)}>
              {t('tsAll').replace('{n}', mates.length)}
            </button>
          </div>
        )}

        <label>{t('tsPeriod')}</label>
        <div className="row" style={{ gap: 6 }}>
          {PERIODER.map(([k]) => (
            <button key={k} type="button" className={`chip ${periode === k ? 'on' : ''}`}
              onClick={() => setPeriode(k)}>{t('tsP_' + k)}</button>
          ))}
        </div>

        <label>{t('tlDiscipline')}</label>
        <Flervalg valg={GRENER} prefix="disc_" valgt={grener} sett={setGrener} t={t} />
        <label>{t('tlSnow')}</label>
        <Flervalg valg={FORE} prefix="snow_" valgt={fore} sett={setFore} t={t} />
        <label>{t('tlWeather')}</label>
        <Flervalg valg={VAER} prefix="wx_" valgt={vaer} sett={setVaer} t={t} />
        <label>{t('tsBandLabel')}</label>
        <Flervalg valg={BAND} prefix="band_" valgt={bandValg} sett={setBandValg} t={t} />

        <div className="tl-grid">
          <div>
            <label htmlFor="ts-fra">{t('tsTempFrom')}</label>
            <input id="ts-fra" type="number" step="1" value={tempFra} placeholder="-15"
              onChange={e => setTempFra(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ts-til">{t('tsTempTo')}</label>
            <input id="ts-til" type="number" step="1" value={tempTil} placeholder="0"
              onChange={e => setTempTil(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ts-sted">{t('tlResort')}</label>
            <select id="ts-sted" value={sted} onChange={e => setSted(e.target.value)}>
              <option value="">{t('tsAllPlaces')}</option>
              {steder.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {filtrert && (
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn small" onClick={nullstill}>{t('tsClear')}</button>
            <span className="muted">{t('tsShowing').replace('{n}', valgt.length).replace('{m}', rader.length)}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="ad-kpis">
          <Kpi tall={tall.dager} tekst={t('tsDays')} />
          <Kpi tall={tall.runs} tekst={t('tsRuns')} />
          <Kpi tall={tall.okter} tekst={t('tsSessions')} />
          <Kpi tall={tall.timer || '–'} tekst={t('tsHours')} />
          <Kpi tall={tall.porter || '–'} tekst={t('tsGates')} />
          <Kpi tall={tall.temp == null ? '–' : tall.temp + '°'} tekst={t('tsTemp')} />
          <Kpi tall={en(tall.rpe)} tekst={t('tsRpe')} />
          <Kpi tall={en(tall.vurdering)} tekst={t('tsRating')} />
        </div>
      </div>

      {valgt.length === 0 ? (
        <div className="card"><p className="muted">{t('tsNothing')}</p></div>
      ) : (
        <>
          <div className="card">
            <h2>{t('tsRunsBy')}</h2>
            <div className="ts-kolonner">
              <Fordeling tittel={t('tlDiscipline')} rader={perGren} prefix="disc_" t={t} />
              <Fordeling tittel={t('tlSnow')} rader={perFore} prefix="snow_" t={t} />
              <Fordeling tittel={t('tlResort')} rader={perSted} t={t} />
            </div>
          </div>

          {vurderte.length > 0 && (
            <div className="card">
              <h2>{t('tsBestTitle')}</h2>
              <p className="muted">{t('tsBestSub').replace('{n}', vurderte.length)}</p>
              <div className="ts-band">
                {perBand.map(x => (
                  <button key={x.k} type="button" className={`ts-band-knapp ${x.k}${bandValg.includes(x.k) ? ' on' : ''}`}
                    onClick={() => setBandValg(v => v.includes(x.k) ? v.filter(y => y !== x.k) : [...v, x.k])}>
                    <b>{x.n}</b><span>{t('band_' + x.k)}</span><small>{t('bandSpan_' + x.k)}</small>
                  </button>
                ))}
              </div>
              <ul className="ts-beste">
                {beste.map(r => (
                  <li key={r.id}>
                    <b className={`ts-vurd t${r.rating}`}>{r.rating}</b>
                    <div className="ts-beste-hva">
                      <b>{fmtDato(r.date)}{gruppe ? ` · ${navn[r.athlete_id] || '–'}` : ''} · {t('disc_' + r.discipline)}{r.slope ? ` · ${r.slope.resort} · ${r.slope.name}` : r.venue ? ` · ${r.venue}` : ''}</b>
                      <span className="muted">{[r.snow && t('snow_' + r.snow), r.weather && t('wx_' + r.weather), r.temp_c != null && `${r.temp_c}°`, r.runs && `${r.runs} runs`, r.gates && `${r.gates} ${t('tlGates').toLowerCase()}`].filter(Boolean).join(' · ')}</span>
                      {r.note && <span className="ts-notat">«{r.note}»</span>}
                    </div>
                  </li>
                ))}
              </ul>
              {(funkerFore.length + funkerVaer.length + funkerGren.length + funkerSted.length) > 0 && (
                <>
                  <h3 className="ts-funker-h">{t('tsWorksTitle')}</h3>
                  <p className="muted">{t('tsWorksSub')}</p>
                  <div className="ts-kolonner">
                    <Fordeling tittel={t('tlSnow')} rader={funkerFore} prefix="snow_" t={t} maks={10} />
                    <Fordeling tittel={t('tlWeather')} rader={funkerVaer} prefix="wx_" t={t} maks={10} />
                    <Fordeling tittel={t('tlDiscipline')} rader={funkerGren} prefix="disc_" t={t} maks={10} />
                    <Fordeling tittel={t('tlResort')} rader={funkerSted} t={t} maks={10} />
                  </div>
                </>
              )}
            </div>
          )}

          {uker.length > 1 && (
            <div className="card">
              <h2>{t('tsWeeks')}</h2>
              <div className="ad-stolper">
                {uker.map(([u, n]) => {
                  const topp = Math.max(...uker.map(x => x[1]), 1)
                  return (
                    <div className="ad-stolpe" key={u}>
                      <div className="ad-sokyle" style={{ height: `${Math.round((n / topp) * 100)}%` }} />
                      <span className="ad-tall">{n}</span>
                      <span className="ad-uke">{fmtDato(u)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {gruppe && (
            <div className="card">
              <h2>{t('tsPerAthlete')}</h2>
              <div className="ad-scroll">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>{t('adName')}</th>
                      <th className="n">{t('tsDays')}</th>
                      <th className="n">{t('tsRuns')}</th>
                      <th className="n">{t('tsSessions')}</th>
                      {GRENER.filter(g => g !== 'COND').map(g =>
                        <th key={g} className="n">{t('disc_' + g)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {perLoper.map(p => (
                      <tr key={p.id} className={p.runs === 0 ? 'ad-test' : ''}>
                        <td>{p.navn}</td>
                        <td className="n">{p.dager.size}</td>
                        <td className="n">{p.runs}</td>
                        <td className="n">{p.okter}</td>
                        {GRENER.filter(g => g !== 'COND').map(g =>
                          <td key={g} className="n">{p.gren[g] || '–'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ margin: 0 }}>{t('tsList')} <span className="muted">({valgt.length})</span></h2>
              <div className="row" style={{ gap: 6 }}>
                {SORTERING.map(s => (
                  <button key={s} type="button" className={`chip ${sorter === s ? 'on' : ''}`}
                    onClick={() => setSorter(s)}>{t('tsSort_' + s)}</button>
                ))}
              </div>
            </div>
            <div className="ad-scroll" style={{ marginTop: 12 }}>
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>{t('tlDate')}</th>
                    {gruppe && <th>{t('adName')}</th>}
                    <th>{t('tlDiscipline')}</th>
                    <th>{t('tlResort')}</th>
                    <th className="n">{t('tsRuns')}</th>
                    <th>{t('tlSnow')}</th>
                    <th>{t('tlWeather')}</th>
                    <th className="n">°C</th>
                    <th className="n">{t('tlRpe')}</th>
                    <th className="n">{t('tsRatingCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortert.map(r => (
                    <tr key={r.id}>
                      <td>{fmtDato(r.date)}</td>
                      {gruppe && <td>{navn[r.athlete_id] || '–'}</td>}
                      <td>{t('disc_' + r.discipline)}</td>
                      <td>{r.slope ? `${r.slope.resort} · ${r.slope.name}` : (r.venue || '–')}</td>
                      <td className="n">{en(r.runs)}</td>
                      <td>{r.snow ? t('snow_' + r.snow) : '–'}</td>
                      <td>{r.weather ? t('wx_' + r.weather) : '–'}</td>
                      <td className="n">{en(r.temp_c)}</td>
                      <td className="n">{en(r.rpe)}</td>
                      <td className="n">{r.rating != null ? <b className={`ts-vurd t${r.rating}`}>{r.rating}</b> : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {valgt.length > 100 && <p className="muted fb-meta">{t('tsCapped')}</p>}
          </div>
        </>
      )}
    </>
  )
}

function Kpi({ tall, tekst }) {
  return <div className="ad-kpi"><b>{tall}</b><span>{tekst}</span></div>
}

function Flervalg({ valg, prefix, valgt, sett, t }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {valg.map(v => (
        <button key={v} type="button" aria-pressed={valgt.includes(v)}
          className={`chip ${valgt.includes(v) ? 'on' : ''}`}
          onClick={() => sett(valgt.includes(v) ? valgt.filter(x => x !== v) : [...valgt, v])}>
          {t(prefix ? prefix + v : v)}
        </button>
      ))}
    </div>
  )
}

function Fordeling({ tittel, rader, prefix, t, maks = null }) {
  const topp = maks || Math.max(...rader.map(r => r.n), 1)
  return (
    <div className="ts-fordeling">
      <h3>{tittel}</h3>
      {rader.length === 0 ? <p className="muted">–</p> : rader.map(r => (
        <div className="ts-rad" key={r.k}>
          <span className="ts-navn">{prefix ? t(prefix + r.k) : r.k}</span>
          <span className="ts-bar"><i style={{ width: `${Math.round((r.n / topp) * 100)}%` }} /></span>
          <span className="ts-n">{r.n}{r.antall != null && <small className="muted"> ({r.antall})</small>}</span>
        </div>
      ))}
    </div>
  )
}
