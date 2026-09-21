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
 * ⚠ "PAGO" É QUANTO FOI APLICADO — `conciliacao_bancaria_itens.valor_aplicado` dos vínculos
 * vivos, somado por lançamento. A fase 1 decidia por `status_transacao`, e isso MENTIA: o gatilho
 * `trg_promover_lancamento_realizado_ao_conciliar` promove a 'realizado' na PRIMEIRA conciliação,
 * sem olhar valor — um pagamento parcial já chegava com status de pago. Medido: não existe coluna
 * "pago" nem status 'parcial' em `financeiro_lancamentos_v2`; parcial é derivado.
 * ⚠ AINDA ASSIM É MAIS SIMPLES QUE A OC: lá o pago vem de três views sobre
 * `zoo_operacao_liquidacoes`, porque o compromisso dela é outra entidade. Aqui o compromisso É o
 * lançamento, e a soma é uma consulta.
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
  /**
   * O id de quem recebe — não o nome.
   * ⚠ ELE EXISTE PARA A RECONSTRUÇÃO, não para a lista: a lista mostra `favorecido`, mas o payload
   * de `agri_carga_mandioca_corrigir` grava `fornecedor_id`. Reconstruir a carga a partir do NOME
   * exigiria procurar o fornecedor por texto — e é assim que se cria um segundo cadastro com o
   * mesmo nome. A consulta já trazia a coluna; só não a devolvia.
   */
  favorecidoId: string | null;
  conta: string | null;
  /** O id da conta, para o seletor — `conta` é só o nome que a linha mostra. */
  contaId: string | null;
  /**
   * ⚠ SOMA DE `conciliacao_bancaria_itens.valor_aplicado` DOS VÍNCULOS VIVOS — a única fonte de
   * pagamento desta família. Não existe coluna "pago" nem status 'parcial' em
   * `financeiro_lancamentos_v2` (medido: os status são previsto, agendado, programado, realizado
   * e conciliado). "Parcial" é DERIVADO.
   */
  pago: number;
  /** ⚠ Nulo em TODOS os 96 compromissos vivos de mandioca, inclusive nos conciliados — medido. */
  conciliadoEm: string | null;
  /** Tem vínculo vivo no extrato. É o que de fato tranca a edição nesta família. */
  conciliado: boolean;
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
  /** Quanto já foi aplicado pela conciliação. */
  pago: number;
  /** `valor − pago`, nunca negativo. Zero quando quitado. */
  falta: number;
  status: StatusCompromisso;
  dataVencimento: string | null;
  conta: string | null;
  contaId: string | null;
  /**
   * ⚠ PODE EDITAR VENCIMENTO E CONTA? É a mesma pergunta que a RPC faz antes de gravar, e a tela
   * a faz ANTES de mostrar o campo: avisar depois de o operador digitar é pior que não deixar
   * digitar. As três condições são as da guarda — `conciliado_em`, o status e o vínculo vivo.
   */
  editavel: boolean;
  /** O motivo do travamento, escrito — regra da OC: campo desligado diz por quê. */
  motivoTravado: string | null;
}

const duas = (n: number) => n.toFixed(2).replace('.', ',');

/**
 * TOLERÂNCIA DE UM CENTAVO — a mesma do molde.
 *
 * ⚠ COPIADA DE `_oc_estado_liquidacao` (md5 d5630e18, conferido no proto): ela usa `<= 0.01` para
 * decidir "liquidada". Sem tolerância, um arredondamento de centavo deixaria um compromisso
 * eternamente "Parcial · falta R$ 0,00" — o pior dos dois erros, porque parece defeito.
 */
const TOL = 0.01;

/**
 * O estado de uma linha, pelo QUE FOI PAGO — PR-CARGA-MANDIOCA-MODAL-OC-02 (fase 2).
 *
 * ⚠ ELE NÃO LÊ MAIS `status_transacao`, E ISSO CONSERTA UMA MENTIRA DA FASE 1. O gatilho
 * `trg_promover_lancamento_realizado_ao_conciliar` promove o lançamento a 'realizado' na PRIMEIRA
 * conciliação, sem olhar valor — então um pagamento PARCIAL já chega com status 'realizado', e a
 * fase 1, que decidia por ele, mostrava "Pago" com dinheiro faltando.
 * ⚠ O MOLDE É `_oc_estado_liquidacao(base, liquidado)`, com uma diferença declarada: lá há um
 * quinto estado, 'excedente' (pagou MAIS que o valor). Aqui ele cai em 'pago', por decisão do
 * briefing — a pílula tem três cores. Se um dia excedente precisar aparecer, é cor nova, não
 * reaproveitar a do pago.
 */
