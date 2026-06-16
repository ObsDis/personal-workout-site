// Auth + OAuth Protected Resource Metadata for the BarbellMind MCP server.
// Tokens are standard Supabase JWTs issued by Supabase Auth's OAuth 2.1 server.
// We validate them and hand back a user-scoped Supabase client so RLS applies.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const FN = '/functions/v1/barbellmind-mcp'

export function publicBase(reqUrl: string): string {
  return `${('https://' + new URL(reqUrl).host)}${FN}`
}
export function authServer(reqUrl: string): string {
  return `${('https://' + new URL(reqUrl).host)}/auth/v1`
}

// RFC 9728 Protected Resource Metadata: tells MCP clients which authorization
// server (Supabase Auth) to use to obtain a token for this resource.
export function protectedResourceMetadata(reqUrl: string) {
  return {
    resource: `${publicBase(reqUrl)}/mcp`,
    authorization_servers: [authServer(reqUrl)],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'email', 'profile'],
  }
}

export function wwwAuthenticate(reqUrl: string): string {
  const prm = `${publicBase(reqUrl)}/.well-known/oauth-protected-resource`
  return `Bearer resource_metadata="${prm}", error="invalid_token"`
}

export interface AuthResult { client: SupabaseClient; user: { id: string; email?: string } }

export async function authenticate(req: Request): Promise<AuthResult | null> {
  const header = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1].trim()
  // User-scoped client: every query carries the user's token, so the user's
  // existing Row Level Security policies (auth.uid() = user_id) are enforced.
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) return null
  return { client, user: { id: data.user.id, email: data.user.email ?? undefined } }
}
