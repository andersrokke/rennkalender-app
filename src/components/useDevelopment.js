import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

export const DISC = ['SL', 'GS', 'SG', 'DH']
export const DISC_COLOR = { SL: '#4D8DFF', GS: '#2ECC8F', SG: '#FFB547', DH: '#F55FA1' }
// fis_results spells disciplines out; fis_points uses the codes.
const LONG_TO_CODE = {
  'Slalom': 'SL', 'Giant Slalom': 'GS', 'Super G': 'SG', 'Super-G': 'SG',
  'Downhill': 'DH', 'Alpine Combined': 'AC', 'Combined': 'AC'
}
export const discCode = d => LONG_TO_CODE[d] || d
export const isFinish = pos => /^\d+$/.test(String(pos || '').trim())

// FIS points history and results for one or more athletes. RLS (can_see_fis)
// already limits rows to the athlete, their team and their wards, so a coach
// gets the whole team from the same query.
export function useDevelopment(codes) {
  const key = (codes || []).filter(Boolean).sort().join(',')
  const [points, setPoints] = useState([])
  const [results, setResults] = useState([])
  const [updatedAt, setUpdatedAt] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const list = key ? key.split(',') : []
    if (!list.length) { setPoints([]); setResults([]); setUpdatedAt({}); setLoading(false); return }
    setLoading(true)
    const [p, r, a] = await Promise.all([
      supabase.from('fis_points').select('fis_code, list_id, list_label, season, discipline, points, rank')
        .in('fis_code', list).order('list_id'),
      supabase.from('fis_results').select('fis_code, race_date, place, discipline, category, position, fis_points')
        .in('fis_code', list).order('race_date', { ascending: false }),
      supabase.from('fis_athletes').select('fis_code, updated_at').in('fis_code', list)
    ])
    setPoints(p.data || []); setResults(r.data || [])
    setUpdatedAt(Object.fromEntries((a.data || []).map(x => [x.fis_code, x.updated_at])))
    setLoading(false)
  }, [key])

  useEffect(() => { load() }, [load])

  return { points, results, updatedAt, loading, reload: load }
}

// One row per points list, with a series per athlete+discipline.
export function toChartRows(points) {
  const byList = new Map()
  points.forEach(p => {
    if (p.points == null) return
    const row = byList.get(p.list_id) || { list_id: p.list_id, label: shortLabel(p.list_label) }
    row[`${p.fis_code}|${p.discipline}`] = Number(p.points)
    byList.set(p.list_id, row)
  })
  return [...byList.values()].sort((a, b) => a.list_id - b.list_id)
}
// "11th FIS points list 2023/2024" -> "11 · 23/24"
export function shortLabel(label) {
  const m = /^(\d+)\D+(\d{4})\/(\d{2,4})/.exec(label || '')
  return m ? `${m[1]} · ${m[2].slice(2)}/${m[3].slice(-2)}` : (label || '')
}

// FIS counts the average of an athlete's two best results per discipline.
export function countingResults(results, code) {
  const out = {}
  DISC.forEach(d => {
    const scored = results
      .filter(r => r.fis_code === code && discCode(r.discipline) === d && r.fis_points != null)
      .map(r => ({ ...r, pts: Number(r.fis_points) }))
      .sort((a, b) => a.pts - b.pts)
    if (!scored.length) return
    const best = scored.slice(0, 2)
    out[d] = { best, average: best.reduce((a, r) => a + r.pts, 0) / best.length, total: scored.length }
  })
  return out
}

export function seasonSummary(results, code, season) {
  const mine = results.filter(r => r.fis_code === code && (!season || inSeason(r.race_date, season)))
  const finished = mine.filter(r => isFinish(r.position))
  const best = finished.reduce((b, r) => (b == null || +r.position < +b.position ? r : b), null)
  const scored = finished.filter(r => r.fis_points != null).map(r => Number(r.fis_points))
  return {
    starts: mine.length,
    finished: finished.length,
    dnf: mine.length - finished.length,
    best,
    bestPoints: scored.length ? Math.min(...scored) : null
  }
}
// A FIS season runs from July to June, so "2026/27" starts in July 2026.
export function inSeason(date, startYear) {
  const d = new Date(date)
  const y = d.getFullYear(), m = d.getMonth()
  return m >= 6 ? y === startYear : y === startYear + 1
}
export const currentSeasonStart = () => {
  const n = new Date()
  return n.getMonth() >= 6 ? n.getFullYear() : n.getFullYear() - 1
}
