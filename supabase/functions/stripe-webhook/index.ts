// Stripe webhook: flips profiles.subscription_status when someone pays.
// Verifies the Stripe signature, then updates the user's profile with the
// service-role key. Deploy with --no-verify-jwt (Stripe has no Supabase JWT).
// Secrets needed (set in Supabase): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import Stripe from 'npm:stripe@^17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' })
const WHSEC = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

async function setProfile(match: { col: string; val: string }, patch: Record<string, unknown>) {
  patch.updated_at = new Date().toISOString()
  const { error } = await admin.from('profiles').update(patch).eq(match.col, match.val)
  if (error) console.error('profile update failed', error.message)
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')
  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig ?? '', WHSEC)
  } catch (e) {
    return new Response('Bad signature: ' + (e as Error).message, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session
      const uid = s.client_reference_id || (s.metadata && (s.metadata as Record<string, string>).user_id)
      const patch: Record<string, unknown> = {
        subscription_status: 'active',
        subscription_source: 'stripe',
        stripe_customer_id: typeof s.customer === 'string' ? s.customer : (s.customer as { id?: string } | null)?.id ?? null,
      }
      if (s.subscription) patch.stripe_subscription_id = typeof s.subscription === 'string' ? s.subscription : (s.subscription as { id?: string }).id
      if (s.mode === 'payment') { patch.subscription_product_id = 'lifetime'; patch.subscription_expires_at = null }
      if (uid) await setProfile({ col: 'id', val: uid }, patch)
      else if (patch.stripe_customer_id) await setProfile({ col: 'stripe_customer_id', val: patch.stripe_customer_id as string }, patch)
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription
      const active = sub.status === 'active' || sub.status === 'trialing'
      await setProfile({ col: 'stripe_customer_id', val: sub.customer as string }, {
        subscription_status: active ? 'active' : (sub.status === 'past_due' ? 'past_due' : 'inactive'),
        subscription_source: 'stripe',
        stripe_subscription_id: sub.id,
        subscription_expires_at: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      })
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      await setProfile({ col: 'stripe_customer_id', val: sub.customer as string }, { subscription_status: 'inactive' })
    }
  } catch (e) {
    console.error('handler error', (e as Error).message)
    return new Response('Handler error', { status: 500 })
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } })
})
