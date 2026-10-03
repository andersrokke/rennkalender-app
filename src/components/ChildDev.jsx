import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import Development from './Development.jsx'

// Barnets utvikling som egen fane for foreldre: FIS-poeng over tid, tellende
// resultater og hele resultathistorikken. Samme skjerm som løperen selv ser,
// i lesemodus. Med flere barn velger man hvem øverst.
export default function ChildDev() {
  const t = useT()
  const [kids, setKids] = useState(null)
  const [valgt, setValgt] = useState(null)      // athlete_id
  const [barn, setBarn] = useState(null)        // barnets profilrad
  const [lag, setLag] = useState(null)

  useEffect(() => {
    supabase.rpc('my_children').then(({ data }) => {
      setKids(data || [])
      if (data?.length) setValgt(data[0].athlete_id)
    })
  }, [])

  useEffect(() => {
    if (!valgt) return
    let av = false
    setBarn(null); setLag(null)
    ;(async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', valgt).single()
      if (av) return
      setBarn(p || null)
      if (p?.team_id) {
        const { data: tm } = await supabase.from('teams').select('*').eq('id', p.team_id).single()
        if (!av) setLag(tm || null)
      }
    })()
    return () => { av = true }
  }, [valgt])

  if (!kids) return <div className="page muted">{t('loading')}</div>
  if (kids.length === 0) return <div className="page"><div className="card"><p className="muted">{t('childrenNone')}</p></div></div>

  return (
    <>
      {kids.length > 1 && (
        <div className="controls">
          <div className="group">
            {kids.map(k => (
              <button key={k.athlete_id} className={`chip ${valgt === k.athlete_id ? 'on' : ''}`}
                aria-pressed={valgt === k.athlete_id} onClick={() => setValgt(k.athlete_id)}>{k.full_name}</button>
            ))}
          </div>
        </div>
      )}
      {!barn ? <div className="page muted">{t('loading')}</div>
        : <Development key={barn.id} profile={barn} team={lag} isCoach={false} readOnly />}
    </>
  )
}
