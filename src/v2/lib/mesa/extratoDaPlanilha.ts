/**
 * O EXTRATO DA PLANILHA — PR-CONC-ENRIQUECER-V2-01, quadro 2 do mock.
 *
 * É a Conferência OFX × Sistema com o lado esquerdo trocado: no lugar do extrato do banco, as linhas da PLANILHA da
 * conta; à direita, o MESMO lado Sistema (`sistema_completo` de `fn_extratos_espelhados`).
 *
 * ⚠ NENHUM PAREAMENTO NOVO. O par de cada linha é o que o casador do banco já decidiu (`lanc_id` do staging), e a
 *   mesa é montada pela MESMA `montarMesa` da Conferência: cada linha da planilha entra como um "extrato" e o seu
 *   `lanc_id` vira o vínculo. Por construção, o dia, a ordem (entradas antes, maiores primeiro), o N:1 e o "confere"
 *   são os da Conferência — não uma cópia deles.
 * ⚠ O N:1 É O AGRUPAMENTO (`↳`): N linhas da planilha com o MESMO lançamento (o split gravado) são desenhadas como as
 *   filhas de um lançamento. Só exibição.
 * ⚠ SÓ O REALIZADO DO MÊS fica do lado Sistema (é o que `sistema_completo` traz). Linha cujo lançamento está em outro
 *   mês, ou ainda não realizado, fica como "sem par" do lado da planilha, com o estado dela — a tela não inventa um par
 *   que o Espelho não tem.
 * ⚠ O BLOCO CONFERIDO (PR-CONC-ENRIQ-BLOCO-NM-B) É DESENHADO SEM PAREAMENTO: as linhas da planilha em 'conferido_bloco'
 *   ficam ✓ do lado delas, e os M lançamentos (os `match_lancamento_ids` delas) ficam "Em bloco" do lado Sistema, cada um
 *   no seu dia. NENHUM vínculo de bloco vai à `montarMesa` — ela trataria o N×M como N:1 e consumiria os extratos
 *   (CONC-MESA-NN-01). O que liga os dois lados é o `blocoId` (`casamento_meta.bloco_id`).
 */
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import type { EspOfx } from '@/components/conciliacao/TabelaExtratoDoMes';
import {
  montarMesa, totaisDoEspelho, type DiaConf, type EspelhadosReais, type EspSis, type EspVinculo,
} from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { normalizarTipo, parteDeAgrupamento } from '@/v2/lib/mesa/enriquecimentoView';
import { baldeDaLinha, type BaldePainel } from '@/v2/lib/mesa/painelContas';

/** O sinal da linha: o do lançamento quando há, senão o tipo da planilha. Transferência que entra é a da destino. */
export function sinalDaPlanilha(r: ClassificacaoStagingPreviewRow, contaId: string): 1 | -1 {
  if (r.lanc_sinal === '1') return 1;
  if (r.lanc_sinal === '-1') return -1;
  const t = normalizarTipo(r.excel_tipo_operacao);
  if (t === 'entrada') return 1;
  if (t === 'transferencia') return r.lanc_conta_destino_id === contaId ? 1 : -1;
  return -1;
}

/** O bloco da linha da planilha — `casamento_meta.bloco_id` de uma linha em 'conferido_bloco'; `null` fora dele. */
export function blocoDaLinha(r: ClassificacaoStagingPreviewRow): string | null {
  if (String(r.match_status) !== 'conferido_bloco') return null;
  const b = r.casamento_meta?.bloco_id;
  return typeof b === 'string' && b ? b : null;
}

/** "Conta do plano · Fornecedor" — o texto da planilha, como veio. */
export function textoDaPlanilha(r: ClassificacaoStagingPreviewRow): string {
  const plano = (r.excel_subcentro ?? '').trim();
  const forn = (r.excel_fornecedor ?? '').trim();
  return [plano || '—', forn || '—'].join(' · ');
}

/**
 * O SÍMBOLO DA COLUNA DO MEIO (26px), por estado da linha da planilha:
 *   ✓ enriquecida (gravada, ou o lançamento já é o da planilha) · ≈ casada e pronta para gravar · ≠ casada com valor
 *   ou campo divergente · ○ sem par no banco · ! você decide · ↳ parte de um agrupamento.
 */
