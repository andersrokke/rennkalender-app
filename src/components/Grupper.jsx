import { useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Gruppene i huset, og en ny. Vises for hver trener som står i et hus.
//
// Grunnen til at dette finnes: hovedtreneren kunne ikke lage en gruppe til
// sine egne løpere. De lå rett på huset, usynlige for de andre trenerne selv
// med «alle ser alt» på. Nå lager hver trener i huset grupper selv.

export default function Grupper({ team, grupper, onEndret }) {
  const t = useT()
  const [navn, setNavn] = useState('')
  const [busy, setBusy] = useState(false)
  const [feil, setFeil] = useState(null)

  async function opprett(e) {
    e.preventDefault(); setBusy(true); setFeil(null)
    const { error } = await supabase.rpc('opprett_gruppe', { p_name: navn.trim() })
    setBusy(false)
    if (error) return setFeil(error.message)
    setNavn('')
    // Man står i den nye gruppa etterpå, så hele appen må lese laget på nytt.
    onEndret?.(); location.reload()
  }

  const hus = grupper.find(g => g.er_hus)
  return (
    <div className="card">
      <h2>{t('grTitle')}</h2>
      <p className="muted">{hus ? t('grSub').replace('{hus}', hus.name) : t('grSubNoHouse')}</p>
      {grupper.length > 0 && (
        <ul className="gr-liste">
          {grupper.map(g => (
            <li key={g.id} className={g.id === team.id ? 'na' : ''}>
              <b>{g.name}</b>{g.er_hus && <span className="ad-merke">{t('groupHouse')}</span>}
              <span className="muted"> · {g.eier_navn || '–'} · {t('grAthletes').replace('{n}', g.lopere)}</span>
              {g.id === team.id && <span className="gr-na">{t('grCurrent')}</span>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={opprett} className="cs-inviter">
        <input value={navn} placeholder={t('grNamePh')} aria-label={t('grName')}
          onChange={e => setNavn(e.target.value)} />
        <button className="btn primary small" disabled={busy || navn.trim().length < 2}>
          {busy ? t('grCreating') : t('grCreate')}
        </button>
      </form>
      {feil && <p className="error" style={{ margin: '8px 0 0' }}>{feil}</p>}
    </div>
  )
}
