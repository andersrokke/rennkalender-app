import { supabase } from './supabase'

// Laget med huset det ligger under. Et skigymnas og en klubb ser like ut i
// basen; forskjellen sitter i huset, og den trenger appen ett sted:
// bare skigymnaset dekker reisen når laget reiser samlet.
export async function hentLag(id) {
  if (!id) return null
  const { data: t } = await supabase.from('teams').select('*').eq('id', id).single()
  if (!t) return null
  if (!t.parent_team_id) return { ...t, hus: null }
  const { data: hus } = await supabase.from('teams').select('id, name, is_school, kind').eq('id', t.parent_team_id).single()
  return { ...t, hus: hus || null }
}

export const erSkigymnas = team => !!(team && (team.is_school || team.hus?.is_school))
