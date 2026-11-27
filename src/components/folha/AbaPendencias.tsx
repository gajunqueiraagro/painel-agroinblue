/**
 * FOLHA-01 · PR B (telas) — a aba PENDÊNCIAS: uma lista só, por tipo, cada uma com a sua ação (contrato §3.3 + §6).
 * ⚠ AS PENDÊNCIAS VÊM DO BANCO (`fn_folha_pendencias`): a tela não acha nenhuma; só filtra por tipo e oferece a ação do contrato.
 * ⚠ TODA AÇÃO PASSA PELA FUNÇÃO DO BANCO, COM PRÉVIA E TRILHA: ligar = `fn_lancamento_funcionario_ligar` (simular → confirmar); cadastrar =
 *   `fn_folha_funcionario_gravar` (+ desligar) e depois ligar; "não é" = `fn_folha_pendencia_descartar` com motivo, e o aviso traz o DESFAZER.
 * ⚠ A AÇÃO TEM 372px (FOLHA-TELAS-03: os 3 botões a 11px, 340 × 11/10): até 3 botões de largura fixa que nunca quebram; o resto vai para o "⋯".
 * ⚠ FOLHA-TELAS-03: RÉGUA DE FONTES NOVA (UI-FONTES-REGUA-01) — tipos 11px/26px, cabeçalho e datas 10px, linha 11px/24px. O botão DENTRO da
 *   linha é 11px a 20px (a linha de 24px não carrega o de 26px sem crescer para 30px; a lista tem 150+ linhas — densidade).
 * ⚠ FOLHA-REGUA-01 (Gabriel 26/11 08:13): a régua da Folha (`reguaFolha.ts`); os botões da linha são os PEQUENOS do padrão (11px / 24px; a
 *   linha com botão tem 26px), o 1º no navy e os outros em contorno, com o RÓTULO INTEIRO (sem "…"; a frase longa no `title`), em
 *   larguras fixas medidas (o maior rótulo de cada lugar a 11px + 16); os 6 filtros numa linha a 1126 e a 1280 (140px cada).
 */
import { useMemo, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Segmentado } from '@/components/ui/segmentado';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { TH_F, LINHA_F, TD_F, TD_F_TEXTO, TD_F_DATA, LINHA_RODAPE_F, ALTURA_F, FONTE_F, BOTAO_PRINCIPAL_F, BOTAO_CONTORNO_F } from './reguaFolha';
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
  { coluna: 'tipo', rotulo: 'Tipo', largura: 128, ordena: true },
  { coluna: 'quem', rotulo: 'Funcionário / favorecido', largura: 230, ordena: true },
  { coluna: 'oque', rotulo: 'O que é', largura: null, ordena: true },
  { coluna: 'desde', rotulo: 'Desde', largura: 76, ordena: true },
  { coluna: 'acao', rotulo: 'Ação', largura: 332 },
];
const ORDENAVEIS: readonly ColunaOrdenavel<Pendencia, Coluna>[] = [
  { coluna: 'tipo', tipo: 'texto', valor: p => rotuloDaPendencia(p) },
  { coluna: 'quem', tipo: 'texto', valor: p => quemDaPendencia(p) },
  { coluna: 'oque', tipo: 'texto', valor: p => fraseDaPendencia(p) },
  { coluna: 'desde', tipo: 'data', valor: p => desdeDaPendencia(p) },
];
/** as larguras FIXAS dos 3 botões à vista, medidas a 11px/500 + 16 de padding: 1º "É o mesmo · ligar 999" (115) · 2º "Baixa sem recibo"/"Cadastrar
 *  ativo" · 3º "Não é". Ação = 132 + 104 + 52 + o "⋯" (20) + 3 × 4 de vão + 8 de padding = 328 → 332 */
