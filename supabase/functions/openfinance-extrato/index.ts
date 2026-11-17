/**
 * OPENFINANCE-P3b — o EXTRATO da conta permitida (só o admin AgroinBlue no piloto): 'buscar' (desde o corte, grava o saldo do banco) e
 * 'conferir' (só leitura, período já coberto pelo extrato). Só liga as peças; a ordem mora em `_shared/pluggy.ts` (`extrato`, provada
 * no vitest). Não grava extrato: a tela grava pela porta de sempre, depois da prévia.
 * ⚠ Não loga corpo, cabeçalho, chave, token, transação nem saldo. Secrets: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { extrato } from "../_shared/pluggy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const HOJE_EM_BRASILIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

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

  const r = await extrato({
    token, acao: corpo.acao, clienteId: corpo.cliente_id, contaBancariaId: corpo.conta_bancaria_id, de: corpo.de, ate: corpo.ate,
    hoje: HOJE_EM_BRASILIA.format(new Date()),
  }, {
    autorDoToken: async (t) => (await admin.auth.getUser(t)).data.user?.id ?? null,
    ehAdmin: async (autor) => (await admin.rpc("is_admin_agroinblue", { _user_id: autor })).data === true,
    credenciais: () => {
      const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
      const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
      return clientId && clientSecret ? { clientId, clientSecret } : null;
    },
    busca: (u, init) => fetch(u, init),
    permitidaDaConta: async (clienteId, contaId) => {
      const { data, error } = await admin.from("openfinance_contas_permitidas").select("item_id, account_id")
        .eq("cliente_id", clienteId).eq("conta_bancaria_id", contaId).eq("ativo", true).eq("tipo", "BANK").limit(2);
      if (error) return "erro";
      return data && data.length === 1 ? data[0] : null;
    },
    ultimoDiaDoExtrato: async (contaId) => {
      const { data, error } = await admin.from("extrato_bancario_v2").select("data_movimento")
        .eq("conta_bancaria_id", contaId).is("cancelado_em", null).order("data_movimento", { ascending: false }).limit(1);
      if (error) return "erro";
      return data && data.length > 0 ? String(data[0].data_movimento).slice(0, 10) : null;
    },
    registrarSaldo: async (p) => {
      const { data, error } = await admin.rpc("_fn_openfinance_saldo_registrar", p);
      return !error && !!data;
    },
  });
  return json(r.status, r.corpo);
});
