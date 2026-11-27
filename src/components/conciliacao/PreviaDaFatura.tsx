/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11 13:38, vista 1) — "Compras da fatura · prévia" no lado direito do painel do CARTÃO.
 * Ocupa os 3 lugares da moldura do painel (cabeçalho 40 · conteúdo · botões 52), como o `Trabalho`: os grupos clicáveis (a seleção marcada
 * em navy), a tabela de colunas fixas (texto com "…" e o inteiro no `title`; número e data nunca cortam) e o rodapé.
 * CARTAO-FATURA-GRAVAR (25/11, lote 118540; decisões 24/11 09:27 "tudo como recomendado"):
 *  · D1: a linha a LANÇAR se completa NA TABELA — clicar na linha leva a conta e a fazenda dela à faixa de escolha (altura reservada: nada
 *    se desloca); a coluna "Conta · fazenda" diz a escolhida (a sugestão do histórico já vem) ou, em vermelho, o que falta;
 *  · D2: "Gravar N prontas" → a PRÉVIA do banco; a recusa vem NA LINHA (coluna "O que o sistema vai fazer", vermelho) e a linha sai do
 *    pedido; a prévia limpa → "Confirmar gravação" (tudo ou nada) → a fatura é relida;
 *  · "Desfazer gravação" (a fatura gravada) → motivo → a prévia ("N voltam · M ficam") → "Desfazer".
 *  · Régua de fontes nova (UI-FONTES-REGUA-01, tela alterada): controles 11px/26px, rótulos e cabeçalhos 10px, linha 11px/24px.
 */
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { CONTROLE, LINHA_FONTES, TD_FONTES_DATA, TD_FONTES_NUM, TD_FONTES_TEXTO, TEXTO_ROTULO, TH_FONTES, TITULO_MODAL, larguraDoSeletor } from '@/components/ui/regua-fontes';
import { COR_DO_GRUPO, ORDEM_DOS_GRUPOS, ROTULO_DO_GRUPO, type GrupoDaFatura, type GruposDaFatura, type LinhaDoGrupo } from '@/lib/financeiro/cartao/gruposDaFatura';
import type { FaturaLida } from '@/lib/financeiro/cartao/lerFaturaOurocard';
import { usePreviaDaFatura, type EstadoDaPrevia } from '@/hooks/usePreviaDaFatura';
import { useGravarDaFatura, type FaseDoGravar } from '@/hooks/useGravarDaFatura';
import { faturaApiDoBanco, type FaturaApi } from '@/lib/financeiro/cartao/faturaApi';
import {
  escolhaDaLinha, estadoDaLinha, fraseDoDesfazer, fraseDoGravar, type Escolha, type EstadoDaLinha, type RecusaDaLinha,
} from '@/lib/financeiro/cartao/gravarDaFatura';
import type { LinhasDoPdf } from '@/lib/oc/leitura/linhasDoPdf';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { EscolherConta } from '@/components/shared/EscolherConta';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { useFazenda, type Fazenda } from '@/contexts/FazendaContext';
import { ehLinhaAdministrativa, fazendaAdministrativa } from '@/lib/financeiro/escopoDoSubcentro';

/** o selo curto (o nome inteiro do grupo no `title`): 8 selos em 2 linhas de altura fixa */
export const SELO_DO_GRUPO: Record<GrupoDaFatura, string> = {
  ja_lancado: 'Já lançado', parcela_casa: 'Parcela k/N casa', diferenca: 'Com diferença', mover: 'Mover', nova_sugestao: 'Nova · sugestão',
  nova_classificar: 'Nova · classificar', encargos: 'Anuidade, IOF, juros', pagamento: 'Pagamento',
};
const COR: Record<(typeof COR_DO_GRUPO)[GrupoDaFatura], string> = {
  verde: 'bg-[#e3f5ea] text-[#1e8449]', ambar: 'bg-[#fff3d6] text-[#9a6b00]', azul: 'bg-[#e6efff] text-[#1f56b8]',
  vermelho: 'bg-[#fde8e8] text-[#c0392b]', cinza: 'bg-[#eceff3] text-[#5A6A80]',
};
export const FRASE_ESCOLHER = 'Clique numa linha a lançar para escolher a conta e a fazenda.';
export const MOTIVO_NENHUMA_PRONTA = 'nenhuma linha pronta: escolha a conta e a fazenda nas linhas em vermelho';

