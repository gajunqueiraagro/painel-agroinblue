/**
 * O PAINEL LATERAL DA VENDA EM BOITEL — PR-OC-BOITEL-PAINEL-01.
 *
 * ⚠ UMA CONTA, DE CIMA PARA BAIXO, e cada linha e' um termo que o motor (`derivadosBoitel`) JA' tem:
 *     Faturamento − descontos do acerto = Saldo do acerto
 *     + Adiantamento devolvido          = A RECEBER DO BOITEL   (o Pix; `saldoReceberBase`)
 *     − Adiantamento (ja' era seu) − Gastos diretos (`custosDoProdutor`) − Parte do parceiro (`pParte`)
 *                                       = LIQUIDO NO BOLSO      (`bolsoDaVendaBoitel`)
 *   e embaixo o que o financeiro tem: "Financeiro X faltam Y".
 * ⚠ NENHUMA CONTA NOVA E NENHUMA LINHA DE RESIDUO. Antes deste painel, o acerto e o bolso vinham do motor e o trio
 *   "A receber / Recebido / Saldo" vinha da view, sem ligacao entre os dois: o Saldo de nivel liquidado dizia −107.150,94
 *   numa venda que deixa 581.232,52 (b58bf556, 02/10). `residuoDaConta` existe so' para a prova de que a escada fecha
 *   ao centavo com os termos do motor — ele nunca vira linha.
 * ⚠ A TELA SO' RENDERIZA: rotulo, texto, cor e visibilidade saem daqui.
 */
import { linhasResumoProdutor } from '@/components/venda/previsaoBoitel';
import { COR_SINAL } from '@/lib/oc/contaCorrente';

/** Os termos do motor que o painel le' — `derivadosBoitel` os devolve todos. */
export interface TermosDoMotor {
  fba: number;
  dAcertoAbate: number; dAcertoDiarias: number; dAcertoSanidade: number;
  dAcertoOutros: number; dAcertoFrete: number; dAcertoNotas: number;
  descontoDoAcerto: number;
  valorTotalAntecipadoCalc: number;
  saldoReceberBase: number;
  custosDoProdutor: number;
  pParte: number;
}

/** `pos`/`neg` = cor pelo sinal (realizado); `projecao` = o ambar da promessa; `neutra` = sem sinal. */
export type CorLinhaPainel = 'pos' | 'neg' | 'neutra' | 'projecao';

export interface LinhaPainelBoitel {
  chave: string;
  rotulo: string;
  /** O valor COM o sinal da conta (o desconto e' negativo). `null` = sem dado ("—"). */
  valor: number | null;
  /** O valor escrito: sem "R$", com o "−" tipografico colado ao numero. */
  texto: string;
  sinal: '+' | '−' | '=';
  destaque: boolean;
  /** Filete acima: as linhas de total. */
  separador: boolean;
  visivel: boolean;
  cor: CorLinhaPainel;
  title?: string;
  /** So' no "Financeiro" do realizado da A: a diferenca contra o a receber, por extenso. */
  diferenca?: { valor: number; texto: string } | null;
}

export interface EntradaPainelBoitel {
  termos: TermosDoMotor;
  /** `bolsoDaVendaBoitel` dos MESMOS dados dos termos — `null` quando o motor nao tem os campos que o sustentam. */
  bolso: number | null;
  modalidade: 'boitel' | 'produtor';
  realizado: boolean;
  /** `entrada_obrigacao` de `vw_oc_operacao_compromissos_resumo`; `null` sem compromissos. */
  noFinanceiro: number | null;
}

export const TITLE_GASTOS_DIRETOS = 'gastos diretos do produtor (frete e notas do envio) não entram neste acerto — vivem no financeiro';
/**
 * O `title` da linha "Financeiro" — fix1: a frase inteira com os DOIS valores, para quando uma diferenca de milhoes voltar a
 * cortar a linha de 218px. Sem diferenca (ou na projecao), so' a soma.
 */
