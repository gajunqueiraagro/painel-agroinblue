/**
 * NOTAS-RECEITA · CIÊNCIA DA OPERAÇÃO (210210) — a função de borda que envia o evento à Receita (NFeRecepcaoEvento4, Ambiente Nacional).
 * Só liga as peças reais; a ordem e as recusas moram em `_shared/dfe/cienciaDfe.ts` (provadas no vitest). Desenho da Lambda v2 aprovado
 * pelo Gabriel 18/11 (FASE 0 09:14): o POST sai pela Lambda `agro-dfe-mtls`, que só aceita o envEvento 210210 (a forma inteira, ancorada).
 *  · POST JSON { titular_id, ambiente: "producao" | "homologacao", chave: "<44 dígitos>", ensaio?: true, via?: "automatica" (só service_role) };
 *  · o certificado sai do cofre como na busca (`fiscal-dfe-buscar`): bucket privado cifrado + senha do Vault, aberto só na memória;
 *  · a trilha de TODO envio (aceito ou recusado) vai para `fiscal_dfe_eventos` pela `fn_fiscal_dfe_evento_registrar` (só service_role).
 *  · ⚠ NÃO loga corpo, cabeçalho, senha, chave, .pfx nem XML. ⚠ O DEPLOY espera o lote; a 1ª chamada REAL, o teste combinado (Vera).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { abrirCredencial } from "../_shared/dfe/credencialA1.ts";
import { cienciaDfe, type PecasCiencia } from "../_shared/dfe/cienciaDfe.ts";
import { importarPublica, lerRespostaLambda, montarPedidoLambda } from "../_shared/dfe/clienteLambda.ts";
import { CAB } from "../_shared/dfe/protocoloLambda.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "fiscal-certificados";
const ESPERA_MS = 40_000;

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const texto = (x: unknown): string => (typeof x === "string" ? x : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { ok: false, recusa: "metodo", frase: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mestra = Deno.env.get("FISCAL_CERT_CHAVE_MESTRA");
  const lambdaUrl = Deno.env.get("FISCAL_DFE_LAMBDA_URL");
  const lambdaHmac = Deno.env.get("FISCAL_DFE_LAMBDA_HMAC");
  const lambdaPublica = Deno.env.get("FISCAL_DFE_LAMBDA_PUBLICA");
  if (!url || !servico || !mestra) return json(500, { ok: false, recusa: "configuracao", frase: "A ciência ainda não está configurada." });
  const admin = createClient(url, servico, { auth: { persistSession: false } });
  const chave = await crypto.subtle.importKey("raw", base64ParaBytes(mestra), "AES-GCM", false, ["decrypt"]);

  let corpo: unknown = null;
  try { corpo = await req.json(); } catch { return json(400, { ok: false, recusa: "pedido", frase: "Pedido inválido." }); }
  const campo = (n: string) => (corpo && typeof corpo === "object" ? Reflect.get(corpo, n) : undefined);
  if (campo("ensaio") !== true && (!lambdaUrl || !lambdaHmac || !lambdaPublica)) {
    return json(500, { ok: false, recusa: "configuracao", frase: "A ciência ainda não está configurada (a Lambda). Nada foi enviado à Receita." });
  }

  const pecas: PecasCiencia = {
    ehServico: (token) => token === servico,
    autorDoToken: async (token) => (await admin.auth.getUser(token)).data.user?.id ?? null,
    lerTitular: async (id) => {
      const { data } = await admin.from("fiscal_titulares").select("id, cliente_id").eq("id", id).maybeSingle();
      return data ?? null;
    },
    podeBuscar: async (autor, clienteId) => {
      const { data: ehAdmin } = await admin.rpc("is_admin_agroinblue", { _user_id: autor });
      if (ehAdmin === true) return true;
      const { data: perfil } = await admin.rpc("get_user_perfil", { _user_id: autor, _cliente_id: clienteId });
      return perfil === "gestor_cliente";
    },
    lerCredencial: async (titularId) => {
      const { data, error } = await admin.rpc("fn_fiscal_dfe_credencial", { p_titular_id: titularId });
      if (error) throw new Error(error.message);
      return { certificadoId: texto(Reflect.get(data, "certificado_id")), documento: texto(Reflect.get(data, "documento")),
        uf: texto(Reflect.get(data, "uf")) || null, objeto: texto(Reflect.get(data, "objeto")), senha: texto(Reflect.get(data, "senha")),
        impressaoDigital: texto(Reflect.get(data, "impressao_digital")) };
    },
    baixarEDecifrar: async (objeto) => {
      const { data, error } = await admin.storage.from(BUCKET).download(objeto);
      if (error || !data) throw new Error("Não consegui ler o certificado cifrado do cofre.");
      const tudo = new Uint8Array(await data.arrayBuffer());
      return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: tudo.subarray(0, 12) }, chave, tudo.subarray(12)));
    },
    abrirCredencial: (bytes, senha, esperado) => abrirCredencial(bytes, senha, esperado),
    postarEvento: async (ambiente, par, envelope) => {
      if (!lambdaUrl || !lambdaHmac || !lambdaPublica) throw new Error("Lambda mTLS sem configuração");
      /* o destino NÃO vai no pedido: a Lambda v2 escolhe a Recepção de Evento pela forma do envelope */
      const pedido = await montarPedidoLambda({ ambiente, envelope, par, segredo: lambdaHmac, publica: await importarPublica(lambdaPublica),
        agoraSegundos: Math.floor(Date.now() / 1000) });
      const r = await fetch(lambdaUrl, { method: "POST", headers: pedido.headers, body: pedido.corpo, signal: AbortSignal.timeout(ESPERA_MS) });
      return await lerRespostaLambda({ status: r.status, tempo: r.headers.get(CAB.tempo), assinatura: r.headers.get(CAB.assinatura),
        corpo: await r.text(), nonce: pedido.nonce, segredo: lambdaHmac, agoraSegundos: Math.floor(Date.now() / 1000) });
    },
    registrarEvento: async (r) => {
      const { data, error } = await admin.rpc("fn_fiscal_dfe_evento_registrar", {
        p_titular_id: r.titularId, p_chave: r.chave, p_ambiente: r.ambiente, p_cstat_lote: r.cStatLote, p_cstat: r.cStat,
        p_x_motivo: r.xMotivo, p_n_prot: r.nProt, p_dh_registro: r.dhRegistro, p_falha: r.falha, p_via: r.via, p_autor: r.autor,
        p_certificado_id: r.certificadoId || null, p_bruto: r.bruto,
      });
      if (error) throw new Error(error.message);
      return { id: Number(Reflect.get(data, "id") ?? 0), com_ciencia: Reflect.get(data, "com_ciencia") === true };
    },
    agora: () => new Date(),
  };

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;
  try {
    const r = await cienciaDfe({ token, titularId: texto(campo("titular_id")) || null, ambiente: campo("ambiente"), chave: campo("chave"),
      ensaio: campo("ensaio"), via: campo("via") }, pecas);
    return json(r.status, r.corpo);
  } catch {
    return json(500, { ok: false, recusa: "interno", frase: "A ciência falhou no meio. Veja a trilha do evento antes de tentar de novo." });
  }
});