const reais = (cent: number | null) => (cent == null ? '—' : (cent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dma = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function cabecalhoDaFatura(f: FaturaLida): string {
  return [f.finalCartao ? `final ${f.finalCartao}` : null, `fechou ${dma(f.fechamento)}`, `vence ${dma(f.vencimento)}`, `total R$ ${reais(f.totalCent)}`]
    .filter(Boolean).join(' · ');
}
export const grupoInicial = (g: GruposDaFatura): GrupoDaFatura => ORDEM_DOS_GRUPOS.find((k) => g.contagem[k] > 0) ?? 'ja_lancado';

const BOTAO = cn(CONTROLE, 'whitespace-nowrap rounded border px-2.5 disabled:cursor-not-allowed disabled:opacity-50');
const AZUL = 'border-[#1f56b8] bg-[#1f56b8] text-white';
const CLARO = 'border-[#cfd8e3] bg-white text-[#1E3A5F]';
/** a caixa dos botões do rodapé: largura FIXA (o rótulo muda com a fase; nada se desloca) */
const LARGURA_BOTOES = 200;

/** o que a coluna "Conta · fazenda" diz: a escolhida; na linha a lançar sem uma das duas, o que falta (vermelho) */
function contaEFazenda(x: LinhaDoGrupo, e: Escolha, s: EstadoDaLinha, contaPeloId: (id: string) => string | null, fazendaPeloId: (id: string) => string | null) {
  if (x.gesto !== 'lancar') return { texto: '—', falta: false };
  if (s.k === 'falta') return { texto: `falta ${s.falta}`, falta: true };
  return { texto: [e.planoContaId ? contaPeloId(e.planoContaId) ?? '—' : '—', e.fazendaId ? fazendaPeloId(e.fazendaId) ?? '—' : '—'].join(' · '), falta: false };
}
/** "O que o sistema vai fazer": a recusa do banco (vermelho) > resolver no Editar (âmbar) > o gesto */
function oQueFaz(x: LinhaDoGrupo, s: EstadoDaLinha, recusa: RecusaDaLinha | undefined): { texto: string; tom: 'recusa' | 'editar' | null } {
  if (recusa) return { texto: recusa.frase, tom: 'recusa' };
  if (s.k === 'editar') return { texto: s.frase, tom: 'editar' };
  return { texto: x.oQueFaz, tom: null };
}

/** as duas linhas do rodapé e os botões, pela fase */
function Rodape({ fase, prontas, incompletas, rodape, recusadas, aoGravar, aoConfirmar, aoVoltar, aoPreverDesfazer, aoDesfazer }: {
  fase: FaseDoGravar; prontas: number; incompletas: number; rodape: string; recusadas: number;
  aoGravar: () => void; aoConfirmar: () => void; aoVoltar: () => void; aoPreverDesfazer: (motivo: string) => void; aoDesfazer: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const ficam = [incompletas ? `${incompletas} incompleta${incompletas > 1 ? 's' : ''}` : null, recusadas ? `${recusadas} recusada${recusadas > 1 ? 's' : ''}` : null]
    .filter(Boolean).join(' · ');
  const idle = `${prontas} pronta${prontas === 1 ? '' : 's'}${ficam ? ` · ficam ${ficam}` : ''}`;
  let l1 = rodape; let l2 = prontas ? idle : MOTIVO_NENHUMA_PRONTA; let tom2 = 'text-[#6b7a8f]';
  let botoes: JSX.Element = (
    <button type="button" className={cn(BOTAO, AZUL)} disabled={prontas === 0 || fase.k === 'conferindo'} onClick={aoGravar}
      title={prontas ? 'O banco confere cada linha antes (prévia); nada é gravado sem o seu OK' : MOTIVO_NENHUMA_PRONTA} data-testid="fatura-gravar">
      {fase.k === 'conferindo' ? 'Conferindo…' : `Gravar ${prontas} pronta${prontas === 1 ? '' : 's'}`}</button>
  );
  if (fase.k === 'confirmar' || fase.k === 'gravando') {
    l1 = fase.k === 'confirmar' ? fraseDoGravar(fase.resposta) : 'Gravando…';
    l2 = ficam ? `prévia do banco · ficam ${ficam}` : 'prévia do banco · confira e confirme';
    botoes = (<>
      <button type="button" className={cn(BOTAO, CLARO)} onClick={aoVoltar} disabled={fase.k === 'gravando'} data-testid="fatura-voltar-gravar">voltar</button>
      <button type="button" className={cn(BOTAO, AZUL)} onClick={aoConfirmar} disabled={fase.k === 'gravando'} data-testid="fatura-confirmar">Confirmar gravação</button>
    </>);
  } else if (fase.k === 'gravada') {
    l1 = `Gravada: ${fraseDoGravar(fase.resposta)}`; tom2 = 'text-[#1e8449]'; l2 = 'a fatura foi relida';
  } else if (fase.k === 'erro') {
    l2 = fase.frase; tom2 = 'text-destructive';
  } else if (fase.k === 'motivo' || fase.k === 'desfazer_conferindo') {
    return (
      <>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para desfazer (obrigatório)"
          className={cn(CONTROLE, 'w-full min-w-0 rounded border border-[#cfd8e3] px-2')} data-testid="fatura-motivo-desfazer" />
        <span className="flex justify-end gap-1" style={{ width: LARGURA_BOTOES }}>
          <button type="button" className={cn(BOTAO, CLARO)} onClick={aoVoltar} data-testid="fatura-voltar-gravar">voltar</button>
          <button type="button" className={cn(BOTAO, AZUL)} disabled={!motivo.trim() || fase.k === 'desfazer_conferindo'} title={motivo.trim() ? undefined : 'escreva o motivo'}
            onClick={() => aoPreverDesfazer(motivo.trim())} data-testid="fatura-prever-desfazer">{fase.k === 'desfazer_conferindo' ? 'Conferindo…' : 'Prever desfazer'}</button>
        </span>
      </>
    );
  } else if (fase.k === 'desfazer_confirmar' || fase.k === 'desfazendo') {
    l1 = fase.k === 'desfazer_confirmar' ? `Desfazer: ${fraseDoDesfazer(fase.resposta)}` : 'Desfazendo…';
    l2 = fase.k === 'desfazer_confirmar' ? `motivo: ${fase.motivo}` : '';
    botoes = (<>
      <button type="button" className={cn(BOTAO, CLARO)} onClick={aoVoltar} disabled={fase.k === 'desfazendo'} data-testid="fatura-voltar-gravar">voltar</button>
      <button type="button" className={cn(BOTAO, 'border-[#c0392b] bg-[#c0392b] text-white')} onClick={aoDesfazer} disabled={fase.k === 'desfazendo'}
        data-testid="fatura-confirmar-desfazer">Desfazer</button>
    </>);
  } else if (fase.k === 'desfeita') {
    l1 = `Desfeita: ${fraseDoDesfazer(fase.resposta)}`; tom2 = 'text-[#1e8449]'; l2 = 'a fatura foi relida';
  }
  return (
    <>
      <span className="min-w-0 leading-[13px]">
        <span className={cn('block truncate text-[#1E3A5F] tabular-nums', TEXTO_ROTULO)} title={l1} data-testid="fatura-rodape">{l1}</span>
        <span className={cn('block truncate', TEXTO_ROTULO, tom2)} title={l2} data-testid="fatura-motivo">{l2}</span>
      </span>
      <span className="flex justify-end gap-1" style={{ width: LARGURA_BOTOES }}>{botoes}</span>
    </>
  );
}

/** a vista (sem leitura): a bancada e o teste a montam com o estado pronto */
export function PreviaDaFaturaVista({ estado, aoVoltar, aoTentarDeNovo, clienteId, contaId, fazendas, api = faturaApiDoBanco }: {
  estado: EstadoDaPrevia; aoVoltar: () => void; aoTentarDeNovo: () => void; clienteId: string; contaId: string; fazendas: Fazenda[]; api?: FaturaApi;
}) {
  const pronta = estado.fase === 'pronta' ? estado : null;
  const [escolhido, setEscolhido] = useState<GrupoDaFatura | null>(null);
  const [escolhas, setEscolhas] = useState<ReadonlyMap<number, Escolha>>(new Map());
  const [linhaAberta, setLinhaAberta] = useState<number | null>(null);
  const grupo = pronta ? escolhido ?? grupoInicial(pronta.grupos) : null;
  const linhas = pronta && grupo ? pronta.grupos.linhas.filter((x) => x.grupo === grupo) : [];
  const classificacoes: ClassificacaoItem[] = useMemo(() => pronta?.classificacoes ?? [], [pronta]);
  const fazOper = useMemo(() => fazendas.filter((f) => f.id !== '__global__'), [fazendas]);
  const nomeDaConta = useCallback((id: string) => classificacoes.find((c) => c.id === id)?.subcentro ?? null, [classificacoes]);
  const nomeDaFazenda = useCallback((id: string) => fazOper.find((f) => f.id === id)?.nome ?? null, [fazOper]);
  /* a conta administrativa FORÇA a fazenda Administrativo (a regra do `FazendaSelect`) */
  const adm = useMemo(() => fazendaAdministrativa(fazOper)?.id ?? null, [fazOper]);
  const forca = useCallback((id: string) => { const c = classificacoes.find((x) => x.id === id); return !!c && ehLinhaAdministrativa(classificacoes, c.subcentro, c.macro_custo); }, [classificacoes]);
  const fazendaDaConta = useCallback((id: string) => (forca(id) ? adm : null), [forca, adm]);
  const g = useGravarDaFatura({ clienteId, contaId, api, aoMudou: aoTentarDeNovo, pronta, escolhas, fazendaDaConta });

  const estados = useMemo(() => new Map((pronta?.grupos.linhas ?? []).map((x) => {
    const e = escolhaDaLinha(x, escolhas, fazendaDaConta);
    return [x.linha.ordem, { e, s: estadoDaLinha(x, e, contaId) }] as const;
  })), [pronta, escolhas, fazendaDaConta, contaId]);
  const prontas = [...estados.entries()].filter(([o, v]) => v.s.k === 'pronta' && !g.recusas.has(o)).length;
  const incompletas = [...estados.values()].filter((v) => v.s.k === 'falta').length;
  const aberta = pronta?.grupos.linhas.find((x) => x.linha.ordem === linhaAberta && x.gesto === 'lancar') ?? null;
  const escolhaAberta = aberta ? estados.get(aberta.linha.ordem)?.e ?? null : null;
  const muda = (ordem: number, parte: Partial<Escolha>) => setEscolhas((m) => {
    const atual = m.get(ordem) ?? { planoContaId: null, fazendaId: null };
    return new Map(m).set(ordem, { ...atual, ...parte });
  });
  const ocupado = ['conferindo', 'gravando', 'desfazer_conferindo', 'desfazendo'].includes(g.fase.k);
  const tipoDaAberta = aberta && aberta.linha.valorCent < 0 ? '1-Entradas' : '2-Saídas';
  /* o seletor mostra o nome INTEIRO (régua): a largura do maior nome da lista */
  const largConta = larguraDoSeletor(classificacoes.filter((c) => c.tipo_operacao.startsWith(tipoDaAberta[0])).map((c) => c.subcentro));
  const largFaz = larguraDoSeletor(fazOper.map((f) => f.nome));

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[#e3e8ef] px-4" data-testid="fatura-previa">
        <span className={cn('min-w-0 whitespace-nowrap', TITULO_MODAL)}>Compras da fatura · prévia
          {pronta?.gravacao ? (
            <small className={cn('ml-1.5 font-normal text-[#6b7a8f]', TEXTO_ROTULO)} data-testid="fatura-gravada">gravada em {dma(pronta.gravacao.feitaEm.slice(0, 10))} ·{' '}
              <button type="button" className="text-[#c0392b] hover:underline disabled:opacity-50" disabled={ocupado} onClick={g.abrirDesfazer}
                data-testid="fatura-desfazer">Desfazer gravação</button></small>
          ) : <small className={cn('ml-1.5 font-normal text-[#6b7a8f]', TEXTO_ROTULO)}>nada é gravado sem o seu OK</small>}</span>
        <button type="button" className="whitespace-nowrap text-[11px] text-[#1f5fbf] hover:underline" onClick={aoVoltar} data-testid="fatura-voltar">cancelar</button>
      </div>

      <div className="flex min-h-0 flex-col px-3 pt-2 text-[11px]">
        {estado.fase === 'lendo' && <p className="pt-2 text-muted-foreground" data-testid="fatura-lendo">Lendo a fatura e o que já está no sistema…</p>}
        {estado.fase === 'nao_li' && <p className="pt-2" data-testid="fatura-nao-li">{estado.motivo}</p>}
        {estado.fase === 'erro' && (
          <p className="pt-2 text-destructive" role="alert" data-testid="fatura-erro">{estado.frase}{' '}
            <button type="button" className="text-[#1f5fbf] underline" onClick={aoTentarDeNovo} data-testid="fatura-tentar">Tentar de novo</button></p>
        )}
        {pronta && grupo && (
          <>
            <p className={cn('h-[16px] shrink-0 truncate text-[#55657a] tabular-nums', TEXTO_ROTULO)} data-testid="fatura-cabecalho">{cabecalhoDaFatura(pronta.fatura)}</p>
            <p className={cn('h-[14px] shrink-0 truncate text-amber-700', TEXTO_ROTULO)} data-testid="fatura-avisos"
              title={pronta.avisos.join(' ')}>{pronta.avisos[0] ?? ''}</p>
            {/* os grupos: altura FIXA de 2 linhas (nada se desloca ao escolher) */}
            <div className="flex h-[56px] shrink-0 flex-wrap content-start gap-1" data-testid="fatura-grupos">
              {ORDEM_DOS_GRUPOS.map((k) => (
                <button key={k} type="button" onClick={() => { setEscolhido(k); setLinhaAberta(null); }} title={`${ROTULO_DO_GRUPO[k]} · ${pronta.grupos.contagem[k]}`}
                  className={cn('h-[26px] whitespace-nowrap rounded-[13px] px-2.5 text-[11px] font-semibold tabular-nums',
                    k === grupo ? 'bg-[#1E3A5F] text-white' : COR[COR_DO_GRUPO[k]])}
                  data-testid={`fatura-grupo-${k}`} data-ligado={k === grupo ? 'sim' : 'nao'}>
                  {SELO_DO_GRUPO[k]} {pronta.grupos.contagem[k]}
                </button>
              ))}
            </div>
            {/* D1: a faixa de escolha da linha clicada — altura RESERVADA (vazia = a frase); conta e fazenda do seletor da casa */}
            <div className="flex h-[32px] shrink-0 items-center gap-1.5" data-testid="fatura-escolha">
              {aberta && escolhaAberta ? (
                <>
                  <span className="shrink-0" style={{ width: largConta }} title="Conta do plano" data-testid="fatura-escolha-conta">
                    <EscolherConta valor={escolhaAberta.planoContaId ?? ''} classificacoes={classificacoes} tipoOperacao={tipoDaAberta}
                      onEscolher={(c) => muda(aberta.linha.ordem, { planoContaId: c.id })} triggerClassName={cn(CONTROLE, 'px-2')} disabled={ocupado} />
                  </span>
                  <span className="shrink-0" style={{ width: largFaz }} title="Fazenda" data-testid="fatura-escolha-fazenda">
                    <FazendaSelect value={escolhaAberta.fazendaId ?? ''} onChange={(id) => muda(aberta.linha.ordem, { fazendaId: id || null })} fazendas={fazOper}
                      forcaAdministrativo={!!escolhaAberta.planoContaId && forca(escolhaAberta.planoContaId)} hideAviso triggerClassName={CONTROLE} disabled={ocupado} />
                  </span>
                </>
              ) : <span className={cn('text-[#6b7a8f]', TEXTO_ROTULO)}>{FRASE_ESCOLHER}</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded border border-[#e3e8ef]" data-testid="fatura-quadro">
              <table className="w-full table-fixed border-collapse" data-testid="fatura-tabela">
                <colgroup><col style={{ width: 64 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 72 }} /><col style={{ width: 132 }} /></colgroup>
                <thead className="sticky top-0 z-[1] bg-primary">
                  <tr><th className={TH_FONTES}>Data</th><th className={TH_FONTES}>Na fatura</th><th className={TH_FONTES}>Conta · fazenda</th>
                    <th className={cn(TH_FONTES, 'text-right')}>Valor</th><th className={TH_FONTES}>O que o sistema vai fazer</th></tr>
                </thead>
                <tbody>
                  {linhas.map((x) => {
                    const v = estados.get(x.linha.ordem);
                    if (!v) return null;
                    const cf = contaEFazenda(x, v.e, v.s, nomeDaConta, nomeDaFazenda);
                    const faz = oQueFaz(x, v.s, g.recusas.get(x.linha.ordem));
                    const clicavel = x.gesto === 'lancar';
                    return (
                      <tr key={x.linha.ordem} className={cn(LINHA_FONTES, 'border-b border-[#f0f2f6]', clicavel && 'cursor-pointer hover:bg-[#f5f8fc]',
                        linhaAberta === x.linha.ordem && clicavel && 'bg-[#e6efff] hover:bg-[#e6efff]')}
                        onClick={clicavel ? () => setLinhaAberta(x.linha.ordem) : undefined}
                        data-testid="fatura-linha" data-gesto={x.gesto} data-ordem={x.linha.ordem} data-estado={v.s.k}>
                        <td className={TD_FONTES_DATA}>{dma(x.linha.dataCompra)}</td>
                        <td className={TD_FONTES_TEXTO} title={x.linha.descricao}>{x.linha.descricao}</td>
                        <td className={cn(TD_FONTES_TEXTO, cf.falta && 'text-destructive')} title={cf.texto} data-testid="fatura-linha-conta">{cf.texto}</td>
                        <td className={cn(TD_FONTES_NUM, x.linha.valorCent < 0 ? 'text-[#1e8449]' : 'text-[#c0392b]')}>{reais(x.linha.valorCent)}</td>
                        <td className={cn(TD_FONTES_TEXTO, faz.tom === 'recusa' && 'text-destructive', faz.tom === 'editar' && 'text-amber-700')} title={faz.texto}
                          data-testid="fatura-linha-faz">{faz.texto}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="grid items-center gap-2 border-t border-[#e3e8ef] px-4" style={{ gridTemplateColumns: `minmax(0,1fr) ${LARGURA_BOTOES}px` }} data-testid="fatura-barra">
        {pronta ? (
          <Rodape fase={g.fase} prontas={prontas} incompletas={incompletas} rodape={pronta.grupos.rodape} recusadas={g.recusas.size}
            aoGravar={() => void g.conferir()} aoConfirmar={() => void g.confirmar()} aoVoltar={g.voltar}
            aoPreverDesfazer={(m) => void g.preverDesfazer(m)} aoDesfazer={() => void g.desfazer()} />
        ) : <><span /><span /></>}
      </div>
    </>
  );
}

/** o painel: lê a fatura solta e mostra a vista */
export function PreviaDaFatura(p: {
  clienteId: string; contaId: string; arquivo: File; nomeDaConta: (id: string) => string; aoVoltar: () => void; lerLinhas?: (f: File) => Promise<LinhasDoPdf>;
  api?: FaturaApi;
}) {
  const { estado, tentarDeNovo } = usePreviaDaFatura(p);
  const { fazendas } = useFazenda();
  return <PreviaDaFaturaVista estado={estado} aoVoltar={p.aoVoltar} aoTentarDeNovo={tentarDeNovo} clienteId={p.clienteId} contaId={p.contaId}
    fazendas={fazendas} api={p.api} />;
}
