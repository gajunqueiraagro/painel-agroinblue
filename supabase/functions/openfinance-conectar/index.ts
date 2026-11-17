/**
 * OPENFINANCE-PILOTO-01 · P2 — o connect token (30 min) para o Widget da Pluggy. Usuário logado: admin AGROinBLUE ou gestor do cliente.
 * Só liga as peças; a ordem (quem → cliente → pode → configuração → Pluggy → trilha) mora em `_shared/pluggy.ts` (`conectar`).
 * A API key nasce e morre aqui; à tela vai só o `accessToken` de 30 min. ⚠ Não loga corpo, cabeçalho, chave nem token.
 * Secrets: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET (o Gabriel cola no proto).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { conectar } from "../_shared/pluggy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { ok: false, frase: "Use o botão Conectar banco." });
  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !servico) return json(503, { ok: false, frase: "O Open Finance ainda não está configurado neste ambiente." });
  const admin = createClient(url, servico, { auth: { persistSession: false } });

  let corpo: Record<string, unknown> = {};
  try { const c = await req.json(); if (c && typeof c === "object") corpo = c; } catch { corpo = {}; }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;

  const r = await conectar({ token, clienteId: corpo.cliente_id }, {
    autorDoToken: async (t) => (await admin.auth.getUser(t)).data.user?.id ?? null,
    podeConectar: async (autor, clienteId) => {
      const { data: ehAdmin } = await admin.rpc("is_admin_agroinblue", { _user_id: autor });
      if (ehAdmin === true) return true;
      const { data: perfil } = await admin.rpc("get_user_perfil", { _user_id: autor, _cliente_id: clienteId });
      return perfil === "gestor_cliente";
    },
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
