/**
 * OPENFINANCE-P3a — as CONTAS de uma conexão (admin AGROinBLUE ou gestor do cliente, PRONTO-NJ-01): 'conexoes' (as conexões como a Pluggy
 * as vê: banco, situação, frase), 'listar' (tipo · banco · 4 dígitos · titular mascarado; nunca
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

  /* OPENFINANCE-PRONTO-NJ-01 (8, Gabriel 15:36): CONECTA/ESCOLHE/LIGA = o admin AGROinBLUE ou o PROPRIETÁRIO (a mesma regra do
     openfinance-conectar); VÊ = também o gestor do cliente */
  const perfilDe = async (autor: string, clienteId: string): Promise<string | null> => {
    const { data: ehAdmin } = await admin.rpc("is_admin_agroinblue", { _user_id: autor });
    if (ehAdmin === true) return "admin";
    const { data: perfil } = await admin.rpc("get_user_perfil", { _user_id: autor, _cliente_id: clienteId });
    return typeof perfil === "string" ? perfil : null;
  };
  const podeConectar = async (autor: string, clienteId: string) => {
    const p = await perfilDe(autor, clienteId);
    return p === "admin" || p === "proprietario";
  };
  const podeVer = async (autor: string, clienteId: string) => {
    const p = await perfilDe(autor, clienteId);
    return p === "admin" || p === "proprietario" || p === "gestor_cliente";
  };

  /* P3b: 'ligar = a conta permitida → a conta do sistema (não fala com a Pluggy; a interna da 118140 confere) */
  if (corpo.acao === "ligar") {
    const l = await ligarConta({ token, clienteId: corpo.cliente_id, permitidaId: corpo.permitida_id, contaBancariaId: corpo.conta_bancaria_id, simular: corpo.simular }, {
      autorDoToken: async (t) => (await admin.auth.getUser(t)).data.user?.id ?? null,
      podeConectar,
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
    podeConectar,
    podeVer,
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
    /* (1)+(7): os itens que a Pluggy avisou com o clientUserId deste cliente (a tentativa que não completou entra), sem os desconectados */
    itensDoCliente: async (clienteId) => {
      const { data, error } = await admin.from("openfinance_eventos").select("evento, item_id, recebido_em")
        .eq("cliente_id", clienteId).not("item_id", "is", null).order("recebido_em", { ascending: false }).limit(2000);
      if (error) return null;
      const linhas: Array<{ evento: string; item_id: string }> = data ?? [];
      const fora = new Set(linhas.filter((l) => l.evento === "agroinblue/item_desconectado").map((l) => l.item_id));
      const ids: string[] = [];
      for (const l of linhas) if (l.evento.startsWith("item/") && !fora.has(l.item_id) && !ids.includes(l.item_id)) ids.push(l.item_id);
      return ids;
    },
    gravar: async (p) => {
      const { data, error } = await admin.rpc("_fn_openfinance_contas_gravar", p);
      if (error || !data || typeof data !== "object") return { ok: false, codigo: error?.code ?? null };
      return { ok: true, corpo: data };
    },
  });
  return json(r.status, r.corpo);
});
