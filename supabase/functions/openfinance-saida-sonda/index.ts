/**
 * OF-IP-FIXO-01 · a SONDA da saída com IP fixo (Gabriel 27/11): só o admin AGROinBLUE. Manda UM pedido assinado (OF_SAIDA_HMAC) para a
 * Lambda (OF_SAIDA_URL) num caminho que NUNCA é permitido e devolve só `{ ok, resultado, frase }` — "caminho" = a volta inteira de pé.
 * Não lê o segredo do provedor, não chama a TecnoSpeed, não grava nada. Só liga as peças; a regra mora em `_shared/of/clienteSaida.ts`
 * (`sondarSaida`, provada no vitest). ⚠ Não loga corpo, cabeçalho, URL nem segredo. Secrets: OF_SAIDA_URL, OF_SAIDA_HMAC.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { configuracaoDaSaida, sondarSaida } from "../_shared/of/clienteSaida.ts";

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
  if (!url || !servico) return json(503, { ok: false, frase: "O Supabase deste ambiente não está configurado." });
  const admin = createClient(url, servico, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;

  const r = await sondarSaida({
    token,
    autorDoToken: async (t) => (await admin.auth.getUser(t)).data.user?.id ?? null,
    ehAdmin: async (autor) => (await admin.rpc("is_admin_agroinblue", { _user_id: autor })).data === true,
    config: configuracaoDaSaida({ url: Deno.env.get("OF_SAIDA_URL"), hmac: Deno.env.get("OF_SAIDA_HMAC") }),
    busca: async (u, init) => {
      const resp = await fetch(u, { ...init, signal: AbortSignal.timeout(20_000) });
      return { status: resp.status, header: (n) => resp.headers.get(n), texto: () => resp.text() };
    },
    agoraSegundos: () => Math.floor(Date.now() / 1000),
  });
  console.log(JSON.stringify({ sonda: r.corpo.resultado }));
  return json(r.status, r.corpo);
});
