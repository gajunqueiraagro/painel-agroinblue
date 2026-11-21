/**
 * CONC-DESCONCILIAR-EDSON-01 (R2, Gabriel 18/11) — no "Casar com o banco", o valor da NF nunca muda: quando o banco pagou diferente
 * (acima de R$ 1,00), o banco (`fn_espelho_casar`) devolve a PERGUNTA pronta (`pergunta_nf`) e o operador diz o que é a diferença:
 *   a mais  → 'juros'    (a NF casa inteira + "Juros/multa da NF nº X" no mesmo extrato)
 *           → 'taxa'     (FILA 18/11 09:22: "outra despesa sem nota", na conta de saída que o operador escolhe — a taxa da plataforma)
 *           → 'outra_nota' (115570, FILA 18/11 13:10: outra nota do fornecedor que falta lançar; nº e valor de cada uma opcionais — com
 *                        valor, uma linha por nota; sem valor, uma linha com os números; fica a pendência "anexar a nota")
 *   a menos → 'desconto' (com motivo; "Desconto obtido" sem caixa, a NF fica quitada) ou 'parcial' (divide; o saldo fica em aberto)
 * A regra e as frases são do banco; a tela só lê a pergunta e manda a escolha no item (`destino` / `motivo_desconto`).
 */
export type DestinoDaNf = 'juros' | 'taxa' | 'outra_nota' | 'desconto' | 'parcial';

export interface PerguntaNf {
  lancamentoId: string;
  frase: string;
  sentido: 'a_mais' | 'a_menos';
  opcoes: DestinoDaNf[];
  /** extrato − NF, com sinal (positivo = o banco pagou a mais) */
  diferenca: number;
}

/** uma nota que falta lançar: o nº (pode ter vários, "270, 272") e o valor, os dois opcionais */
export interface OutraNota { numero: string; valor: number | null }

export interface EscolhaNf { destino: DestinoDaNf; motivo?: string; /** a conta da taxa */ planoContaId?: string; planoNome?: string;
  /** 'outra_nota': as notas que faltam (vazio = uma linha sem nº) */ outrasNotas?: readonly OutraNota[] }

const ehDestino = (v: unknown): v is DestinoDaNf => v === 'juros' || v === 'taxa' || v === 'outra_nota' || v === 'desconto' || v === 'parcial';

/** A pergunta da NF numa resposta da `fn_espelho_casar` (simulada ou gravada); sem pergunta válida = null. */
export function perguntaNfDaResposta(resposta: unknown): PerguntaNf | null {
  if (typeof resposta !== 'object' || resposta === null || !('pergunta_nf' in resposta)) return null;
  const p = resposta.pergunta_nf;
  if (typeof p !== 'object' || p === null) return null;
  if (!('lancamento_id' in p) || typeof p.lancamento_id !== 'string') return null;
  if (!('frase' in p) || typeof p.frase !== 'string') return null;
  if (!('sentido' in p) || (p.sentido !== 'a_mais' && p.sentido !== 'a_menos')) return null;
  const opcoes = 'opcoes' in p && Array.isArray(p.opcoes) ? p.opcoes.filter(ehDestino) : [];
  if (opcoes.length === 0) return null;
  const dif = 'diferenca' in p ? Number(p.diferenca) : NaN;
  return { lancamentoId: p.lancamento_id, frase: p.frase, sentido: p.sentido, opcoes, diferenca: Number.isFinite(dif) ? dif : 0 };
}

/** Os itens do casar com a escolha de cada NF (o resto do item não muda). Desconto sem motivo e taxa sem conta não vão: o banco pediria. */
export function itensComDestino<T extends { lancamento_id: string }>(itens: readonly T[], escolhas: Readonly<Record<string, EscolhaNf>>) {
  return itens.map((i) => {
    const e = escolhas[i.lancamento_id];
    if (!e) return i;
    if (e.destino === 'desconto') {
      const motivo = (e.motivo ?? '').trim();
      return motivo ? { ...i, destino: e.destino, motivo_desconto: motivo } : i;
    }
    if (e.destino === 'taxa') return e.planoContaId ? { ...i, destino: e.destino, plano_conta_id: e.planoContaId } : i;
    if (e.destino === 'outra_nota') {
      /* o banco (`_fn_conc_outras_notas`) confere a soma e divide; a linha toda em branco não vai */
      const notas = (e.outrasNotas ?? []).map((n) => ({ numero: n.numero.trim(), valor: n.valor }))
        .filter((n) => n.numero || (n.valor != null && n.valor > 0))
        .map((n) => (n.valor != null && n.valor > 0 ? { numero: n.numero, valor: Math.round(n.valor * 100) / 100 } : { numero: n.numero }));
      return notas.length ? { ...i, destino: e.destino, outras_notas: notas } : { ...i, destino: e.destino };
    }
    return { ...i, destino: e.destino };
  });
}

export const ROTULO_DO_DESTINO: Record<DestinoDaNf, string> = {
  juros: 'É juros/multa',
  taxa: 'Outra despesa sem nota (taxa)',
  outra_nota: 'Outra nota (falta lançar)',
  desconto: 'É desconto',
  parcial: 'Pagamento parcial',
};

/** A frase da escolha feita, com o valor da diferença (em módulo). */
export function fraseDaEscolha(e: EscolhaNf, diferenca: number, brl: (n: number) => string): string {
  const v = `R$ ${brl(Math.abs(diferenca))}`;
  if (e.destino === 'juros') return `${v} viram "Juros/multa da NF", no mesmo extrato; a NF fica com o valor dela.`;
  if (e.destino === 'taxa') return `${v} viram "Taxa (sem nota) da NF"${e.planoNome ? ` em ${e.planoNome}` : ''}, no mesmo extrato; a NF fica com o valor dela.`;
  if (e.destino === 'outra_nota') {
    const nums = (e.outrasNotas ?? []).map((n) => n.numero.trim()).filter(Boolean).join(', ');
    return `${v} viram "Falta nota${nums ? ` nº ${nums}` : ''}" (a classificar), no mesmo extrato; a NF fica com o valor dela e fica a pendência de anexar a nota.`;
  }
  if (e.destino === 'desconto') return `${v} viram "Desconto obtido" (sem caixa)${e.motivo?.trim() ? ` · ${e.motivo.trim()}` : ''}; a NF fica quitada.`;
  return `${v} ficam em aberto na NF, para o próximo pagamento.`;
}
