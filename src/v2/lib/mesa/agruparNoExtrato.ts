/**
 * O GESTO DA SELEÇÃO no Extrato da planilha — PR-CONC-ENRIQ-AGRUP-2b-TELA; o bloco e o casar 1×1 no PR-CONC-ENRIQ-BLOCO-NM-B.
 *
 * O operador marca linhas "sem par" da planilha e lançamentos "Só no sistema", como na Conferência; a forma da seleção
 * e a CLASSIFICAÇÃO dos lançamentos marcados dizem qual RPC grava, nesta ordem:
 *   só um lado               -> nada ("marque também o outro lado")
 *   todos classificados      -> 'bloco'      (`fn_classificacao_conferir_bloco`: N linhas × M lançamentos, nada se grava
 *                                              no lançamento; só com a soma fechando ao centavo)
 *   há cru, 1 × 1            -> 'casar'      (`fn_classificacao_casar_manual`: a planilha sobe para a proposta do cru)
 *   há cru, N × 1            -> 'desmembrar' (`fn_classificacao_split_substituir`: N lançamentos no lugar do consolidado)
 *   todos crus, 1 × N        -> 'juntar'     (`fn_classificacao_resolver_grupo`: N lançamentos nesta linha)
 *   o resto                  -> nada (cru misturado num bloco: desmembre ou case 1×1)
 *
 * ⚠ ESTA FUNÇÃO SÓ HABILITA O BOTÃO. Quem valida soma, origem, conta, mês fechado e estado da linha é a RPC; a recusa dela é
 *   a verdade e aparece escrita na barra. As contas daqui são as somas ao centavo que o próprio banco também exige (o
 *   desmembrar pela MESMA frase da RPC, `motivoDoDesmembrar`; o bloco e o casar pela diferença).
 * ⚠ "CRU" É O DO LADO SISTEMA (`cru` de cada item: origem extrato/ofx e sem subcentro) — a mesma pergunta que o casar manual
 *   faz no banco. O banco ainda recusa o que a tela não vê (ex.: plano vazio com subcentro escrito) — a recusa fica na barra.
 * ⚠ SOMAS COM SINAL, como os valores já desenhados na linha (saída negativa nos dois lados).
 */
import { motivoDoDesmembrar } from '@/v2/lib/mesa/desmembrar';

export type FormaDaSelecao = 'casar' | 'desmembrar' | 'juntar' | 'bloco';

export interface ItemMarcado { id: string; valor: number }
/** O lançamento marcado — `cru` decide entre o bloco (classificado) e o casar/desmembrar/juntar (cru). */
export interface ItemSistemaMarcado extends ItemMarcado { cru: boolean }

export interface GestoDaSelecao {
  /** `null` = nada marcado, só um lado, ou uma forma sem gravação. */
  forma: FormaDaSelecao | null;
  /** O texto do botão. */
  rotulo: string;
  habilitado: boolean;
  /** Por que o botão está apagado — escrito ao lado e no `title`. */
  motivo: string | null;
  somaPlanilha: number;
  somaSistema: number;
  /** planilha − sistema, com sinal. */
  diferenca: number;
}

export const MOTIVO_CRU_NO_BLOCO = 'há lançamento sem classificação no bloco: desmembre ou case 1×1';

const cent = (v: number) => Math.round(v * 100);
const brl = (centavos: number) =>
  (Math.abs(centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function gestoDaSelecao(sel: {
  planilha: readonly ItemMarcado[]; sistema: readonly ItemSistemaMarcado[];
}): GestoDaSelecao {
  const nP = sel.planilha.length;
  const nS = sel.sistema.length;
  const somaPlanilha = cent(sel.planilha.reduce((a, x) => a + x.valor, 0)) / 100;
  const somaSistema = cent(sel.sistema.reduce((a, x) => a + x.valor, 0)) / 100;
  const diferencaCent = cent(somaPlanilha) - cent(somaSistema);
  const base = { somaPlanilha, somaSistema, diferenca: diferencaCent / 100 };

  if (nP === 0 && nS === 0) return { ...base, forma: null, rotulo: '', habilitado: false, motivo: null };
  if (nP === 0 || nS === 0) {
    return { ...base, forma: null, rotulo: '', habilitado: false, motivo: 'marque também o outro lado' };
  }
  const nCrus = sel.sistema.filter((x) => x.cru).length;

  /* TODOS CLASSIFICADOS: o bloco, de qualquer forma (1×1 inclusive) — só confere quando fecha ao centavo */
  if (nCrus === 0) {
    const fecha = diferencaCent === 0;
    return {
      ...base, forma: 'bloco', rotulo: `Conferir bloco ${nP}×${nS}`, habilitado: fecha,
      motivo: fecha ? null : `as somas diferem em R$ ${brl(diferencaCent)} — o bloco só confere quando fecha`,
    };
  }
  if (nP === 1 && nS === 1) {
    const iguais = diferencaCent === 0;
    return {
      ...base, forma: 'casar', rotulo: 'Casar', habilitado: iguais,
      motivo: iguais ? null : `os valores diferem em R$ ${brl(diferencaCent)} — o casar 1×1 é ao centavo`,
    };
  }
  if (nP >= 2 && nS === 1) {
    const motivo = motivoDoDesmembrar({
      completo: true, bate: diferencaCent === 0, diferencaCent, carregadas: nP, total: nP,
    });
    return { ...base, forma: 'desmembrar', rotulo: `Desmembrar em ${nP}`, habilitado: motivo === null, motivo };
  }
  if (nP === 1 && nS >= 2 && nCrus === nS) {
    return { ...base, forma: 'juntar', rotulo: `Juntar ${nS} nesta linha`, habilitado: true, motivo: null };
  }
  return { ...base, forma: null, rotulo: '', habilitado: false, motivo: MOTIVO_CRU_NO_BLOCO };
}

/**
 * "OS DO MESMO FORNECEDOR" — PR-CONC-ENRIQ-MARCAR-FAVORECIDO. Os ids MARCÁVEIS de UM lado com a mesma chave de fornecedor
 * (`chaveFornecedor` da linha). É só um atalho para marcar caixas que já existem: linha em bloco, pareada, filha,
 * transferência e a mãe do desmembrar não têm caixa (`selPlanilha`/`selSistema` nulos) e por isso nunca entram.
 * ⚠ UM LADO SÓ: a chave da planilha e a do sistema são de mundos diferentes (o fornecedor resolvido da planilha × o nome do
 *   cadastro) e nunca se comparam — o operador escolhe os dois lados.
 * ⚠ CHAVE VAZIA (sem fornecedor, "—") devolve [] — nunca "todos os sem fornecedor".
 */
export type LadoDoExtrato = 'planilha' | 'sistema';

export interface LinhaComFornecedor {
  selPlanilha: string | null;
  selSistema: string | null;
  chaveFornecedor: { planilha: string; sistema: string };
}

export function doMesmoFornecedor(linhas: readonly LinhaComFornecedor[], lado: LadoDoExtrato, chave: string): string[] {
  if (!chave) return [];
  const ids: string[] = [];
  for (const l of linhas) {
    const id = lado === 'planilha' ? l.selPlanilha : l.selSistema;
    if (id && l.chaveFornecedor[lado] === chave && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
