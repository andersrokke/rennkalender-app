import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fisPoints } from '../format'
import { berik, lagTabell, sorterLag, sesongNavn, FORSTE_SESONG } from '../resultater'

const GRENER = ['SL', 'GS', 'SG', 'DH']
const KOL = [['navn', 'tsAthlete'], ['starter', 'startsL'], ['fullfort', 'finished'], ['prosent', 'rhPct'], ['ute', 'rhOut'],
  ['bestePlass', 'rhBestPos'], ['bestePoeng', 'rhBestPts'], ['snittPoeng', 'rhAvgPts']]

// Trenerens oversikt: hele laget i én tabell, sorterbar på alle kolonner og
// filtrert på sesong og gren. Et trykk på en løper åpner hele historikken
// hans eller hennes under. Resultatene hentes per løper, så et stort lag ikke
// støter mot radgrensen i API-et.
export default function TeamStats({ people, valgt, onPick }) {
  const t = useT()
  const p1 = v => fisPoints(v, t.lang)
  const [perKode, setPerKode] = useState(null)
  const [sesong, setSesong] = useState([])   // valgte sesonger; tom = alle
  const vippSesong = x => setSesong(v => v.includes(x) ? v.filter(y => y !== x) : [...v, x])
  const [gren, setGren] = useState([])
  const [kol, setKol] = useState('navn')
  const [retning, setRetning] = useState('opp')
  const koder = people.map(p => p.fis_code).join(',')

  useEffect(() => {
    let av = false
    setPerKode(null)
    Promise.all(people.map(p =>
      supabase.from('fis_results')
        .select('fis_race_id, race_date, place, discipline, category, position, fis_points')
        .eq('fis_code', p.fis_code).gte('race_date', `${FORSTE_SESONG}-07-01`)
        .then(({ data }) => [p.fis_code, berik(data)])
    )).then(par => { if (!av) setPerKode(Object.fromEntries(par)) })
    return () => { av = true }
  }, [koder])

  const sesonger = useMemo(() => [...new Set(Object.values(perKode || {}).flat().map(r => r.sesong))].sort((a, b) => b - a), [perKode])
  const rader = useMemo(() => sorterLag(lagTabell(people, perKode || {}, { sesong, gren }), kol, retning), [people, perKode, sesong, gren, kol, retning])
  const sorterPa = k => {
    if (k === kol) setRetning(r => r === 'opp' ? 'ned' : 'opp')
    else { setKol(k); setRetning(['navn', 'bestePlass', 'bestePoeng', 'snittPoeng', 'ute'].includes(k) ? 'opp' : 'ned') }
  }
  const vipp = g => setGren(v => v.includes(g) ? v.filter(x => x !== g) : [...v, g])
  const pstKlasse = p => p == null ? '' : p >= 75 ? 'bra' : p >= 50 ? 'middels' : 'svak'

  return (
    <div className="card rh">
      <h2>{t('lagTitle')}</h2>
      <p className="muted">{t('lagSub')}</p>
      <div className="rh-filter">
        <div className="row" style={{ gap: 4 }}>
          <button className={`chip ${!sesong.length ? 'on' : ''}`} aria-pressed={!sesong.length} onClick={() => setSesong([])}>{t('rhAllSeasons')}</button>
          {sesonger.map(s => <button key={s} className={`chip ${sesong.includes(s) ? 'on' : ''}`} aria-pressed={sesong.includes(s)} onClick={() => vippSesong(s)}>{sesongNavn(s)}</button>)}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className={`chip ${!gren.length ? 'on' : ''}`} aria-pressed={!gren.length} onClick={() => setGren([])}>{t('rhAllDisc')}</button>
          {GRENER.map(g => <button key={g} className={`chip ${gren.includes(g) ? 'on' : ''}`} aria-pressed={gren.includes(g)} onClick={() => vipp(g)}>{g}</button>)}
        </div>
      </div>
      {perKode === null ? <p className="muted">{t('loading')}</p> : (
        <div className="ad-scroll">
          <table className="ad-table rh-tabell ts-tabell">
            <thead><tr>
              {KOL.map(([k, etikett], i) => (
                <th key={k} className={i ? 'tall' : ''} aria-sort={kol === k ? (retning === 'opp' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="rh-sort" onClick={() => sorterPa(k)}>
                    {t(etikett)}<span aria-hidden="true">{kol === k ? (retning === 'opp' ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr></thead>
            <tbody>{rader.map(r => (
              <tr key={r.fis_code} className={valgt === r.fis_code ? 'ts-valgt' : ''}>
                <td><button type="button" className="btn link ts-navn" onClick={() => onPick(r.fis_code)}>{r.navn}</button></td>
                <td className="tall">{r.starter}</td><td className="tall">{r.fullfort}</td>
                <td className="tall"><span className={`rh-pst ${pstKlasse(r.prosent)}`}>
                  <i style={{ width: `${r.prosent ?? 0}%` }} /><b>{r.prosent == null ? '–' : `${r.prosent} %`}</b></span></td>
                <td className="tall">{r.ute}</td>
                <td className="tall">{r.bestePlass ?? '–'}</td><td className="tall">{p1(r.bestePoeng)}</td><td className="tall">{p1(r.snittPoeng)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="muted rh-note">{t('tsHint')}</p>
    </div>
  )
}
