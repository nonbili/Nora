import { supabaseAuth } from './client'

export const signOut = () => supabaseAuth.signOut({ scope: 'local' })

export const onReceiveAuthUrl = (url: string) => {
  const token = new URL(url).searchParams.get('t')
  if (token) {
    // https://github.com/orgs/supabase/discussions/27181#discussioncomment-10986267
    supabaseAuth.verifyOtp({
      token_hash: token,
      type: 'email',
    })
  }
}
