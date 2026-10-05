import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { lesHcTiming, foreslaLoper } from '../hctiming'
import { s2 } from './Timing.jsx'

const GRENER = ['SL', 'GS', 'SG', 'DH', 'FREE']
const BEHOLD = '__behold', UTE = '__ute'

// Treneren laster opp en CSV-fil fra HC Timing. Fila leses i nettleseren, og
// ingenting lagres før treneren har sett over hvem som er hvem: navnene i
// fila kobles til løperne på laget, og koblingen huskes til neste gang.
export default function TimingImport({ team, profile, onLagret }) {
  const t = useT()
  const fil = useRef(null)
  const [lest, setLest] = useState(null)        // { filnavn, rader, mellomtider, hoder }
  const [feil, setFeil] = useState(null)
  const [lopere, setLopere] = useState([])
  const [kjente, setKjente] = useState({})       // source_name -> athlete_id fra tidligere opplastinger
  const [valg, setValg] = useState({})           // source_name -> athlete_id | BEHOLD | UTE
  const [dato, setDato] = useState(() => new Date().toISOString().slice(0, 10))
  const [gren, setGren] = useState('GS')
  const [sted, setSted] = useState('')
  const [lagrer, setLagrer] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('team_id', team.id).eq('role', 'athlete').order('full_name')
      .then(({ data }) => setLopere(data || []))
    supabase.from('timing_aliases').select('source_name, athlete_id').eq('team_id', team.id)
      .then(({ data }) => setKjente(Object.fromEntries((data || []).map(a => [a.source_name, a.athlete_id]))))
  }, [team.id])

  const navn = useMemo(() => {
    if (!lest) return []
    const m = new Map()
    lest.rader.forEach(r => {
      const x = m.get(r.source_name) || { navn: r.source_name, lop: 0, beste: null, ukjent: r.ukjent }
      x.lop++
      if (r.run_time_ms != null && (x.beste == null || r.run_time_ms < x.beste)) x.beste = r.run_time_ms
      m.set(r.source_name, x)
    })
    return [...m.values()].sort((a, b) => Number(a.ukjent) - Number(b.ukjent) || a.navn.localeCompare(b.navn, 'nb'))
  }, [lest])

  async function velgFil(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFeil(null)
    const res = lesHcTiming(await f.text())
    if (res.feil || !res.rader.length) { setLest(null); setFeil(t('tiUnknown')); return }
    setLest({ filnavn: f.name, ...res })
    // Forslag: det treneren valgte sist for navnet, ellers et sikkert navnetreff.
    const forslag = {}
    for (const r of res.rader) {
      if (forslag[r.source_name]) continue
      const kjent = kjente[r.source_name]
      forslag[r.source_name] = (kjent && lopere.some(l => l.id === kjent)) ? kjent
        : r.ukjent ? BEHOLD : (foreslaLoper(r.source_name, lopere) || BEHOLD)
    }
    setValg(forslag)
  }

  function avbryt() { setLest(null); setFeil(null); if (fil.current) fil.current.value = '' }

  async function lagre() {
    setLagrer(true); setFeil(null)
    const med = lest.rader.filter(r => valg[r.source_name] !== UTE)
    const koblet = r => (valg[r.source_name] && ![BEHOLD, UTE].includes(valg[r.source_name])) ? valg[r.source_name] : null
    const { data: imp, error: e1 } = await supabase.from('timing_imports').insert({
      team_id: team.id, uploaded_by: profile.id, filename: lest.filnavn, session_date: dato, discipline: gren,
      venue: sted.trim() || null, note: 'HC Timing', rows_total: med.length, rows_mapped: med.filter(koblet).length, raw_headers: lest.hoder
    }).select('id').single()
    if (e1) { setLagrer(false); setFeil(e1.message); return }
    const { error: e2 } = await supabase.from('timing_runs').insert(med.map(r => ({
      import_id: imp.id, team_id: team.id, athlete_id: koblet(r), source_name: r.source_name, bib: r.bib, run_no: r.run_no,
      run_time_ms: r.run_time_ms, run_time_text: r.run_time_text, status: r.status,
      // Basen tar ikke tomme plasser midt i en liste; et brutt løp beholder mellomtidene det rakk.
      splits_ms: r.splits_ms.filter(v => v != null), extra: r.extra
    })))
    if (e2) {
      // Halvferdig opplasting skal ikke bli liggende.
      await supabase.from('timing_imports').delete().eq('id', imp.id)
      setLagrer(false); setFeil(e2.message); return
    }
    const nyeKoblinger = Object.entries(valg).filter(([, v]) => v && ![BEHOLD, UTE].includes(v))
      .map(([source_name, athlete_id]) => ({ team_id: team.id, source_name, athlete_id, created_by: profile.id }))
    if (nyeKoblinger.length) await supabase.from('timing_aliases').upsert(nyeKoblinger, { onConflict: 'team_id,source_name' })
    setLagrer(false); avbryt(); onLagret?.(imp.id)
  }

  const antMed = lest ? lest.rader.filter(r => valg[r.source_name] !== UTE).length : 0

  return (
    <div className="ti">
      {!lest ? (
        <>
          <input ref={fil} id="ti-fil" type="file" accept=".csv,text/csv" onChange={velgFil} hidden />
          <button type="button" className="btn primary" onClick={() => fil.current?.click()}>{t('tiUpload')}</button>
          <span className="muted ti-hjelp">{t('tiHelp')}</span>
          {feil && <div className="error">{feil}</div>}
        </>
      ) : (
        <div className="ti-skjema">
          <h3>{lest.filnavn}</h3>
          <p className="muted">{lest.rader.length} {t('tiRuns')} · {navn.length} {t('tiNames')} · {lest.mellomtider} {t('tiSplits')}</p>
          <div className="ti-felt">
            <div><label htmlFor="ti-dato">{t('tiDate')}</label><input id="ti-dato" type="date" value={dato} onChange={e => setDato(e.target.value)} /></div>
            <div><label htmlFor="ti-gren">{t('rhDisc')}</label>
              <select id="ti-gren" value={gren} onChange={e => setGren(e.target.value)}>
                {GRENER.map(g => <option key={g} value={g}>{g === 'FREE' ? t('tiFree') : g}</option>)}
              </select></div>
            <div><label htmlFor="ti-sted">{t('tiVenue')}</label><input id="ti-sted" value={sted} onChange={e => setSted(e.target.value)} placeholder={t('tiVenuePh')} /></div>
          </div>
          <h3>{t('tiWho')}</h3>
          <p className="muted">{t('tiWhoSub')}</p>
          <div className="ad-scroll">
            <table className="ad-table rh-tabell">
              <thead><tr><th>{t('tiInFile')}</th><th className="tall">{t('tiRunsCol')}</th><th className="tall">{t('tmBest')}</th><th>{t('tiAthlete')}</th></tr></thead>
              <tbody>{navn.map(n => (
                <tr key={n.navn} className={valg[n.navn] === UTE ? 'ti-ute' : ''}>
                  <td>{n.ukjent ? <span className="muted">{t('tiNoBib')}</span> : n.navn}</td>
                  <td className="tall">{n.lop}</td>
                  <td className="tall">{n.beste != null ? s2(n.beste, t.lang) : '–'}</td>
                  <td>
                    <select value={valg[n.navn] || BEHOLD} aria-label={`${t('tiAthlete')}: ${n.navn}`}
                      onChange={e => setValg(v => ({ ...v, [n.navn]: e.target.value }))}>
                      <option value={BEHOLD}>{t('tiKeep')}</option>
                      <option value={UTE}>{t('tiSkip')}</option>
                      {lopere.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button type="button" className="btn primary" disabled={lagrer || !antMed} onClick={lagre}>
              {lagrer ? t('saving') : `${t('tiSave')} (${antMed} ${t('tiRuns')})`}
            </button>
            <button type="button" className="btn" onClick={avbryt}>{t('cancel')}</button>
          </div>
          {feil && <div className="error">{feil}</div>}
        </div>
      )}
    </div>
  )
}
