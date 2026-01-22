import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const client = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://pgukcvgypvjwtibzlvhr.supabase.co',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_xAsTNsNKJ4AFbcf0JSiKxA_2-5CDlg4',
  {
    auth: {
      // https://github.com/supabase/supabase-js/issues/870#issuecomment-1746699664
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

export const supabase = client.schema('nora')
export const supabaseAuth = client.auth
