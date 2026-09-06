import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export function useRaces() {
  const [races, setRaces] = useState([])
  useEffect(() => {
    supabase.from('races').select('*, venue:venues(*)').order('start_date').order('host_nation')
      .then(({ data }) => setRaces(data || []))
  }, [])
  return races
}
