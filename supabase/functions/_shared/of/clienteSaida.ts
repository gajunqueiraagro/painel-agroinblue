/**
 * OF-IP-FIXO-01 · o lado da BORDA da saída com IP fixo (a Lambda `agro-of-saida`). PREPARADO, NÃO LIGADO: nenhuma função do Open Finance
 * o chama ainda; o caminho de hoje (a Pluggy direto da borda) segue igual enquanto `OF_PROVEDOR` não disser "tecnospeed".
 *  · o pedido vai assinado (HMAC + relógio + nonce, o protocolo da `agro-dfe-mtls`); só método, caminho e corpo — nunca o host nem o token;
 *  · a resposta só vale se vier assinada com o MESMO nonce; qualquer falha LANÇA `FalhaDaSaida` (a tela diz "Não consegui falar com o banco").
 */
import { CAB, deB64, hmacHex, iguaisHex, JANELA_S, textoDaResposta, textoDoPedido } from '../dfe/protocoloLambda.ts';
import { type MetodoSaida, type PedidoSaida, type RespostaSaida, VERSAO_SAIDA } from './protocoloSaida.ts';

/** qual caminho o Open Finance usa: "pluggy" (o de hoje, a borda chama a Pluggy) ou "tecnospeed" (pela Lambda com IP fixo).
 *  Qualquer outro valor, ou vazio = "pluggy" — a volta atrás é trocar o segredo, sem deploy. */
export type ProvedorDoOF = 'pluggy' | 'tecnospeed';
export const provedorDoOF = (v: string | undefined | null): ProvedorDoOF => ((v ?? '').trim().toLowerCase() === 'tecnospeed' ? 'tecnospeed' : 'pluggy');

/** a configuração da saída (segredos do Supabase OF_SAIDA_URL e OF_SAIDA_HMAC); faltando qualquer um = nulo (a função recusa "configuracao") */
export function configuracaoDaSaida(env: { url?: string | null; hmac?: string | null }): { url: string; segredo: string } | null {
  const url = (env.url ?? '').trim(); const segredo = (env.hmac ?? '').trim();
  if (!/^https:\/\/[a-z0-9.-]+\.lambda-url\.sa-east-1\.on\.aws\/?$/.test(url) || segredo.length < 32) return null;
  return { url: url.endsWith('/') ? url : `${url}/`, segredo };
}

const hexDe = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export interface PedidoAssinado { corpo: string; headers: Record<string, string>; nonce: string }

export async function montarPedidoSaida(o: { metodo: MetodoSaida; caminho: string; corpo?: string; segredo: string; agoraSegundos: number }): Promise<PedidoAssinado> {
  const nonce = hexDe(crypto.getRandomValues(new Uint8Array(16)));
  const p: PedidoSaida = { v: VERSAO_SAIDA, metodo: o.metodo, caminho: o.caminho, ...(o.corpo !== undefined ? { corpo: o.corpo } : {}) };
  const corpo = JSON.stringify(p);
  const tempo = String(o.agoraSegundos);
  const assinatura = await hmacHex(o.segredo, await textoDoPedido(tempo, nonce, corpo));
  return { corpo, nonce, headers: { 'Content-Type': 'application/json', [CAB.tempo]: tempo, [CAB.nonce]: nonce, [CAB.assinatura]: assinatura } };
}

export class FalhaDaSaida extends Error {
  constructor(public falha: string) { super(`saida: ${falha}`); this.name = 'FalhaDaSaida'; }
}

/** confere a resposta da Lambda e devolve a do provedor (status + texto); lança `FalhaDaSaida` em tudo o que não for assinado e bom */
export async function lerRespostaSaida(o: {
  status: number; tempo: string | null; assinatura: string | null; corpo: string; nonce: string; segredo: string; agoraSegundos: number;
}): Promise<{ status: number; corpo: string }> {
  if (!o.tempo || !o.assinatura || !/^\d{1,12}$/.test(o.tempo)) throw new FalhaDaSaida(o.status === 401 ? 'nao_autorizado' : `sem_assinatura_${o.status}`);
  const esperada = await hmacHex(o.segredo, await textoDaResposta(o.nonce, o.tempo, o.corpo));
  if (!iguaisHex(esperada, o.assinatura)) throw new FalhaDaSaida('assinatura_da_resposta');
  if (Math.abs(o.agoraSegundos - Number(o.tempo)) > JANELA_S * 2) throw new FalhaDaSaida('relogio_da_resposta');
  let r: RespostaSaida;
  try { r = JSON.parse(o.corpo); } catch { throw new FalhaDaSaida('resposta_ilegivel'); }
  if (!r || r.ok !== true) throw new FalhaDaSaida(r && r.ok === false && typeof r.falha === 'string' ? r.falha : 'resposta_ilegivel');
  if (!Number.isInteger(r.http) || typeof r.corpo !== 'string') throw new FalhaDaSaida('resposta_ilegivel');
  return { status: r.http, corpo: new TextDecoder().decode(deB64(r.corpo)) };
}