export function statusDaLinha(valor: number, pago: number): StatusCompromisso {
  const base = Math.abs(valor);
  const liq = Math.max(0, pago);
  if (base > 0 && liq >= base - TOL) return 'pago';
  if (liq > TOL) return 'parcial';
  return 'programado';
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
    const abs = Math.abs(l.valor);
    const pago = Math.min(Math.max(0, l.pago), abs);
    const status = statusDaLinha(l.valor, l.pago);
    const travado = motivoDoTravamento(l);
    return {
      lancamentoId: l.lancamentoId,
      papel: l.papel,
      rotulo: ROTULO[l.papel as PapelCarga] ?? l.papel,
      favorecido: l.favorecido,
      valor,
      entrada,
      unitario: unitarioDaLinha(l.papel, abs, toneladas, precoG),
      pago,
      /* ⚠ `falta` VEM DO ESTADO, NÃO DA SUBTRAÇÃO CRUA: quitado com um centavo de sobra devolveria
         "falta −0,01" e a tela mostraria dívida negativa. Quem já é 'pago' não deve nada. */
      falta: status === 'pago' ? 0 : Math.max(0, abs - pago),
      status,
      dataVencimento: l.dataVencimento,
      conta: l.conta,
      contaId: l.contaId,
      editavel: travado === null,
      motivoTravado: travado,
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

/**
 * Por que este compromisso não pode ser reprogramado — ou `null` quando pode.
 *
 * ⚠ ESPELHA A GUARDA DA RPC, nas três condições e na mesma ordem. Duas respostas diferentes para
 * "posso editar?" divergem no dia em que alguém mexer numa só; a tela pergunta antes de mostrar o
 * campo e o banco pergunta antes de gravar, mas a regra é uma.
 */
function motivoDoTravamento(l: LancamentoDaCarga): string | null {
  if (l.conciliadoEm) return 'Conciliado — estorne a conciliação para alterar.';
  if (l.statusTransacao === 'realizado' || l.statusTransacao === 'conciliado' || l.statusTransacao === 'agendado') {
    return `Compromisso ${l.statusTransacao} — estorne o pagamento para mudar.`;
  }
  if (l.conciliado) return 'Já conciliado no extrato — desfaça a conciliação para alterar.';
  return null;
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
    /* ⚠ "RECEBIDO" E "PAGAS" SOMAM O APLICADO, não o valor da linha — fase 2. Somar o valor
       inteiro de um compromisso PARCIAL diria que entrou dinheiro que não entrou, e é justamente
       a caixa que o operador confere contra o extrato. */
    if (l.entrada) { aReceber += abs; recebido += l.pago; }
    else { despesas += abs; pagas += l.pago; }
  }
  return { aReceber, recebido, despesas, pagas };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   RECONSTRUÇÃO DA CARGA — o que o modal precisa para reabrir uma carga SEM perdê-la.
   ──────────────────────────────────────────────────────────────────────────────────────────── */

/** O que uma carga gravada devolve quando se pergunta "com que números você foi feita?". */
export interface CargaReconstruida {
  servicos: Array<{ tipo: 'frete' | 'trator' | 'mao_obra'; fornecedor_id: string | null; preco_t: number | null }>;
  icms: number | null;
  funrural: number | null;
  inss: number | null;
  icmsTransporte: number | null;
}

/** Os dois nomes de cada serviço apontam para o mesmo tipo do payload. */
const TIPO_DO_PAPEL: Record<string, 'frete' | 'trator' | 'mao_obra'> = {
  frete: 'frete',
  trator: 'trator',
  mao_obra: 'mao_obra',
  carregamento: 'trator',
  arranquio: 'mao_obra',
};

/**
 * Reconstrói serviços e impostos de uma carga JÁ GRAVADA, a partir dos lançamentos dela.
 *
 * ⚠ ELA EXISTE PORQUE A AUSÊNCIA DELA APAGOU DINHEIRO. Em 21/09/2026 a carga 9287581 foi
 * corrigida e perdeu 28,19 t e R$ 16.402,85 em cinco lançamentos. A causa não era a correção:
 * `agri_carga_mandioca_corrigir` é `cancelar + registrar`, e o formulário reabria com
 * `servicos: []`, `icms: ''` e `funrural: ''`. O payload que voltava descrevia uma carga menor do
 * que a que existia, e a RPC obedeceu — ela não tinha como saber que aquilo era esquecimento.
 * ⚠ O CONSERTO É AQUI, NÃO NA TRAVA. A trava do front era contenção: enquanto o formulário não
 * soubesse ler o que já existe, salvar era destruir. Com esta função ele sabe.
 *
 * ⚠ O R$/t É RECONSTRUÍVEL, e isso derruba a premissa de 16/09 de que não era. O lançamento guarda
 * o TOTAL e a colheita guarda as toneladas; o preço unitário é a divisão. Conferido na 9287581:
 * 5.647,60 / 40,34 = 140,00 (arranquio e frete) e 2.017,00 / 40,34 = 50,00 (carregamento) — os
 * mesmos números que foram negociados.
 * ⚠ IMPOSTO NÃO SE DIVIDE: ele é valor fechado da nota, não preço por tonelada. ICMS 2.470,26 e
 * Funrural 335,54 entram como estão.
 *
 * ⚠ TONELADAS ZERO OU AUSENTE DEVOLVE `preco_t: null`, nunca zero — e a diferença é a que separa
 * "não sei" de "é de graça". Zero num preço de serviço faria o payload prometer um serviço
 * gratuito, que é justamente a forma de apagar dinheiro que esta função existe para impedir.
 */
export function reconstruirCarga(
  linhas: readonly LancamentoDaCarga[], toneladas: number | null,
): CargaReconstruida {
  const t = toneladas != null && toneladas > 0 ? toneladas : null;

  const servicos: CargaReconstruida['servicos'] = [];
  for (const l of linhas) {
    const tipo = TIPO_DO_PAPEL[l.papel];
    if (!tipo) continue;
    /* ⚠ UMA LINHA POR TIPO: se os dois nomes do mesmo serviço coexistissem numa carga, o payload
       levaria o tipo duas vezes e a RPC gravaria dois lançamentos onde havia um. */
    if (servicos.some(s => s.tipo === tipo)) continue;
    servicos.push({
      tipo,
      fornecedor_id: l.favorecidoId,
      preco_t: t != null ? Math.round((Math.abs(l.valor) / t) * 100) / 100 : null,
    });
  }

  const valorDe = (papel: string): number | null => {
    const l = linhas.find(x => x.papel === papel);
    return l ? Math.abs(l.valor) : null;
  };

  return {
    servicos,
    icms: valorDe('icms'),
    funrural: valorDe('funrural'),
    inss: valorDe('inss'),
    icmsTransporte: valorDe('icms_transporte'),
  };
}

/**
 * O TOTAL de um serviço da carga: o que o R$/t vira em dinheiro.
 *
 * ⚠ É O INVERSO EXATO DE `reconstruirCarga`, e por isso mora ao lado dela: uma vai de `valor` para
 * `preco_t` dividindo pelas toneladas, a outra volta multiplicando. Mesmo arredondamento nas duas
 * — duas casas —, senão reabrir uma carga e salvá-la sem tocar em nada mudaria o centavo.
 *
 * ⚠ SEM PREÇO OU SEM PESO, `null` — nunca zero. É a mesma regra do `preco_t`: zero afirma "este
 * serviço custa nada", e a tela estaria inventando um total para uma carga que ainda não tem os
 * dois números. Ausência é traço.
 */
export function totalDoServico(precoT: number | null, toneladas: number | null): number | null {
  if (precoT == null || toneladas == null || toneladas <= 0) return null;
  return Math.round(precoT * toneladas * 100) / 100;
}
