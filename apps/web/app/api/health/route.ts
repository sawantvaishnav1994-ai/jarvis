export const dynamic = "force-dynamic";
export async function GET() {
    return Response.json(
        {
            service: "web",
            status: "ok",
            version: "0.3.0",
            environment: "development",
            checks: { process: true },
        },
        { headers: { "cache-control": "no-store" } },
    );
}
