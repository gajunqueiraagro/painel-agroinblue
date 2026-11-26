/**
 * FOLHA-TELAS-03 (2) — a aba FÉRIAS (mock MDj3uBiVv1ez5SFtBP7hEn; D2 a / D3 a do Gabriel, 25/11): no topo as PROVISÕES de férias e de 13º
 * (acumuladas, sem encargos) e quantas férias pedem programação em 90 dias; embaixo um funcionário por linha — o período que ganhou, até quando
 * tem de tirar, o que já tirou, a situação (vencida em vermelho, vencendo em âmbar) e a fonte (a escala do contador ou "pela admissão").
 * ⚠ TUDO VEM DE `fn_folha_ferias_lista` (lote 118740): a tela não calcula período, prazo nem provisão (`folhaFerias.ts` só escreve a palavra).
 * ⚠ RÉGUA DE FONTES NOVA (UI-FONTES-REGUA-01): cabeçalho e datas 10px, linha 11px/24px; tabela de régua fixa (`colgroup` em px; Funcionário é a
 *   elástica), cabeçalho e rodapé presos, um scrollport, altura até o fim da janela.
 * ⚠ FOLHA-REGUA-01 (Gabriel 26/11 08:13): a régua da Folha (`reguaFolha.ts`: tabela 10,5 · linha 20 · cabeçalho 10).
 */
import type { ReactNode } from 'react';
import { QUADRO_REGUA, RODAPE_REGUA } from '@/components/ui/regua-tabela';
import { ROTULO_F, TH_F, LINHA_F, TD_F, TD_F_TEXTO, TD_F_NUM, TD_F_DATA, LINHA_RODAPE_F } from './reguaFolha';
import { useFeriasDaFolha } from '@/hooks/useFolhaMes';
import { cn } from '@/lib/utils';
import { dataBR, n2 } from '@/lib/folha/folhaTela';
import { FRASE_PELA_ADMISSAO, feriasAProgramar, situacaoDeFerias, type FeriasDoFuncionario, type TomDeFerias } from '@/lib/folha/folhaFerias';

