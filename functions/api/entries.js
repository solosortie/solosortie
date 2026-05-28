export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    // Handle GET Request (Fetch all entries)
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

    // Handle POST Request (Save a new entry)
    if (request.method === "POST") {
        try {
            const { date, title, content } = await request.json();
            
            if (!title || !content) {
                return new Response("Missing title or content", { status: 400 });
            }

            await db.prepare(
                "INSERT INTO entries (date, title, content) VALUES (?, ?, ?)"
            ).bind(date, title, content).run();

            return new Response("Entry saved successfully", { status: 201 });
        } catch (err) {
            return new Response(err.message, { status: 500 });
        }
    }

    return new Response("Method not allowed", { status: 405 });
}