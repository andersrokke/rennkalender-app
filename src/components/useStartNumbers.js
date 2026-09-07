import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export const DISCIPLINES = ['DH', 'SG', 'GS', 'SL']
// "4xGS 4xSL" -> ['GS','SL']
export const raceDisciplines = r =>
  DISCIPLINES.filter(d => (r.events || '').includes(d))

// Predicted start numbers for the athlete's own FIS code.
// predicted_start() is one call per race and discipline, so we first ask which
// races have entries at all and only query those — the rest have no prediction.
export function useStartNumbers(fisCode) {
  const [byKey, setByKey] = useState({})

  useEffect(() => {
    if (!fisCode) { setByKey({}); return }
    let cancelled = false
    ;(async () => {
      const { data: pairs } = await supabase.from('race_entries').select('race_id, discipline')
      if (!pairs || !pairs.length) return
      const seen = new Set()
      const todo = []
      pairs.forEach(p => {
        const k = `${p.race_id}|${p.discipline}`
        if (!seen.has(k)) { seen.add(k); todo.push(p) }
      })
      const out = {}
      await Promise.all(todo.map(async p => {
        const { data } = await supabase.rpc('predicted_start', {
          p_race_id: p.race_id, p_discipline: p.discipline, p_fis_code: fisCode
        })
        const row = Array.isArray(data) ? data[0] : data
        if (row && row.rank_by_points != null) out[`${p.race_id}|${p.discipline}`] = row
      }))
      if (!cancelled) setByKey(out)
    })()
    return () => { cancelled = true }
  }, [fisCode])

  return byKey
}
