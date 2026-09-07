import { useState } from 'react'
import { useT } from '../i18n'

const fullName = a => `${a.first_name || ''} ${a.last_name || ''}`.trim()

// Follow athletes by FIS code. The code is confirmed against the points list
// so you can see who you are about to follow before it is saved.
export default function Favourites({ follows, names, lookup, follow, unfollow }) {
  const t = useT()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function check(e) {
    e?.preventDefault()
    const v = code.trim()
    if (!/^\d{5,7}$/.test(v)) { setMsg(t('favBadCode')); return }
    if (follows.some(f => f.fis_code === v)) { setMsg(t('favAlready')); return }
    setBusy(true); setMsg(null)
    const res = await lookup(v)
    setBusy(false)
    if (res.error) setMsg(res.error)
    else if (res.notFound) setMsg(t('favUnknown'))
    else setPending(res.athlete)
  }
  async function confirm() {
    setBusy(true)
    const err = await follow(pending.fis_code)
    setBusy(false); setPending(null); setCode('')
    setMsg(err || null)
  }

  return (
    <div className="group fav">
      <span>{t('favs')}</span>
      <form onSubmit={check} style={{ display: 'contents' }}>
        <input value={code} onChange={e => { setCode(e.target.value); setMsg(null) }}
          placeholder={t('favPh')} inputMode="numeric" />
        <button type="submit" className="chip" disabled={busy}>{t('favAdd')}</button>
      </form>
      {follows.map(f => (
        <span className="chipx" key={f.fis_code}>
          {names[f.fis_code] || f.fis_code}
          <button title={t('favRemove')} onClick={() => unfollow(f.fis_code)}>×</button>
        </span>
      ))}
      {pending && (
        <span className="fav-confirm">
          {fullName(pending)}{pending.club ? ` · ${pending.club}` : ''}{pending.birth_year ? ` · ${pending.birth_year}` : ''}
          <button className="btn small primary" disabled={busy} onClick={confirm}>{t('favConfirm')}</button>
          <button className="btn small" onClick={() => setPending(null)}>{t('cancel')}</button>
        </span>
      )}
      {msg && <span className="muted">{msg}</span>}
    </div>
  )
}
