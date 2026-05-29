export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    // parts: ['api', 'entries'] or ['api', 'entries', '42']
    const id = parts[2] ? parseInt(parts[2]) : null;

    if (request.method === "GET") {
        try {
            const { results } = await db.prepare(
                "SELECT * FROM entries ORDER BY created_at DESC"
            ).all();
            return new Response(JSON.stringify(results), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (err) {
            return new Response(err.message, { status: 500 });
        }
    }

    if (request.method === "POST") {
        try {
            const { date, title, content } = await request.json();
            if (!title || !content) {
                return new Response("Missing title or content", { status: 400 });
            }
            await db.prepare(
                "INSERT INTO entries (date, title, content) VALUES (?, ?, ?)"
            ).bind(date, title, content).run();
            return new Response("Entry saved", { status: 201 });
        } catch (err) {
            return new Response(err.message, { status: 500 });
        }
    }

    if (request.method === "PUT") {
        if (!id) return new Response("Missing entry ID", { status: 400 });
        try {
            const { date, content } = await request.json();
            if (!date || !content) {
                return new Response("Missing date or content", { status: 400 });
            }
            await db.prepare(
                "UPDATE entries SET date = ?, content = ? WHERE id = ?"
            ).bind(date, content, id).run();
            return new Response("Entry updated", { status: 200 });
        } catch (err) {
            return new Response(err.message, { status: 500 });
        }
    }

    if (request.method === "DELETE") {
        if (!id) return new Response("Missing entry ID", { status: 400 });
        try {
            await db.prepare(
                "DELETE FROM entries WHERE id = ?"
            ).bind(id).run();
            return new Response("Entry deleted", { status: 200 });
        } catch (err) {
            return new Response(err.message, { status: 500 });
        }
    }

    return new Response("Method not allowed", { status: 405 });
}
