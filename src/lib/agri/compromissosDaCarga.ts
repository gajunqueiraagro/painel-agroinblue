/**
 * OS COMPROMISSOS DE UMA CARGA DE MANDIOCA — a leitura que a aba Financeiro mostra.
 *
 * ⚠ AQUI NÃO SE CALCULA DINHEIRO NOVO. Cada linha desta lista é um lançamento que a RPC
 * `agri_carga_mandioca_registrar` já gravou, com o valor que ELA decidiu. Este arquivo agrupa,
 * rotula e ordena — e a única conta que faz é a divisão que devolve o preço unitário, para o
 * operador conferir de onde o total veio.
 *
 * ⚠ E ESSA DIVISÃO NÃO É A MESMA DA `proposta()`, ainda que a fórmula seja. Lá ela reconstitui um
 * preço que VOLTA para o payload, e por isso o comentário daquele hook a trata como proposta
 * âmbar que o operador confere. Aqui ela é LEITURA: descreve o que já está gravado e não volta
 * para lugar nenhum. A diferença está em para onde o número vai, não em como ele nasce.
 *
 * ⚠ "PAGO" É UM CAMPO SÓ — `status_transacao`. O gatilho
 * `trg_promover_lancamento_realizado_ao_conciliar` já vira 'programado' → 'realizado' quando a
 * conciliação casa o lançamento. Não há view a consultar nem soma a fazer: a OC precisa de três
 * views e de `zoo_operacao_liquidacoes` porque o compromisso dela é outra entidade; aqui o
 * compromisso É o lançamento.
 */

/** Os papéis que a RPC grava em `agri_colheita_lancamentos.papel`. */
export type PapelCarga =
  | 'venda' | 'frete' | 'trator' | 'mao_obra'
  | 'icms' | 'icms_transporte' | 'funrural' | 'inss'
  /* ⚠ OS DOIS NOMES ANTIGOS CONTINUAM NO BANCO: 42 lançamentos do backfill de 16/09 usam
     'arranquio' e 'carregamento'. A RPC não os grava mais, mas a tela LÊ o que existe — omiti-los
     aqui faria a aba Financeiro esconder serviços de toda carga anterior à reclassificação. */
  | 'arranquio' | 'carregamento';

const ROTULO: Record<PapelCarga, string> = {
  venda: 'Venda',
  frete: 'Frete',
  trator: 'Trator',
  mao_obra: 'Mão de obra',
  icms: 'ICMS da venda',
  icms_transporte: 'ICMS do frete',
  funrural: 'Funrural',
  inss: 'INSS',
  arranquio: 'Mão de obra',
  carregamento: 'Trator',
};

/**
 * A ordem em que as linhas aparecem.
 *
 * ⚠ É A ORDEM DO DINHEIRO, não a alfabética nem a do banco: primeiro o que entra, depois o que
 * sai — e dentro do que sai, os serviços antes dos impostos, porque é assim que o resumo lateral
 * soma (venda − impostos − serviços). Duas ordens diferentes para a mesma carga fariam o operador
 * conferir linha a linha em vez de bater o olho.
 */
const ORDEM: Record<PapelCarga, number> = {
  venda: 0,
  mao_obra: 10, arranquio: 10,
  frete: 20,
  trator: 30, carregamento: 30,
  icms: 40, icms_transporte: 50, funrural: 60, inss: 70,
};

const SERVICOS: readonly PapelCarga[] = ['frete', 'trator', 'mao_obra', 'arranquio', 'carregamento'];
const IMPOSTOS: readonly PapelCarga[] = ['icms', 'icms_transporte', 'funrural', 'inss'];

export const ehServico = (p: string): boolean => SERVICOS.includes(p as PapelCarga);
export const ehImposto = (p: string): boolean => IMPOSTOS.includes(p as PapelCarga);

/** O lançamento cru, como a consulta o traz. */
export interface LancamentoDaCarga {
  lancamentoId: string;
  papel: string;
  valor: number;
  /** '1' entrada, '-1' saída — a convenção de `financeiro_lancamentos_v2`. */
  sinal: string;
  statusTransacao: string | null;
  dataVencimento: string | null;
  favorecido: string | null;
  conta: string | null;
}

export type StatusCompromisso = 'programado' | 'pago' | 'parcial';

export interface LinhaCompromisso {
  lancamentoId: string;
  papel: string;
  rotulo: string;
  favorecido: string | null;
  /** Com sinal: negativo é saída. */
  valor: number;
  entrada: boolean;
  /** "140,00 R$/t", "1,05 R$/g" ou `null` quando a linha não tem unitário (imposto). */
  unitario: string | null;
  /** O que ainda não foi pago/recebido. Zero quando o lançamento já é realizado. */
  falta: number;
  status: StatusCompromisso;
  dataVencimento: string | null;
  conta: string | null;
}

