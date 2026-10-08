import { useState } from 'react'
import { useT } from '../i18n'
import Development from './Development.jsx'
import GoodVenues from './GoodVenues.jsx'
import FavTab from './FavTab.jsx'

// Utvikling samler det som handler om resultater: egen utvikling, steder der
// det har gått bra, og løperne man måler seg mot. Før var de tre egne faner.
export default function Utvikling({ profile, team, isCoach, readOnly = false }) {
  const t = useT()
  const [vis, setVis] = useState('dev')
  const valg = [['dev', isCoach ? t('devTitleCoach') : t('dev')], ...(isCoach ? [] : [['steder', t('steder')]]), ['favoritter', t('favoritter')]]
  return (
    <>
      <Underfaner valg={valg} vis={vis} onVelg={setVis} />
      {vis === 'dev' && <Development profile={profile} team={team} isCoach={isCoach} readOnly={readOnly} />}
      {vis === 'steder' && <GoodVenues fisCode={profile.fis_code} gender={profile.gender} />}
      {vis === 'favoritter' && <FavTab profile={profile} isCoach={isCoach} />}
    </>
  )
}

export function Underfaner({ valg, vis, onVelg }) {
  return (
    <div className="page underfaner" role="tablist">
      {valg.map(([k, navn]) => (
        <button key={k} type="button" role="tab" aria-selected={vis === k}
          className={`chip ${vis === k ? 'on' : ''}`} onClick={() => onVelg(k)}>{navn}</button>
      ))}
    </div>
  )
}
