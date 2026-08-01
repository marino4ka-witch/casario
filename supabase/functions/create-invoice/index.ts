// Casario · Telegram Stars ⭐ — создание ссылки на оплату (createInvoiceLink)
//
// Секреты (НЕ коммитить, задать в проекте):
//   supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC...
//   supabase secrets set STARS_PER_USD=60        # необязательно; сколько ⭐ за $1
//
// Деплой:
//   supabase functions deploy create-invoice --no-verify-jwt
//
// Клиент вызывает: CB.SB.functions.invoke('create-invoice', { body: {sku,title,usd,initData} })
// и получает { link } → Telegram.WebApp.openInvoice(link).

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const STARS_PER_USD = Number(Deno.env.get("STARS_PER_USD") || "60");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!BOT_TOKEN) return json({ error: "TELEGRAM_BOT_TOKEN not set" }, 500);

    const { sku, title, usd } = await req.json();
    const stars = Math.max(1, Math.round(Number(usd || 0) * STARS_PER_USD));

    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(title || "Casario").slice(0, 32),
          description: `Casario · ${sku || "purchase"}`.slice(0, 255),
          payload: JSON.stringify({ sku, usd, ts: Date.now() }),
          provider_token: "", // Stars → пустой provider_token
          currency: "XTR", // XTR = Telegram Stars
          prices: [{ label: String(title || "Casario").slice(0, 32), amount: stars }],
        }),
      },
    );
    const data = await res.json();
    if (!data.ok) return json({ error: data.description || "telegram error" }, 400);
    return json({ link: data.result });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
