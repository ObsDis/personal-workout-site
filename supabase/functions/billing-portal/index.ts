// Creates a Stripe Customer Billing Portal session so a web subscriber can
// manage/cancel their plan and update their card. Validates the Supabase JWT
// in-function (deploy with --no-verify-jwt so the CORS preflight works).
// Secret needed: STRIPE_SECRET_KEY. The Customer Portal must be activated once
// in Stripe → Settings → Billing → Customer portal.
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' })
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supa = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: uErr } = await supa.auth.getUser()
    if (uErr || !user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )
    const { data: prof } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle()
    const customer = prof?.stripe_customer_id
    if (!customer) return json({ error: 'no_customer' }, 400)

    let return_url = 'https://barbellmind.com/app/#/profile'
    try { const b = await req.json(); if (b && typeof b.return_url === 'string') return_url = b.return_url } catch (_) { /* no body */ }

    const session = await stripe.billingPortal.sessions.create({ customer, return_url })
    return json({ url: session.url })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
