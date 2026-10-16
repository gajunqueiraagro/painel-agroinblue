/**
 * FIN-LR-SYNC-01 passo b — "Atualizar do Lucro Rural", tela 1 (mock-lr-sync, aprovado 16/10/2026): a comparação ANTES de gravar.
 * Só desenha e junta as escolhas do operador; a regra é do banco (o envelope de `fn_lr_sync_comparar`) e da lib `telaLr.ts`.
 *
 * Cabeçalho navy (cliente e faixa de vencimentos) · linha dos dois arquivos + área de trocar + "Histórico e desfazer (N)" ·
 * cartões-filtro por situação (quantidade e valor, do resumo do banco) + o aviso "N novas nascem sem safra" · tabela de uma linha
 * por registro (Situação | Venc. | Fornecedor | Tipo de contas (LR) → classificação | Faz. | Valor LR | No sistema | Ação ▾) ·
 * rodapé com as pendências, Cancelar, Simular e Gravar (descreve o que faz; só acende sem pendência).
 * ⚠ ALTURA FIXA: o corpo é a tabela, que rola por dentro com o cabeçalho preso; cartões e rodapé não andam.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import type { ResultadoLr } from '@/v2/hooks/useLrSyncAplicar';
import {
  FRASE_SEM_SAFRA, ROTULO_ACAO, acaoInicial, acoesDaLinha, decisoesParaGravar, faixaDeVencimentos, faltaClassificar, faltaDecidir,
  fraseDoMotivo, frasePendencias, itensDoRetorno, nasceSemSafra, pendencias, textoDeDecisao, textoDoGravar,
  type AcaoLr, type EnvelopeLr, type EscolhaDaLinha, type ItemDoRetorno, type LinhaLrTela, type SituacaoLr,
} from '@/v2/lib/lucroRural/telaLr';
import { textoDoTamanho } from '@/v2/lib/lucroRural/pastaLr';

export const REGRA_ARQUIVOS_LR: RegraDeAceite = { tipos: ['xlsx', 'xls'], varios: true };

type Filtro = SituacaoLr | 'so_no_sistema' | null;
const CARTOES: readonly { chave: Exclude<Filtro, null>; rotulo: string; cor: string }[] = [
  { chave: 'nova', rotulo: 'novas', cor: 'text-[#1e40af]' },
  { chave: 'mudou', rotulo: 'mudaram', cor: 'text-[#b45309]' },
  { chave: 'pago_no_lr', rotulo: 'pagas no LR', cor: 'text-[#0f766e]' },
  { chave: 'decidir', rotulo: 'decidir', cor: 'text-[#b91c1c]' },
  { chave: 'sem_mudanca', rotulo: 'sem mudança', cor: 'text-muted-foreground' },
  { chave: 'so_no_sistema', rotulo: 'só no sistema', cor: 'text-[#6d28d9]' },
  { chave: 'da_oc', rotulo: 'da OC', cor: 'text-[#9a3412]' },
];
const PILULA: Record<SituacaoLr, { texto: string; cls: string }> = {
  nova: { texto: 'nova', cls: 'bg-[#dbeafe] text-[#1e40af]' },
  mudou: { texto: 'mudou', cls: 'bg-[#fef3c7] text-[#b45309]' },
  pago_no_lr: { texto: 'pago no LR', cls: 'bg-[#ccfbf1] text-[#0f766e]' },
  decidir: { texto: 'decidir', cls: 'bg-[#fee2e2] text-[#b91c1c]' },
  sem_mudanca: { texto: 'sem mudança', cls: 'bg-muted text-muted-foreground' },
  ignorada: { texto: 'ignorada', cls: 'bg-muted text-muted-foreground' },
  da_oc: { texto: 'da OC', cls: 'bg-[#ffedd5] text-[#9a3412]' },
};
const AMBAR = 'text-[#b45309]';
const fmtData = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—');
const fmtValor = (c: number | null) => (c == null ? '—' : formatMoeda(c / 100).replace('R$', '').trim());

export interface ArquivoLrNaTela { tipo: 'pagar' | 'receber'; nome: string; data: string | null; linhas: number; tamanho?: number | null }

export interface TelaAtualizarLrProps {
  envelope: EnvelopeLr;
  clienteNome: string;
  clienteId: string;
  arquivos: readonly ArquivoLrNaTela[];
  classificacoes: ClassificacaoItem[];
  fazendas: Fazenda[];
  escopoDoPlano: (id: string) => string | null | undefined;
  escopoDaSafra: (id: string) => string | null | undefined;
  onTrocarArquivos: (arquivos: File[]) => void;
  historicoQtde: number;
  onAbrirHistorico: () => void;
  simular: (decisoes: ReturnType<typeof decisoesParaGravar>) => Promise<ResultadoLr>;
  gravar: (decisoes: ReturnType<typeof decisoesParaGravar>) => Promise<ResultadoLr>;
  onCancelar: () => void;
  /** Depois de GRAVAR e fechar o resultado: quem hospeda compara de novo (a tela antiga ficou velha). */
  onGravado?: () => void;
  /** Passo c: o que acompanha os arquivos (aviso da data, "trocar arquivos"), ao lado deles. */
  extraArquivos?: ReactNode;
}

