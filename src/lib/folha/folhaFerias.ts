/**
 * FOLHA-TELAS-03 (2) — as REGRAS da aba FÉRIAS: o leitor do jsonb de `fn_folha_ferias_lista(cliente)` (lote 118740; sem cast) e as palavras.
 * ⚠ NENHUM NÚMERO NASCE AQUI: o período, o "tirar até", a situação e as PROVISÕES vêm prontos do banco (D2 a / D3 a do Gabriel, 25/11).
 * ⚠ "pela admissão" = sem a escala do contador: o banco conta o período pelo aniversário da admissão e não sabe o que foi tirado ("—").
 */
import { ehLinha, linhas, num, numOuNulo, txt, type Linha } from '@/lib/folha/folhaTela';

export type SituacaoDeFerias = 'vencida' | 'vence' | 'a_tirar' | 'ganhando' | 'tirou' | 'sem_admissao';
const SITUACOES: readonly SituacaoDeFerias[] = ['vencida', 'vence', 'a_tirar', 'ganhando', 'tirou', 'sem_admissao'];
export interface FeriasDoFuncionario {
  funcionario_id: string; nome: string; admissao: string | null; origem: 'escala' | 'admissao' | null;
  aquisitivo_inicio: string | null; aquisitivo_fim: string | null; tirar_ate: string | null; dias: number | null;
  direito: number | null; tirou: number | null; saldo: number | null; situacao_ferias: SituacaoDeFerias; avos_em_curso: number;
  salario: number | null; provisao_ferias: number | null; provisao_13: number | null;
}
export interface TotaisDeFerias {
  pessoas: number; vencidas: number; vence_90: number; pela_admissao: number; pela_escala: number; sem_admissao: number; sem_salario: number;
  provisao_ferias: number | null; provisao_13: number | null;
}
export interface FeriasDaFolha { linhas: FeriasDoFuncionario[]; totais: TotaisDeFerias }

const origem = (v: unknown): FeriasDoFuncionario['origem'] => (v === 'escala' || v === 'admissao' ? v : null);
export function feriasDoBanco(v: unknown): FeriasDaFolha | null {
  if (!ehLinha(v)) return null;
  const t: Linha = ehLinha(v.totais) ? v.totais : {};
  return {
    linhas: linhas(v.linhas).map(l => ({
      funcionario_id: txt(l.funcionario_id) ?? '', nome: txt(l.nome) ?? '—', admissao: txt(l.admissao), origem: origem(l.origem),
      aquisitivo_inicio: txt(l.aquisitivo_inicio), aquisitivo_fim: txt(l.aquisitivo_fim), tirar_ate: txt(l.tirar_ate), dias: numOuNulo(l.dias),
      direito: numOuNulo(l.direito), tirou: numOuNulo(l.tirou), saldo: numOuNulo(l.saldo),
      situacao_ferias: SITUACOES.find(s => s === l.situacao_ferias) ?? 'sem_admissao', avos_em_curso: num(l.avos_em_curso),
      salario: numOuNulo(l.salario), provisao_ferias: numOuNulo(l.provisao_ferias), provisao_13: numOuNulo(l.provisao_13),
    })),
    totais: {
      pessoas: num(t.pessoas), vencidas: num(t.vencidas), vence_90: num(t.vence_90), pela_admissao: num(t.pela_admissao), pela_escala: num(t.pela_escala),
      sem_admissao: num(t.sem_admissao), sem_salario: num(t.sem_salario), provisao_ferias: numOuNulo(t.provisao_ferias), provisao_13: numOuNulo(t.provisao_13),
    },
  };
}

export type TomDeFerias = 'verde' | 'ambar' | 'vermelho' | 'cinza' | 'azul';
/** a palavra da tela (o mock: "Em dia", "Vence em N dias", "Vencida (dobro)", "Tirou") e o tom do ponto */
export function situacaoDeFerias(l: Pick<FeriasDoFuncionario, 'situacao_ferias' | 'dias' | 'avos_em_curso'>): { texto: string; tom: TomDeFerias } {
  switch (l.situacao_ferias) {
    case 'vencida': return { texto: 'Vencida (dobro)', tom: 'vermelho' };
    case 'vence': return { texto: l.dias == null ? 'Vence em breve' : l.dias === 0 ? 'Vence hoje' : `Vence em ${l.dias} ${l.dias === 1 ? 'dia' : 'dias'}`, tom: 'ambar' };
    case 'a_tirar': return { texto: 'A tirar', tom: 'verde' };
    case 'ganhando': return { texto: `Ganhando (${l.avos_em_curso}/12)`, tom: 'azul' };
    case 'tirou': return { texto: 'Tirou', tom: 'verde' };
    default: return { texto: 'Sem admissão', tom: 'cinza' };
  }
}
export const FRASE_PELA_ADMISSAO = 'pela admissão: sem a escala do contador, o período conta do aniversário da admissão e não se sabe o que já foi tirado';
/** as férias que pedem atenção (o número da aba): vencidas + vencendo em 90 dias */
export const feriasAProgramar = (t: Pick<TotaisDeFerias, 'vencidas' | 'vence_90'>): number => t.vencidas + t.vence_90;
