import { MN } from '../util'
import { useT } from '../i18n'

// Sesongen som en slalåmløype. Portene veksler blå og rød slik de gjør i en
// løype, statusen ligger i selve porten, og neste renn er markert rødt.
// Den er både bilde av sesongen og en måte å hoppe i den på.
//
// rows: [{ race, status }] sortert på dato. status er null for renn løperen
// ikke har svart på ennå.
export default function GateLine({ rows, onSelect, activeId, nextId, title }) {
  const t = useT()
  if (!rows?.length) {
    return (
      <section className="gateline">
        <div className="gateline-head"><h3>{title || t('nrSeason')}</h3></div>
        <p className="gate-empty">{t('gateEmpty')}</p>
      </section>
    )
  }

  const n = k => rows.filter(r => r.status === k).length
  const parts = [
    `${rows.length} ${t('racesN')}`,
    n('entered') ? `${n('entered')} ${t('st_entered').toLowerCase()}` : null,
    n('planned') ? `${n('planned')} ${t('st_planned').toLowerCase()}` : null,
    n('wish') ? `${n('wish')} ${t('st_wish').toLowerCase()}` : null
  ].filter(Boolean)

  return (
    <section className="gateline">
      <div className="gateline-head">
        <h3>{title || t('nrSeason')}</h3>
        <span className="side">{parts.join(' · ')}</span>
      </div>
      <div className="gate-track">
        <div className="gate-row">
          {rows.map(({ race, status }) => {
            const [, m, d] = race.start_date.split('-')
            const cls = ['gate', race.id === nextId ? 'next' : '', race.id === activeId ? 'on' : '']
              .filter(Boolean).join(' ')
            const label = `${race.place}, ${+d}. ${MN[+m]}${status ? ` – ${t('st_' + status)}` : ''}`
            return (
              <button key={race.id} type="button" className={cls} data-s={status || undefined}
                title={label} aria-label={label} onClick={() => onSelect?.(race)}>
                <span className="pole" />
                <span className="knob" />
                <span className="gd">{+d}. {MN[+m]}</span>
                <span className="gp">{race.place}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
