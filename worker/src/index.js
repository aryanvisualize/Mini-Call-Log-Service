export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return Response.json({
                status: "ok",
            });
        }

        return new Response("Vaami Mini Call Log API");
    },
};
