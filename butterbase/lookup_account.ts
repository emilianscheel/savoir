export default async function handler(req: Request, ctx: { db: any }) {
    const { email } = await req.json();
    const { rows } = await ctx.db.query(
        "SELECT id, plan, status FROM accounts WHERE email = $1 LIMIT 1",
        [email],
    );
    return Response.json(rows[0] ?? { error: "not_found" });
}
