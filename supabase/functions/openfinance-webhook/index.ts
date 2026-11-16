/**
 * OPENFINANCE-PILOTO-01 · P2 — o webhook da Pluggy (PÚBLICO: `verify_jwt = false` no config.toml; a Pluggy não tem JWT do Supabase).
 * Só liga as peças; a ordem (segredo → corpo → clientId → fila) mora em `_shared/pluggy.ts` (`receberAviso`, provada no vitest).
 * Grava SÓ O AVISO na `openfinance_eventos` pela interna `_fn_openfinance_evento_registrar` (118120); NÃO grava transação.
 * ⚠ Não loga corpo, cabeçalho nem segredo. Secrets: PLUGGY_WEBHOOK_SEGREDO, PLUGGY_CLIENT_ID (o Gabriel cola no proto).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { CABECALHO_SEGREDO, receberAviso } from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let corpo: unknown = null;
  try { corpo = await req.json(); } catch { corpo = null; }
  const r = await receberAviso({
    segredo: url && servico ? Deno.env.get("PLUGGY_WEBHOOK_SEGREDO") : null,
    segredoRecebido: req.headers.get(CABECALHO_SEGREDO),
    clientIdEsperado: Deno.env.get("PLUGGY_CLIENT_ID"),
    corpo,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    registrar: async (aviso) => {
      const admin = createClient(url!, servico!, { auth: { persistSession: false } });
      const { error } = await admin.rpc("_fn_openfinance_evento_registrar", { p: aviso });
      return !error;
    },
  });
  return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json" } });
});