export const LARGURAS_DOS_BOTOES = [132, 104, 52] as const;
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
  const TH = cn(TH_F, 'sticky top-0 z-10 bg-primary transition-[filter] hover:brightness-110');

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

  const rodape = `${visiveis.length.toLocaleString('pt-BR')} ${visiveis.length === 1 ? 'pendência' : 'pendências'}`
    + `${data && data.descartadas > 0 ? ` · ${data.descartadas.toLocaleString('pt-BR')} ${data.descartadas === 1 ? 'descartada' : 'descartadas'}` : ''}`
    + ' · cada ação passa pela função do banco, com prévia e trilha';
  const opcoes: Array<{ valor: FiltroPendencia; rotulo: string }> = [
    { valor: 'todas', rotulo: 'Todas' }, ...TIPOS_DE_PENDENCIA.map(t => ({ valor: t, rotulo: ROTULO_PENDENCIA[t] })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* As 6 opções têm largura FIXA (128px) e a contagem reservada, em DOIS grupos de 3: quando não cabem (750/814), a faixa quebra entre
          os grupos — pela largura da janela, nunca pelo estado. Sem a quebra a PÁGINA rolava de lado; quebrar DENTRO do Segmentado (altura
          fixa, overflow-hidden) escondia a 2ª linha e o clique nela rolava o grupo (gate desloca). */}
      <div className="flex min-h-[32px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-2 py-[4px]" data-testid="folha-pendencias-filtros">
        {[opcoes.slice(0, 3), opcoes.slice(3)].map((grupo, i) => (
          <Segmentado key={i} altura={ALTURA_F} fonte={FONTE_F} valor={filtro} onEscolher={setFiltro} opcoes={grupo.map(o => ({
            valor: o.valor,
            rotulo: <span className="inline-flex w-[140px] items-center justify-center gap-1 overflow-hidden whitespace-nowrap">{o.rotulo}
              <TextoReservado texto={data ? contagem[o.valor].toLocaleString('pt-BR') : ''} reserva="999" className="font-semibold" /></span>,
          }))} />
        ))}
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
                    <tr key={p.chave} className={cn('h-[26px] border-b border-border/40 hover:bg-muted/40')} data-testid="folha-pendencia">
                      <td className={TD_F_TEXTO} title={rotuloDaPendencia(p)}>{rotuloDaPendencia(p)}</td>
                      <td className={cn(TD_F_TEXTO, 'font-medium')} title={quemDaPendencia(p)}>{quemDaPendencia(p)}</td>
                      <td className={TD_F_TEXTO} title={frase}>{frase}</td>
                      <td className={TD_F_DATA}>{dataBR(desdeDaPendencia(p))}</td>
                      <td className={cn(TD_F, 'h-[26px] whitespace-nowrap')}>
                        <span className="inline-flex items-center gap-1">
                          {vistas.map((a, i) => (
                            <button key={a.acao} type="button" style={{ width: LARGURAS_DOS_BOTOES[i] }}
                              className={cn(i === 0 ? BOTAO_PRINCIPAL_F : BOTAO_CONTORNO_F, 'shrink-0 whitespace-nowrap px-1')} title={a.titulo ?? a.rotulo}
                              onClick={() => agir(p, a.acao)} data-testid={`folha-pendencia-${a.acao}`}>
                              {a.rotulo}
                            </button>
                          ))}
                          <span className="inline-flex w-[20px] shrink-0 justify-center">
                            {resto.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button type="button" aria-label="Mais ações" className="inline-flex h-[24px] w-[20px] items-center justify-center rounded border text-muted-foreground hover:bg-muted">
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
                  <tr className={LINHA_F}>
                    <td colSpan={COLUNAS.length} className={cn(TD_F, 'py-6 text-center text-muted-foreground')}>
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
                <tr className={LINHA_RODAPE_F}>
                  {/* FOLHA-REGUA-01: as descartadas vêm para o rodapé (na faixa dos filtros cortavam com "…" a 1126) */}
                  <td colSpan={5} className="truncate px-1" title={rodape}>{rodape}
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
