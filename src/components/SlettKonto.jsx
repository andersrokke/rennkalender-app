import { useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Slett kontoen min. Sletter brukeren og alt som henger på profilen, uten å
// gå veien om administrator. Ordet må skrives inn først: dette kan ikke angres.
export default function SlettKonto({ profile }) {
  const t = useT()
  const [apen, setApen] = useState(false)
  const [ord, setOrd] = useState('')
  const [feil, setFeil] = useState(null)
  const [sletter, setSletter] = useState(false)
  const fasit = t('delWord')

  async function slett(e) {
    e.preventDefault()
    if (ord.trim().toUpperCase() !== fasit) return
    setSletter(true); setFeil(null)
    const { error } = await supabase.rpc('slett_min_konto')
    if (error) { setSletter(false); setFeil(error.message); return }
    // Kontoen finnes ikke lenger; utloggingen rydder det nettleseren husker.
    await supabase.auth.signOut().catch(() => {})
    try { localStorage.clear() } catch { /* privat vindu */ }
    window.location.assign('/')
  }

  return (
    <div className="card slett-konto">
      <h2>{t('delTitle')}</h2>
      <p className="muted">{t('delSub')}</p>
      <ul className="slett-liste">
        <li>{t('delWhat1')}</li>
        <li>{profile.role === 'parent' ? t('delWhat2Parent') : profile.role === 'coach' ? t('delWhat2Coach') : t('delWhat2')}</li>
        <li>{t('delWhat3')}</li>
      </ul>
      <p className="muted">{t('delReadMore')} <a href="/personvern">{t('privacy')}</a>.</p>
      {!apen ? (
        <button type="button" className="btn danger" onClick={() => setApen(true)}>{t('delOpen')}</button>
      ) : (
        <form onSubmit={slett}>
          <label htmlFor="slett-ord">{t('delType')} <b>{fasit}</b></label>
          <input id="slett-ord" value={ord} onChange={e => { setOrd(e.target.value); setFeil(null) }}
            autoComplete="off" autoCapitalize="characters" spellCheck="false" style={{ maxWidth: 220 }} />
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn danger solid" disabled={sletter || ord.trim().toUpperCase() !== fasit}>
              {sletter ? t('delBusy') : t('delConfirm')}
            </button>
            <button type="button" className="btn" onClick={() => { setApen(false); setOrd(''); setFeil(null) }}>{t('cancel')}</button>
          </div>
          {feil && <div className="error">{feil}</div>}
        </form>
      )}
    </div>
  )
}
