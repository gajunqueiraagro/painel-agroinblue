/**
 * BOLETO D1d (mock-boleto-d1d-v1) — a bancada da coluna "Na caixa" do "Anexar vários boletos" (dado SINTÉTICO). As 6 parcelas GRAVADAS
 * (número → lançamento) e uma caixa em memória que responde como `fn_boleto_entrar` / `boleto_lancamentos`, pelo NOME do arquivo que
 * o gate solta: parcela 1 nova (entra e liga), 2 já na caixa (G1), 3 com outro boleto (G2), 4 já ligada, 5 escaneada (sem linha).
 */
import { respostaDeEntrar } from '@/lib/financeiro/boleto/caixaApi';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import type { LeituraDoArquivo } from '@/lib/financeiro/boleto/lerBoleto';
import { acharBoletoNoTexto } from '@/lib/financeiro/linhaDigitavel';

export const PARCELAS_BANCADA = ['2026-12-10', '2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10', '2027-05-10']
  .map((vencimento, i) => ({ numero: i + 1, vencimento, valor: 1250, temBoleto: false }));
export const LANCAMENTOS_BANCADA: ReadonlyMap<number, string> = new Map(PARCELAS_BANCADA.map((p) => [p.numero, `lanc-${p.numero}`]));

const JA_NA_CAIXA: Record<string, string> = { 'boleto-parcela-2.pdf': 'b-2', 'boleto-parcela-4.pdf': 'b-4' };
const LIGADO: Record<string, string> = { 'lanc-3': 'b-outro', 'lanc-4': 'b-4' };
const LINHA = '34191.09008 04881.820049 19646.100008 8 16110000300650';
const SEM = { documento: null, nome: null, confira: false };

export const API_ANEXAR_BANCADA: ParcelaApi = {
  async entrar(_c, l, simular) {
    const id = JA_NA_CAIXA[String(l.arquivo_nome)];
    return { ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: !!id, id: id ?? null, storage_path: null, frase: id ? 'Este boleto já está no sistema.' : null,
      boleto: { codigo_barras: '3'.repeat(44), situacao: 'novo' }, situacao: { lancamentos: [], avisos: [] }, candidatos: [], avisos: [],
    }) };
  },
  async subirArquivo() { return { ok: true, dados: true }; },
  async ligar() { return { ok: true, dados: { ok: true } }; },
  async boletoDoLancamento(l) { return { ok: true, dados: LIGADO[l] ?? null }; },
};

/** o leitor falso: o conteúdo do arquivo do gate é "%PDF <nome>"; o escaneado não tem linha */
export async function LER_ANEXAR_BANCADA(bytes: ArrayBuffer): Promise<LeituraDoArquivo> {
  const nome = new TextDecoder().decode(bytes);
  return { ok: true, leitura: { boleto: nome.includes('escaneado') ? null : acharBoletoNoTexto(LINHA), beneficiario: SEM, pagador: SEM } };
}
