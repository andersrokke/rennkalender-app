import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { chipState, hasAnswered, isGoing, quickFilters } from './useTeamAssign'

const initials = n => (n || '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()

// The athletes on the team as chips under one race. Clicks and quick filters
// build up a selection the coach can adjust; nothing is written until «Lagre»,
// so a filter is a starting point rather than an action.
export default function AssignRow({ raceId, rows, onApply, compact = false }) {
  const t = useT()
  const stored = new Set(rows.filter(r => r.assigned).map(r => r.athlete_id))
  const [sel, setSel] = useState(stored)
  const [busy, setBusy] = useState(false)

  // reset the draft whenever the stored assignment changes underneath us
  const storedKey = [...stored].sort().join(',')
  useEffect(() => { setSel(new Set(stored)) }, [storedKey])

  // An athlete who has said «Kan ikke» is not the coach's to assign.
  const locked = r => chipState(r) === 'unavailable'
  const selectable = rows.filter(r => !locked(r))

  const toggle = r => {
    if (locked(r)) return
    setSel(s => {
      const n = new Set(s)
      n.has(r.athlete_id) ? n.delete(r.athlete_id) : n.add(r.athlete_id)
      return n
    })
  }
  const pick = test => setSel(new Set(selectable.filter(test).map(r => r.athlete_id)))

  const added = [...sel].filter(id => !stored.has(id))
  const removed = [...stored].filter(id => !sel.has(id))
  const dirty = added.length > 0 || removed.length > 0

  async function save() {
    setBusy(true)
    await onApply(raceId, added, removed)
    setBusy(false)
  }

  // The counter is about who is going to the race, whether the coach put them
  // there or they signed themselves up — not about who has been assigned.
  const going = rows.filter(isGoing).length
  // Only athletes the coach has actually asked can be waiting to answer.
  const unanswered = rows.filter(r => r.assigned && !hasAnswered(r)).length
  const filters = quickFilters(rows, t)

  return (
    <div className="assign">
      <div className="assign-head">
        <span className="assign-count"><b>{going}</b> {t('ofN')} {rows.length} {t('athletesWord')}</span>
        {unanswered > 0 && <span className="tag warn">{unanswered} {t('notAnswered')}</span>}
      </div>

      <div className="chips">
        {rows.map(r => {
          const st = chipState(r)
          const on = sel.has(r.athlete_id)
          return (
            <button key={r.athlete_id} type="button" disabled={locked(r)}
              className={`achip ${st}${on ? ' assigned' : ''}`}
              title={`${r.full_name} · ${r.status ? t('st_' + r.status) : t('noAnswer')}${on ? ' · ' + t('assignedBadge') : ''}`}
              onClick={() => toggle(r)}>
              {on && <span className="dot" aria-hidden="true" />}
              {compact ? initials(r.full_name) : r.full_name.split(' ')[0]}
            </button>
          )
        })}
      </div>

      <div className="assign-picks">
        <button type="button" className="btn small link" onClick={() => pick(() => true)}>{t('pickAll')}</button>
        <button type="button" className="btn small link" onClick={() => setSel(new Set())}>{t('pickNone')}</button>
        {filters.map(f => (
          <button key={f.key} type="button" className="btn small link" onClick={() => pick(f.test)}>{f.label}</button>
        ))}
      </div>

      {dirty && (
        <div className="assign-save">
          <button className="btn small primary" disabled={busy} onClick={save}>
            {busy ? t('saving') : `${t('save')} (${added.length ? '+' + added.length : ''}${added.length && removed.length ? ' / ' : ''}${removed.length ? '−' + removed.length : ''})`}
          </button>
          <button className="btn small" onClick={() => setSel(new Set(stored))}>{t('cancel')}</button>
        </div>
      )}
    </div>
  )
}
