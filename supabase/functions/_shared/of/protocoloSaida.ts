/**
 * OF-IP-FIXO-01 · o PROTOCOLO entre a borda do Open Finance (Supabase) e a Lambda `agro-of-saida` (AWS sa-east-1, numa VPC com NAT +
 * Elastic IP: o IP FIXO que o provedor cadastra). Decisão do Gabriel 26/11: AWS, 1 NAT / 1 IP, o padrão HMAC da `agro-dfe-mtls`.
 * Usado pelos DOIS lados (a Lambda o empacota pelo esbuild); só WebCrypto. A assinatura é a MESMA da Lambda da Receita (`protocoloLambda`):
 *  · pedido: corpo JSON { v:1, metodo, caminho, corpo? } — o HOST nunca vem no pedido (é fixo na Lambda, `DESTINO_BASE`), e o caminho só
 *    passa se começar por um dos prefixos permitidos (`CAMINHOS_PERMITIDOS`); o TOKEN do provedor nunca sai da AWS (a Lambda o põe);
 *  · cabeçalhos x-agro-tempo / x-agro-nonce / x-agro-assinatura = HMAC-SHA-256(segredo, "POST\n/\n<tempo>\n<nonce>\n<sha256 do corpo>");
 *  · resposta assinada: HMAC(segredo, "RESP\n<nonce do pedido>\n<tempo>\n<sha256 do corpo>").
 */
export { CAB, deB64, hmacHex, iguaisHex, JANELA_S, NONCE_OK, paraB64, TEMPO_OK, textoDaResposta, textoDoPedido } from '../dfe/protocoloLambda.ts';

export const VERSAO_SAIDA = 1;
export type MetodoSaida = 'GET' | 'POST';
export interface PedidoSaida { v: number; metodo: MetodoSaida; caminho: string; corpo?: string }
export type FalhaSaida = 'nao_autorizado' | 'pedido' | 'caminho' | 'configuracao' | 'conexao' | 'tempo' | 'tls' | 'interno';
export type RespostaSaida = { ok: true; http: number; corpo: string } | { ok: false; falha: FalhaSaida };

/** o caminho: absoluto, sem "..", sem "//", sem esquema nem host, só os caracteres de uma URL comum, até 512 */
export const CAMINHO_OK = /^\/(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9/_\-.~?=&%:,+]{0,511}$/;

/** os prefixos permitidos (a variável `CAMINHOS_PERMITIDOS`, separados por vírgula); vazio = NENHUM caminho passa */
export function prefixosPermitidos(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter((s) => /^\/[A-Za-z0-9/_\-.]*$/.test(s));
}

/** o caminho só passa se for válido E começar por um prefixo permitido */
export function caminhoPermitido(caminho: unknown, prefixos: readonly string[]): caminho is string {
  return typeof caminho === 'string' && CAMINHO_OK.test(caminho) && prefixos.some((p) => caminho.startsWith(p));
}

/** a base fixa do destino: só https, só o host (sem caminho, sem porta estranha, sem usuário) */
export function baseValida(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null;
    return `https://${u.host}`;
  } catch { return null; }
}