const duas = (n: number) => n.toFixed(2).replace('.', ',');

/**
 * O status de uma linha.
 *
 * ⚠ TRÊS ESTADOS NO TIPO, DOIS NASCEM HOJE — e isso é declaração, não esquecimento. 'parcial'
 * exige saber QUANTO foi aplicado ao lançamento (`conciliacao_bancaria_itens.valor_aplicado`), que
 * esta fase não lê. Ele está no tipo e na tabela de cores porque a FASE 2 o liga, e porque um
 * estado que aparece depois sem lugar reservado costuma aparecer com a cor de outro.
 */
export function statusDaLinha(statusTransacao: string | null): StatusCompromisso {
  return statusTransacao === 'realizado' ? 'pago' : 'programado';
}

/**
 * Monta as linhas da aba Financeiro.
 *
 * `toneladas` é o peso da CARGA INTEIRA (as metades somadas). É o divisor do R$/t — usar o de uma
 * metade devolveria o dobro do preço contratado.
 */
export function montarCompromissos(
  lancamentos: readonly LancamentoDaCarga[],
  toneladas: number | null,
  precoG: number | null,
): LinhaCompromisso[] {
  const linhas = lancamentos.map((l): LinhaCompromisso => {
    const entrada = l.sinal === '1';
    const valor = entrada ? Math.abs(l.valor) : -Math.abs(l.valor);
    const status = statusDaLinha(l.statusTransacao);
    return {
      lancamentoId: l.lancamentoId,
      papel: l.papel,
      rotulo: ROTULO[l.papel as PapelCarga] ?? l.papel,
      favorecido: l.favorecido,
      valor,
      entrada,
      unitario: unitarioDaLinha(l.papel, Math.abs(l.valor), toneladas, precoG),
      /* ⚠ PAGO NÃO DEVE NADA. Sem a leitura do aplicado, "falta" é tudo ou nada — e tudo-ou-nada
         é verdade nos dois extremos, que são os únicos que esta fase sabe distinguir. */
      falta: status === 'pago' ? 0 : Math.abs(l.valor),
      status,
      dataVencimento: l.dataVencimento,
      conta: l.conta,
    };
  });
  return linhas.sort((a, b) => {
    const oa = ORDEM[a.papel as PapelCarga] ?? 99;
    const ob = ORDEM[b.papel as PapelCarga] ?? 99;
    if (oa !== ob) return oa - ob;
    /* Desempate estável: o mesmo conjunto produz sempre a mesma ordem. */
    return a.lancamentoId < b.lancamentoId ? -1 : 1;
  });
}

function unitarioDaLinha(
  papel: string, valorAbs: number, toneladas: number | null, precoG: number | null,
): string | null {
  if (papel === 'venda') return precoG == null ? null : `${duas(precoG)} R$/g`;
  if (!ehServico(papel)) return null;
  if (toneladas == null || toneladas <= 0) return null;
  return `${duas(valorAbs / toneladas)} R$/t`;
}

export interface ResultadoDaCarga {
  venda: number;
  impostos: number;
  servicos: number;
  /** venda − impostos − serviços. É o que a carga rendeu de verdade. */
  liquido: number;
}

/**
 * O resultado da carga.
 *
 * ⚠ SOMA O QUE ESTÁ GRAVADO, sem filtrar por status: uma despesa programada já é despesa da
 * carga. Filtrar pelo que foi pago responderia "quanto saiu do caixa até agora", que é outra
 * pergunta — e é a da conciliação, não a desta tela.
 */
export function resultadoDaCarga(linhas: readonly LinhaCompromisso[]): ResultadoDaCarga {
  let venda = 0; let impostos = 0; let servicos = 0;
  for (const l of linhas) {
    const abs = Math.abs(l.valor);
    if (l.papel === 'venda') venda += abs;
    else if (ehImposto(l.papel)) impostos += abs;
    else if (ehServico(l.papel)) servicos += abs;
  }
  return { venda, impostos, servicos, liquido: venda - impostos - servicos };
}

/** Os quatro números do topo da aba, no vocabulário da OC. */
export interface TopoFinanceiro {
  aReceber: number;
  recebido: number;
  despesas: number;
  pagas: number;
}

export function topoFinanceiro(linhas: readonly LinhaCompromisso[]): TopoFinanceiro {
  let aReceber = 0; let recebido = 0; let despesas = 0; let pagas = 0;
  for (const l of linhas) {
    const abs = Math.abs(l.valor);
    if (l.entrada) { aReceber += abs; if (l.status === 'pago') recebido += abs; }
    else { despesas += abs; if (l.status === 'pago') pagas += abs; }
  }
  return { aReceber, recebido, despesas, pagas };
}
