import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fisPoints } from '../format'
import { fetchFromFisInBackground } from '../fis'
import { DISC_COLOR } from './useDevelopment'
import { klargjor, filtrerFav, sorterFav, rangering } from '../favoritter'

const GRENER = [['sl', 'SL'], ['gs', 'GS'], ['sg', 'SG'], ['dh', 'DH']]

// Favoritter: løpere man selv velger å følge, satt opp mot egne løpere - seg
// selv for en løper, laget for en trener. Poengene er fra den gjeldende
// FIS-lista. Søket går på navn eller FIS-kode.
export default function FavTab({ profile, isCoach }) {
  const t = useT()
  const p1 = v => fisPoints(v, t.lang)
  const [rader, setRader] = useState(null)
  const [sok, setSok] = useState('')
  const [treff, setTreff] = useState(null)
  const [soker, setSoker] = useState(false)
  const [hvem, setHvem] = useState('alle')
  const [kjonn, setKjonn] = useState('alle')
  const [kol, setKol] = useState('navn')
  const [retning, setRetning] = useState('opp')

  const last = useCallback(async () => {
    const { data } = await supabase.rpc('favoritt_tabell')
    setRader(klargjor(data))
  }, [])
  useEffect(() => { last() }, [last])

  async function finn(e) {
    e.preventDefault()
    if (sok.trim().length < 3) { setTreff([]); return }
    setSoker(true)
    const { data } = await supabase.rpc('fis_sok', { q: sok.trim() })
    setSoker(false); setTreff(data || [])
  }
  async function folg(kode) {
    const { error } = await supabase.from('follows').insert({ user_id: profile.id, fis_code: kode })
    if (error && !/duplicate/i.test(error.message)) { alert(error.message); return }
    // Resultater og poenghistorikk hentes i bakgrunnen, som før.
    fetchFromFisInBackground?.(kode)
    setTreff(tr => (tr || []).filter(x => x.fis_code !== kode)); last()
  }
  async function slutt(kode) {
    await supabase.from('follows').delete().eq('user_id', profile.id).eq('fis_code', kode); last()
  }

  const alle = rader || []
  const vist = useMemo(() => sorterFav(filtrerFav(alle, { hvem, kjonn }), kol, retning), [alle, hvem, kjonn, kol, retning])
  const plass = useMemo(() => Object.fromEntries(GRENER.map(([g]) => [g, rangering(vist, g)])), [vist])
  const fulgt = new Set(alle.filter(r => r.favoritt).map(r => r.fis_code))
  const sorterPa = k => {
    if (k === kol) setRetning(r => r === 'opp' ? 'ned' : 'opp')
    else { setKol(k); setRetning('opp') }
  }
  const Hode = ({ k, children, tall }) => (
    <th className={tall ? 'tall' : ''} aria-sort={kol === k ? (retning === 'opp' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="rh-sort" onClick={() => sorterPa(k)}>
        {children}<span aria-hidden="true">{kol === k ? (retning === 'opp' ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  )
  const Brikke = ({ pa, onClick, children }) =>
    <button type="button" className={`chip ${pa ? 'on' : ''}`} aria-pressed={pa} onClick={onClick}>{children}</button>

  return (
    <div className="page">
      <div className="card">
        <h2>{t('fvTitle')}</h2>
        <p className="muted">{isCoach ? t('fvSubCoach') : t('fvSub')}</p>
        <form onSubmit={finn} className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input id="fv-sok" style={{ flex: '1 1 200px' }} value={sok} onChange={e => setSok(e.target.value)}
            placeholder={t('fvSearchPh')} aria-label={t('fvSearchPh')} />
          <button className="btn primary" disabled={soker}>{soker ? t('loading') : t('fvSearch')}</button>
        </form>
        {treff && (treff.length === 0
          ? <p className="muted" style={{ marginTop: 10 }}>{sok.trim().length < 3 ? t('fvTooShort') : t('fvNoHits')}</p>
          : <div className="fv-treff">{treff.map(x => (
              <div className="fv-treffrad" key={x.fis_code}>
                <div>
                  <b>{x.first_name} {x.last_name}</b>
                  <div className="muted">{[x.nation, x.birth_year, x.club].filter(Boolean).join(' · ')} · FIS {x.fis_code}</div>
                </div>
                {fulgt.has(x.fis_code)
                  ? <span className="muted">{t('fvFollowing')}</span>
                  : <button type="button" className="btn small primary" onClick={() => folg(x.fis_code)}>{t('favConfirm')}</button>}
              </div>
            ))}</div>)}
      </div>

      <div className="card rh">
        <h2>{t('fvTable')} <span className="muted">({vist.length})</span></h2>
        <div className="rh-filter">
          <div className="row" style={{ gap: 4 }}>
            <Brikke pa={hvem === 'alle'} onClick={() => setHvem('alle')}>{t('fvAll')}</Brikke>
            <Brikke pa={hvem === 'egne'} onClick={() => setHvem('egne')}>{isCoach ? t('fvOwnTeam') : t('fvMe')}</Brikke>
            <Brikke pa={hvem === 'favoritter'} onClick={() => setHvem('favoritter')}>{t('favs')}</Brikke>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <Brikke pa={kjonn === 'alle'} onClick={() => setKjonn('alle')}>{t('fvBothGenders')}</Brikke>
            <Brikke pa={kjonn === 'W'} onClick={() => setKjonn('W')}>{t('women')}</Brikke>
            <Brikke pa={kjonn === 'M'} onClick={() => setKjonn('M')}>{t('men')}</Brikke>
          </div>
        </div>
        {rader === null ? <p className="muted">{t('loading')}</p>
          : vist.length === 0 ? <p className="muted">{alle.length === 0 ? t('fvEmpty') : t('rhNoMatch')}</p> : (
          <div className="ad-scroll">
            <table className="ad-table rh-tabell">
              <thead><tr>
                <Hode k="navn">{t('tsAthlete')}</Hode>
                <Hode k="birth_year" tall>{t('fvYear')}</Hode>
                {GRENER.map(([g, navn]) => <Hode key={g} k={g} tall>{navn}</Hode>)}
                <th />
              </tr></thead>
              <tbody>{vist.map(r => (
                <tr key={r.fis_code} className={r.egen ? 'ts-valgt' : ''}>
                  <td>
                    <b>{r.navn}</b>{r.egen && <span className="tag assigned" style={{ marginLeft: 6 }}>{isCoach ? t('fvOwnTag') : t('fvMeTag')}</span>}
                    <div className="muted" style={{ fontSize: 12.5 }}>{[r.nation, r.club].filter(Boolean).join(' · ') || `FIS ${r.fis_code}`}</div>
                  </td>
                  <td className="tall">{r.birth_year ?? '–'}</td>
                  {GRENER.map(([g, navn]) => (
                    <td className="tall" key={g}>
                      {r[g] == null ? <span className="muted">–</span> : <>
                        <b style={{ color: plass[g][r.fis_code] === 1 ? DISC_COLOR[navn] : undefined }}>{p1(r[g])}</b>
                        <div className="muted" style={{ fontSize: 11.5 }}>{t('fvNo')} {plass[g][r.fis_code]}</div>
                      </>}
                    </td>
                  ))}
                  <td className="tall">
                    {r.favoritt && <button type="button" className="btn small link" onClick={() => slutt(r.fis_code)}>{t('favRemove')}</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="muted rh-note">{t('fvFoot')}</p>
      </div>
    </div>
  )
}