/** a volta inteira: assina, chama a Lambda (a `busca` é injetada: teste sem rede) e confere a resposta */
export async function chamarPelaSaida(o: { config: { url: string; segredo: string }; metodo: MetodoSaida; caminho: string; corpo?: string;
  busca: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; header: (n: string) => string | null; texto: () => Promise<string> }>;
  agoraSegundos: () => number }): Promise<{ status: number; corpo: string }> {
  const p = await montarPedidoSaida({ metodo: o.metodo, caminho: o.caminho, corpo: o.corpo, segredo: o.config.segredo, agoraSegundos: o.agoraSegundos() });
  let r;
  try { r = await o.busca(o.config.url, { method: 'POST', headers: p.headers, body: p.corpo }); } catch { throw new FalhaDaSaida('conexao'); }
  return lerRespostaSaida({ status: r.status, tempo: r.header(CAB.tempo), assinatura: r.header(CAB.assinatura), corpo: await r.texto(),
    nonce: p.nonce, segredo: o.config.segredo, agoraSegundos: o.agoraSegundos() });
}

/* ─── a SONDA (OF-IP-FIXO-01, Gabriel 27/11): a volta inteira SEM provedor — um pedido ASSINADO para um caminho que nunca é permitido.
 * A Lambda só recusa "caminho" (resposta ASSINADA) depois de: ler o HMAC do cofre pelo endpoint privado, conferir a assinatura, gravar o
 * nonce (DynamoDB pelo caminho privado). Logo "caminho" = OF_SAIDA_URL + OF_SAIDA_HMAC certos e a pilha inteira de pé. Só o admin;
 * devolve SÓ o resultado e a frase (nunca o segredo, a URL ou o corpo). Não lê o segredo do provedor nem chama a TecnoSpeed. */
export const CAMINHO_DA_SONDA = '/agro-sonda-fechada';

const FRASE_DA_SONDA: Record<string, string> = {
  caminho: 'A volta inteira funcionou: a Lambda conferiu a assinatura, leu o cofre pelo endpoint privado e recusou o caminho fechado (assinado).',
  caminho_aberto: 'ATENÇÃO: o caminho de teste PASSOU — os CaminhosPermitidos da pilha não estão vazios. Não ligue o OF_PROVEDOR; me mande o print dos parâmetros.',
  configuracao_supabase: 'Faltam os segredos OF_SAIDA_URL e/ou OF_SAIDA_HMAC no Supabase (ou a URL não é a da Lambda em sa-east-1, ou o HMAC está curto).',
  nao_autorizado: 'A Lambda recusou a assinatura: o OF_SAIDA_HMAC não é exatamente o valor de agro-of-saida/hmac (confira espaço ou quebra de linha ao colar).',
  sem_assinatura_500: 'A Lambda falhou por dentro (provável leitura do cofre ou da tabela do nonce): mande o print do CloudWatch › /aws/lambda/agro-of-saida.',
  sem_assinatura_503: 'A Lambda ainda está sem o código: falta enviar o of-saida.zip (Lambda › Código › Carregar de › arquivo .zip).',
  sem_assinatura_403: 'O endereço respondeu "Forbidden": falta uma das 2 permissões do endereço (Configuração › Permissões). Mande o print.',
  conexao: 'Não consegui falar com o endereço da Lambda: confira o OF_SAIDA_URL (o EnderecoDaFuncao das Saídas da pilha).',
  assinatura_da_resposta: 'A resposta veio com assinatura que não confere: o HMAC do Supabase e o da Lambda são diferentes.',
  relogio_da_resposta: 'A resposta veio com o relógio fora da janela: tente de novo; se repetir, me avise.',
};
const fraseDaSonda = (resultado: string) => FRASE_DA_SONDA[resultado] ?? `Resultado inesperado da Lambda: ${resultado}. Me mande este texto.`;

export interface PecasDaSonda {
  token: string | null;
  autorDoToken: (t: string) => Promise<string | null>;
  ehAdmin: (autor: string) => Promise<boolean>;
  config: { url: string; segredo: string } | null;
  busca: Parameters<typeof chamarPelaSaida>[0]['busca'];
  agoraSegundos: () => number;
}
export interface ResultadoDaSonda { status: number; corpo: { ok: boolean; resultado: string; frase: string } }

export async function sondarSaida(p: PecasDaSonda): Promise<ResultadoDaSonda> {
  const fim = (status: number, ok: boolean, resultado: string, frase = fraseDaSonda(resultado)): ResultadoDaSonda => ({ status, corpo: { ok, resultado, frase } });
  if (!p.token) return fim(401, false, 'sem_login', 'Entre no sistema para rodar a sonda.');
  const autor = await p.autorDoToken(p.token);
  if (!autor) return fim(401, false, 'sem_login', 'Entre no sistema para rodar a sonda.');
  if (!(await p.ehAdmin(autor))) return fim(403, false, 'so_admin', 'Só o admin AGROinBLUE roda a sonda da saída.');
  if (!p.config) return fim(200, false, 'configuracao_supabase');
  try {
    await chamarPelaSaida({ config: p.config, metodo: 'GET', caminho: CAMINHO_DA_SONDA, busca: p.busca, agoraSegundos: p.agoraSegundos });
    return fim(200, false, 'caminho_aberto');
  } catch (e) {
    const falha = e instanceof FalhaDaSaida ? e.falha : 'conexao';
    return fim(200, falha === 'caminho', falha);
  }
}
