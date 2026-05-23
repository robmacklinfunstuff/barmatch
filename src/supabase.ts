import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fhuwympmeiuvgsrgnndi.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_Z3S0PlRua5pCaPgQ-znBRw_n02543EN'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function fetchAppUsers() {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, name, grok_api_key, is_admin, taste_profile, taste_summary')
    .order('name')
  if (error) { console.error('Error fetching users:', error); return [] }
  return data
}

export async function addAppUser(name: string, grokApiKey?: string, tasteProfile?: string) {
  const { data, error } = await supabase
    .from('app_users')
    .insert([{ name, grok_api_key: grokApiKey || null, taste_profile: tasteProfile || null }])
    .select()
    .single()
  if (error) { console.error('Error adding user:', error); return null }
  return data
}

export async function deleteAppUser(id: string) {
  const { error } = await supabase
    .from('app_users')
    .delete()
    .eq('id', id)
  if (error) { console.error('Error deleting user:', error); return false }
  return true
}

export async function updateUserProfiles(id: string, tasteProfile: string) {
  const { error } = await supabase
    .from('app_users')
    .update({ taste_profile: tasteProfile })
    .eq('id', id)
  if (error) { console.error('Error updating profile:', error); return false }
  return true
}

export async function generateAndSaveTasteSummary(id: string, summary: string) {
  const { error } = await supabase
    .from('app_users')
    .update({ taste_summary: summary })
    .eq('id', id)
  if (error) { console.error('Error saving summary:', error); return false }
  return true
}

export async function saveSpiritWithRatings(
  spirit: {
    name: string
    distillery?: string
    spirit_type?: string
    whiskey_style?: string
    age_statement?: string
    abv?: number
    country?: string
    region?: string
    flavor_profile?: string
    nose_notes?: string
    palate_notes?: string
    finish_notes?: string
    tasting_notes?: string
  },
  ratings: {
    user_name: string
    rating?: string
    value_rating?: string
    price?: number
    how_consumed?: string
    notes?: string
  }[]
) {
  const { data: spiritData, error: spiritError } = await supabase
    .from('spirits')
    .insert([spirit])
    .select()
    .single()

  if (spiritError) { console.error('Error saving spirit:', spiritError); return { success: false, error: spiritError } }

  if (ratings.length > 0) {
    const ratingsToInsert = ratings
      .filter(r => r.rating)
      .map(r => ({ ...r, spirit_id: spiritData.id }))
    if (ratingsToInsert.length > 0) {
      const { error: ratingsError } = await supabase
        .from('ratings')
        .insert(ratingsToInsert)
      if (ratingsError) { console.error('Error saving ratings:', ratingsError); return { success: false, error: ratingsError } }
    }
  }
  return { success: true, spirit: spiritData }
}

export async function getSpiritsForUsers(userNames: string[]) {
  if (userNames.length === 0) return []
  const { data, error } = await supabase
    .from('ratings')
    .select(`
      user_name,
      rating,
      value_rating,
      price,
      how_consumed,
      notes,
      spirits (
        name,
        distillery,
        spirit_type,
        whiskey_style,
        age_statement,
        abv,
        country,
        region,
        flavor_profile,
        nose_notes,
        palate_notes,
        finish_notes,
        tasting_notes
      )
    `)
    .in('user_name', userNames)

  if (error) { console.error('Error fetching spirits:', error); return [] }

  return data.map((row: any) => ({
    user_name: row.user_name,
    rating: row.rating,
    value_rating: row.value_rating,
    price: row.price,
    how_consumed: row.how_consumed,
    notes: row.notes,
    ...row.spirits,
  }))
}