import { FechamentoFitaMeses } from '@/components/FechamentoFitaMeses';
import { formatNum } from '@/lib/calculos/formatters';
import { mesCurto, totalDoRebanho, type LinhaDoResumoGlobal, type ResumoGlobal } from '@/lib/pecuaria/fechamentoGlobal';

/**
 * FECH-GLOBAL-RESUMO-01 — o Fechamento Área com o filtro em "Global": uma linha por fazenda e o caminho para os pastos
 * (mock v2 aprovado pelo Gabriel em 12/10/2026). Entra no lugar da frase "Selecione uma fazenda para o fechamento.".
 * FECH-GLOBAL-RESUMO-01b: sem a coluna Atividade (só dizia "Pecuária"/"—"); os 70px dela foram para Fazenda, Último fechamento e Mês atual.
 *
 * ⚠ SÓ DESENHA. Os números vêm prontos de `fechamentoGlobal.ts` (o mesmo critério da tela por fazenda) e do `useFechamentoGlobal`;
 *   aqui não há soma, filtro nem regra. Campo sem dono = "—".
 * ⚠ LAYOUT FIXO (D4): tabela `table-fixed` com colgroup em px (soma 838 — cabe nos 886 úteis da janela de 1.126 e em 1.100), linhas
 *   de 22px, 10px, uma linha por registro (só o nome da fazenda corta, inteiro no `title`), cards de 46px.
 */

export const COLUNAS_DO_RESUMO = [
  { chave: 'fazenda', rotulo: 'Fazenda', largura: 220, alinha: 'esquerda' },
  { chave: 'cabecas', rotulo: 'Cabeças', largura: 70, alinha: 'direita' },
  { chave: 'area', rotulo: 'Área (ha)', largura: 80, alinha: 'direita' },
  { chave: 'pastos', rotulo: 'Pastos', largura: 54, alinha: 'direita' },
  { chave: 'ultimo', rotulo: 'Último fechamento', largura: 140, alinha: 'esquerda' },
  { chave: 'mes', rotulo: 'Mês atual', largura: 170, alinha: 'esquerda' },
  { chave: 'acao', rotulo: '', largura: 104, alinha: 'direita' },
] as const;
export const LARGURA_DA_TABELA = 838;
export const LEGENDA_DO_RESUMO = 'Meses: verde = todas as fazendas fechadas no mês · âmbar = alguma aberta. Cabeças = o último mês fechado de cada fazenda. A fechar = pastos do mês ainda não fechados.';

const AZUL = '#1e3a5f';
const CAB = 'h-[22px] px-1.5 text-[10px] font-semibold whitespace-nowrap overflow-hidden';
const CEL = 'h-[22px] px-1.5 text-[10px] whitespace-nowrap overflow-hidden';
const alinhamento = (a: 'esquerda' | 'direita') => (a === 'direita' ? 'text-right' : 'text-left');

export interface FechamentoGlobalResumoProps {
  resumo: ResumoGlobal | null;
  cabecas: ReadonlyMap<string, number>;
  lendo: boolean;
  lendoCabecas: boolean;
  erro: string | null;
  anoFiltro: string;
  setAnoFiltro: (ano: string) => void;
  anosDisp: string[];
  mesFiltro: number;
  setMesFiltro: (mes: number) => void;
  /** Abre a tela por fazenda, no mesmo ano e mês. */
  onAbrirFazenda: (fazendaId: string) => void;
}

function Cartao({ rotulo, valor, detalhe, testId }: { rotulo: string; valor: string; detalhe?: string; testId: string }) {
  return (
    <div className="flex h-[46px] min-w-0 flex-col justify-center rounded-md border bg-card px-2.5" data-testid={testId} title={detalhe ? `${rotulo}: ${valor} · ${detalhe}` : `${rotulo}: ${valor}`}>
      <span className="truncate text-[10px] text-muted-foreground">{rotulo}{detalhe ? ` · ${detalhe}` : ''}</span>
      <span className="whitespace-nowrap text-[15px] font-medium leading-tight tabular-nums">{valor}</span>
    </div>
  );
}

function textoDasCabecas(l: LinhaDoResumoGlobal, cabecas: ReadonlyMap<string, number>, lendoCabecas: boolean): string {
  if (!l.ultimo) return '—';
  const v = cabecas.get(l.fazendaId);
  if (v === undefined) return lendoCabecas ? '…' : '—';
  return formatNum(v);
}

