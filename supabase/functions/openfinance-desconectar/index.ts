/**
 * OPENFINANCE-SEG-01 (b)+(c) — DESCONECTAR um banco: só o admin AgroinBlue. Confere na Pluggy que o item é DESTE cliente (o `clientUserId`
 * que o nosso connect token gravou), apaga o item (`DELETE /items/{id}`: o consentimento cai) e registra `agroinblue/item_desconectado`
 * na fila. Extratos já importados ficam. Só liga as peças; a ordem mora em `_shared/pluggy.ts` (`desconectar`, provada no vitest).
 * ⚠ Não loga corpo, cabeçalho, chave nem token. Secrets: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { desconectar } from "../_shared/pluggy.ts";

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
  if (!url || !servico) return json(503, { ok: false, frase: "O Open Finance ainda não está configurado neste ambiente." });
  const admin = createClient(url, servico, { auth: { persistSession: false } });

  let corpo: Record<string, unknown> = {};
  try { const c = await req.json(); if (c && typeof c === "object") corpo = c; } catch { corpo = {}; }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;

  const r = await desconectar({ token, clienteId: corpo.cliente_id, itemId: corpo.item_id }, {
    autorDoToken: async (t) => (await admin.auth.getUser(t)).data.user?.id ?? null,
    ehAdmin: async (autor) => (await admin.rpc("is_admin_agroinblue", { _user_id: autor })).data === true,
    credenciais: () => {
      const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
      const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
      return clientId && clientSecret ? { clientId, clientSecret } : null;
    },
    busca: (u, init) => fetch(u, init),
    registrar: async (a) => !(await admin.rpc("_fn_openfinance_evento_registrar", { p: a })).error,
  });
  return json(r.status, r.corpo);
});
