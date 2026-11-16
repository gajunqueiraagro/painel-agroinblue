/**
 * NOTAS-RECEITA-A1-01 · F3.2 — a função de borda que BUSCA as notas do produtor na Receita (Distribuição DF-e, NFeDistribuicaoDFe 1.01).
 * Só liga as peças reais; a ordem, as recusas e o "uma chamada só" moram em `_shared/dfe/buscarDfe.ts` (provados no vitest).
 *  · POST JSON { titular_id, ambiente: "producao" | "homologacao", ensaio?: true } com o token do usuário OU a chave service_role;
 *  · o .pfx sai do bucket PRIVADO `fiscal-certificados` cifrado (AES-GCM, IV de 12 bytes na frente; chave `FISCAL_CERT_CHAVE_MESTRA`) e é
 *    aberto só na memória; a senha vem do Vault pela `fn_fiscal_dfe_credencial` (só service_role);
 *  · mTLS pelo `Deno.createHttpClient({ cert, key })` (provado no lote 3, badssl 200); 30 s de espera; o cliente fecha sempre.
 *  · ⚠ NÃO loga corpo, cabeçalho, senha, chave, .pfx nem XML. ⚠ O DEPLOY espera o lote; a 1ª chamada REAL, o "OK chamar" do Chat.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buscarDfe, type Pecas } from "../_shared/dfe/buscarDfe.ts";
import { abrirCredencial } from "../_shared/dfe/credencialA1.ts";
import { CONTENT_TYPE_DIST_DFE, URL_DIST_DFE } from "../_shared/dfe/distribuicaoDfe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "fiscal-certificados";
const ESPERA_MS = 30_000;

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const ehCliente = (x: unknown): x is Deno.HttpClient => !!x && typeof x === "object" && typeof Reflect.get(x, "close") === "function";
const texto = (x: unknown): string => (typeof x === "string" ? x : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { ok: false, recusa: "metodo", frase: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mestra = Deno.env.get("FISCAL_CERT_CHAVE_MESTRA");
  if (!url || !servico || !mestra) return json(500, { ok: false, recusa: "configuracao", frase: "A busca de notas ainda não está configurada." });
  const admin = createClient(url, servico, { auth: { persistSession: false } });
  const chave = await crypto.subtle.importKey("raw", base64ParaBytes(mestra), "AES-GCM", false, ["decrypt"]);

  let corpo: unknown = null;
  try { corpo = await req.json(); } catch { return json(400, { ok: false, recusa: "pedido", frase: "Pedido inválido." }); }
  const campo = (n: string) => (corpo && typeof corpo === "object" ? Reflect.get(corpo, n) : undefined);

  const pecas: Pecas = {
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
    abrirPedido: async (titularId) => {
      const { data, error } = await admin.rpc("fn_fiscal_dfe_pedido_abrir", { p_titular_id: titularId });
      if (error) throw new Error(error.message);
      if (Reflect.get(data, "pode") === true) return { pode: true, ultNsu: BigInt(String(Reflect.get(data, "ult_nsu") ?? 0)) };
      return { pode: false, motivo: texto(Reflect.get(data, "motivo")), ate: texto(Reflect.get(data, "ate")) || null };
    },
    fecharPedido: async (titularId, motivo, certificadoId, detalhe) => {
      const { error } = await admin.rpc("fn_fiscal_dfe_pedido_fechar",
        { p_titular_id: titularId, p_motivo: motivo, p_certificado_id: certificadoId, p_detalhe: detalhe });
      if (error) throw new Error(error.message);
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
    postarComCertificado: async (destino, par, envelope) => {
      const cliente: unknown = Deno.createHttpClient({ cert: par.cert, key: par.key });
      if (!ehCliente(cliente)) throw new Error("O cliente mTLS não foi criado.");
      try {
        const init: RequestInit & { client: Deno.HttpClient } = {
          method: "POST", body: envelope, headers: { "Content-Type": CONTENT_TYPE_DIST_DFE }, signal: AbortSignal.timeout(ESPERA_MS), client: cliente,
        };
        const r = await fetch(destino, init);
        return { status: r.status, corpo: await r.text() };
      } finally { cliente.close(); }
    },
    registrar: async (r) => {
      const { data, error } = await admin.rpc("fn_fiscal_dfe_registrar", {
        p_titular_id: r.titularId, p_cstat: r.cstat,
        p_ult_nsu: r.ultNsu === null ? null : r.ultNsu.toString(), p_max_nsu: r.maxNsu === null ? null : r.maxNsu.toString(),
        p_nao_antes_de: r.naoAntesDe,
        p_documentos: r.documentos.map((d) => ({ ...d, nsu: d.nsu.toString() })),
        p_eventos: r.eventos.map((e) => ({ ...e, nsu: e.nsu.toString() })),
        p_certificado_id: r.certificadoId, p_detalhe: r.detalhe,
      });
      if (error) throw new Error(error.message);
      return { novos: Number(Reflect.get(data, "novos") ?? 0), atualizados: Number(Reflect.get(data, "atualizados") ?? 0),
        eventos: Number(Reflect.get(data, "eventos") ?? 0) };
    },
    url: (ambiente) => URL_DIST_DFE[ambiente],
    agora: () => new Date(),
  };

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;
  try {
    const r = await buscarDfe({ token, titularId: texto(campo("titular_id")) || null, ambiente: campo("ambiente"), ensaio: campo("ensaio") }, pecas);
    return json(r.status, r.corpo);
  } catch {
    return json(500, { ok: false, recusa: "interno", frase: "A busca falhou no meio. Veja a trilha da busca antes de tentar de novo." });
  }
});
