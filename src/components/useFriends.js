import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fetchFromFisInBackground } from '../fis'

// Followed athletes and which races they have entered.
// friend_entries() is SECURITY DEFINER and already scoped to the caller's
// follows, so it returns only people this user has chosen to follow.
export function useFriends(userId) {
  const [follows, setFollows] = useState([])
  const [byRace, setByRace] = useState({})
  const [names, setNames] = useState({})

  const load = useCallback(async () => {
    if (!userId) return
    const [{ data: f }, { data: e }] = await Promise.all([
      supabase.from('follows').select('fis_code, created_at').order('created_at'),
      supabase.rpc('friend_entries')
    ])
    setFollows(f || [])
    // Names come from the points list, so someone you follow who has not
    // entered any race still shows up by name rather than as a bare code.
    const looked = await Promise.all((f || []).map(async row => {
      const { data } = await supabase.rpc('fis_lookup', { code: row.fis_code })
      const a = Array.isArray(data) ? data[0] : data
      return [row.fis_code, a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() || row.fis_code : row.fis_code]
    }))
    setNames(Object.fromEntries(looked))
    const m = {}
    ;(e || []).forEach(row => {
      const list = m[row.race_id] || (m[row.race_id] = [])
      // one chip per person per race, even when entered in several disciplines
      if (!list.some(x => x.fis_code === row.fis_code)) {
        list.push({ fis_code: row.fis_code, first_name: row.first_name, last_name: row.last_name })
      }
    })
    setByRace(m)
  }, [userId])

  useEffect(() => { load() }, [load])

  // Confirm the code against the FIS points list before following.
  const lookup = async code => {
    const { data, error } = await supabase.rpc('fis_lookup', { code: String(code).trim() })
    if (error) return { error: error.message }
    const row = Array.isArray(data) ? data[0] : data
    return row ? { athlete: row } : { notFound: true }
  }
  const follow = async code => {
    const c = String(code).trim()
    const { error } = await supabase.from('follows').insert({ user_id: userId, fis_code: c })
    await load()
    // Warm the friend's name and points straight away rather than waiting for
    // the nightly job. Runs in the background; following is already done.
    if (!error) fetchFromFisInBackground(c, () => load())
    return error?.message || null
  }
  const unfollow = async code => {
    await supabase.from('follows').delete().eq('user_id', userId).eq('fis_code', code)
    await load()
  }

  return { follows, byRace, names, lookup, follow, unfollow, reload: load }
}
