
export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Health check
        if (url.pathname === "/health" && request.method === "GET") {
            const result = await env.DB
                .prepare("SELECT 1 AS ok")
                .first();

            return Response.json(result);
        }

        // Create a call
        if (url.pathname === "/calls" && request.method === "POST") {
            try {
                const body = await request.json();

                const {
                    id,
                    startedAt,
                    endedAt,
                    duration,
                    transcript = [],
                    metrics = {}
                } = body;

                // Validate required fields
                if (
                    !id ||
                    !startedAt ||
                    !endedAt ||
                    !Number.isInteger(duration) ||
                    duration < 0 ||
                    !Array.isArray(transcript)
                ) {
                    return Response.json(
                        { error: "Invalid call data" },
                        { status: 400 }
                    );
                }

                // Validate transcript entries
                const validTranscript = transcript.every(
                    (item) =>
                        item &&
                        typeof item.speaker === "string" &&
                        typeof item.text === "string"
                );

                if (!validTranscript) {
                    return Response.json(
                        { error: "Invalid transcript data" },
                        { status: 400 }
                    );
                }

                // Build database operations
                const statements = [
                    env.DB.prepare(`
                        INSERT INTO calls
                            (id, started_at, ended_at, duration)
                        VALUES (?, ?, ?, ?)
                    `).bind(id, startedAt, endedAt, duration),

                    ...transcript.map((item) =>
                        env.DB.prepare(`
                            INSERT INTO transcripts
                                (call_id, speaker, text)
                            VALUES (?, ?, ?)
                        `).bind(id, item.speaker, item.text)
                    ),

                    env.DB.prepare(`
                        INSERT INTO call_metrics
                            (call_id, stt_latency, llm_latency, tts_latency)
                        VALUES (?, ?, ?, ?)
                    `).bind(
                        id,
                        metrics.stt ?? null,
                        metrics.llm ?? null,
                        metrics.tts ?? null
                    )
                ];

                // Execute the database operations
                await env.DB.batch(statements);

                return Response.json(
                    {
                        message: "Call saved",
                        id: id
                    },
                    { status: 201 }
                );
            } catch (error) {
                console.error("Error creating call:", error);

                return Response.json(
                    { error: "Could not create call" },
                    { status: 500 }
                );
            }
        }

        // Test database insertion (temporary route)
        if (url.pathname === "/test-db" && request.method === "GET") {
            const result = await env.DB
                .prepare(`
                    INSERT INTO calls (id, started_at, ended_at, duration)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        started_at = excluded.started_at,
                        ended_at = excluded.ended_at,
                        duration = excluded.duration
                `)
                .bind(
                    "call_001",
                    "2026-10-01T10:00:00Z",
                    "2026-10-01T10:02:30Z",
                    150
                )
                .run();

            return Response.json({
                message: "Call inserted or updated",
                success: result.success
            });
        }

        return new Response("Not Found", { status: 404 });
    },
};