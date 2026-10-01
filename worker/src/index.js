export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // Handle preflight requests
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders,
            });
        }

        const jsonResponse = (data, options = {}) =>
            Response.json(data, {
                ...options,
                headers: {
                    ...corsHeaders,
                    ...(options.headers || {}),
                },
        });

        try {
            // Health check
            if (url.pathname === "/health" && request.method === "GET") {
                const result = await env.DB
                    .prepare("SELECT 1 AS ok")
                    .first();

                return jsonResponse(result);
            }

            // Create a call
            if (url.pathname === "/calls" && request.method === "POST") {
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
                    return jsonResponse(
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
                    return jsonResponse(
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

                return jsonResponse(
                    {
                        message: "Call saved",
                        id: id
                    },
                    { status: 201 }
                );
            }

            // List all calls
            if (url.pathname === "/calls" && request.method === "GET") {
                const result = await env.DB
                    .prepare(`
                        SELECT id, started_at, ended_at, duration
                        FROM calls
                        ORDER BY started_at DESC
                    `)
                    .all();

                return jsonResponse(result.results);
            }

            // Get one call and its related data
            const match = url.pathname.match(/^\/calls\/([^/]+)$/);
            if (match && request.method === "GET") {
                const id = decodeURIComponent(match[1]);

                const call = await env.DB
                    .prepare(`
                        SELECT id, started_at, ended_at, duration
                        FROM calls
                        WHERE id = ?
                    `)
                    .bind(id)
                    .first();

                if (!call) {
                    return jsonResponse(
                        { error: "Call not found" },
                        { status: 404 }
                    );
                }

                const transcript = await env.DB
                    .prepare(`
                        SELECT speaker, text
                        FROM transcripts
                        WHERE call_id = ?
                        ORDER BY id ASC
                    `)
                    .bind(id)
                    .all();

                const metrics = await env.DB
                    .prepare(`
                        SELECT stt_latency, llm_latency, tts_latency
                        FROM call_metrics
                        WHERE call_id = ?
                    `)
                    .bind(id)
                    .first();

                return jsonResponse({
                    ...call,
                    transcript: transcript.results,
                    metrics: metrics
                        ? {
                            stt: metrics.stt_latency,
                            llm: metrics.llm_latency,
                            tts: metrics.tts_latency,
                        }
                        : null,
                });
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

                return jsonResponse({
                    message: "Call inserted or updated",
                    success: result.success
                });
            }

            return new Response("Not Found", { 
                status: 404,
                headers: corsHeaders
            });
        } catch (error) {
            console.error("Worker error:", error);
            return jsonResponse(
                { error: "Internal server error" },
                { status: 500 }
            );
        }
    },
};