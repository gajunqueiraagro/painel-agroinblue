/**
 * FOLHA-01 · PR B (telas) — a aba PENDÊNCIAS: uma lista só, por tipo, cada uma com a sua ação (contrato §3.3 + §6).
 * ⚠ AS PENDÊNCIAS VÊM DO BANCO (`fn_folha_pendencias`): a tela não acha nenhuma; só filtra por tipo e oferece a ação do contrato.
 * ⚠ TODA AÇÃO PASSA PELA FUNÇÃO DO BANCO, COM PRÉVIA E TRILHA: ligar = `fn_lancamento_funcionario_ligar` (simular → confirmar); cadastrar =
 *   `fn_folha_funcionario_gravar` (+ desligar) e depois ligar; "não é" = `fn_folha_pendencia_descartar` com motivo, e o aviso traz o DESFAZER.
 * ⚠ A AÇÃO TEM 340px (o gate mediu 334 com os 3 botões e o ⋯): até 3 botões de largura fixa que nunca quebram; o resto vai para o "⋯" (o menu da casa).
 */
import { useMemo, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Segmentado } from '@/components/ui/segmentado';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM, QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { useFolhaApi, usePendenciasFolha, useRelerFolha } from '@/hooks/useFolha';
import { cn } from '@/lib/utils';
import {
  acoesDaPendencia, contarPendencias, dataBR, desdeDaPendencia, fraseDaPendencia, quemDaPendencia, rotuloDaPendencia, ROTULO_PENDENCIA,
  TIPOS_DE_PENDENCIA, type AcaoPendencia, type FiltroPendencia, type Pendencia,
} from '@/lib/folha/folhaTela';
import { ResolverPendencia } from './ResolverPendencia';

