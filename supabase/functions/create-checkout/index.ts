// Casario · Stripe 💳 — создание Checkout-сессии
//
// Секреты (НЕ коммитить):
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...   (или sk_test_... для теста)
//
// Деплой:
//   supabase functions deploy create-checkout --no-verify-jwt
//
// Клиент вызывает: CB.SB.functions.invoke('create-checkout', { body: {sku,title,usd,success_url,cancel_url} })
// и получает { url } → редиректим пользователя на Stripe Checkout.
// PRO (sku='pro') оформляется как подписка (subscription), остальное — разовый платёж.
//
// ⚠️ Для продакшена подтверждай оплату через Stripe webhook (checkout.session.completed)
//    и выдавай доступ по данным из БД, а не только по возврату ?paid= на клиенте.

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") || "";

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
    if (!STRIPE_SECRET) return json({ error: "STRIPE_SECRET_KEY not set" }, 500);

    const { sku, title, usd, success_url, cancel_url } = await req.json();
    const isSub = sku === "pro";
    const cents = Math.max(50, Math.round(Number(usd || 0) * 100)); // Stripe min ~$0.50

    const p = new URLSearchParams();
    p.set("mode", isSub ? "subscription" : "payment");
    p.set("success_url", String(success_url || ""));
    p.set("cancel_url", String(cancel_url || ""));
    p.set("line_items[0][quantity]", "1");
    p.set("line_items[0][price_data][currency]", "usd");
    p.set("line_items[0][price_data][unit_amount]", String(cents));
    p.set("line_items[0][price_data][product_data][name]", String(title || "Casario"));
    if (isSub) p.set("line_items[0][price_data][recurring][interval]", "month");

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: p,
    });
    const data = await res.json();
    if (data.error) return json({ error: data.error.message || "stripe error" }, 400);
    return json({ url: data.url });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
