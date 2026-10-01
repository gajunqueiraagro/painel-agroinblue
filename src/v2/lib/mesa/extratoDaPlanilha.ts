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
  | 'Enriquecido' | 'Cru · aplicar' | 'Diverge' | 'Valor ≠' | 'Só no sistema' | 'Desmembrar' | 'Transferência';

const ORIGENS_CRUAS = new Set(['extrato', 'ofx']);

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

/** B = veio do banco (extrato/OFX) · ✓ = conciliado · M = lançado à mão. */
export function origemDoSistema(s: EspSis): 'B' | '✓' | 'M' {
  if (s.status === 'conciliado') return '✓';
  if (s.origem_lancamento && ORIGENS_CRUAS.has(s.origem_lancamento)) return 'B';
  return 'M';
}

/** Uma linha desenhada. `stagingId` é o que abre a Mesa (só no lado da planilha). */
export interface LinhaExtratoPlanilha {
  chave: string;
  stagingId: string | null;
  data: string | null;
  planilha: { texto: string; valor: number } | null;
  simbolo: SimboloPlanilha | null;
  sistema: { valor: number; data: string | null; descricao: string; fornecedor: string; origem: 'B' | '✓' | 'M'; lancamentoId: string } | null;
  selo: SeloSistema | null;
  /** Fundo verde-claro: a linha da planilha já está enriquecida. */
  enriquecida: boolean;
  /** Filha de um agrupamento (desenhada abaixo da mãe, recuada). */
  filha: boolean;
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
    .filter((r) => !!r.lanc_id && sisIds.has(r.lanc_id))
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

  const linhaPlanilha = (e: EspOfx, sis: EspSis | undefined, filha: boolean): LinhaExtratoPlanilha => {
    const r = porStaging.get(e.extrato_id);
    const balde: BaldePainel = r ? baldeDaLinha(r, sobrescreverIds.has(e.extrato_id)) : 'outras';
    return {
      chave: `p-${e.extrato_id}${sis ? `-${sis.lancamento_id}` : ''}`,
      stagingId: e.extrato_id,
      data: e.data,
      planilha: { texto: e.historico ?? '—', valor: e.valor },
      simbolo: r ? (filha ? '↳' : simboloDaLinha(r, balde, sis ? sis.valor_assinado : null)) : null,
      sistema: sis ? daSistema(sis) : null,
      selo: sis && r ? seloDoPar(r, balde, sis) : null,
      enriquecida: balde === 'gravada',
      filha,
    };
  };

  const dias: DiaExtratoPlanilha[] = mesa.map((d) => {
    const linhas: LinhaExtratoPlanilha[] = [];
    for (const p of d.pareados) {
      /* 1 linha da planilha × 1 lançamento é o caso normal; 1 × N não acontece aqui (o vínculo é um só por linha). */
      linhas.push(linhaPlanilha(p.extrato, p.filhas[0]?.sis, false));
    }
    for (const n1 of d.paredosN1) {
      /* A mãe é o lançamento; as linhas da planilha que o compõem vêm abaixo, com ↳. */
      linhas.push({
        chave: `n1-${n1.sis.lancamento_id}`, stagingId: n1.extratos[0]?.extrato.extrato_id ?? null, data: n1.sis.data,
        planilha: null, simbolo: null, sistema: daSistema(n1.sis), selo: 'Desmembrar', enriquecida: false, filha: false,
      });
      for (const x of n1.extratos) linhas.push(linhaPlanilha(x.extrato, undefined, true));
    }
    for (const e of d.extratosSemPar) linhas.push(linhaPlanilha(e, undefined, false));
    for (const s of d.lancsSemPar) {
      linhas.push({
        chave: `s-${s.lancamento_id}`, stagingId: null, data: s.data, planilha: null, simbolo: null,
        sistema: daSistema(s), selo: 'Só no sistema', enriquecida: false, filha: false,
      });
    }
    for (const s of d.internas) {
      linhas.push({
        chave: `i-${s.lancamento_id}`, stagingId: null, data: s.data, planilha: null, simbolo: null,
        sistema: daSistema(s), selo: 'Transferência', enriquecida: false, filha: false,
      });
    }
    return { data: d.data, linhas, planilha: d.banco, sistema: d.sistema, confere: Math.abs(d.banco - d.sistema) < 0.005 };
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
    origem: origemDoSistema(s), lancamentoId: s.lancamento_id,
  };
}

/** "Só não enriquecidos": tira a linha da planilha já enriquecida (e o dia que fica vazio). */
export function soNaoEnriquecidos(dias: readonly DiaExtratoPlanilha[]): DiaExtratoPlanilha[] {
  return dias
    .map((d) => ({ ...d, linhas: d.linhas.filter((l) => !l.enriquecida) }))
    .filter((d) => d.linhas.length > 0);
}
