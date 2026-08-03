// Casario · Telegram webhook — подтверждение оплаты Stars ⭐
//
// Обрабатывает два апдейта от Telegram:
//   1) pre_checkout_query  → отвечаем ok:true (иначе оплата не пройдёт)
//   2) successful_payment  → пишем покупку в таблицу purchases (источник правды)
//
// Секреты:
//   supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC...
//   supabase secrets set TG_WEBHOOK_SECRET=<любая-строка>   # тот же secret_token, что в setWebhook
//   (SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY доступны автоматически)
//
// Деплой:
//   supabase functions deploy tg-webhook --no-verify-jwt
//
// Регистрация вебхука в Telegram (один раз):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<ref>.functions.supabase.co/tg-webhook&secret_token=<TG_WEBHOOK_SECRET>&allowed_updates=[\"pre_checkout_query\",\"message\"]"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const WH_SECRET = Deno.env.get("TG_WEBHOOK_SECRET") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function tg(method: string, body: unknown) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => null);
}

Deno.serve(async (req: Request) => {
  // Проверка секретного токена вебхука (Telegram шлёт его в заголовке).
  if (WH_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== WH_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return new Response("ok"); // всегда 200, чтобы Telegram не ретраил вечно

  try {
    // 1) Обязательный ответ на pre-checkout в течение 10 сек
    if (update.pre_checkout_query) {
      await tg("answerPreCheckoutQuery", {
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true,
      });
      return new Response("ok");
    }

    // 2) Успешная оплата → фиксируем покупку
    const sp = update.message?.successful_payment;
    if (sp) {
      const from = update.message.from || {};
      let sku = "";
      try { sku = JSON.parse(sp.invoice_payload || "{}").sku || ""; } catch { /* ignore */ }

      if (SB_URL && SB_SERVICE) {
        const sb = createClient(SB_URL, SB_SERVICE);
        await sb.from("purchases").insert({
          tg_user_id: from.id ?? null,
          tg_username: from.username ?? null,
          sku,
          stars: sp.total_amount ?? null,
          charge_id: sp.telegram_payment_charge_id ?? null,
          payload: sp.invoice_payload ?? null,
        });
      }

      await tg("sendMessage", {
        chat_id: update.message.chat.id,
        text: "✅ Оплата получена! Доступ открыт. Спасибо, что выбрали Casario 🏠",
      });
    }
  } catch (_e) {
    // намеренно проглатываем — Telegram должен получить 200
  }

  return new Response("ok");
});
