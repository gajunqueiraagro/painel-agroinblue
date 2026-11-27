/**
 * NOTAS-RECEITA-AGENDA-01 · F2 — a borda DESPACHANTE da busca da Receita (plano aprovado pelo Gabriel 27/11). Só o pg_cron a chama (job
 * `fiscal_dfe_agenda`, a cada 5 min, com a chave do servidor lida do Vault); qualquer outro token = 401.
 *  · pergunta ao banco quem está devido (`_fn_fiscal_dfe_devidos`: regra, sem lista fixa — todo titular com certificado ativo e válido);
 *  · chama a busca de sempre (`fiscal-dfe-buscar`, service_role) UM TITULAR POR VEZ: a espera de 1 h, o 656, o NSU, o registro e a ciência
 *    automática continuam lá, sem regra nova aqui;
 *  · pausa sozinha (cadeia/certificado até subir outro; "lambda: tempo" por 6 h) em `fiscal_dfe_pausa`;
 *  · responde 202 na hora e trabalha em segundo plano (`EdgeRuntime.waitUntil`): o pg_net não espera a Receita.
 *  · ⚠ NÃO loga corpo, chave, certificado nem XML: só contagens.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { rodadaDaAgenda, type DevidoDaAgenda } from "../_shared/dfe/agendaDfe.ts";

const ESPERA_DA_BUSCA_MS = 120_000;
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { ok: false });
  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !servico) return json(500, { ok: false, recusa: "configuracao" });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token !== servico) return json(401, { ok: false, recusa: "so_o_servidor" });
  const admin = createClient(url, servico, { auth: { persistSession: false } });

  const trabalho = rodadaDaAgenda({
    devidos: async (limite) => {
      const { data, error } = await admin.rpc("_fn_fiscal_dfe_devidos", { p_limite: limite });
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []).flatMap((x: unknown): DevidoDaAgenda[] => {
        const t = x && typeof x === "object" ? Reflect.get(x, "titular_id") : null;
        const c = x && typeof x === "object" ? Reflect.get(x, "cliente_id") : null;
        return typeof t === "string" && typeof c === "string" ? [{ titularId: t, clienteId: c, nuncaBuscou: Reflect.get(x as object, "nunca_buscou") === true }] : [];
      });
    },
    buscar: async (titularId) => {
      const r = await fetch(`${url}/functions/v1/fiscal-dfe-buscar`, {
        method: "POST", headers: { Authorization: `Bearer ${servico}`, apikey: servico, "Content-Type": "application/json" },
        body: JSON.stringify({ titular_id: titularId, ambiente: "producao" }), signal: AbortSignal.timeout(ESPERA_DA_BUSCA_MS),
      });
      const lido: unknown = await r.json().catch(() => ({}));
      return { status: r.status, corpo: lido && typeof lido === "object" ? Object.fromEntries(Object.entries(lido)) : {} };
    },
    pausar: async (d, motivo, ate, detalhe) => {
      const { error } = await admin.from("fiscal_dfe_pausa").upsert({ titular_id: d.titularId, cliente_id: d.clienteId, motivo, ate, detalhe, desde: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    agoraMs: () => Date.now(),
  }).then((r) => {
    console.log(JSON.stringify({ agenda: "rodada", devidos: r.devidos, buscados: r.buscados.length, deixados: r.deixados, erro: r.erro,
      cstats: r.buscados.map((b) => b.cstat ?? b.recusa ?? String(b.status)), pausas: r.buscados.filter((b) => b.pausa).length }));
    return r;
  }).catch(() => { console.log(JSON.stringify({ agenda: "rodada", erro: "interno" })); });

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(trabalho);
    return json(202, { ok: true, aceito: true });
  }
  return json(200, { ok: true, rodada: await trabalho });
});
