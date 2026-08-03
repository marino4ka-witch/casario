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

// Проверка подписи Telegram WebApp initData (HMAC-SHA256 по токену бота).
// Возвращает объект пользователя { id, username, ... } или null, если подпись неверна.
async function verifyInitData(initData: string): Promise<Record<string, unknown> | null> {
  try {
    if (!initData) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dataCheck = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const enc = new TextEncoder();
    // secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    const kSecret = await crypto.subtle.importKey(
      "raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const secret = await crypto.subtle.sign("HMAC", kSecret, enc.encode(BOT_TOKEN));
    // hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
    const kData = await crypto.subtle.importKey(
      "raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", kData, enc.encode(dataCheck));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== hash) return null;
    const userStr = params.get("user");
    return userStr ? JSON.parse(userStr) : {};
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!BOT_TOKEN) return json({ error: "TELEGRAM_BOT_TOKEN not set" }, 500);

    const { sku, title, usd, initData } = await req.json();

    // Если initData передан — обязана быть валидной (защита от подделки).
    let uid: number | null = null;
    if (initData) {
      const user = await verifyInitData(String(initData));
      if (!user) return json({ error: "invalid initData" }, 401);
      uid = typeof user.id === "number" ? user.id : null;
    }

    const stars = Math.max(1, Math.round(Number(usd || 0) * STARS_PER_USD));

    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(title || "Casario").slice(0, 32),
          description: `Casario · ${sku || "purchase"}`.slice(0, 255),
          // payload вернётся в successful_payment → по нему вебхук выдаёт доступ
          payload: JSON.stringify({ sku, uid }),
          provider_token: "", // Stars → пустой provider_token
          currency: "XTR", // XTR = Telegram Stars
          prices: [{ label: String(title || "Casario").slice(0, 32), amount: stars }],
        }),
      },
    );
    const data = await res.json();
    if (!data.ok) return json({ error: data.description || "telegram error" }, 400);
    return json({ link: data.result, stars });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
