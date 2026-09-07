import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

export const DISC = ['SL', 'GS', 'SG', 'DH']
// Disciplines that can carry counting results, speed events included.
export const COUNT_DISC = ['SL', 'GS', 'SG', 'DH', 'AC']
// FIS Points Rules 2025/26 art. 4.2.1.1 / 4.2.1.2: tech needs three results,
// speed and combined two.
export const NEEDED = { SL: 3, GS: 3, SG: 2, DH: 2, AC: 2 }
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

const round2 = n => Math.round(n * 100) / 100

// The athlete's official FIS points, taken from the most recent list they
// appear on. This is always the value that actually counts.
export function officialPoints(points, code) {
  const mine = (points || []).filter(p => p.fis_code === code && p.points != null)
  if (!mine.length) return {}
  const latest = Math.max(...mine.map(p => p.list_id))
  const out = {}
  mine.filter(p => p.list_id === latest).forEach(p => {
    out[p.discipline] = {
      points: Number(p.points), rank: p.rank, baseList: !!p.base_list, label: p.list_label
    }
  })
  return out
}

// Counting results per FIS Points Rules 2025/26 (art. 4.2.1.1, 4.2.1.2,
// 4.2.2.1, 4.2.4), in force from the 2026/27 season.
//
//  - SL and GS count the average of the three best results, DH/SG/AC the two best.
//  - Too few results adds 20 % per missing step: two of three -> +20 %,
//    one of three -> +20 % twice (48.00 -> 57.60 -> 69.12), one of two -> +20 %.
//  - Only the current season counts (1 July - 30 June).
//  - With no results at all this season the base list points still stand, so
//    nothing is calculated.
//
// The average is penalised before rounding: (15.00 + 25.89) / 2 = 20.445,
// x1.2 = 24.53. Rounding first would give 24.54.
export function countingResults(results, code, seasonStart, official = {}) {
  const out = {}
  COUNT_DISC.forEach(d => {
    const need = NEEDED[d]
    const scored = (results || [])
      .filter(r => r.fis_code === code && discCode(r.discipline) === d &&
        r.fis_points != null && inSeason(r.race_date, seasonStart))
      .map(r => ({ ...r, pts: Number(r.fis_points) }))
      .sort((a, b) => a.pts - b.pts)

    const off = official[d] || null
    if (!scored.length) {
      // Base list points carry until the athlete has a result this season.
      if (off) out[d] = { need, count: 0, best: [], official: off, baseListStands: true }
      return
    }
    const best = scored.slice(0, need)
    const raw = best.reduce((a, r) => a + r.pts, 0) / best.length
    const missing = Math.max(0, need - best.length)
    const calculated = round2(raw * Math.pow(1.2, missing))
    // Lower points are better. Art. 4.2.2.3: the base list points stay the
    // athlete's official value, so the calculation only matters once it beats
    // them — that difference is the number worth chasing.
    const bl = off ? Number(off.points) : null
    const improvesBy = bl != null && calculated < bl ? round2(bl - calculated) : null
    out[d] = {
      need, count: scored.length, best, official: off,
      baseListStands: false, raw, missing, penaltyPct: missing * 20,
      calculated, improvesBy, beatsBaseList: improvesBy != null
    }
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