export type SimboloPlanilha = '✓' | '≈' | '≠' | '○' | '!' | '↳';

export function simboloDaLinha(r: ClassificacaoStagingPreviewRow, balde: BaldePainel, valorSistema: number | null): SimboloPlanilha {
  /* o bloco conferido é feito, antes de qualquer marca de agrupamento que a linha carregue do casador */
  if (String(r.match_status) === 'conferido_bloco') return '✓';
  if (parteDeAgrupamento(r)) return '↳';
  if (balde === 'gravada') return '✓';
  /* `aguarda` (resolvido como grupo, sem gravação até o 2b) pede você também: não está pronta nem feita */
  if (balde === 'decide' || balde === 'aguarda') return '!';
  if (balde === 'semBanco' || balde === 'outras') return '○';
  const excel = Math.abs(Number(r.excel_valor) || 0);
  if (String(r.match_status) === 'divergente') return '≠';
  if (valorSistema !== null && Math.abs(Math.abs(valorSistema) - excel) > 0.005) return '≠';
  return '≈';
}

export const LEGENDA_SIMBOLOS: ReadonlyArray<[SimboloPlanilha, string]> = [
  ['✓', 'enriquecido'], ['≈', 'casado, pronto para gravar'], ['≠', 'casado, diverge'], ['○', 'sem par no banco'],
  ['!', 'você decide'], ['↳', 'parte de um agrupamento'],
];

/** O selo do lado Sistema. */
export type SeloSistema =
  | 'Enriquecido' | 'Cru · aplicar' | 'Diverge' | 'Valor ≠' | 'Só no sistema' | 'Desmembrar' | 'Transferência' | 'Em bloco'
  /* PR-CONC-ENRIQ-BLOCO-ESTADOS: 2+ linhas no MESMO lançamento cuja soma difere dele — o par está errado */
  | 'Par repetido';

const ORIGENS_CRUAS = new Set(['extrato', 'ofx']);

/**
 * O lançamento do lado Sistema é CRU? Origem 'extrato'/'ofx' e SEM `subcentro` (`EspSis.origem_lancamento` +
 * `EspSis.subcentro`, os dois emitidos por `fn_extratos_espelhados`) — o predicado de `_fn_classificacao_precedencia_cru`,
 * que o casar manual usa no banco. ⚠ O `plano_conta_id` não vem no Espelho: lançamento com plano vazio e subcentro
 *   escrito (legado) a tela vê como classificado, e o bloco o recusa no banco (`lancamento_cru`) — a frase fica na barra.
 */
export function lancamentoCru(s: Pick<EspSis, 'origem_lancamento' | 'subcentro'>): boolean {
  return !!s.origem_lancamento && ORIGENS_CRUAS.has(s.origem_lancamento) && !(s.subcentro ?? '').trim();
}

export function seloDoPar(r: ClassificacaoStagingPreviewRow, balde: BaldePainel, sis: EspSis | undefined): SeloSistema {
  if (normalizarTipo(r.lanc_tipo_operacao ?? r.excel_tipo_operacao) === 'transferencia') return 'Transferência';
  if (parteDeAgrupamento(r)) return 'Desmembrar';
  if (balde === 'gravada') return 'Enriquecido';
  const excel = Math.abs(Number(r.excel_valor) || 0);
  if (sis && Math.abs(Math.abs(sis.valor_assinado) - excel) > 0.005) return 'Valor ≠';
  if (String(r.match_status) === 'divergente') return 'Diverge';
  const origem = r.lanc_origem_lancamento ?? sis?.origem_lancamento ?? null;
  if (origem && ORIGENS_CRUAS.has(origem) && !r.lanc_plano_conta_id_atual) return 'Cru · aplicar';
  return 'Diverge';
}