export function titleDoFinanceiro(fin: number | null, dif: number | null): string {
  if (fin == null) return 'soma das entradas da OC no financeiro: sem compromissos';
  const base = `soma das entradas da OC no financeiro: R$ ${numero(fin)}`;
  if (dif == null || centavos(dif) === 0) return base;
  return `${base} · ${dif < 0 ? 'faltam' : 'sobram'} R$ ${numero(dif)} para o a receber do boitel`;
}

const centavos = (x: number) => Math.round(x * 100);
const r2 = (x: number) => centavos(x) / 100;

/** "813.771,01" — sem "R$", sempre duas casas; o sinal fica com quem chama. */
function numero(x: number): string {
  return Math.abs(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** O texto do valor: o "−" tipografico colado ao numero; o "+" so' nas parcelas que somam depois de um total. */
export function textoDoValor(valor: number | null, mostrarMais: boolean): string {
  if (valor == null) return '—';
  const c = centavos(valor);
  if (c < 0) return `−${numero(valor)}`;
  return `${mostrarMais && c > 0 ? '+' : ''}${numero(valor)}`;
}

function corDoValor(valor: number | null, realizado: boolean): CorLinhaPainel {
  if (!realizado) return 'projecao';
  if (valor == null) return 'neutra';
  const c = centavos(valor);
  return c < 0 ? 'neg' : c > 0 ? 'pos' : 'neutra';
}

export function linhasPainelBoitel(e: EntradaPainelBoitel): { titulo: string; linhas: LinhaPainelBoitel[] } {
  const t = e.termos;
  const linha = (chave: string, rotulo: string, valor: number | null, sinal: '+' | '−' | '=',
    o: { destaque?: boolean; separador?: boolean; visivel?: boolean; mostrarMais?: boolean; title?: string } = {}): LinhaPainelBoitel => ({
    /* `+ 0` tira o −0 (desconto zero negado): zero nao tem sinal. */
    chave, rotulo, valor: valor == null ? null : valor + 0, sinal,
    texto: textoDoValor(valor, !!o.mostrarMais),
    destaque: !!o.destaque, separador: !!o.separador, visivel: o.visivel ?? true,
    cor: corDoValor(valor, e.realizado), title: o.title,
  });
  /* Desconto e' termo NEGATIVO da conta; zero nao entra — uma linha zerada afirmaria que o boitel cobrou nada. */
  const desconto = (chave: string, rotulo: string, v: number) =>
    linha(chave, rotulo, -v, '−', { visivel: centavos(v) !== 0 });

  /* A CAUDA COMUM DAS DUAS MODALIDADES: o que sai do bolso por fora do acerto, e o que sobra. */
  const cauda: LinhaPainelBoitel[] = [
    linha('gastos', 'Gastos diretos (frete, taxas)', -t.custosDoProdutor, '−', { title: TITLE_GASTOS_DIRETOS }),
    linha('parceiro', 'Parte do parceiro', -t.pParte, '−', { visivel: centavos(t.pParte) !== 0 }),
    linha('bolso', 'LÍQUIDO NO BOLSO', e.bolso == null ? null : r2(e.bolso), '=', { destaque: true, separador: true }),
  ];

  if (e.modalidade === 'produtor') {
    /* ⚠ A B MANTEM AS TRES LINHAS DE HOJE, com os mesmos numeros: a fonte continua `linhasResumoProdutor`. Sem
       "Financeiro": na B o financeiro tem entrada do frigorifico E saida ao boitel, e compara-lo com o Liquido e'
       outra conta (divida registrada). */
    const b = linhasResumoProdutor(t);
    return {
      titulo: 'Abate em nome do produtor',
      linhas: [
        ...b.linhas.map((l, i) => linha(`produtor-${i}`, l.rotulo, l.sinal === '−' ? -l.valor : l.valor, l.sinal)),
        linha('liquido', '(=) Líquido', r2(b.liquido), '=', { separador: true }),
        ...cauda,
      ],
    };
  }

  const antecipado = t.valorTotalAntecipadoCalc;
  const temAntecipado = centavos(antecipado) !== 0;
  const fin = e.noFinanceiro;
  const dif = e.realizado && fin != null ? r2(fin - t.saldoReceberBase) : null;
  /* fix1 (Gabriel, 02/10): rotulo "Financeiro" e a diferenca sem o "· " — o gap ja' separa; a linha pedia 222px de 218. */
  const linhaFin = linha('financeiro', 'Financeiro', fin == null ? null : r2(fin), '=', { title: titleDoFinanceiro(fin, dif) });
  linhaFin.cor = 'neutra';
  linhaFin.texto = fin == null ? '—' : numero(fin);
  linhaFin.diferenca = dif == null || centavos(dif) === 0 ? null
    : { valor: dif, texto: `${dif < 0 ? 'faltam' : 'sobram'} ${numero(dif)}` };

  return {
    titulo: 'Acerto com o boitel',
    linhas: [
      linha('faturamento', 'Faturamento do abate', t.fba, '+'),
      desconto('abate', 'Despesas do abate', t.dAcertoAbate),
      desconto('diarias', 'Diárias · nutrição', t.dAcertoDiarias),
      desconto('sanidade', 'Sanidade', t.dAcertoSanidade),
      desconto('outros', 'Outros', t.dAcertoOutros),
      desconto('frete-boitel', 'Frete do envio', t.dAcertoFrete),
      desconto('notas-boitel', 'Notas do envio', t.dAcertoNotas),
      linha('saldo', 'Saldo do acerto', r2(t.fba - t.descontoDoAcerto), '=', { separador: true }),
      linha('devolvido', 'Adiantamento devolvido', antecipado, '+', { visivel: temAntecipado, mostrarMais: true }),
      linha('receber', 'A RECEBER DO BOITEL', r2(t.saldoReceberBase), '=', { destaque: true, separador: true }),
      linha('ja-seu', 'Adiantamento (já era seu)', -antecipado, '−', { visivel: temAntecipado }),
      ...cauda,
      linhaFin,
    ],
  };
}

/**
 * A PROVA DE QUE A ESCADA FECHA — so' termos do motor, em centavos. 0 = fecha.
 * A: bolso − (a receber − adiantamento − gastos diretos − parte do parceiro).
 * B: bolso − (liquido − gastos diretos − parte do parceiro).
 * `null` quando nao ha bolso (motor sem os campos).
 */
export function residuoDaConta(t: TermosDoMotor, bolso: number | null, modalidade: 'boitel' | 'produtor'): number | null {
  if (bolso == null) return null;
  const topo = modalidade === 'produtor' ? r2(t.fba - t.descontoDoAcerto) : r2(t.saldoReceberBase) - r2(t.valorTotalAntecipadoCalc);
  return centavos(bolso) - (centavos(topo) - centavos(t.custosDoProdutor) - centavos(t.pParte));
}

/** Entrega no painel de boitel: com nada a entregar, uma linha so' ("Entregue 110 / 110 cab"). */
export function entregaEmUmaLinha(diferenca: number | null): boolean {
  return diferenca != null && Math.max(0, -diferenca) === 0;
}

/** A segunda linha da Identificacao no painel de boitel: "Data · Fazenda · Tipo", sem os vazios. */
export function linhaIdentificacaoBoitel(data: string | null, fazenda: string | null, tipo: string | null): string {
  const partes = [data, fazenda, tipo].filter((p): p is string => !!p && p.trim() !== '');
  return partes.length ? partes.join(' · ') : '—';
}

/** A classe da cor: o sinal pelo dono unico (`COR_SINAL`); a projecao fica com o ambar da tela (`corProjecao`). */
export function classeDaCorPainel(cor: CorLinhaPainel, corProjecao: string): string | undefined {
  if (cor === 'pos') return COR_SINAL.pos;
  if (cor === 'neg') return COR_SINAL.neg;
  if (cor === 'projecao') return corProjecao;
  return undefined;
}
