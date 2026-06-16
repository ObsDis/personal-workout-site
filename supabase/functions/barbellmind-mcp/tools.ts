// BarbellMind MCP tools. Every handler runs against a user-scoped Supabase
// client (db), so Row Level Security guarantees a user only ever touches their
// own rows -- the model cannot reach another user's data even if it tried.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WIDGET_HTML } from './widgets.ts'

const todayUTC = () => new Date().toISOString().slice(0, 10)
const ok = (obj: unknown) => ({
  content: [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
})
const fail = (msg: string) => ({
  content: [{ type: 'text' as const, text: 'Error: ' + msg }],
  isError: true,
})
const needConfirm = (what: string) => ({
  content: [{ type: 'text' as const, text: 'Confirmation required before deleting. ' + what + ' Ask the user to confirm, then re-run with confirm: true.' }],
})
const UI_MIME = 'text/html;profile=mcp-app'
const UI_WIDGET = 'ui://barbellmind/widget-v7.html'
const uiOk = (summary: string, payload: unknown) => ({
  content: [{ type: 'text' as const, text: summary }],
  structuredContent: payload as Record<string, unknown>,
  _meta: { render: payload },
})
const sumMacros = (rows: any[]) =>
  (rows || []).reduce(
    (a, l) => ({
      calories: a.calories + (+l.calories || 0),
      protein_g: a.protein_g + (+l.protein_g || 0),
      carbs_g: a.carbs_g + (+l.carbs_g || 0),
      fat_g: a.fat_g + (+l.fat_g || 0),
      fiber_g: a.fiber_g + (+l.fiber_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  )

export function buildServer(db: SupabaseClient, user: { id: string; email?: string }) {
  const server = new McpServer({ name: 'barbellmind', version: '1.0.0' })
  const uid = user.id

  // The user's "today" in THEIR timezone (the app stores an IANA tz on the profile),
  // not the server's UTC day -- otherwise an evening log in the Americas lands on
  // tomorrow. Cached for the lifetime of this request.
  let _tz: string | null | undefined = undefined
  const userToday = async (): Promise<string> => {
    if (_tz === undefined) {
      try {
        const { data } = await db.from('profiles').select('timezone').eq('id', uid).maybeSingle()
        _tz = data && (data as { timezone?: string }).timezone ? String((data as { timezone?: string }).timezone) : null
      } catch { _tz = null }
    }
    if (!_tz) return new Date().toISOString().slice(0, 10)
    try { return new Date().toLocaleDateString('en-CA', { timeZone: _tz }) } catch { return new Date().toISOString().slice(0, 10) }
  }

  // Builds the Today dashboard payload (shared by get_today and the log tools so
  // a log action returns the freshly updated dashboard).
  const buildTodayPayload = async (date?: string): Promise<Record<string, any>> => {
    const d = date || (await userToday())
    const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
    const [prof, foods, hm, bw, plan] = await Promise.all([
      db.from('profiles').select('goal,kcal_target,protein_target_g,carbs_target_g,fat_target_g').eq('id', uid).maybeSingle(),
      db.from('food_logs').select('calories,protein_g,carbs_g,fat_g,fiber_g').eq('log_date', d),
      db.from('health_metrics').select('metric,value,unit,day,recorded_at').gte('day', since).order('day', { ascending: false }).order('recorded_at', { ascending: false }).limit(300),
      db.from('body_weights').select('weight_lbs,recorded_at,created_at').order('recorded_at', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      db.from('plans').select('id,split_type,name').eq('is_active', true).limit(1).maybeSingle(),
    ])
    const latest: Record<string, any> = {}
    for (const r of hm.data || []) if (!latest[r.metric]) latest[r.metric] = { value: Number(r.value), unit: r.unit, day: r.day }
    let workout: any = { slot_type: 'rest', exercises: [] }
    if (plan.data) {
      const dow = new Date(d + 'T00:00:00').getDay()
      const { data: pd } = await db.from('plan_days').select('slot_type,slot_key,custom_name').eq('plan_id', plan.data.id).eq('day_of_week', dow).maybeSingle()
      if (pd) {
        const key = pd.slot_key || pd.slot_type
        let { data: ex } = await db.from('plan_exercises').select('exercise_name,target_sets,target_reps').eq('plan_id', plan.data.id).eq('slot_key', key).order('order_idx', { ascending: true })
        if (!ex || !ex.length) { const r = await db.from('plan_exercises').select('exercise_name,target_sets,target_reps').eq('plan_id', plan.data.id).eq('slot_type', pd.slot_type).order('order_idx', { ascending: true }); ex = r.data }
        workout = { slot_type: pd.slot_type, slot_key: key, custom_name: pd.custom_name, exercises: ex || [] }
      }
    }
    const p = prof.data || {}
    const consumed = sumMacros(foods.data || [])
    return {
      kind: 'today', date: d, goal: p.goal ?? null,
      macros: { consumed, target: { kcal: p.kcal_target, protein_g: p.protein_target_g, carbs_g: p.carbs_target_g, fat_g: p.fat_target_g } },
      health: latest,
      apple_health_latest: latest,
      body_weight_lbs: bw.data?.[0]?.weight_lbs ?? null,
      workout,
    }
  }

  // ---------- READ ----------
  server.registerTool(
    'get_profile',
    { title: 'Get profile', description: 'The user profile: goal, body stats, and daily macro targets.', inputSchema: {} },
    async () => {
      const { data, error } = await db.from('profiles')
        .select('username,age,height_ft,height_in,weight_lbs,goal,activity_level,daily_minutes,kcal_target,protein_target_g,carbs_target_g,fat_target_g,subscription_status')
        .eq('id', uid).maybeSingle()
      return error ? fail(error.message) : ok(data || {})
    },
  )

  server.registerTool(
    'get_today',
    { title: "Today's snapshot", description: "Summary for a date (YYYY-MM-DD, default today UTC): macros consumed vs target, latest Apple Health metrics, latest body weight, and the planned workout.", inputSchema: { date: z.string().optional() }, _meta: { ui: { resourceUri: UI_WIDGET } } },
    async ({ date }) => {
      const payload = await buildTodayPayload(date)
      return uiOk('Today ' + payload.date + ': ' + Math.round(payload.macros.consumed.calories) + ' / ' + (payload.macros.target.kcal || 0) + ' kcal.', payload)
    },
  )

  server.registerTool(
    'get_plan',
    { title: 'Get plan', description: 'The active workout plan: split type, weekly schedule, and exercises per day (each day has its own list).', inputSchema: {} },
    async () => {
      const { data: plan, error } = await db.from('plans').select('id,split_type,name,is_active').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) return fail(error.message)
      if (!plan) return ok({ plan: null, note: 'No active plan.' })
      const [days, ex] = await Promise.all([
        db.from('plan_days').select('day_of_week,slot_type,slot_key,custom_name,cardio_type,cardio_duration_min').eq('plan_id', plan.id).order('day_of_week', { ascending: true }),
        db.from('plan_exercises').select('id,slot_key,slot_type,exercise_name,target_sets,target_reps,order_idx').eq('plan_id', plan.id).order('slot_key', { ascending: true }).order('order_idx', { ascending: true }),
      ])
      // Each day owns its own exercise list (two same-type days can differ); group per day.
      const exArr = ex.data || []
      const byKey: Record<string, any[]> = {}
      for (const e of exArr) { const k = e.slot_key || e.slot_type; (byKey[k] = byKey[k] || []).push(e) }
      const daysOut = (days.data || []).map((d: any) => {
        if (d.slot_type === 'rest') return d
        const key = d.slot_key || d.slot_type
        let list = byKey[key]
        if ((!list || !list.length) && d.slot_type !== 'cardio') list = byKey[d.slot_type]
        return { ...d, slot_key: key, exercises: list || [] }
      })
      return ok({ plan, days: daysOut, exercises: exArr })
    },
  )

  server.registerTool(
    'list_workouts',
    { title: 'List workouts', description: 'Recent completed workout sessions with their sets. limit defaults to 10.', inputSchema: { limit: z.number().int().positive().max(50).optional(), since: z.string().optional() } },
    async ({ limit, since }) => {
      let q = db.from('sessions').select('id,session_date,slot_type,notes,cardio_type,cardio_duration_min,set_logs(exercise_name,set_number,reps,weight_lbs)').neq('is_draft', true).order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit || 10)
      if (since) q = q.gte('session_date', since)
      const { data, error } = await q
      return error ? fail(error.message) : ok({ count: (data || []).length, sessions: data || [] })
    },
  )

  server.registerTool(
    'get_prs',
    { title: 'Get personal records', description: 'Heaviest weight lifted per exercise, all time.', inputSchema: {} },
    async () => {
      const { data, error } = await db.from('set_logs').select('exercise_name,weight_lbs,reps').not('weight_lbs', 'is', null).limit(5000)
      if (error) return fail(error.message)
      const best: Record<string, { weight_lbs: number; reps: number | null }> = {}
      for (const s of data || []) {
        const w = Number(s.weight_lbs) || 0
        if (!best[s.exercise_name] || w > best[s.exercise_name].weight_lbs) best[s.exercise_name] = { weight_lbs: w, reps: s.reps ?? null }
      }
      const prs = Object.entries(best).map(([exercise_name, v]) => ({ exercise_name, ...v })).sort((a, b) => b.weight_lbs - a.weight_lbs)
      return ok({ count: prs.length, prs })
    },
  )

  server.registerTool(
    'get_nutrition',
    { title: 'Get nutrition', description: 'Food log entries and macro totals for a date (YYYY-MM-DD, default today UTC).', inputSchema: { date: z.string().optional() } },
    async ({ date }) => {
      const d = date || (await userToday())
      const { data, error } = await db.from('food_logs').select('id,meal_slot,food_name,brand,servings,serving_size_g,calories,protein_g,carbs_g,fat_g,fiber_g,logged_at').eq('log_date', d).order('logged_at', { ascending: true })
      return error ? fail(error.message) : ok({ date: d, totals: sumMacros(data || []), entries: data || [] })
    },
  )

  server.registerTool(
    'get_health',
    { title: 'Get Apple Health metrics', description: 'Daily Apple Health data. Provide a metric key (steps, active_energy, exercise_minutes, distance, flights, sleep_hours, resting_heart_rate, heart_rate, oxygen_saturation, respiratory_rate, body_fat, blood_glucose, body_temperature, bp_systolic, bp_diastolic) and days (default 30) for a series; omit metric for the latest value of every metric.', inputSchema: { metric: z.string().optional(), days: z.number().int().positive().max(365).optional() } },
    async ({ metric, days }) => {
      const n = days || 30
      const since = new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
      let q = db.from('health_metrics').select('metric,value,unit,day,agg,recorded_at').gte('day', since).order('day', { ascending: false }).order('recorded_at', { ascending: false })
      if (metric) q = q.eq('metric', metric)
      const { data, error } = await q.limit(5000)
      if (error) return fail(error.message)
      if (metric) return ok({ metric, days: n, series: (data || []).slice().reverse() })
      const latest: Record<string, any> = {}
      for (const r of data || []) if (!latest[r.metric]) latest[r.metric] = { value: Number(r.value), unit: r.unit, day: r.day }
      return ok({ as_of: (await userToday()), latest })
    },
  )

  server.registerTool(
    'get_body_weight',
    { title: 'Get body weight', description: 'Recent body weight entries (lb), newest first. limit defaults to 30.', inputSchema: { limit: z.number().int().positive().max(365).optional() } },
    async ({ limit }) => {
      const { data, error } = await db.from('body_weights').select('weight_lbs,recorded_at,source,created_at').order('recorded_at', { ascending: false }).order('created_at', { ascending: false }).limit(limit || 30)
      return error ? fail(error.message) : ok({ count: (data || []).length, entries: data || [] })
    },
  )

  server.registerTool(
    'get_measurements',
    { title: 'Get body measurements', description: 'Recent body measurements in inches (waist, chest, biceps, thighs, calves), newest first. limit defaults to 12.', inputSchema: { limit: z.number().int().positive().max(365).optional() } },
    async ({ limit }) => {
      const { data, error } = await db.from('body_measurements').select('measured_date,waist_in,chest_in,bicep_left_in,bicep_right_in,thigh_left_in,thigh_right_in,calf_left_in,calf_right_in,notes').order('measured_date', { ascending: false }).limit(limit || 12)
      return error ? fail(error.message) : ok({ count: (data || []).length, latest: (data || [])[0] || null, entries: data || [] })
    },
  )

  server.registerTool(
    'get_meal_plans',
    { title: 'Get meal plans', description: 'Saved meal plans with their items (grouped by day_index and meal_slot). Pass active_only for just the active plan.', inputSchema: { active_only: z.boolean().optional() } },
    async ({ active_only }) => {
      let pq = db.from('meal_plans').select('id,name,description,kcal_target,protein_target_g,carbs_target_g,fat_target_g,is_active,created_at').order('created_at', { ascending: false })
      if (active_only) pq = pq.eq('is_active', true)
      const { data: plans, error } = await pq
      if (error) return fail(error.message)
      if (!plans || !plans.length) return ok({ count: 0, meal_plans: [] })
      const ids = plans.map((pl: any) => pl.id)
      const { data: items } = await db.from('meal_plan_items').select('id,plan_id,day_index,meal_slot,food_name,serving_size_g,calories,protein_g,carbs_g,fat_g,fiber_g,order_idx').in('plan_id', ids).order('day_index', { ascending: true }).order('order_idx', { ascending: true })
      const byPlan: Record<string, any[]> = {}
      for (const it of items || []) (byPlan[it.plan_id] = byPlan[it.plan_id] || []).push(it)
      return ok({ count: plans.length, meal_plans: plans.map((pl: any) => ({ ...pl, items: byPlan[pl.id] || [] })) })
    },
  )

  server.registerTool(
    'get_food_favorites',
    { title: 'Get saved foods', description: 'Saved/frequent foods with macros, most used first. limit defaults to 25.', inputSchema: { limit: z.number().int().positive().max(200).optional() } },
    async ({ limit }) => {
      const { data, error } = await db.from('food_favorites').select('food_name,brand,serving_size_g,calories,protein_g,carbs_g,fat_g,fiber_g,use_count,last_used_at').order('use_count', { ascending: false }).limit(limit || 25)
      return error ? fail(error.message) : ok({ count: (data || []).length, favorites: data || [] })
    },
  )

  // ---------- WRITE ----------
  server.registerTool(
    'log_food',
    { title: 'Log food', description: 'Add a food entry to the nutrition log.', inputSchema: { food_name: z.string(), calories: z.number(), protein_g: z.number().optional(), carbs_g: z.number().optional(), fat_g: z.number().optional(), fiber_g: z.number().optional(), serving_size_g: z.number().optional(), servings: z.number().optional(), meal_slot: z.string().optional(), date: z.string().optional() }, _meta: { ui: { resourceUri: UI_WIDGET } } },
    async (a) => {
      const row = { user_id: uid, log_date: a.date || (await userToday()), logged_at: new Date().toISOString(), meal_slot: a.meal_slot ?? null, food_name: a.food_name, serving_size_g: a.serving_size_g ?? null, servings: a.servings ?? 1, calories: a.calories, protein_g: a.protein_g ?? 0, carbs_g: a.carbs_g ?? 0, fat_g: a.fat_g ?? 0, fiber_g: a.fiber_g ?? 0, source: 'mcp' }
      const { data, error } = await db.from('food_logs').insert(row).select().single()
      if (error) return fail(error.message)
      const today = await buildTodayPayload(a.date)
      const kcalAdded = Math.round(Number(data.calories) || 0)
      const foodPayload = { kind: 'macros', date: today.date, macros: today.macros, justLogged: 'Logged ' + data.food_name + ' (+' + kcalAdded + ' kcal)' }
      return uiOk('Logged ' + data.food_name + ' (+' + kcalAdded + ' kcal). Today: ' + Math.round(today.macros.consumed.calories) + ' / ' + (today.macros.target.kcal || 0) + ' kcal.', foodPayload)
    },
  )

  server.registerTool(
    'log_workout',
    { title: 'Log workout', description: 'Log a completed workout session and its sets. slot_type is e.g. push, pull, legs, upper, lower, full, cardio.', inputSchema: { slot_type: z.string(), exercises: z.array(z.object({ exercise_name: z.string(), sets: z.array(z.object({ weight_lbs: z.number().optional(), reps: z.number().int().optional() })) })), date: z.string().optional(), notes: z.string().optional() }, _meta: { ui: { resourceUri: UI_WIDGET } } },
    async (a) => {
      const date = a.date || (await userToday())

      // If the app has an ACTIVE DRAFT for this slot+day (user is mid-workout),
      // merge into it instead of creating a parallel session. Otherwise hitting
      // Finish in the app saves the same lift twice and volume double-counts.
      // CONSTRAINT: the app's auto-save rewrites the draft's set_logs from its
      // screen state, so only exercises the screen is guaranteed to render can
      // survive a merge: ones already in the draft, or in the active plan for
      // this slot. Anything else keeps the old behavior (own finished session).
      let draft: any = null
      try {
        const { data } = await db.from('sessions').select('id, set_logs(exercise_name,set_number)')
          .eq('session_date', date).eq('slot_type', a.slot_type).eq('is_draft', true)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        draft = data || null
      } catch { draft = null }

      const mergeable = new Set<string>()
      if (draft) {
        for (const s of (draft.set_logs || [])) mergeable.add(s.exercise_name)
        try {
          const { data: plan } = await db.from('plans').select('id').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (plan) {
            // Scope to the specific day's list (two same-type days can differ).
            const dow = new Date(date + 'T00:00:00').getDay()
            const { data: pd } = await db.from('plan_days').select('slot_type,slot_key').eq('plan_id', plan.id).eq('day_of_week', dow).maybeSingle()
            const key = pd && (pd.slot_key || pd.slot_type)
            let pex: any = null
            if (key) { const r = await db.from('plan_exercises').select('exercise_name').eq('plan_id', plan.id).eq('slot_key', key); pex = r.data }
            if (!pex || !pex.length) { const r = await db.from('plan_exercises').select('exercise_name').eq('plan_id', plan.id).eq('slot_type', a.slot_type); pex = r.data }
            for (const px of (pex || [])) mergeable.add(px.exercise_name)
          }
        } catch { /* plan lookup is best-effort */ }
      }

      const mergeExs = draft ? a.exercises.filter((ex) => mergeable.has(ex.exercise_name)) : []
      const sepExs = draft ? a.exercises.filter((ex) => !mergeable.has(ex.exercise_name)) : a.exercises

      let totalSets = 0
      let mergedSets = 0

      // 1) Append mergeable sets to the draft, numbering after its existing sets.
      if (draft && mergeExs.length) {
        const maxBy: Record<string, number> = {}
        for (const s of (draft.set_logs || [])) maxBy[s.exercise_name] = Math.max(maxBy[s.exercise_name] || 0, Number(s.set_number) || 0)
        const rows: any[] = []
        for (const ex of mergeExs) {
          let n = maxBy[ex.exercise_name] || 0
          for (const s of ex.sets) { n++; rows.push({ session_id: draft.id, exercise_name: ex.exercise_name, set_number: n, reps: s.reps ?? null, weight_lbs: s.weight_lbs ?? null }) }
        }
        if (rows.length) { const { error: le } = await db.from('set_logs').insert(rows); if (le) return fail(le.message) }
        mergedSets = rows.length
        totalSets += rows.length
        if (a.notes) { try { await db.from('sessions').update({ notes: a.notes }).eq('id', draft.id) } catch { /* non-fatal */ } }
      }

      // 2) Everything else: own finished session (previous behavior).
      if (sepExs.length) {
        const { data: sess, error: se } = await db.from('sessions').insert({ user_id: uid, session_date: date, slot_type: a.slot_type, notes: a.notes ?? null, is_draft: false }).select().single()
        if (se) return fail(se.message)
        const rows: any[] = []
        for (const ex of sepExs) { let n = 0; for (const s of ex.sets) { n++; rows.push({ session_id: sess.id, exercise_name: ex.exercise_name, set_number: n, reps: s.reps ?? null, weight_lbs: s.weight_lbs ?? null }) } }
        if (rows.length) { const { error: le } = await db.from('set_logs').insert(rows); if (le) return fail(le.message) }
        totalSets += rows.length
      }

      let totalVolume = 0
      const exPayload = a.exercises.map((ex) => {
        let vol = 0
        for (const s of ex.sets) vol += (Number(s.weight_lbs) || 0) * (Number(s.reps) || 0)
        totalVolume += vol
        return { exercise_name: ex.exercise_name, sets: ex.sets, volume: vol }
      })
      const summary = a.slot_type + ' workout logged: ' + totalSets + ' sets, ' + Math.round(totalVolume) + ' lb volume' + (mergedSets ? ' (merged into your active workout -- reopen the Log screen to see them)' : '')
      const woPayload = {
        kind: 'workout', date, slot_type: a.slot_type, notes: a.notes ?? null,
        exercises: exPayload, totalSets, totalVolume,
        justLogged: summary,
      }
      return uiOk(summary + '.', woPayload)
    },
  )

  server.registerTool(
    'log_body_weight',
    { title: 'Log body weight', description: 'Record a body weight entry in pounds.', inputSchema: { weight_lbs: z.number(), date: z.string().optional() } },
    async (a) => {
      const recorded_at = a.date ? new Date(a.date + 'T12:00:00').toISOString() : new Date().toISOString()
      const { data, error } = await db.from('body_weights').insert({ user_id: uid, weight_lbs: a.weight_lbs, recorded_at, source: 'mcp' }).select().single()
      return error ? fail(error.message) : ok({ logged: true, entry: data })
    },
  )

  server.registerTool(
    'set_macro_targets',
    { title: 'Set macro targets', description: 'Update daily calorie and macro targets on the profile.', inputSchema: { kcal_target: z.number().int().optional(), protein_target_g: z.number().int().optional(), carbs_target_g: z.number().int().optional(), fat_target_g: z.number().int().optional() } },
    async (a) => {
      const patch: any = { updated_at: new Date().toISOString() }
      for (const k of ['kcal_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g'] as const) if (a[k] != null) patch[k] = a[k]
      if (Object.keys(patch).length === 1) return fail('Provide at least one target to update.')
      const { data, error } = await db.from('profiles').update(patch).eq('id', uid).select('kcal_target,protein_target_g,carbs_target_g,fat_target_g').single()
      return error ? fail(error.message) : ok({ updated: true, targets: data })
    },
  )

  server.registerTool(
    'add_plan_exercise',
    { title: 'Add plan exercise', description: 'Add an exercise to a day in the active plan. slot_type is e.g. push, pull, legs. Each day owns its own list, so if you have two days of the same type (e.g. two leg days) pass day_of_week (0=Sun..6=Sat) to choose which one.', inputSchema: { slot_type: z.string(), exercise_name: z.string(), target_sets: z.number().int().optional(), target_reps: z.string().optional(), day_of_week: z.number().int().min(0).max(6).optional() } },
    async (a) => {
      const { data: plan, error: pe } = await db.from('plans').select('id').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (pe) return fail(pe.message)
      if (!plan) return fail('No active plan to add to.')
      // Resolve which day's list to add to (per-day slot_key).
      const { data: pdays } = await db.from('plan_days').select('day_of_week,slot_type,slot_key').eq('plan_id', plan.id)
      let key = a.slot_type
      if (a.day_of_week != null) {
        const d = (pdays || []).find((x: any) => x.day_of_week === a.day_of_week)
        if (!d) return fail('No day ' + a.day_of_week + ' in your plan.')
        if (d.slot_type !== a.slot_type) return fail('Day ' + a.day_of_week + ' is a ' + d.slot_type + ' day, not ' + a.slot_type + '.')
        key = d.slot_key || (d.slot_type + '-' + d.day_of_week)
      } else {
        const matches = (pdays || []).filter((x: any) => x.slot_type === a.slot_type)
        if (matches.length > 1) return fail('You have multiple ' + a.slot_type + ' days (day_of_week ' + matches.map((m: any) => m.day_of_week).join(', ') + '). Pass day_of_week (0=Sun..6=Sat) to choose which one.')
        if (matches.length === 1) key = matches[0].slot_key || (matches[0].slot_type + '-' + matches[0].day_of_week)
      }
      const { data: mx } = await db.from('plan_exercises').select('order_idx').eq('plan_id', plan.id).eq('slot_key', key).order('order_idx', { ascending: false }).limit(1).maybeSingle()
      const order_idx = ((mx?.order_idx ?? -1) as number) + 1
      const { data, error } = await db.from('plan_exercises').insert({ plan_id: plan.id, slot_type: a.slot_type, slot_key: key, exercise_name: a.exercise_name, target_sets: a.target_sets ?? 3, target_reps: a.target_reps ?? '8-12', order_idx }).select().single()
      return error ? fail(error.message) : ok({ added: true, exercise: data })
    },
  )

  server.registerTool(
    'update_food_log',
    { title: 'Update food log', description: 'Edit an existing food log entry by id. Only provided fields change.', inputSchema: { id: z.string(), food_name: z.string().optional(), calories: z.number().optional(), protein_g: z.number().optional(), carbs_g: z.number().optional(), fat_g: z.number().optional(), fiber_g: z.number().optional(), serving_size_g: z.number().optional(), servings: z.number().optional(), meal_slot: z.string().optional() } },
    async (a) => {
      const patch: any = {}
      for (const k of ['food_name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'serving_size_g', 'servings', 'meal_slot'] as const) if (a[k] != null) patch[k] = a[k]
      if (!Object.keys(patch).length) return fail('Provide at least one field to change.')
      const { data, error } = await db.from('food_logs').update(patch).eq('id', a.id).select().maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('No food log with that id (or not yours).')
      return ok({ updated: true, entry: data })
    },
  )

  server.registerTool(
    'delete_food_log',
    { title: 'Delete food log', description: 'Delete a food log entry by id. Destructive: requires confirm: true after the user agrees.', inputSchema: { id: z.string(), confirm: z.boolean().optional() } },
    async (a) => {
      const { data: row } = await db.from('food_logs').select('id,food_name,calories,log_date').eq('id', a.id).maybeSingle()
      if (!row) return fail('No food log with that id (or not yours).')
      if (!a.confirm) return needConfirm('This will delete "' + row.food_name + '" (' + Math.round(Number(row.calories) || 0) + ' kcal) logged on ' + row.log_date + '.')
      const { error } = await db.from('food_logs').delete().eq('id', a.id)
      return error ? fail(error.message) : ok({ deleted: true, id: a.id })
    },
  )

  server.registerTool(
    'update_plan_exercise',
    { title: 'Update plan exercise', description: 'Edit an exercise in the routine. Identify it by id, or by day_of_week (0=Sun..6=Sat) + exercise_name. Change new_exercise_name, target_sets, target_reps, or order_idx.', inputSchema: { id: z.string().optional(), day_of_week: z.number().int().min(0).max(6).optional(), exercise_name: z.string().optional(), new_exercise_name: z.string().optional(), target_sets: z.number().int().optional(), target_reps: z.string().optional(), order_idx: z.number().int().optional() } },
    async (a) => {
      const { data: plan } = await db.from('plans').select('id').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!plan) return fail('No active plan.')
      let id = a.id
      if (!id) {
        if (a.day_of_week == null || !a.exercise_name) return fail('Provide id, or day_of_week + exercise_name.')
        const { data: pd } = await db.from('plan_days').select('slot_type,slot_key').eq('plan_id', plan.id).eq('day_of_week', a.day_of_week).maybeSingle()
        if (!pd) return fail('No day ' + a.day_of_week + ' in your plan.')
        const key = pd.slot_key || pd.slot_type
        const { data: rows } = await db.from('plan_exercises').select('id').eq('plan_id', plan.id).eq('slot_key', key).eq('exercise_name', a.exercise_name)
        if (!rows || !rows.length) return fail('No exercise "' + a.exercise_name + '" on day ' + a.day_of_week + '.')
        if (rows.length > 1) return fail('Multiple matches; pass id.')
        id = rows[0].id
      }
      const patch: any = {}
      if (a.new_exercise_name != null) patch.exercise_name = a.new_exercise_name
      if (a.target_sets != null) patch.target_sets = a.target_sets
      if (a.target_reps != null) patch.target_reps = a.target_reps
      if (a.order_idx != null) patch.order_idx = a.order_idx
      if (!Object.keys(patch).length) return fail('Provide a field to change (new_exercise_name, target_sets, target_reps, order_idx).')
      const { data, error } = await db.from('plan_exercises').update(patch).eq('id', id).eq('plan_id', plan.id).select().maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('No matching plan exercise.')
      return ok({ updated: true, exercise: data })
    },
  )

  server.registerTool(
    'remove_plan_exercise',
    { title: 'Remove plan exercise', description: 'Remove an exercise from the routine. Identify by id, or day_of_week + exercise_name. Destructive: requires confirm: true after the user agrees.', inputSchema: { id: z.string().optional(), day_of_week: z.number().int().min(0).max(6).optional(), exercise_name: z.string().optional(), confirm: z.boolean().optional() } },
    async (a) => {
      const { data: plan } = await db.from('plans').select('id').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!plan) return fail('No active plan.')
      let id = a.id
      let label = a.exercise_name || 'this exercise'
      if (!id) {
        if (a.day_of_week == null || !a.exercise_name) return fail('Provide id, or day_of_week + exercise_name.')
        const { data: pd } = await db.from('plan_days').select('slot_type,slot_key').eq('plan_id', plan.id).eq('day_of_week', a.day_of_week).maybeSingle()
        if (!pd) return fail('No day ' + a.day_of_week + ' in your plan.')
        const key = pd.slot_key || pd.slot_type
        const { data: rows } = await db.from('plan_exercises').select('id,exercise_name').eq('plan_id', plan.id).eq('slot_key', key).eq('exercise_name', a.exercise_name)
        if (!rows || !rows.length) return fail('No exercise "' + a.exercise_name + '" on day ' + a.day_of_week + '.')
        if (rows.length > 1) return fail('Multiple matches; pass id.')
        id = rows[0].id
        label = rows[0].exercise_name
      } else {
        const { data: r } = await db.from('plan_exercises').select('exercise_name').eq('id', id).maybeSingle()
        if (r) label = r.exercise_name
      }
      if (!a.confirm) return needConfirm('This will remove "' + label + '" from your routine.')
      const { error } = await db.from('plan_exercises').delete().eq('id', id).eq('plan_id', plan.id)
      return error ? fail(error.message) : ok({ removed: true, id })
    },
  )

  server.registerTool(
    'set_plan_day',
    { title: 'Set plan day', description: "Change a day in the routine. day_of_week 0=Sun..6=Sat. Set slot_type (push/pull/legs/upper/lower/full/cardio/rest/custom), custom_name, cardio_type, cardio_duration_min. Changing slot_type to a different type clears that day's exercises and requires confirm: true.", inputSchema: { day_of_week: z.number().int().min(0).max(6), slot_type: z.string().optional(), custom_name: z.string().optional(), cardio_type: z.string().optional(), cardio_duration_min: z.number().int().optional(), confirm: z.boolean().optional() } },
    async (a) => {
      const { data: plan } = await db.from('plans').select('id').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!plan) return fail('No active plan.')
      const { data: pd } = await db.from('plan_days').select('id,slot_type,slot_key').eq('plan_id', plan.id).eq('day_of_week', a.day_of_week).maybeSingle()
      if (!pd) return fail('No day ' + a.day_of_week + ' in your plan.')
      const patch: any = {}
      if (a.custom_name !== undefined) patch.custom_name = a.custom_name || null
      if (a.cardio_type !== undefined) patch.cardio_type = a.cardio_type || null
      if (a.cardio_duration_min !== undefined) patch.cardio_duration_min = a.cardio_duration_min || null
      let cleared = 0
      if (a.slot_type && a.slot_type !== pd.slot_type) {
        const newType = a.slot_type
        const oldKey = pd.slot_key || pd.slot_type
        const { data: existing } = await db.from('plan_exercises').select('id').eq('plan_id', plan.id).eq('slot_key', oldKey)
        const exCount = (existing || []).length
        if (exCount && !a.confirm) return needConfirm('Changing day ' + a.day_of_week + ' from ' + pd.slot_type + ' to ' + newType + ' will remove its ' + exCount + ' exercise(s).')
        if (exCount) { await db.from('plan_exercises').delete().eq('plan_id', plan.id).eq('slot_key', oldKey); cleared = exCount }
        patch.slot_type = newType
        patch.slot_key = (newType === 'rest') ? null : (newType + '-' + a.day_of_week)
      }
      if (!Object.keys(patch).length) return fail('Provide something to change (slot_type, custom_name, cardio_type, cardio_duration_min).')
      const { data, error } = await db.from('plan_days').update(patch).eq('id', pd.id).select().maybeSingle()
      if (error) return fail(error.message)
      return ok({ updated: true, day: data, cleared_exercises: cleared })
    },
  )

  server.registerTool(
    'create_meal_plan',
    { title: 'Create meal plan', description: 'Create a meal plan, optionally with items. day_index is 0-based per day; meal_slot like breakfast/lunch/dinner/snack. Set make_active to activate it.', inputSchema: { name: z.string(), description: z.string().optional(), kcal_target: z.number().int().optional(), protein_target_g: z.number().int().optional(), carbs_target_g: z.number().int().optional(), fat_target_g: z.number().int().optional(), make_active: z.boolean().optional(), items: z.array(z.object({ day_index: z.number().int().optional(), meal_slot: z.string().optional(), food_name: z.string(), serving_size_g: z.number().optional(), calories: z.number().optional(), protein_g: z.number().optional(), carbs_g: z.number().optional(), fat_g: z.number().optional(), fiber_g: z.number().optional(), order_idx: z.number().int().optional() })).optional() } },
    async (a) => {
      if (a.make_active) { try { await db.from('meal_plans').update({ is_active: false }).eq('user_id', uid).eq('is_active', true) } catch { /* best-effort */ } }
      const { data: plan, error } = await db.from('meal_plans').insert({ user_id: uid, name: a.name, description: a.description ?? null, kcal_target: a.kcal_target ?? null, protein_target_g: a.protein_target_g ?? null, carbs_target_g: a.carbs_target_g ?? null, fat_target_g: a.fat_target_g ?? null, is_active: !!a.make_active }).select().single()
      if (error) return fail(error.message)
      let itemsAdded = 0
      if (a.items && a.items.length) {
        const rows = a.items.map((it, i) => ({ plan_id: plan.id, day_index: it.day_index ?? 0, meal_slot: it.meal_slot ?? null, food_name: it.food_name, serving_size_g: it.serving_size_g ?? null, calories: it.calories ?? 0, protein_g: it.protein_g ?? 0, carbs_g: it.carbs_g ?? 0, fat_g: it.fat_g ?? 0, fiber_g: it.fiber_g ?? 0, order_idx: it.order_idx ?? i }))
        const { error: ie } = await db.from('meal_plan_items').insert(rows)
        if (ie) return fail('Plan created but adding items failed: ' + ie.message)
        itemsAdded = rows.length
      }
      return ok({ created: true, meal_plan: plan, items_added: itemsAdded })
    },
  )

  server.registerTool(
    'update_meal_plan',
    { title: 'Update meal plan', description: 'Edit a meal plan by id (name, description, targets). Only provided fields change.', inputSchema: { id: z.string(), name: z.string().optional(), description: z.string().optional(), kcal_target: z.number().int().optional(), protein_target_g: z.number().int().optional(), carbs_target_g: z.number().int().optional(), fat_target_g: z.number().int().optional() } },
    async (a) => {
      const patch: any = {}
      for (const k of ['name', 'description', 'kcal_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g'] as const) if (a[k] != null) patch[k] = a[k]
      if (!Object.keys(patch).length) return fail('Provide a field to change.')
      const { data, error } = await db.from('meal_plans').update(patch).eq('id', a.id).eq('user_id', uid).select().maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('No meal plan with that id (or not yours).')
      return ok({ updated: true, meal_plan: data })
    },
  )

  server.registerTool(
    'set_active_meal_plan',
    { title: 'Set active meal plan', description: 'Make a meal plan the active one (deactivates the others).', inputSchema: { id: z.string() } },
    async (a) => {
      const { data: row } = await db.from('meal_plans').select('id').eq('id', a.id).eq('user_id', uid).maybeSingle()
      if (!row) return fail('No meal plan with that id (or not yours).')
      await db.from('meal_plans').update({ is_active: false }).eq('user_id', uid).eq('is_active', true)
      const { data, error } = await db.from('meal_plans').update({ is_active: true }).eq('id', a.id).select().maybeSingle()
      return error ? fail(error.message) : ok({ active: true, meal_plan: data })
    },
  )

  server.registerTool(
    'add_meal_plan_item',
    { title: 'Add meal plan item', description: 'Add a food item to a meal plan (meal_plan_id). day_index 0-based; meal_slot like breakfast/lunch/dinner/snack.', inputSchema: { meal_plan_id: z.string(), food_name: z.string(), day_index: z.number().int().optional(), meal_slot: z.string().optional(), serving_size_g: z.number().optional(), calories: z.number().optional(), protein_g: z.number().optional(), carbs_g: z.number().optional(), fat_g: z.number().optional(), fiber_g: z.number().optional() } },
    async (a) => {
      const { data: plan } = await db.from('meal_plans').select('id').eq('id', a.meal_plan_id).eq('user_id', uid).maybeSingle()
      if (!plan) return fail('No meal plan with that id (or not yours).')
      const { data: mx } = await db.from('meal_plan_items').select('order_idx').eq('plan_id', a.meal_plan_id).eq('day_index', a.day_index ?? 0).order('order_idx', { ascending: false }).limit(1).maybeSingle()
      const order_idx = ((mx?.order_idx ?? -1) as number) + 1
      const { data, error } = await db.from('meal_plan_items').insert({ plan_id: a.meal_plan_id, day_index: a.day_index ?? 0, meal_slot: a.meal_slot ?? null, food_name: a.food_name, serving_size_g: a.serving_size_g ?? null, calories: a.calories ?? 0, protein_g: a.protein_g ?? 0, carbs_g: a.carbs_g ?? 0, fat_g: a.fat_g ?? 0, fiber_g: a.fiber_g ?? 0, order_idx }).select().single()
      return error ? fail(error.message) : ok({ added: true, item: data })
    },
  )

  server.registerTool(
    'update_meal_plan_item',
    { title: 'Update meal plan item', description: 'Edit a meal plan item by id. Only provided fields change.', inputSchema: { id: z.string(), food_name: z.string().optional(), day_index: z.number().int().optional(), meal_slot: z.string().optional(), serving_size_g: z.number().optional(), calories: z.number().optional(), protein_g: z.number().optional(), carbs_g: z.number().optional(), fat_g: z.number().optional(), fiber_g: z.number().optional(), order_idx: z.number().int().optional() } },
    async (a) => {
      const patch: any = {}
      for (const k of ['food_name', 'day_index', 'meal_slot', 'serving_size_g', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'order_idx'] as const) if (a[k] != null) patch[k] = a[k]
      if (!Object.keys(patch).length) return fail('Provide a field to change.')
      const { data, error } = await db.from('meal_plan_items').update(patch).eq('id', a.id).select().maybeSingle()
      if (error) return fail(error.message)
      if (!data) return fail('No item with that id (or not yours).')
      return ok({ updated: true, item: data })
    },
  )

  server.registerTool(
    'delete_meal_plan_item',
    { title: 'Delete meal plan item', description: 'Delete a meal plan item by id. Destructive: requires confirm: true after the user agrees.', inputSchema: { id: z.string(), confirm: z.boolean().optional() } },
    async (a) => {
      const { data: row } = await db.from('meal_plan_items').select('id,food_name').eq('id', a.id).maybeSingle()
      if (!row) return fail('No item with that id (or not yours).')
      if (!a.confirm) return needConfirm('This will delete the meal item "' + row.food_name + '".')
      const { error } = await db.from('meal_plan_items').delete().eq('id', a.id)
      return error ? fail(error.message) : ok({ deleted: true, id: a.id })
    },
  )

  server.registerTool(
    'delete_meal_plan',
    { title: 'Delete meal plan', description: 'Delete a whole meal plan and its items by id. Destructive: requires confirm: true after the user agrees.', inputSchema: { id: z.string(), confirm: z.boolean().optional() } },
    async (a) => {
      const { data: row } = await db.from('meal_plans').select('id,name').eq('id', a.id).eq('user_id', uid).maybeSingle()
      if (!row) return fail('No meal plan with that id (or not yours).')
      if (!a.confirm) return needConfirm('This will delete the meal plan "' + row.name + '" and all its items.')
      await db.from('meal_plan_items').delete().eq('plan_id', a.id)
      const { error } = await db.from('meal_plans').delete().eq('id', a.id).eq('user_id', uid)
      return error ? fail(error.message) : ok({ deleted: true, id: a.id })
    },
  )

  // ---------- ACCOUNT SETUP (mirrors the in-app onboarding) ----------
  server.registerTool(
    'start_account_setup',
    { title: 'Start account setup', description: 'Begin guided account setup for a new BarbellMind user. Returns the exact questionnaire the in-app setup asks, the valid options, and the split day-templates, plus what is already set on the account. When a user asks to set up their BarbellMind account, call this FIRST, then ask them every question it returns, one at a time and in order (basic stats, goal, minutes per workout day, training split, the 7-day layout, and the exercises for each training day). Once you have the answers, call update_profile, then create_plan. Macro targets are optional and are not part of the app setup, but you may offer to set them afterward with set_macro_targets.', inputSchema: {} },
    async () => {
      const { data: profile } = await db.from('profiles').select('username,age,height_ft,height_in,weight_lbs,goal,daily_minutes,kcal_target,protein_target_g,carbs_target_g,fat_target_g').eq('id', uid).maybeSingle()
      const { data: plan } = await db.from('plans').select('id,split_type,name').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      return ok({
        instructions: 'Ask the user each question below one at a time, in order, mirroring the BarbellMind app setup. Do not skip any. After collecting the answers, call update_profile (age, height_ft, height_in, weight_lbs, goal, daily_minutes), then call create_plan (split_type plus the 7-day layout with each training day\'s exercises). If a field is already set under already_set, you can confirm it rather than re-ask. Macro targets are optional; after the plan is saved you may offer to set them with set_macro_targets.',
        already_set: { profile: profile || null, active_plan: plan || null },
        questions: [
          { step: 1, field: 'basics', ask: ['Age (years)', 'Height (feet and inches)', 'Body weight (lbs)'] },
          { step: 2, field: 'goal', ask: 'What is your main goal right now?', options: [
            { value: 'build_muscle', label: 'Build muscle' },
            { value: 'lose_weight', label: 'Lose weight' },
            { value: 'gain_strength', label: 'Gain strength' },
            { value: 'maintain', label: 'Maintain' },
            { value: 'general_fitness', label: 'General fitness' },
          ] },
          { step: 3, field: 'daily_minutes', ask: 'About how many minutes do you train on a workout day?', presets: [30, 45, 60, 75, 90], custom_range: '15-240' },
          { step: 4, field: 'split_type', ask: 'Which training split do you want? (template is Sunday-first)', options: [
            { value: 'ppl', label: 'Push / Pull / Legs', template: ['rest', 'push', 'pull', 'legs', 'push', 'pull', 'legs'] },
            { value: 'upper_lower', label: 'Upper / Lower', template: ['rest', 'upper', 'lower', 'rest', 'upper', 'lower', 'rest'] },
            { value: 'full_body', label: 'Full Body', template: ['rest', 'full', 'rest', 'full', 'rest', 'full', 'rest'] },
            { value: 'custom', label: 'Custom / Build your own', template: ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'] },
          ] },
          { step: 5, field: 'days', ask: 'Confirm or adjust each day of the week, Sunday first. Pick a slot_type for each day.', slot_types: ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'cardio', 'rest', 'custom'], note: 'Cardio days can include cardio_type and cardio_duration_min; custom days can have a custom_name.' },
          { step: 6, field: 'exercises', ask: 'For each training day, list the exercises with target sets and target reps (e.g. 8-12). Offer the standard template for the chosen split if they want sensible defaults.' },
        ],
      })
    },
  )

  server.registerTool(
    'update_profile',
    { title: 'Update profile', description: 'Create or update the user profile. Upserts, so it also works for a brand-new account that has no profile row yet. Fields mirror the app setup: age, height_ft, height_in, weight_lbs, goal, daily_minutes (typical minutes per workout day), and optional username. goal must be one of build_muscle, lose_weight, gain_strength, maintain, general_fitness. Only provided fields change.', inputSchema: { age: z.number().int().min(10).max(100).optional(), height_ft: z.number().int().min(3).max(8).optional(), height_in: z.number().int().min(0).max(11).optional(), weight_lbs: z.number().min(50).max(700).optional(), goal: z.enum(['build_muscle', 'lose_weight', 'gain_strength', 'maintain', 'general_fitness']).optional(), daily_minutes: z.number().int().min(10).max(240).optional(), username: z.string().optional() } },
    async (a) => {
      const patch: any = { id: uid, updated_at: new Date().toISOString() }
      for (const k of ['age', 'height_ft', 'height_in', 'weight_lbs', 'goal', 'daily_minutes', 'username'] as const) if (a[k] != null) patch[k] = a[k]
      if (Object.keys(patch).length <= 2) return fail('Provide at least one field to set (age, height_ft, height_in, weight_lbs, goal, daily_minutes, or username).')
      const { data, error } = await db.from('profiles').upsert(patch).select('username,age,height_ft,height_in,weight_lbs,goal,daily_minutes,kcal_target,protein_target_g,carbs_target_g,fat_target_g').single()
      return error ? fail(error.message) : ok({ updated: true, profile: data })
    },
  )

  server.registerTool(
    'create_plan',
    { title: 'Create workout plan', description: 'Create a new active workout plan from scratch, deactivating any current active plan. Mirrors the app setup. split_type is ppl, upper_lower, full_body, or custom. Provide days as 7 entries starting Sunday (index 0 = Sunday .. 6 = Saturday); each day has a slot_type (push, pull, legs, upper, lower, full, cardio, rest, custom) and may include custom_name, cardio_type, cardio_duration_min, and its own exercises list (each exercise has exercise_name and optional target_sets and target_reps). Use the templates from start_account_setup as the starting point.', inputSchema: { split_type: z.enum(['ppl', 'upper_lower', 'full_body', 'custom']), name: z.string().optional(), days: z.array(z.object({ slot_type: z.enum(['push', 'pull', 'legs', 'upper', 'lower', 'full', 'cardio', 'rest', 'custom']), custom_name: z.string().optional(), cardio_type: z.string().optional(), cardio_duration_min: z.number().int().optional(), exercises: z.array(z.object({ exercise_name: z.string(), target_sets: z.number().int().optional(), target_reps: z.string().optional() })).optional() })) } },
    async (a) => {
      if (!a.days || !a.days.length) return fail('Provide the days array (ideally 7 entries, Sunday first).')
      await db.from('plans').update({ is_active: false }).eq('user_id', uid).eq('is_active', true)
      const { data: plan, error } = await db.from('plans').insert({ user_id: uid, split_type: a.split_type, name: a.name || 'My Plan', is_active: true }).select().single()
      if (error) return fail(error.message)
      const dayRows = a.days.map((d, i) => ({ plan_id: plan.id, day_of_week: i, slot_type: d.slot_type, slot_key: (d.slot_type && d.slot_type !== 'rest') ? (d.slot_type + '-' + i) : null, custom_name: d.custom_name || null, cardio_type: d.cardio_type || null, cardio_duration_min: d.cardio_duration_min || null }))
      const { error: eD } = await db.from('plan_days').insert(dayRows)
      if (eD) return fail('Plan created but saving days failed: ' + eD.message)
      const exRows: any[] = []
      a.days.forEach((d, i) => {
        if (!d.slot_type || d.slot_type === 'rest' || d.slot_type === 'cardio') return
        const key = d.slot_type + '-' + i
        ;(d.exercises || []).filter((x) => x.exercise_name && x.exercise_name.trim()).forEach((x, j) => exRows.push({ plan_id: plan.id, slot_type: d.slot_type, slot_key: key, exercise_name: x.exercise_name.trim(), target_sets: x.target_sets ?? 3, target_reps: x.target_reps ?? '8-12', order_idx: j }))
      })
      if (exRows.length) { const { error: eE } = await db.from('plan_exercises').insert(exRows); if (eE) return fail('Plan and days saved but exercises failed: ' + eE.message) }
      return ok({ created: true, plan_id: plan.id, days: dayRows.length, exercises: exRows.length, note: 'Active plan created.' })
    },
  )


  server.registerResource(
    'BarbellMind widget',
    UI_WIDGET,
    { mimeType: UI_MIME, description: 'Interactive BarbellMind widget (macros, workout, today).' },
    async (u) => ({
      contents: [{
        uri: u.href,
        mimeType: UI_MIME,
        text: WIDGET_HTML,
      }],
    }),
  )

  return server
}
