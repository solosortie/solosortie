export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathname: /api/entries or /api/entries/:id
  const id = pathParts.length > 2 ? pathParts[pathParts.length - 1] : null;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // GET /api/entries
    if (method === 'GET' && !id) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM entries ORDER BY created_at DESC'
      ).all();
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/entries
    if (method === 'POST' && !id) {
      const body = await request.json();
      const { date, title, content } = body;
      await env.DB.prepare(
        'INSERT INTO entries (date, title, content) VALUES (?, ?, ?)'
      ).bind(date ?? null, title ?? null, content ?? null).run();
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /api/entries/:id
    if (method === 'PUT' && id) {
      const body = await request.json();
      const { date, content } = body;
      await env.DB.prepare(
        'UPDATE entries SET date = ?, content = ? WHERE id = ?'
      ).bind(date ?? null, content ?? null, id).run();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /api/entries/:id
    if (method === 'DELETE' && id) {
      await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
