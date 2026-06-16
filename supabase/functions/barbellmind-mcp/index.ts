// BarbellMind MCP server (remote, Streamable HTTP) on Supabase Edge Functions.
// - Tools live in tools.ts, run as the signed-in user (RLS enforced).
// - Auth is delegated to Supabase Auth's OAuth 2.1 server; this function only
//   validates the bearer token and advertises Protected Resource Metadata.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Hono } from 'hono'
import { buildServer } from './tools.ts'
import { authenticate, protectedResourceMetadata, wwwAuthenticate } from './auth.ts'

const app = new Hono().basePath('/barbellmind-mcp')

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version, accept',
  'Access-Control-Expose-Headers': 'mcp-session-id, www-authenticate',
}

app.options('*', () => new Response(null, { status: 204, headers: CORS }))

app.get('/', (c) =>
  c.json({ name: 'BarbellMind MCP', mcp_endpoint: '/functions/v1/barbellmind-mcp/mcp', metadata: '/functions/v1/barbellmind-mcp/.well-known/oauth-protected-resource' }, 200, CORS))

// RFC 9728 discovery. Served here and at the resource-suffixed path some clients probe.
app.get('/.well-known/oauth-protected-resource', (c) => c.json(protectedResourceMetadata(c.req.url), 200, CORS))
app.get('/.well-known/oauth-protected-resource/mcp', (c) => c.json(protectedResourceMetadata(c.req.url), 200, CORS))

app.all('/mcp', async (c) => {
  const auth = await authenticate(c.req.raw)
  if (!auth) {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: sign in via OAuth' }, id: null }),
      { status: 401, headers: { ...CORS, 'content-type': 'application/json', 'WWW-Authenticate': wwwAuthenticate(c.req.url) } },
    )
  }
  const server: McpServer = buildServer(auth.client, auth.user)
  const transport = new WebStandardStreamableHTTPServerTransport()
  await server.connect(transport)
  const res = await transport.handleRequest(c.req.raw)
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
})

Deno.serve(app.fetch)
