import { createClient } from '@supabase/supabase-js'

const client = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://pgukcvgypvjwtibzlvhr.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xAsTNsNKJ4AFbcf0JSiKxA_2-5CDlg4',
)

export const supabase = client.schema('nora')
export const supabaseAuth = client.auth
