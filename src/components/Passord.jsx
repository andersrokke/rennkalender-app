import { useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Sette eller bytte passord.
//
// Trengs fordi ikke alle har hatt et. Den som kommer inn gjennom en
// invitasjon eller en innloggingslenke har en konto uten passord, og hadde
// før ingen måte å skaffe seg et - «Glemt passord?» hjelper ikke den som
// aldri har hatt noe å glemme.

export function PassordSkjema({ onLagret, knappetekst }) {
  const t = useT()
  const [passord, setPassord] = useState('')
  const [igjen, setIgjen] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const kort = passord.length > 0 && passord.length < 8
  const ulike = igjen.length > 0 && passord !== igjen

  async function lagre(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: passord })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setPassord(''); setIgjen('')
    setMsg({ text: t('pwSaved') })
    onLagret?.()
  }

  return (
    <form onSubmit={lagre}>
      <label htmlFor="pw-ny">{t('pwNew')}</label>
      <input id="pw-ny" type="password" autoComplete="new-password" minLength={8}
        value={passord} onChange={e => { setPassord(e.target.value); setMsg(null) }} />
      {kort && <p className="fine">{t('pwTooShort')}</p>}

      <label htmlFor="pw-igjen">{t('pwRepeat')}</label>
      <input id="pw-igjen" type="password" autoComplete="new-password"
        value={igjen} onChange={e => { setIgjen(e.target.value); setMsg(null) }} />
      {ulike && <p className="error" style={{ margin: '6px 0 0' }}>{t('pwMismatch')}</p>}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={busy || passord.length < 8 || passord !== igjen}>
          {busy ? t('pwSaving') : (knappetekst || t('pwSave'))}
        </button>
        {msg && <span className={msg.bad ? 'error' : 'notice'} style={{ margin: 0 }}>{msg.text}</span>}
      </div>
    </form>
  )
}

export default function PassordKort() {
  const t = useT()
  return (
    <div className="card">
      <h2>{t('pwTitle')}</h2>
      <p className="muted">{t('pwSub')}</p>
      <PassordSkjema />
    </div>
  )
}
