/**
 * OPENFINANCE-PILOTO-01 · P2 — registra NA PLUGGY o webhook `all` com o cabeçalho secreto (a doc da Pluggy: os headers do webhook "só
 * pela API"; o painel deles não os põe). SÓ o admin AgroinBlue. Idempotente: a URL já registrada não é registrada de novo.
 * A URL é a do `openfinance-webhook` DESTE projeto. A resposta nunca leva o cabeçalho; nada é logado.
 * Secrets: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SEGREDO (o Gabriel cola no proto).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { chaveDaApi, registrarWebhook } from "../_shared/pluggy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { ok: false });
  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  const segredo = Deno.env.get("PLUGGY_WEBHOOK_SEGREDO");
  if (!url || !servico || !clientId || !clientSecret || !segredo) return json(503, { ok: false, frase: "Faltam os secrets do Open Finance no proto." });
  const admin = createClient(url, servico, { auth: { persistSession: false } });

  /* quem chama: o admin AgroinBlue logado, OU o botão "Test" do painel do Supabase com a chave service_role (quem a tem já pode tudo;
     é o caminho do passo a passo do Gabriel, sem colar chave em lugar nenhum) */
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const viaPainel = token !== "" && token === servico;
  const autor = !viaPainel && token ? (await admin.auth.getUser(token)).data.user?.id ?? null : null;
  if (!viaPainel) {
    if (!autor) return json(401, { ok: false, frase: "Entre de novo no sistema." });
    const { data: ehAdmin } = await admin.rpc("is_admin_agroinblue", { _user_id: autor });
    if (ehAdmin !== true) return json(403, { ok: false, frase: "Só a AgroinBlue registra o webhook." });
  }

  const chave = await chaveDaApi((u, init) => fetch(u, init), clientId, clientSecret);
  if (chave.ok === false) return json(chave.status, { ok: false, frase: chave.frase });
  const r = await registrarWebhook((u, init) => fetch(u, init), chave.valor, `${url}/functions/v1/openfinance-webhook`, segredo);
  if (r.ok === false) return json(r.status, { ok: false, frase: r.frase });
  await admin.rpc("_fn_openfinance_evento_registrar", { p: { origem: "agroinblue", evento: "agroinblue/webhook_registrado", autor } });
  return json(200, { ok: true, id: r.valor.id, ja_existia: r.valor.jaExistia });
});
