import { useT } from '../i18n'
import { cupName } from './useCupStandings'

const nf = n => n == null ? '' : Number(n).toLocaleString('nb-NO')

// One block per cup: overall first, then the disciplines.
// "Australia New Zealand Cup 2027 — sammenlagt nr. 3 av 51 · 182 p · GS nr. 1 · SL nr. 6"
export default function CupStandings({ groups, compact = false }) {
  const t = useT()
  if (!groups?.length) return null      // hidden entirely without rows

  const parts = g => (
    <>
      {g.overall && (
        <span className={g.overall.rank <= 3 ? 'podium' : ''}>
          {t('overall')} {t('bibNo')} {g.overall.rank} {t('ofN')} {g.overall.field}
          {g.overall.points != null && <> · {nf(g.overall.points)} p</>}
        </span>
      )}
      {g.disciplines.map(d => (
        <span key={d.discipline} className={d.rank <= 3 ? 'podium' : ''}>
          {' · '}{d.discipline} {t('bibNo')} {d.rank}
        </span>
      ))}
    </>
  )

  if (compact) {
    return (
      <div className="cup-compact">
        {groups.map(g => (
          <div key={g.cup + g.season}>
            <b>{cupName(g.cup)} {g.season}</b>{' — '}{parts(g)}
          </div>
        ))}
      </div>
    )
  }

  const updated = groups.map(g => g.updated).filter(Boolean).sort().pop()
  return (
    <div className="card">
      <h2>{t('cupStandings')}</h2>
      {groups.map(g => (
        <div className="cup-row" key={g.cup + g.season}>
          <div className="cup-name">{cupName(g.cup)} {g.season}</div>
          <div className="cup-line">{parts(g)}</div>
        </div>
      ))}
      {updated && <div className="muted cup-updated">
        {t('updatedAt')} {new Date(updated).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}
      </div>}
    </div>
  )
}