/**
 * O STATUS do lançamento do lado Sistema — PR-CONC-ENRIQ-AGRUP-2b-TELA ("não consigo ver o que está realizado"). O lado
 * Sistema do Enriquecer é o REALIZADO do mês (`sistema_completo`): com vínculo vivo ao extrato é Conciliado, sem ele é
 * Realizado. Previstos não chegam aqui (casam-se no "Casar lançamentos"). Substitui a origem B/✓/M, que não dizia isso.
 */
export type StatusSistemaExtrato = 'conciliado' | 'realizado';

/** Uma linha desenhada. `stagingId` é o que abre a Mesa (só no lado da planilha). */
export interface LinhaExtratoPlanilha {
  chave: string;
  stagingId: string | null;
  data: string | null;
  planilha: { texto: string; valor: number } | null;
  simbolo: SimboloPlanilha | null;
  sistema: {
    valor: number; data: string | null; descricao: string; fornecedor: string; status: StatusSistemaExtrato; lancamentoId: string;
    /** Sem classificação, vindo do extrato (`lancamentoCru`) — decide a forma do gesto. */
    cru: boolean;
  } | null;
  selo: SeloSistema | null;
  /** Fundo verde-claro: a linha da planilha já está enriquecida. */
  enriquecida: boolean;
  /** Filha de um agrupamento (desenhada abaixo da mãe, recuada). */
  filha: boolean;
  /**
   * O QUE SE MARCA para agrupar — PR-CONC-ENRIQ-AGRUP-2b-TELA. Derivados, sem cálculo novo:
   * `selPlanilha` = a linha da planilha "sem par" (sem lado Sistema, não filha, não enriquecida);
   * `selSistema` = o lançamento "Só no sistema". Transferência interna e a mãe do "Desmembrar" não se marcam.
   */
  selPlanilha: string | null;
  selSistema: string | null;
  /** O bloco conferido a que a linha pertence (os dois lados) — abre o "Desfazer bloco". `null` fora de bloco. */
  blocoId: string | null;
  /**
   * O PAR DA LINHA — PR-CONC-ENRIQ-BLOCO-ESTADOS. `parSoltavel` = a linha tem par vivo (`lanc_id`), não é livre, não está
   * aplicada e não está em bloco: o "Soltar o par" vale para ela. `par` é o que a barra escreve no modo par — presente com
   * `parSoltavel` ou quando o par repetido já foi gravado (então a barra diz para reverter na Mesa, sem botão).
   */
  parSoltavel: string | null;
  par: ParDaLinha | null;
  /** Por que a linha livre é livre, quando não é óbvio: o par dela foi cancelado (par morto). */
  motivoLivre: string | null;
  /**
   * O FORNECEDOR DE CADA LADO, para o "marcar todos do fornecedor" (PR-CONC-ENRIQ-MARCAR-FAVORECIDO). Cada lado com a SUA
   * chave, e as duas NUNCA se comparam: planilha = `planilha_favorecido_id` (o fornecedor que o banco resolveu da planilha)
   * ou, sem ele, o texto normalizado de `excel_fornecedor`; sistema = o nome do cadastro normalizado (`EspSis.fornecedor`).
   * String vazia quando o lado não existe ou não tem fornecedor ("—").
   */
  chaveFornecedor: { planilha: string; sistema: string };
  /** O nome como se mostra na ação ("+ N de {nome}") — o texto da planilha e o nome do cadastro. */
  nomeFornecedor: { planilha: string; sistema: string };
}