type Coluna = 'nome' | 'admissao' | 'periodo' | 'ate' | 'tirou' | 'situacao' | 'fonte' | 'prov_ferias' | 'prov_13';
/** px medidos para a janela de 1126 (≈ 950 de tabela): Funcionário é a elástica (~140px a 1126, o inteiro no `title`) */
const COLUNAS: ReadonlyArray<{ coluna: Coluna; rotulo: string; largura: number | null; direita?: boolean }> = [
  { coluna: 'nome', rotulo: 'Funcionário', largura: null },
  { coluna: 'admissao', rotulo: 'Admissão', largura: 80 },
  { coluna: 'periodo', rotulo: 'Período que ganhou', largura: 168 },
  { coluna: 'ate', rotulo: 'Tirar até', largura: 80 },
  { coluna: 'tirou', rotulo: 'Tirou', largura: 72, direita: true },
  { coluna: 'situacao', rotulo: 'Situação', largura: 140 },
  { coluna: 'fonte', rotulo: 'Fonte', largura: 84 },
  { coluna: 'prov_ferias', rotulo: 'Provisão férias', largura: 96, direita: true },
  { coluna: 'prov_13', rotulo: 'Provisão 13º', largura: 92, direita: true },
];
function Colunas() {
  return <colgroup>{COLUNAS.map(c => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>;
}
const PONTO: Record<TomDeFerias, string> = { verde: 'bg-emerald-600', ambar: 'bg-amber-500', vermelho: 'bg-red-600', cinza: 'bg-slate-400', azul: 'bg-blue-600' };
const valorOuTraco = (v: number | null) => (v == null ? '—' : n2(v));
const periodoBR = (l: FeriasDoFuncionario) => (l.aquisitivo_inicio && l.aquisitivo_fim ? `${dataBR(l.aquisitivo_inicio)} a ${dataBR(l.aquisitivo_fim)}` : '—');

export function AbaFerias({ clienteId, onFicha }: { clienteId: string; onFicha: (id: string) => void }) {
  const { data, isLoading, error } = useFeriasDaFolha(clienteId);
  const linhas = data?.linhas ?? [];
  const t = data?.totais ?? null;
  const aProgramar = t ? feriasAProgramar(t) : null;
  const notas = t ? [
    t.pela_admissao ? `${t.pela_admissao} pela admissão (sem a escala do contador)` : null,
    t.sem_salario ? `${t.sem_salario} sem salário fora da provisão` : null, t.sem_admissao ? `${t.sem_admissao} sem admissão` : null,
  ].filter((x): x is string => x !== null) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="folha-aba-ferias">
      <div className="flex h-[48px] shrink-0 items-center gap-2 rounded-lg border bg-card px-2" data-testid="folha-ferias-topo">
        <Indicador rotulo="Provisão de férias (acumulada)" valor={t ? valorOuTraco(t.provisao_ferias) : '…'} testId="folha-ferias-prov-ferias" />
        <Indicador rotulo="Provisão de 13º (acumulada)" valor={t ? valorOuTraco(t.provisao_13) : '…'} testId="folha-ferias-prov-13" />
        <Indicador rotulo="A programar nos próximos 90 dias" testId="folha-ferias-a-programar"
          valor={aProgramar == null ? '…' : aProgramar.toLocaleString('pt-BR')}
          extra={t && t.vencidas ? <span className="text-red-700">{t.vencidas} {t.vencidas === 1 ? 'vencida' : 'vencidas'}</span> : null} />
        {/* frase fora de tabela: nunca "…" nem rolar (P104) — DUAS linhas reservadas a 10px; a explicação inteira no `title` */}
        <span className={cn(ROTULO_F, 'max-h-[26px] min-w-0 flex-1 overflow-hidden whitespace-normal leading-[13px] text-muted-foreground')}
          title={`sem encargos · ${FRASE_PELA_ADMISSAO}`} data-testid="folha-ferias-notas">
          sem encargos{notas.length ? ` · ${notas.join(' · ')}` : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <div className={QUADRO_REGUA}>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll" data-testid="folha-ferias-rolagem">
            <table className="w-full table-fixed border-collapse" data-testid="folha-ferias-tabela">
              <Colunas />
              <thead className="text-primary-foreground">
                <tr className="h-[22px]">
                  {COLUNAS.map(c => <th key={c.coluna} className={cn(TH_F, 'sticky top-0 z-10 bg-primary', c.direita ? 'text-right' : 'text-left')}>{c.rotulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const s = situacaoDeFerias(l);
                  const vermelho = l.situacao_ferias === 'vencida';
                  return (
                    <tr key={l.funcionario_id} className={cn(LINHA_F, 'border-b border-border/40 hover:bg-muted/40')} data-testid="folha-ferias-linha">
                      <td className={TD_F_TEXTO} title={l.nome}>
                        <button type="button" className="max-w-full truncate text-left hover:underline" onClick={() => onFicha(l.funcionario_id)}>{l.nome}</button>
                      </td>
                      <td className={cn(TD_F_DATA, !l.admissao && 'text-muted-foreground')}>{l.admissao ? dataBR(l.admissao) : '—'}</td>
                      <td className={cn(TD_F_DATA, !l.aquisitivo_inicio && 'text-muted-foreground')}>{periodoBR(l)}</td>
                      <td className={cn(TD_F_DATA, vermelho ? 'font-semibold text-red-700' : l.situacao_ferias === 'vence' ? 'text-amber-700' : !l.tirar_ate && 'text-muted-foreground')}>
                        {l.tirar_ate ? dataBR(l.tirar_ate) : '—'}
                      </td>
                      <td className={cn(TD_F_NUM, l.tirou == null && 'text-muted-foreground')}
                        title={l.tirou == null && l.origem === 'admissao' ? 'pela admissão não se sabe o que já foi tirado' : undefined}>
                        {l.tirou == null ? '—' : `${l.tirou.toLocaleString('pt-BR')} de ${(l.direito ?? 30).toLocaleString('pt-BR')} d`}
                      </td>
                      <td className={cn(TD_F, vermelho && 'text-red-700')} title={s.texto} data-testid="folha-ferias-situacao">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={cn('h-1.5 w-1.5 rounded-full', PONTO[s.tom])} />{s.texto}</span>
                      </td>
                      <td className={TD_F} title={l.origem === 'admissao' ? FRASE_PELA_ADMISSAO : l.origem === 'escala' ? 'a escala de férias do contador' : undefined}>
                        {l.origem === 'escala' ? 'escala' : l.origem === 'admissao' ? <span className="text-muted-foreground">pela admissão</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={cn(TD_F_NUM, l.provisao_ferias == null && 'text-muted-foreground')}
                        title={l.provisao_ferias == null && l.salario == null ? 'sem salário no cadastro' : undefined}>{valorOuTraco(l.provisao_ferias)}</td>
                      <td className={cn(TD_F_NUM, l.provisao_13 == null && 'text-muted-foreground')}>{valorOuTraco(l.provisao_13)}</td>
                    </tr>
                  );
                })}
                {linhas.length === 0 && (
                  <tr className={LINHA_F}>
                    <td colSpan={COLUNAS.length} className={cn(TD_F, 'py-6 text-center text-muted-foreground')}>
                      {isLoading ? 'Carregando…' : error ? 'Não consegui ler as férias. Tente de novo.' : 'Nenhum funcionário ativo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={cn(RODAPE_REGUA, 'overflow-x-hidden overflow-y-scroll')} data-testid="folha-ferias-rodape">
            <table className="w-full table-fixed border-collapse">
              <Colunas />
              <tbody>
                <tr className={LINHA_RODAPE_F}>
                  <td colSpan={7} className="truncate px-1">{t ? `${t.pessoas.toLocaleString('pt-BR')} ${t.pessoas === 1 ? 'funcionário' : 'funcionários'}` : ''}</td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums">{t ? valorOuTraco(t.provisao_ferias) : ''}</td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums">{t ? valorOuTraco(t.provisao_13) : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, extra, testId }: { rotulo: string; valor: string; extra?: ReactNode; testId: string }) {
  return (
    <div className="flex h-[38px] w-[196px] shrink-0 flex-col justify-center rounded-md border px-2" data-testid={testId}>
      <span className={cn('truncate text-muted-foreground', ROTULO_F)} title={rotulo}>{rotulo}</span>
      <span className="flex items-baseline gap-2 whitespace-nowrap">
        <b className="text-[13px] tabular-nums">{valor}</b>
        {extra && <span className={ROTULO_F}>{extra}</span>}
      </span>
    </div>
  );
}
