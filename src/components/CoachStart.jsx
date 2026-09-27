import { useState } from 'react'
import { useT } from '../i18n'

// Steg-for-steg for en fersk trener.
//
// En trener som nettopp har fått invitasjon har ett spørsmål: hvordan får jeg
// løperne mine inn? Svaret lå i en setning under «Lag og profil», altså et
// annet sted enn der man leter. Nå står det her, på skjermen som heter Løpere.
//
// Har laget løpere fra før, faller veiledningen sammen til bare koden. Da er
// spørsmålet besvart, og resten er støy.

export default function CoachStart({ team, antall }) {
  const t = useT()
  const [kopiert, setKopiert] = useState(null)

  const invitasjon = t('csInviteText')
    .replace('{lag}', team.name)
    .replace('{kode}', team.invite_code)
    .replace('{url}', window.location.origin)

  const kopier = async (tekst, hva) => {
    try {
      await navigator.clipboard.writeText(tekst)
      setKopiert(hva); setTimeout(() => setKopiert(null), 2000)
    } catch {
      // Uten tilgang til utklippstavla er koden fortsatt synlig på skjermen.
      setKopiert('feil'); setTimeout(() => setKopiert(null), 2500)
    }
  }

  const Kode = () => (
    <div className="cs-kode">
      <code>{team.invite_code}</code>
      <button type="button" className="btn small" onClick={() => kopier(team.invite_code, 'kode')}>
        {kopiert === 'kode' ? t('csCopied') : t('csCopyCode')}
      </button>
      <button type="button" className="btn small" onClick={() => kopier(invitasjon, 'tekst')}>
        {kopiert === 'tekst' ? t('csCopied') : t('csCopyText')}
      </button>
      {kopiert === 'feil' && <span className="error" style={{ margin: 0 }}>{t('csCopyFailed')}</span>}
    </div>
  )

  if (antall > 0) {
    return (
      <div className="card cs-kort">
        <h2>{t('csShareTitle')}</h2>
        <p className="muted">{t('csShareSub').replace('{n}', antall)}</p>
        <Kode />
      </div>
    )
  }

  const steg = [
    { t: t('csStep1'), b: t('csStep1b').replace('{lag}', team.name), gjort: true },
    { t: t('csStep2'), b: t('csStep2b'), kode: true },
    { t: t('csStep3'), b: t('csStep3b') },
    { t: t('csStep4'), b: t('csStep4b') }
  ]

  return (
    <div className="card cs-kort">
      <h2>{t('csTitle')}</h2>
      <p className="muted">{t('csSub')}</p>
      <ol className="cs-steg">
        {steg.map((s, i) => (
          <li key={i} className={s.gjort ? 'gjort' : ''}>
            <div className="cs-nr">{s.gjort ? '✓' : i + 1}</div>
            <div className="cs-tekst">
              <b>{s.t}</b>
              <p>{s.b}</p>
              {s.kode && <Kode />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