/** O texto do fornecedor normalizado: sem acento, minúsculo, espaços colapsados; "—" e vazio viram "". */
export function normalizarFornecedor(t: string | null | undefined): string {
  const x = (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return x === '—' || x === '-' ? '' : x;
}

/** A chave do fornecedor da linha da PLANILHA: o id resolvido pelo banco, senão o texto normalizado. */
export function chaveFornecedorPlanilha(r: Pick<ClassificacaoStagingPreviewRow, 'planilha_favorecido_id' | 'excel_fornecedor'>): string {
  if (r.planilha_favorecido_id) return `id:${r.planilha_favorecido_id}`;
  const t = normalizarFornecedor(r.excel_fornecedor);
  return t ? `txt:${t}` : '';
}

/** A chave do fornecedor do lançamento do SISTEMA: o nome do cadastro normalizado. */
export function chaveFornecedorSistema(nome: string | null | undefined): string {
  const t = normalizarFornecedor(nome);
  return t ? `nome:${t}` : '';
}

type LinhaSemFornecedor = Omit<LinhaExtratoPlanilha, 'chaveFornecedor' | 'nomeFornecedor'>;

/** O par que a barra descreve no modo par. */
export interface ParDaLinha {
  descricao: string;
  /** Com sinal (saída negativa), como os valores desenhados; `null` sem valor. */
  valor: number | null;
  /** A linha já foi gravada no lançamento: soltar exige reverter na Mesa antes. */
  gravado: boolean;
  /** 2+ linhas desta conta no mesmo lançamento. */
  repetido: boolean;
}

export const MOTIVO_PAR_MORTO = 'o par desta linha foi cancelado';

/**
 * A LINHA LIVRE (pode entrar num bloco ou num casar) — PR-CONC-ENRIQ-BLOCO-ESTADOS. A REGRA MORA EM
 * `_fn_classificacao_linha_livre` (banco); a tela só lê a coluna `linha_livre` da view. `null` = a view ainda não a traz
 * (anterior à migration 20261027190300): quem chama trata como antes, NUNCA como livre.
 */
export function linhaLivreDaView(r: Pick<ClassificacaoStagingPreviewRow, 'linha_livre'>): boolean | null {
  return r.linha_livre === true ? true : r.linha_livre === false ? false : null;
}

export interface DiaExtratoPlanilha {
  data: string | null;
  linhas: LinhaExtratoPlanilha[];
  planilha: number;
  sistema: number;
  /** "confere" quando os dois lados do dia fecham (tolerância de meio centavo). */
  confere: boolean;
}

export interface ExtratoDaPlanilha {
  dias: DiaExtratoPlanilha[];
  totais: ReturnType<typeof totaisDoEspelho>;
  /** Linhas da planilha da conta (o conjunto comparado — a prova reporta o tamanho). */
  nPlanilha: number;
  nSistema: number;
}

export function montarExtratoDaPlanilha(
  stagingDaConta: readonly ClassificacaoStagingPreviewRow[],
  espelho: EspelhadosReais,
  contaId: string,
  internos: ReadonlySet<string>,
  sobrescreverIds: ReadonlySet<string> = new Set(),
): ExtratoDaPlanilha {
  const porStaging = new Map(stagingDaConta.map((r) => [r.staging_id, r]));
  /* os lançamentos de cada bloco conferido da conta: id do lançamento -> bloco */
  const blocoDoLanc = new Map<string, string>();
  for (const r of stagingDaConta) {
    const b = blocoDaLinha(r);
    if (b) for (const id of r.match_lancamento_ids ?? []) blocoDoLanc.set(id, b);
  }
  const sisIds = new Set(espelho.sistema_completo.map((s) => s.lancamento_id));
  const ofx: EspOfx[] = stagingDaConta.map((r) => ({
    extrato_id: r.staging_id,
    data: r.excel_data_pagamento ?? r.excel_data,
    historico: textoDaPlanilha(r),
    documento: r.excel_documento,
    valor: sinalDaPlanilha(r, contaId) * Math.abs(Number(r.excel_valor) || 0),
    status: 'sem_vinculo',
    flag_dup: false,
    flag_investimento: false,
  }));
  /* O vínculo é o par do casador — e só quando o lançamento está do lado Sistema deste mês.
     ⚠ O APLICADO DO PAR 1:1 É O VALOR DO LANÇAMENTO: a `montarMesa` soma o aplicado no lado Sistema do dia, e com o
       valor da planilha ali o dia "conferia" por construção — o "Valor ≠" nunca mudaria o fecho. No N:1 (o ↳) a mãe
       já entra pelo valor do lançamento, e o aplicado de cada filha é a parte dela (o valor da planilha). */
  const sisValor = new Map(espelho.sistema_completo.map((s) => [s.lancamento_id, Math.abs(s.valor_assinado)]));
  const porLanc = new Map<string, number>();
  for (const r of stagingDaConta) if (r.lanc_id) porLanc.set(r.lanc_id, (porLanc.get(r.lanc_id) ?? 0) + 1);
  const vinculos: EspVinculo[] = stagingDaConta
    /* o bloco nunca vira vínculo (ver o cabeçalho): mesmo que a linha trouxesse `lanc_id`, ele fica fora da `montarMesa` */
    .filter((r) => !!r.lanc_id && sisIds.has(r.lanc_id) && !blocoDaLinha(r))
    .map((r) => {
      const lanc = r.lanc_id ?? '';
      const parte = (porLanc.get(lanc) ?? 0) > 1;
      return {
        extrato_id: r.staging_id, lancamento_id: lanc,
        valor_aplicado: parte ? Math.abs(Number(r.excel_valor) || 0) : (sisValor.get(lanc) ?? 0),
        tipo_aprovacao: null, grupo_id: null,
      };
    });
  const data: EspelhadosReais = { ...espelho, ofx_completo: ofx, vinculos, sistema_candidatos: [] };
  const mesa: DiaConf[] = montarMesa(data, internos);

  /* o fornecedor de cada lado, a partir do que a linha já desenha (planilha pelo staging, sistema pelo Espelho) */
  const completar = (l: LinhaSemFornecedor): LinhaExtratoPlanilha => {
    const r = l.planilha && l.stagingId ? porStaging.get(l.stagingId) : undefined;
    const nomeSis = l.sistema && normalizarFornecedor(l.sistema.fornecedor) ? l.sistema.fornecedor : '';
    return {
      ...l,
      chaveFornecedor: { planilha: r ? chaveFornecedorPlanilha(r) : '', sistema: l.sistema ? chaveFornecedorSistema(l.sistema.fornecedor) : '' },
      nomeFornecedor: { planilha: r ? (r.excel_fornecedor ?? '').trim() : '', sistema: nomeSis },
    };
  };

  const linhaPlanilha = (e: EspOfx, sis: EspSis | undefined, filha: boolean): LinhaSemFornecedor => {
    const r = porStaging.get(e.extrato_id);
    const balde: BaldePainel = r ? baldeDaLinha(r, sobrescreverIds.has(e.extrato_id)) : 'outras';
    const enriquecida = balde === 'gravada';
    const blocoId = r ? blocoDaLinha(r) : null;
    const livre = r ? linhaLivreDaView(r) : null;
    /* a caixa: a linha livre do banco; sem a coluna (view antiga), a regra de antes — e nunca uma caixa nova */
    const selPlanilha = blocoId ? null
      : livre === true ? e.extrato_id
      : livre === false ? null
      : (!sis && !filha && !enriquecida ? e.extrato_id : null);
    const parSoltavel = r && r.lanc_id && livre === false && !r.aplicado && !blocoId ? e.extrato_id : null;
    const repetido = !!r?.lanc_id && (porLanc.get(r.lanc_id) ?? 0) > 1;
    const par: ParDaLinha | null = r && r.lanc_id && (parSoltavel || (r.aplicado && repetido)) ? {
      descricao: (r.lanc_descricao ?? '').trim() || '—',
      valor: sis ? sis.valor_assinado
        : r.lanc_valor === null || r.lanc_valor === undefined ? null
        : (r.lanc_sinal === '1' ? 1 : -1) * Math.abs(Number(r.lanc_valor)),
      gravado: r.aplicado,
      repetido,
    } : null;
    return {
      chave: `p-${e.extrato_id}${sis ? `-${sis.lancamento_id}` : ''}`,
      stagingId: e.extrato_id,
      data: e.data,
      planilha: { texto: e.historico ?? '—', valor: e.valor },
      simbolo: r ? (filha ? '↳' : simboloDaLinha(r, balde, sis ? sis.valor_assinado : null)) : null,
      sistema: sis ? daSistema(sis) : null,
      selo: sis && r ? seloDoPar(r, balde, sis) : null,
      enriquecida,
      filha,
      selPlanilha,
      selSistema: null,
      blocoId,
      parSoltavel,
      par,
      motivoLivre: livre === true && r?.lanc_id && r.lanc_cancelado === true ? MOTIVO_PAR_MORTO : null,
    };
  };

  const dias: DiaExtratoPlanilha[] = mesa.map((d) => {
    const linhas: LinhaSemFornecedor[] = [];
    for (const p of d.pareados) {
      /* 1 linha da planilha × 1 lançamento é o caso normal; 1 × N não acontece aqui (o vínculo é um só por linha). */
      linhas.push(linhaPlanilha(p.extrato, p.filhas[0]?.sis, false));
    }
    for (const n1 of d.paredosN1) {
      /* A mãe é o lançamento; as linhas da planilha que o compõem vêm abaixo, com ↳.
         ⚠ "Desmembrar" SÓ QUANDO A SOMA FECHA (PR-CONC-ENRIQ-BLOCO-ESTADOS): 2+ linhas no mesmo lançamento que somam outro
           valor são um par repetido — o Vivo Casa: duas "Telefone" −506,51 no 8ebd63d4 de −506,51 (soma −1.013,02). */
      const somaFilhas = n1.extratos.reduce((a, x) => a + x.extrato.valor, 0);
      const fecha = Math.abs(Math.abs(somaFilhas) - Math.abs(n1.sis.valor_assinado)) < 0.005;
      linhas.push({
        chave: `n1-${n1.sis.lancamento_id}`, stagingId: n1.extratos[0]?.extrato.extrato_id ?? null, data: n1.sis.data,
        planilha: null, simbolo: null, sistema: daSistema(n1.sis), selo: fecha ? 'Desmembrar' : 'Par repetido',
        enriquecida: false, filha: false,
        selPlanilha: null, selSistema: null, blocoId: null, parSoltavel: null, par: null, motivoLivre: null,
      });
      for (const x of n1.extratos) linhas.push(linhaPlanilha(x.extrato, undefined, true));
    }
    for (const e of d.extratosSemPar) linhas.push(linhaPlanilha(e, undefined, false));
    for (const s of d.lancsSemPar) {
      /* o lançamento de um bloco conferido não é "Só no sistema": está explicado pelas linhas do bloco */
      const blocoId = blocoDoLanc.get(s.lancamento_id) ?? null;
      linhas.push({
        chave: `s-${s.lancamento_id}`, stagingId: null, data: s.data, planilha: null, simbolo: null,
        sistema: daSistema(s), selo: blocoId ? 'Em bloco' : 'Só no sistema', enriquecida: false, filha: false,
        selPlanilha: null, selSistema: blocoId ? null : s.lancamento_id, blocoId, parSoltavel: null, par: null, motivoLivre: null,
      });
    }
    for (const s of d.internas) {
      linhas.push({
        chave: `i-${s.lancamento_id}`, stagingId: null, data: s.data, planilha: null, simbolo: null,
        sistema: daSistema(s), selo: 'Transferência', enriquecida: false, filha: false,
        selPlanilha: null, selSistema: null, blocoId: null, parSoltavel: null, par: null, motivoLivre: null,
      });
    }
    return {
      data: d.data, linhas: linhas.map(completar), planilha: d.banco, sistema: d.sistema,
      confere: Math.abs(d.banco - d.sistema) < 0.005,
    };
  });

  return {
    dias,
    totais: totaisDoEspelho(data, internos),
    nPlanilha: ofx.length,
    nSistema: espelho.sistema_completo.length,
  };
}

function daSistema(s: EspSis): NonNullable<LinhaExtratoPlanilha['sistema']> {
  return {
    valor: s.valor_assinado, data: s.data, descricao: s.descricao ?? '—', fornecedor: s.fornecedor ?? '—',
    status: s.status === 'conciliado' ? 'conciliado' : 'realizado', lancamentoId: s.lancamento_id,
    cru: lancamentoCru(s),
  };
}

/** "Só não enriquecidos": tira a linha da planilha já enriquecida (e o dia que fica vazio). */
export function soNaoEnriquecidos(dias: readonly DiaExtratoPlanilha[]): DiaExtratoPlanilha[] {
  return dias
    .map((d) => ({ ...d, linhas: d.linhas.filter((l) => !l.enriquecida) }))
    .filter((d) => d.linhas.length > 0);
}