export function FechamentoGlobalResumo({
  resumo, cabecas, lendo, lendoCabecas, erro, anoFiltro, setAnoFiltro, anosDisp, mesFiltro, setMesFiltro, onAbrirFazenda,
}: FechamentoGlobalResumoProps) {
  const rebanho = resumo ? totalDoRebanho(resumo.linhas, cabecas) : null;
  const textoDoRebanho = !rebanho || rebanho.fazendas === 0 ? '—' : rebanho.total === null ? (lendoCabecas ? '…' : '—') : formatNum(rebanho.total);
  const detalheDoRebanho = !rebanho || rebanho.fazendas === 0 ? undefined : rebanho.mes ? mesCurto(rebanho.mes) : 'meses diferentes';

  return (
    <div className="px-3 py-2" data-testid="fechamento-global-resumo">
      <div className="mx-auto" style={{ width: LARGURA_DA_TABELA, maxWidth: '100%' }}>
        <FechamentoFitaMeses anoFiltro={anoFiltro} setAnoFiltro={setAnoFiltro} anosDisp={anosDisp}
          mesFiltro={mesFiltro} setMesFiltro={setMesFiltro} statusPorMes={resumo?.statusPorMes ?? {}} />

        <div className="mt-2 grid grid-cols-4 gap-2">
          <Cartao testId="cartao-rebanho" rotulo="Rebanho · último fechamento" valor={textoDoRebanho} detalhe={detalheDoRebanho} />
          <Cartao testId="cartao-area" rotulo="Área de pastos (ha)" valor={resumo ? formatNum(resumo.totais.areaHa, 1) : lendo ? '…' : '—'} />
          <Cartao testId="cartao-pastos" rotulo="Pastos" valor={resumo ? formatNum(resumo.totais.pastos) : lendo ? '…' : '—'} />
          <Cartao testId="cartao-fechamento" rotulo="Fechamento do mês"
            valor={resumo ? `${resumo.fechamentoDoMes.fechadas} de ${resumo.fechamentoDoMes.comPastos} fazendas` : lendo ? '…' : '—'} />
        </div>

        {/* Lugar reservado do recado: existe sempre. */}
        <div className="flex h-[16px] items-center text-[10px]" data-testid="recado-do-resumo">
          {erro ? <span className="truncate text-destructive" role="alert" title={erro}>{erro}</span>
            : lendo ? <span className="text-muted-foreground">Lendo os fechamentos…</span> : null}
        </div>

        <table className="table-fixed border-collapse" style={{ width: LARGURA_DA_TABELA }} data-testid="tabela-do-resumo">
          <colgroup>
            {COLUNAS_DO_RESUMO.map(c => <col key={c.chave} style={{ width: c.largura }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: '#eef2f7', color: AZUL }}>
              {COLUNAS_DO_RESUMO.map(c => <th key={c.chave} className={`${CAB} ${alinhamento(c.alinha)}`}>{c.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {(resumo?.linhas ?? []).map(l => {
              const aberto = l.mes.situacao === 'aberto';
              const textoDoMes = l.mes.situacao === 'fechado' ? 'fechado'
                : aberto ? `aberto · ${l.mes.aFechar} a fechar` : '—';
              const cab = textoDasCabecas(l, cabecas, lendoCabecas);
              return (
                <tr key={l.fazendaId} className="cursor-pointer border-b hover:bg-muted/40" data-testid="linha-fazenda"
                  data-situacao={l.mes.situacao} onClick={() => onAbrirFazenda(l.fazendaId)}>
                  <td className={`${CEL} text-left font-medium text-ellipsis`} title={l.nome} data-testid="cel-fazenda">{l.nome}</td>
                  <td className={`${CEL} text-right tabular-nums`} data-testid="cel-cabecas">{cab}</td>
                  <td className={`${CEL} text-right tabular-nums`} data-testid="cel-area">{formatNum(l.areaHa, 1)}</td>
                  <td className={`${CEL} text-right tabular-nums`} data-testid="cel-pastos">{formatNum(l.pastos)}</td>
                  <td className={`${CEL} text-left tabular-nums`} data-testid="cel-ultimo">
                    {l.ultimo ? `${mesCurto(l.ultimo.anoMes)} · ${cab}` : '—'}
                  </td>
                  <td className={`${CEL} text-left ${l.mes.situacao === 'fechado' ? 'text-[#3B6D11]' : aberto ? 'text-[#854F0B]' : 'text-muted-foreground'}`}
                    data-testid="cel-mes" title={aberto ? `${l.mes.aFechar} pasto(s) do mês ainda não fechado(s)` : undefined}>
                    {textoDoMes}
                  </td>
                  <td className={`${CEL} text-right`}>
                    <button type="button" className="whitespace-nowrap text-[10px] font-medium text-primary underline-offset-2 hover:underline"
                      data-testid="abrir-fazenda" onClick={(e) => { e.stopPropagation(); onAbrirFazenda(l.fazendaId); }}>
                      {l.mes.situacao === 'fechado' ? 'Ver pastos →' : 'Abrir pastos →'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {resumo && resumo.linhas.length === 0 && (
              <tr><td colSpan={COLUNAS_DO_RESUMO.length} className={`${CEL} text-left text-muted-foreground`}>Nenhuma fazenda ativa.</td></tr>
            )}
          </tbody>
          {resumo && resumo.linhas.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f3f5f8' }} className="font-semibold" data-testid="rodape-do-resumo">
                <td className={`${CEL} text-left`}>Total · {resumo.linhas.length} {resumo.linhas.length === 1 ? 'fazenda' : 'fazendas'}</td>
                <td className={`${CEL} text-right tabular-nums`} data-testid="total-cabecas">{textoDoRebanho}</td>
                <td className={`${CEL} text-right tabular-nums`} data-testid="total-area">{formatNum(resumo.totais.areaHa, 1)}</td>
                <td className={`${CEL} text-right tabular-nums`} data-testid="total-pastos">{formatNum(resumo.totais.pastos)}</td>
                <td className={CEL} />
                <td className={`${CEL} text-left`} data-testid="total-mes">{resumo.fechamentoDoMes.fechadas} de {resumo.fechamentoDoMes.comPastos} fechadas</td>
                <td className={CEL} />
              </tr>
            </tfoot>
          )}
        </table>

        <p className="mt-1 truncate text-[10px] text-muted-foreground" title={LEGENDA_DO_RESUMO} data-testid="legenda-do-resumo">{LEGENDA_DO_RESUMO}</p>
      </div>
    </div>
  );
}