type Coluna = 'tipo' | 'quem' | 'oque' | 'desde' | 'acao';
const COLUNAS: ReadonlyArray<{ coluna: Coluna; rotulo: string; largura: number | null; ordena?: boolean }> = [
  { coluna: 'tipo', rotulo: 'Tipo', largura: 140, ordena: true },
  { coluna: 'quem', rotulo: 'Funcionário / favorecido', largura: 230, ordena: true },
  { coluna: 'oque', rotulo: 'O que é', largura: null, ordena: true },
  { coluna: 'desde', rotulo: 'Desde', largura: 72, ordena: true },
  { coluna: 'acao', rotulo: 'Ação', largura: 340 },
];
const ORDENAVEIS: readonly ColunaOrdenavel<Pendencia, Coluna>[] = [
  { coluna: 'tipo', tipo: 'texto', valor: p => rotuloDaPendencia(p) },
  { coluna: 'quem', tipo: 'texto', valor: p => quemDaPendencia(p) },
  { coluna: 'oque', tipo: 'texto', valor: p => fraseDaPendencia(p) },
  { coluna: 'desde', tipo: 'data', valor: p => desdeDaPendencia(p) },
];
/** as larguras FIXAS dos 3 botões à vista (o maior rótulo de cada lugar cabe a 10px: "Cadastrar desligado", "É o mesmo · ligar 999") */
export const LARGURAS_DOS_BOTOES = [124, 92, 82] as const;
function Colunas() {
  return <colgroup>{COLUNAS.map(c => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>;
}

export function AbaPendencias({ clienteId, onFicha }: { clienteId: string; onFicha?: (funcionarioId: string) => void }) {
  const api = useFolhaApi();
  const reler = useRelerFolha();
  const { data, isLoading, error } = usePendenciasFolha(clienteId);
  const [filtro, setFiltro] = useState<FiltroPendencia>('todas');
  const [resolvendo, setResolvendo] = useState<{ p: Pendencia; acao: AcaoPendencia } | null>(null);
  const itens = useMemo(() => data?.itens ?? [], [data]);
  const contagem = useMemo(() => contarPendencias(itens), [itens]);
  const visiveis = useMemo(() => (filtro === 'todas' ? itens : itens.filter(p => p.tipo === filtro)), [itens, filtro]);
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela(visiveis, ORDENAVEIS, { coluna: 'desde', direcao: 'desc' });
  const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary transition-[filter] hover:brightness-110');

  const agir = (p: Pendencia, acao: AcaoPendencia) => {
    if (acao === 'novo_documento') { if (p.funcionario_id && onFicha) onFicha(p.funcionario_id); return; }
    setResolvendo({ p, acao });
  };
  /** o aviso do descarte traz o DESFAZER (o gesto contrário do mesmo dono) */
  const aoDescartar = (p: Pendencia) => {
    toast.success('Pendência descartada.', {
      action: { label: 'Desfazer', onClick: () => { void (async () => {
        const r = await api.descartar(clienteId, p.chave, 'desfeito pelo aviso', true);
        if (!r.ok) toast.error(r.erro); else { toast.success('A pendência voltou.'); await reler(); }
      })(); } },
    });
  };

  const opcoes: Array<{ valor: FiltroPendencia; rotulo: string }> = [
    { valor: 'todas', rotulo: 'Todas' }, ...TIPOS_DE_PENDENCIA.map(t => ({ valor: t, rotulo: ROTULO_PENDENCIA[t] })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex h-[34px] shrink-0 items-center gap-2 rounded-lg border bg-card px-2" data-testid="folha-pendencias-filtros">
        <Segmentado altura={22} fonte={10} valor={filtro} onEscolher={setFiltro} opcoes={opcoes.map(o => ({
          valor: o.valor,
          rotulo: <span className="inline-flex w-[128px] items-center justify-center gap-1 overflow-hidden whitespace-nowrap">{o.rotulo}
            <TextoReservado texto={data ? contagem[o.valor].toLocaleString('pt-BR') : ''} reserva="999" className="font-semibold" /></span>,
        }))} />
        <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground" title="cada ação passa pela função do banco, com prévia e trilha">
          {data && data.descartadas > 0 ? `${data.descartadas.toLocaleString('pt-BR')} descartadas` : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <div className={QUADRO_REGUA}>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll" data-testid="folha-pendencias-rolagem">
            <table className="w-full table-fixed border-collapse" data-testid="folha-pendencias-tabela">
              <Colunas />
              <thead className="text-primary-foreground">
                <tr className="h-[22px]">
                  {COLUNAS.map(c => c.ordena
                    ? <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.rotulo} ordem={ordem} onOrdenar={alternar} className={TH} />
                    : <th key={c.coluna} className={cn(TH, 'text-left')}>{c.rotulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(p => {
                  const acoes = acoesDaPendencia(p);
                  const vistas = acoes.slice(0, 3); const resto = acoes.slice(3);
                  const frase = fraseDaPendencia(p);
                  return (
                    <tr key={p.chave} className="h-[19px] border-b border-border/40 hover:bg-muted/40" data-testid="folha-pendencia">
                      <td className={TD_REGUA_TEXTO} title={rotuloDaPendencia(p)}>{rotuloDaPendencia(p)}</td>
                      <td className={cn(TD_REGUA_TEXTO, 'font-medium')} title={quemDaPendencia(p)}>{quemDaPendencia(p)}</td>
                      <td className={TD_REGUA_TEXTO} title={frase}>{frase}</td>
                      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(desdeDaPendencia(p))}</td>
                      <td className={cn(TD_REGUA, 'whitespace-nowrap')}>
                        <span className="inline-flex items-center gap-1">
                          {vistas.map((a, i) => (
                            <Button key={a.acao} size="sm" variant={i === 0 ? 'default' : 'outline'} style={{ width: LARGURAS_DOS_BOTOES[i] }}
                              className="h-[17px] shrink-0 overflow-hidden px-1 text-[9.5px]" title={a.rotulo} onClick={() => agir(p, a.acao)}
                              data-testid={`folha-pendencia-${a.acao}`}>
                              <span className="truncate">{a.rotulo}</span>
                            </Button>
                          ))}
                          <span className="inline-flex w-[20px] shrink-0 justify-center">
                            {resto.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button type="button" aria-label="Mais ações" className="inline-flex h-[17px] w-[20px] items-center justify-center rounded border text-muted-foreground hover:bg-muted">
                                    <MoreHorizontal className="h-3 w-3" /></button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {resto.map(a => <DropdownMenuItem key={a.acao} onSelect={() => agir(p, a.acao)}>{a.rotulo}</DropdownMenuItem>)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {ordenadas.length === 0 && (
                  <tr className="h-[19px]">
                    <td colSpan={COLUNAS.length} className={cn(TD_REGUA, 'py-6 text-center text-muted-foreground')}>
                      {isLoading ? 'Carregando…' : error ? 'Não consegui ler as pendências. Tente de novo.' : itens.length === 0 ? 'Nenhuma pendência na folha.' : 'Nenhuma pendência deste tipo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={cn(RODAPE_REGUA, 'overflow-x-hidden overflow-y-scroll')} data-testid="folha-pendencias-rodape">
            <table className="w-full table-fixed border-collapse">
              <Colunas />
              <tbody>
                <tr className="h-[22px] font-semibold">
                  <td colSpan={5} className="truncate px-1">
                    {`${visiveis.length.toLocaleString('pt-BR')} ${visiveis.length === 1 ? 'pendência' : 'pendências'} · cada ação passa pela função do banco, com prévia e trilha`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {resolvendo && (
        <ResolverPendencia clienteId={clienteId} pendencia={resolvendo.p} acao={resolvendo.acao}
          aoFechar={() => setResolvendo(null)}
          aoResolver={() => { const p = resolvendo.p; const descarte = resolvendo.acao === 'descartar'; setResolvendo(null); if (descarte) aoDescartar(p); }} />
      )}
    </div>
  );
}
