/**
 * OPENFINANCE-P3a — as CONTAS de uma conexão (só o admin AGROinBLUE): 'listar' (tipo · banco · 4 dígitos · titular mascarado; nunca
 * saldo nem transação) e 'permitir' (grava SÓ as marcadas em openfinance_contas_permitidas, 118130). Só liga as peças; a ordem mora em
 * `_shared/pluggy.ts` (`contas`, provada no vitest).
 * ⚠ Não loga corpo, cabeçalho, chave nem token. Secrets: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { contas, ligarConta } from "../_shared/pluggy.ts";

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

  /* P3b: 'ligar' = a conta permitida → a conta do sistema (não fala com a Pluggy; a interna da 118140 confere) */
  if (corpo.acao === "ligar") {
    const l = await ligarConta({ token, clienteId: corpo.cliente_id, permitidaId: corpo.permitida_id, contaBancariaId: corpo.conta_bancaria_id, simular: corpo.simular }, {
      autorDoToken: async (t) => (await admin.auth.getUser(t)).data.user?.id ?? null,
      ehAdmin: async (autor) => (await admin.rpc("is_admin_agroinblue", { _user_id: autor })).data === true,
      ligar: async (p) => {
        const { data, error } = await admin.rpc("_fn_openfinance_conta_ligar_sistema", p);
        if (error || !data || typeof data !== "object") return { ok: false, codigo: error?.code ?? null };
        return { ok: true, corpo: data };
      },
    });
    return json(l.status, l.corpo);
  }

  const r = await contas({ token, acao: corpo.acao, clienteId: corpo.cliente_id, itemId: corpo.item_id, accountIds: corpo.account_ids, simular: corpo.simular }, {
    autorDoToken: async (t) => (await admin.auth.getUser(t)).data.user?.id ?? null,
    ehAdmin: async (autor) => (await admin.rpc("is_admin_agroinblue", { _user_id: autor })).data === true,
    credenciais: () => {
      const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
      const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
      return clientId && clientSecret ? { clientId, clientSecret } : null;
    },
    busca: (u, init) => fetch(u, init),
    permitidasDoItem: async (itemId) => {
      const { data, error } = await admin.from("openfinance_contas_permitidas").select("account_id").eq("item_id", itemId).eq("ativo", true);
      return error ? null : (data ?? []).map((l: { account_id: string }) => l.account_id);
    },
    gravar: async (p) => {
      const { data, error } = await admin.rpc("_fn_openfinance_contas_gravar", p);
      if (error || !data || typeof data !== "object") return { ok: false, codigo: error?.code ?? null };
      return { ok: true, corpo: data };
    },
  });
  return json(r.status, r.corpo);
});