export function TelaAtualizarLr(p: TelaAtualizarLrProps) {
  const { envelope } = p;
  const [escolhas, setEscolhas] = useState<Map<string, EscolhaDaLinha>>(() => new Map());
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [classificandoChave, setClassificandoChave] = useState<string | null>(null);
  const [vinculandoChave, setVinculandoChave] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<{ modo: 'simulado' | 'confirmar' | 'gravado'; itens: ItemDoRetorno[]; aplicadas: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const escolhaDe = (l: LinhaLrTela): EscolhaDaLinha => escolhas.get(l.chave) ?? { acao: acaoInicial(l) };
  const escolher = (l: LinhaLrTela, e: EscolhaDaLinha) => setEscolhas(m => new Map(m).set(l.chave, e));
  const porChave = useMemo(() => new Map(envelope.linhas.map(l => [l.chave, l])), [envelope.linhas]);
  const pend = pendencias(envelope.linhas, escolhas);
  const fPend = frasePendencias(pend);
  const semSafra = envelope.linhas.filter(l => nasceSemSafra(l, escolhaDe(l), p.escopoDoPlano, p.escopoDaSafra) !== null).length;
  const decisoes = decisoesParaGravar(envelope.linhas, escolhas);
  const linhasVisiveis = filtro === null ? envelope.linhas : filtro === 'so_no_sistema' ? [] : envelope.linhas.filter(l => l.situacao === filtro);
  const contagem = (k: Exclude<Filtro, null>) =>
    k === 'da_oc' ? (envelope.resumo.da_oc ?? { qtde: 0, valorC: 0 }) : envelope.resumo[k] ?? { qtde: 0, valorC: 0 };

  const rodar = async (modo: 'simular' | 'gravar') => {
    setOcupado(true); setRecado(null);
    try {
      const r = modo === 'simular' || retorno?.modo !== 'confirmar' ? await p.simular(decisoes) : await p.gravar(decisoes);
      if (r.ok === false) { setRecado(r.frase); return; }
      const lido = itensDoRetorno(r.envelope);
      if (!lido) { setRecado('Resposta inesperada do banco.'); return; }
      const aplicadas = typeof lido.resumo.aplicadas === 'number' ? lido.resumo.aplicadas : 0;
      const modoNovo = modo === 'simular' ? 'simulado' : retorno?.modo === 'confirmar' ? 'gravado' : 'confirmar';
      setRetorno({ modo: modoNovo, itens: lido.itens, aplicadas });
    } finally { setOcupado(false); }
  };

  const fecharRetorno = () => { const gravou = retorno?.modo === 'gravado'; setRetorno(null); if (gravou) p.onGravado?.(); };

  const classificando = classificandoChave ? porChave.get(classificandoChave) ?? null : null;
  const vinculando = vinculandoChave ? porChave.get(vinculandoChave) ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="tela-atualizar-lr">
      {/* cabeçalho */}
      <div className="flex h-9 shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
        <span className="text-[13px] font-semibold">Atualizar do Lucro Rural</span>
        <span className="rounded-full bg-white/15 px-2 text-[10px]">{p.clienteNome}</span>
        {faixaDeVencimentos(envelope.linhas) && <span className="rounded-full bg-white/15 px-2 text-[10px]">{faixaDeVencimentos(envelope.linhas)}</span>}
      </div>
      {/* arquivos */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {p.arquivos.map(a => (
          <span key={a.tipo} className="flex h-8 shrink-0 items-center gap-1.5 rounded border border-[#86efac] bg-[#f0fdf4] px-2 text-[10px]" data-testid={`arquivo-${a.tipo}`}
            title={a.nome}>
            <b>{a.tipo === 'pagar' ? 'Contas a pagar' : 'Contas a receber'}</b>
            <span className="text-muted-foreground">{a.data ?? ''} · {a.linhas} linhas{a.tamanho != null ? ` · ${textoDoTamanho(a.tamanho)}` : ''}</span>
          </span>
        ))}
        {p.extraArquivos}
        <AreaDeArquivo regra={REGRA_ARQUIVOS_LR} modo="lote" className="h-8 w-[290px] shrink-0" testId="area-trocar-lr"
          convite="trocar arquivos: clique ou arraste os dois relatórios do LR" detalhe=""
          onArquivos={fs => { if (fs.length > 0) p.onTrocarArquivos(fs); }} />
        <button type="button" onClick={p.onAbrirHistorico} data-testid="abrir-historico"
          className="ml-auto shrink-0 text-[10px] text-primary underline">Histórico e desfazer ({p.historicoQtde})</button>
      </div>
      {/* cartões */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 px-3">
        {CARTOES.map(c => {
          const n = contagem(c.chave);
          const ativo = filtro === c.chave;
          return (
            <button key={c.chave} type="button" data-testid={`cartao-${c.chave}`} aria-pressed={ativo}
              onClick={() => setFiltro(ativo ? null : c.chave)}
              className={cn('flex h-7 shrink-0 items-baseline gap-1 rounded border px-2 text-[10px]', ativo ? 'border-primary ring-1 ring-primary' : 'bg-card')}>
              <b className={cn('text-[12px] tabular-nums', c.cor)} data-testid={`cartao-${c.chave}-qtde`}>{n.qtde}</b>
              <span>{c.rotulo}</span>
              {c.chave !== 'sem_mudanca' && c.chave !== 'da_oc' && <span className="tabular-nums text-muted-foreground">{fmtValor(n.valorC)}</span>}
            </button>
          );
        })}
        <span data-testid="aviso-sem-safra" className={cn('ml-auto shrink-0 rounded border px-2 py-0.5 text-[10px]',
          semSafra > 0 ? 'border-[#fcd34d] bg-[#fef3c7] text-[#92400e]' : 'invisible')}>
          ⚠ {semSafra} {semSafra === 1 ? 'nova nasce' : 'novas nascem'} sem safra
        </span>
      </div>
      {/* tabela */}
      <div className="min-h-0 flex-1 overflow-auto px-3">
        <table className="w-full table-fixed text-[10px]">
          <colgroup>
            <col style={{ width: 80 }} /><col style={{ width: 70 }} /><col /><col style={{ width: 280 }} />
            <col style={{ width: 40 }} /><col style={{ width: 88 }} /><col style={{ width: 88 }} /><col style={{ width: 190 }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
            <tr className="h-[22px] text-[9.5px] uppercase">
              <th className="px-1 text-left">Situação</th><th className="px-1 text-right">Venc.</th><th className="px-1 text-left">Fornecedor</th>
              <th className="px-1 text-left">Tipo de contas (LR) → classificação</th><th className="px-1 text-center">Faz.</th>
              <th className="px-1 text-right">Valor LR</th><th className="px-1 text-right">No sistema</th><th className="px-1 text-left">Ação</th>
            </tr>
          </thead>
          <tbody>
            {linhasVisiveis.map(l => {
              const e = escolhaDe(l);
              const pendente = faltaDecidir(l, e) || faltaClassificar(l, e);
              const ss = nasceSemSafra(l, e, p.escopoDoPlano, p.escopoDaSafra);
              const subcentro = e.classificacao?.subcentro ?? l.resolvido.subcentro;
              const faz = e.classificacao?.fazendaId ?? l.resolvido.fazendaId;
              const fazCod = faz ? p.fazendas.find(f => f.id === faz)?.codigo ?? '?' : '—';
              return (
                <tr key={l.chave} className="h-[22px] border-b" data-testid="linha-lr" data-chave={l.chave} data-situacao={l.situacao}>
                  <td className="px-1"><span className={cn('rounded px-1.5 py-[1px] text-[9.5px]', PILULA[l.situacao].cls)}>{PILULA[l.situacao].texto}</span></td>
                  <td className={cn('whitespace-nowrap px-1 text-right tabular-nums', l.difVencimento && AMBAR)}
                    title={l.difVencimento && l.lancamento ? `no sistema: ${fmtData(l.lancamento.vencimento)}` : undefined}>
                    {fmtData(l.lr.vencimento)}{l.difVencimento && <RotateCw className="ml-0.5 inline h-2.5 w-2.5" aria-hidden />}
                  </td>
                  <td className="truncate px-1" title={l.lr.contraparte ?? ''}>{l.lr.contraparte ?? '—'}</td>
                  <td className="truncate px-1" title={[l.lr.tipoContas, subcentro, ss ? FRASE_SEM_SAFRA[ss] : null].filter(Boolean).join(' → ')}>
                    {l.lr.tipoContas ?? '—'} → {subcentro ? subcentro : <span className="font-semibold text-[#c2410c]">classificar</span>}
                    {ss && <span className="font-semibold text-[#c2410c]" data-testid="marca-sem-safra"> · sem safra</span>}
                  </td>
                  <td className="px-1 text-center">{fazCod}</td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums">{fmtValor(l.lr.valorC)}</td>
                  <td className={cn('whitespace-nowrap px-1 text-right tabular-nums', l.difValor && AMBAR)}>{fmtValor(l.lancamento?.valorC ?? null)}</td>
                  <td className="px-1 py-[1px]">
                    {l.situacao === 'ignorada' || l.situacao === 'da_oc' ? (
                      <span className="text-muted-foreground">Nada</span>
                    ) : (
                      <Select value={e.acao ?? undefined} onValueChange={v => {
                        if (v === '__classificar') { setClassificandoChave(l.chave); return; }
                        if (v === '__lancamento') { setVinculandoChave(l.chave); return; }
                        const acao = acoesDaLinha(l).find(a => a === v);
                        if (!acao) return;
                        escolher(l, { ...e, acao });
                        if (acao === 'vincular' && !l.lancamentoId && !e.lancamentoId) setVinculandoChave(l.chave);
                        if (acao === 'criar_programada' && faltaClassificar(l, { ...e, acao })) setClassificandoChave(l.chave);
                      }}>
                        <SelectTrigger data-testid="acao-da-linha" className={cn('h-[18px] px-1.5 text-[10px]', pendente && 'border-destructive bg-[#fef2f2] text-destructive')}>
                          <span className="truncate">{rotuloDaAcao(l, e)}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {acoesDaLinha(l).map(a => <SelectItem key={a} value={a}>{ROTULO_ACAO[a]}</SelectItem>)}
                          {e.acao === 'criar_programada' && <SelectItem value="__classificar">Escolher classificação…</SelectItem>}
                          {e.acao === 'vincular' && <SelectItem value="__lancamento">Escolher o lançamento…</SelectItem>}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtro === 'so_no_sistema' && envelope.soNoSistema.map(s => (
              <tr key={s.lancamentoId} className="h-[22px] border-b" data-testid="linha-so-no-sistema">
                <td className="px-1"><span className="rounded bg-[#ede9fe] px-1.5 py-[1px] text-[9.5px] text-[#6d28d9]">só no sistema</span></td>
                <td className="px-1 text-right tabular-nums">{fmtData(s.vencimento)}</td>
                <td className="truncate px-1" colSpan={2} title={s.descricao ?? ''}>{s.descricao ?? '—'}</td>
                <td /><td /><td className="px-1 text-right tabular-nums">{fmtValor(s.valorC)}</td>
                <td className="px-1 text-muted-foreground">aviso · nada é apagado</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* rodapé */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-t px-3">
        <span className={cn('min-w-0 flex-1 truncate text-[10px]', fPend ? 'text-destructive' : 'text-muted-foreground')} data-testid="pendencias" title={recado ?? fPend ?? ''}>
          {recado ?? fPend ?? 'Tudo decidido.'}
        </span>
        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={p.onCancelar}>Cancelar</Button>
        <Button variant="outline" size="sm" className="h-7 text-[11px]" data-testid="botao-simular" disabled={ocupado} onClick={() => void rodar('simular')}>Simular</Button>
        <Button size="sm" className="h-7 text-[11px]" data-testid="botao-gravar" disabled={ocupado || !!fPend || decisoes.length === 0}
          onClick={() => void rodar('gravar')}>{textoDoGravar(envelope.linhas, escolhas)}</Button>
      </div>

      {/* resultado da simulação / confirmação / gravação */}
      <Dialog open={!!retorno} onOpenChange={o => { if (!o) fecharRetorno(); }}>
        <DialogContent className="max-w-[560px]" data-testid="resultado-lr">
          <DialogHeader><DialogTitle className="text-[13px]">
            {retorno?.modo === 'gravado' ? 'Atualização gravada' : retorno?.modo === 'confirmar' ? 'Confirmar a gravação' : 'Simulação — nada foi gravado'}
          </DialogTitle></DialogHeader>
          <p className="text-[11px]">{retorno?.aplicadas ?? 0} {retorno?.modo === 'gravado' ? 'aplicadas' : 'seriam aplicadas'} · {retorno?.itens.filter(i => i.status === 'recusado').length ?? 0} recusadas</p>
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-[10px]">
              <tbody>
                {retorno?.itens.filter(i => i.status === 'recusado').map((i, k) => (
                  <tr key={k} className="border-b" data-testid="recusa-lr">
                    <td className="truncate px-1">{(i.chave && porChave.get(i.chave)?.lr.contraparte) || i.chave}</td>
                    <td className="px-1">{i.acao}</td>
                    <td className="px-1 text-destructive">{fraseDoMotivo(i.motivo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={fecharRetorno}>{retorno?.modo === 'gravado' ? 'Fechar' : 'Voltar'}</Button>
            {retorno?.modo === 'confirmar' && (
              <Button size="sm" className="h-7 text-[11px]" data-testid="confirmar-gravar" disabled={ocupado} onClick={() => void rodar('gravar')}>
                Gravar {retorno.aplicadas}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* classificação da conta nova */}
      <Dialog open={!!classificando} onOpenChange={o => { if (!o) setClassificandoChave(null); }}>
        {classificando && (
          <ClassificarLinha linha={classificando} escolha={escolhaDe(classificando)} classificacoes={p.classificacoes} fazendas={p.fazendas}
            clienteId={p.clienteId} escopoDoPlano={p.escopoDoPlano}
            onOk={c => { escolher(classificando, { ...escolhaDe(classificando), acao: 'criar_programada', classificacao: c }); setClassificandoChave(null); }}
            onCancelar={() => setClassificandoChave(null)} />
        )}
      </Dialog>

      {/* o lançamento do vínculo (os "só no sistema" da mesma direção) */}
      <Dialog open={!!vinculando} onOpenChange={o => { if (!o) setVinculandoChave(null); }}>
        {vinculando && (
          <DialogContent className="max-w-[560px]" data-testid="escolher-lancamento">
            <DialogHeader><DialogTitle className="text-[13px]">Vincular {vinculando.lr.contraparte ?? ''} a um lançamento</DialogTitle></DialogHeader>
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-[10px]"><tbody>
                {envelope.soNoSistema
                  .filter(s => s.tipo === (vinculando.tipo === 'r' ? '1-Entradas' : '2-Saídas'))
                  .sort((a, b) => Math.abs(a.valorC - (vinculando.lr.valorC ?? 0)) - Math.abs(b.valorC - (vinculando.lr.valorC ?? 0)))
                  .map(s => (
                    <tr key={s.lancamentoId} className="h-[22px] cursor-pointer border-b hover:bg-muted/50" data-testid="candidato-vinculo"
                      onClick={() => { escolher(vinculando, { ...escolhaDe(vinculando), acao: 'vincular', lancamentoId: s.lancamentoId }); setVinculandoChave(null); }}>
                      <td className="px-1 tabular-nums">{fmtData(s.vencimento)}</td>
                      <td className="truncate px-1">{s.descricao}</td>
                      <td className="px-1 text-right tabular-nums">{fmtValor(s.valorC)}</td>
                    </tr>
                  ))}
              </tbody></table>
            </div>
            <p className="text-[10px] text-muted-foreground">Só os lançamentos em aberto do sistema, da mesma direção, que o LR não casou.</p>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function rotuloDaAcao(l: LinhaLrTela, e: EscolhaDaLinha): string {
  if (e.acao === null) return textoDeDecisao(l);
  if (e.acao === 'criar_programada' && faltaClassificar(l, e)) return 'Escolher classificação';
  if (e.acao === 'vincular' && !(e.lancamentoId ?? l.lancamentoId)) return 'Vincular a lançamento…';
  if (e.acao === 'atualizar' && l.motivo === 'valor_do_mes') return 'Atualizar valor do mês';
  return ROTULO_ACAO[e.acao];
}

function ClassificarLinha({ linha, escolha, classificacoes, fazendas, clienteId, escopoDoPlano, onOk, onCancelar }: {
  linha: LinhaLrTela; escolha: EscolhaDaLinha; classificacoes: ClassificacaoItem[]; fazendas: Fazenda[]; clienteId: string;
  escopoDoPlano: (id: string) => string | null | undefined;
  onOk: (c: { planoContaId: string; subcentro: string; fazendaId: string; favorecidoId: string }) => void; onCancelar: () => void;
}) {
  const [plano, setPlano] = useState<{ id: string; subcentro: string } | null>(
    (escolha.classificacao?.planoContaId ?? linha.resolvido.planoContaId)
      ? { id: escolha.classificacao?.planoContaId ?? linha.resolvido.planoContaId ?? '', subcentro: escolha.classificacao?.subcentro ?? linha.resolvido.subcentro ?? '' }
      : null);
  const [fazenda, setFazenda] = useState(escolha.classificacao?.fazendaId ?? linha.resolvido.fazendaId ?? '');
  const [forn, setForn] = useState(escolha.classificacao?.favorecidoId ?? linha.resolvido.fornecedorId ?? '');
  const [busca, setBusca] = useState('');
  const pronto = !!plano?.id && !!fazenda && !!forn;
  return (
    <DialogContent className="max-w-[480px]" data-testid="classificar-linha">
      <DialogHeader><DialogTitle className="text-[13px]">Classificar {linha.lr.contraparte ?? ''}</DialogTitle></DialogHeader>
      <p className="text-[10px] text-muted-foreground">No LR: {linha.lr.tipoContas ?? '—'}. A conta nasce programada; sem classificar, não grava.</p>
      <PlanoSubcentroSelect value={plano?.subcentro ?? ''} onChange={() => undefined} classificacoes={classificacoes}
        tipoOperacao={linha.tipo === 'r' ? '1-Entradas' : '2-Saídas'} label="Conta do plano" search={busca} onSearchChange={setBusca}
        onSelected={(sub, cls) => setPlano(cls?.id ? { id: cls.id, subcentro: sub } : null)} />
      <FazendaSelect value={fazenda} onChange={setFazenda} fazendas={fazendas} label="Fazenda"
        forcaAdministrativo={!!plano?.id && escopoDoPlano(plano.id) === 'administrativo'} />
      <FavorecidoSelect value={forn} onChange={setForn} clienteId={clienteId} label="Fornecedor" />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onCancelar}>Voltar</Button>
        <Button size="sm" className="h-7 text-[11px]" disabled={!pronto} data-testid="classificar-ok"
          onClick={() => { if (plano) onOk({ planoContaId: plano.id, subcentro: plano.subcentro, fazendaId: fazenda, favorecidoId: forn }); }}>
          Usar esta classificação
        </Button>
      </div>
    </DialogContent>
  );
}
