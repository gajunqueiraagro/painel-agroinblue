/**
 * PainelDaConta — o PAINEL DA CONTA NO MÊS. CONC-PAINEL-CONTA-01 (fatia 1, Gabriel 17/11) virou CONC-PAINEL-02 (mock aprovado 23/11 08:11,
 * `ui-validar/conc-painel-02-ref/mock-aprovado.html`): o ✎ da conta em "Saldos por conta" abre este painel À DIREITA, por cima.
 * ⚠ LARGURA E ALTURA FIXAS (UI-LARGURA-FIXA-01): 980 px (430 passos | 550 trabalho); topo 56 · arquivos 72 · corpo · rodapé 44 — iguais
 *   para qualquer conta, nome ou número de arquivos.
 * ⚠ "ARQUIVOS DO MÊS" (CONC-PAINEL-ARQUIVOS-01, D1 a / D2 do Gabriel 23/11): TODOS os arquivos da conta no mês — os comprovantes de saldo
 *   (a MESMA lista que acende o chip "PDF" da linha: a tela lê uma vez e passa aqui) e as importações do mês (`importacoesDoMes`, pelos
 *   movimentos). Ver abre DENTRO do painel (o `VisualizadorDeDocumento` embutido; a importação mostra os movimentos que trouxe), Baixar (a
 *   importação só a NOVA, com o original guardado — lote 115620; a antiga: "o arquivo original não foi guardado"), Desfazer (o comprovante se CANCELA com motivo; a importação pelo `DesfazerArquivoModal`).
 * ⚠ OS PASSOS SÃO DO DONO, POR TIPO (`passosDoPainel`): corrente = extrato → casar → saldo; investimento = saldo → movimentos → explicar a
 *   diferença; cartão = fatura → compras → pagamento. Nada se recalcula aqui.
 * ⚠ O PAINEL LEVA ÀS PEÇAS QUE JÁ EXISTEM: o lote do mês (`PalcoDoMes`, "casar os exatos" com prévia) e o "Extrato do sistema" abrem POR
 *   CIMA do painel; a Conferência e o Importar banco são as abas de hoje; o saldo à mão é o `SaldoRealDialog`; o lançamento a casar abre no
 *   modal do lançamento de sempre (`LancamentoV2Dialog`), já com a conta, o realizado e a data — quem grava é o Salvar dele.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { LinhaResumo } from '@/lib/conciliacao/resumoDoDono';
import { saldosDaLinha } from '@/lib/conciliacao/resumoDoDono';
import {
  ROTULO_DO_TIPO, SUGESTOES_AO_ABRIR_ATE, candidatosDaDiferenca, ddmmaaaa, fimDoMes, fonteDaConta, linhasParaCasar, moeda, passoInicial,
  passosDoPainel, seloDosPassos, tipoDoPainel, vizinhasPendentes, type EstadoDoPasso, type IdDoPasso, type LancamentoCandidato,
  type TipoDoPainel, type TomDaSugestao,
} from '@/lib/conciliacao/painelDaConta';
import { useConciliacaoDoMes, type MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';
import { buscarSugestoesDoMes, type RespostaDoMotor } from '@/lib/conciliacao/loteDeSugestoes';
import { PreviaDaFatura } from '@/components/conciliacao/PreviaDaFatura';
import { EstacaoConciliar } from '@/components/conciliacao/EstacaoConciliar';
import {
  MAX_CARTOES_NA_FAIXA, arquivosDoMes, formatoDoArquivo, ordenarArquivos, periodoCurto, resumoDosArquivos, sobreposicoesDePeriodo,
  type ArquivoDoMes, type ColunaDosArquivos, type ComprovanteDoMes, type FormatoDoArquivo,
} from '@/lib/conciliacao/arquivosDoMes';
import { anexarSaldoDocumento, cancelarSaldoDocumento, importacoesDoMes, urlAssinadaSaldoDocumento, useImportacoesDaConta } from '@/hooks/useExtratoDaConta';
import {
  baixarComprovante, bytesDoComprovante, gravarObservacaoDoMes, lerLancamentosDeValor, lerMovimentosDaImportacao, lerObservacaoDoMes,
  type MovimentoDoArquivo,
} from '@/hooks/useArquivosDoMes';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { VisualizadorDeDocumento } from '@/components/financeiro-v2/VisualizadorDeDocumento';
import { DesfazerArquivoModal } from '@/components/conciliacao/DesfazerArquivoModal';
import { PalcoDoMes } from '@/components/conciliacao/PalcoDoMes';
import { ExtratoDoSistemaDialog } from '@/components/conciliacao/ExtratoDoSistemaDialog';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, notificarLancamentosMudaram, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';

/** O fundo escuro do SALDOinBLUE (#162931) e o item ativo (#196E96) — as cores medidas no print do Gabriel (09:44). */
export const FUNDO_ESCURO = '#162931';
export const AZUL_ATIVO = '#196E96';
/** A régua fixa do painel (o mock). */
export const PAINEL = { largura: 980, passos: 430, trabalho: 550, topo: 56, arquivos: 72, rodape: 44 };

const BOLA: Record<EstadoDoPasso, string> = { ok: 'bg-[#1e8449]', pendente: 'bg-[#d39e00]', espera: 'bg-[#9aa7b8]' };
const ICONE: Record<FormatoDoArquivo, string> = {
  PDF: 'bg-[#b03a2e]', IMG: 'bg-[#7d5ba6]', OFX: 'bg-[#1f5fbf]', CSV: 'bg-[#2f7d4f]', XLS: 'bg-[#2f7d4f]', OF: 'bg-[#196E96]', ARQ: 'bg-[#6b7a8f]',
};
/** O que o "Arraste aqui" aceita: o extrato (o que o Importar banco aceita) e o comprovante/fatura (o que o anexo do saldo aceita). */
const REGRA_DO_PAINEL: RegraDeAceite = { tipos: ['ofx', 'csv', 'txt', 'xlsx', 'xls', 'pdf', 'jpg', 'png'] };
const BOTAO = 'h-[24px] whitespace-nowrap rounded border px-2 text-[10.5px] disabled:cursor-not-allowed disabled:opacity-50';
const BOTAO_PRI = 'h-[24px] whitespace-nowrap rounded px-2 text-[10.5px] text-white disabled:cursor-not-allowed disabled:opacity-50';
const TH = 'h-[22px] px-1 text-left text-[9.5px] font-medium';
const TD = 'h-[19px] overflow-hidden text-ellipsis whitespace-nowrap px-1 text-[10px]';
const CONTORNO = { borderColor: AZUL_ATIVO, color: AZUL_ATIVO };

type Direita =
  | { k: 'passo'; id: IdDoPasso }
  | { k: 'lista' }
  | { k: 'arquivo'; chave: string }
  | { k: 'desfazer'; chave: string }
  | { k: 'soltou'; arquivo: File }
  /** CARTAO-FATURA-IMPORT-01: o PDF da fatura solto no painel do cartão — a prévia (só lê) */
  | { k: 'fatura'; arquivo: File };

export interface PainelDaContaProps {
  aberto: boolean;
  /** NAV-VOLTA-ORIGEM-01 (Gabriel 23/11 17:11): a aba Importar está na frente — o painel fica MONTADO (o passo) e some da tela; volta igual */
  escondido?: boolean;
  /** fechar volta à linha da ÚLTIMA conta mostrada (NAV-VOLTA-ORIGEM-01) */
  aoFechar: (ultimaConta: string | null) => void;
  clienteId: string | null;
  conta: { id: string; nome: string; tipoConta: string | null } | null;
  /** a linha da conta no DONO (`fn_conciliacao_resumo_mes`) */
  linha: LinhaResumo | null;
  anoMes: string;
  /** os comprovantes de saldo do ano — a MESMA lista do chip "PDF" da linha (`null` = a leitura falhou) */
  comprovantes: readonly ComprovanteDoMes[] | null;
  /** releia os comprovantes (anexou ou desfez) — o chip da linha e o painel mudam juntos */
  aoMudarArquivos: () => void;
  /** as contas da tela, na ordem dela, e quais NÃO estão conciliadas (o rodapé "Próxima pendente") */
  ordem: readonly { id: string; nome: string; pendente: boolean }[];
  aoTrocarConta: (contaId: string) => void;
  /** Importar banco nesta conta; com `arquivo`, a prévia já abre com ele (o arrastar do painel) */
  aoImportar: (contaId: string, arquivo?: File) => void;
  aoCasar: (contaId: string) => void;
  aoInformarSaldo: (contaId: string) => void;
}

export function PainelDaConta(props: PainelDaContaProps) {
  const { aberto, escondido = false, aoFechar, clienteId, conta, linha, anoMes, comprovantes, aoMudarArquivos, ordem, aoTrocarConta, aoImportar, aoCasar, aoInformarSaldo } = props;
  const [ligadaOF, setLigadaOF] = useState(false);
  const { importacoes, recarregar: releImportacoes } = useImportacoesDaConta(aberto ? clienteId : null, aberto ? conta?.id ?? null : null);
  const doMes = useMemo(() => importacoesDoMes(importacoes, anoMes).ativas, [importacoes, anoMes]);
  const arquivos = useMemo(() => (conta ? arquivosDoMes({ comprovantes: comprovantes ?? [], importacoesDoMes: doMes, contaId: conta.id, anoMes }) : []),
    [comprovantes, doMes, conta, anoMes]);
  const fonte = fonteDaConta(ligadaOF, null);
  const tipo = tipoDoPainel(conta?.tipoConta);
  const saldos = saldosDaLinha(linha);
  const passos = passosDoPainel(tipo, linha, saldos, { arquivos: arquivos.length, fonte });
  const selo = seloDosPassos(passos);
  const [direita, setDireita] = useState<Direita>({ k: 'passo', id: passoInicial(passos) });
  const [sobrePalco, setSobrePalco] = useState(false);
  const [sobreSistema, setSobreSistema] = useState(false);
  const [alvoDesfazer, setAlvoDesfazer] = useState<{ id: string; nome_arquivo: string | null } | null>(null);

  /* voltou da aba Importar: relê as importações (a nova entra na lista); o passo fica onde estava */
  const estavaEscondido = useRef(escondido);
  useEffect(() => { if (estavaEscondido.current && !escondido) void releImportacoes(); estavaEscondido.current = escondido; }, [escondido, releImportacoes]);
  /* troca de conta ou de mês: volta ao 1º passo pendente */
  useEffect(() => { if (aberto) setDireita({ k: 'passo', id: passoInicial(passos) }); // eslint-disable-line react-hooks/exhaustive-deps
  }, [aberto, conta?.id, anoMes]);
  useEffect(() => {
    if (!aberto || !conta || !clienteId) return;
    let vivo = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela do Open Finance fora dos tipos gerados
    void (supabase as any).from('openfinance_contas_permitidas').select('id').eq('cliente_id', clienteId).eq('conta_bancaria_id', conta.id).eq('ativo', true).limit(1)
      .then((r: { data: unknown[] | null }) => { if (vivo) setLigadaOF((r.data ?? []).length > 0); });
    return () => { vivo = false; };
  }, [aberto, conta, clienteId]);

  if (!conta) return null;
  const mesTxt = `${anoMes.slice(5)}/${anoMes.slice(0, 4)}`;
  const viz = vizinhasPendentes(ordem, conta.id);
  const nomeDe = (id: string | null) => ordem.find((c) => c.id === id)?.nome ?? '';
  const comprovanteDoMes = arquivos.find((a) => a.origem === 'comprovante' && a.podeVer) ?? null;
  const dif = saldos.diferenca;
  const passoAberto = direita.k === 'passo' ? direita.id : null;
  const arquivoAberto = direita.k === 'arquivo' || direita.k === 'desfazer' ? arquivos.find((a) => a.chave === direita.chave) ?? null : null;
  const voltarAoPasso = () => setDireita({ k: 'passo', id: passoInicial(passos) });
  const desfazer = (a: ArquivoDoMes) => (a.origem === 'importacao' ? setAlvoDesfazer({ id: a.id, nome_arquivo: a.nome }) : setDireita({ k: 'desfazer', chave: a.chave }));
  const baixar = (a: ArquivoDoMes) => { if (a.caminho) void baixarComprovante(a.caminho, a.nome); };
  /* a LISTA dos arquivos (CONC-PAINEL-02 ajuste): é o trabalho do passo "Extrato"/"Fatura"; o investimento (sem esse passo) a abre sozinha */
  const passoDosArquivos = passos.find((x) => x.id === 'extrato' || x.id === 'fatura')?.id ?? null;
  const abrirLista = () => setDireita(passoDosArquivos ? { k: 'passo', id: passoDosArquivos } : { k: 'lista' });
  const listaAberta = direita.k === 'lista' || (passoDosArquivos != null && passoAberto === passoDosArquivos);
  const lista = <ListaDeArquivos arquivos={arquivos} aoVer={(a) => setDireita({ k: 'arquivo', chave: a.chave })} aoBaixar={baixar} aoDesfazer={desfazer} />;

  return (
    <>
      <Sheet open={aberto && !escondido} onOpenChange={(v) => { if (!v && !escondido) aoFechar(conta.id); }}>
        <SheetContent side="right" className="grid w-[980px] max-w-[100vw] gap-0 p-0 sm:max-w-[980px] [&>button.absolute]:text-white"
          style={{ gridTemplateRows: `${PAINEL.topo}px ${PAINEL.arquivos}px minmax(0,1fr) ${PAINEL.rodape}px` }}
          data-testid="painel-da-conta" data-painel-por-cima data-tipo={tipo}>
          {/* ─── topo: conta · mês | selo | diferença ─── */}
          <div className="grid items-center gap-2.5 px-4 pr-10 text-white" style={{ background: FUNDO_ESCURO, gridTemplateColumns: 'minmax(0,1fr) 170px 150px' }}>
            <div className="min-w-0">
              <SheetTitle className="truncate text-[14px] font-semibold text-white" title={`${conta.nome} · ${mesTxt}`} data-testid="painel-titulo">{conta.nome} · {mesTxt}</SheetTitle>
              <SheetDescription className="whitespace-nowrap text-[11px] text-[#b9c6d8]" data-testid="painel-fonte">
                {ROTULO_DO_TIPO[tipo].nome}{fonte.tipo === 'open_finance' ? ' · Open Finance' : ''}
              </SheetDescription>
            </div>
            <div className="text-right">
              <span className={cn('inline-block whitespace-nowrap rounded-[10px] px-2 py-0.5 text-[11px] font-semibold', selo.ok ? 'bg-[#e3f5ea] text-[#1e8449]' : 'bg-[#fde8e8] text-[#c0392b]')}
                data-testid="painel-selo">{selo.texto}</span>
            </div>
            <div className="text-right text-[11px] text-[#b9c6d8]">Diferença
              <b className={cn('block text-[16px] tabular-nums', dif == null ? 'text-[#b9c6d8]' : Math.abs(dif) < 0.005 ? 'text-[#7ee2a8]' : 'text-[#ff8a80]')}
                data-testid="painel-diferenca">{moeda(dif)}</b>
            </div>
          </div>

          {/* ─── arquivos do mês: todos, de qualquer origem + arraste aqui ─── */}
          <div className="grid items-center gap-2.5 border-b border-[#e3e8ef] bg-[#f6f8fb] px-4" style={{ gridTemplateColumns: '110px minmax(0,1fr) 200px' }}
            data-testid="painel-arquivos">
            <div className="text-[11px] font-semibold text-[#55657a]">Arquivos do mês<small className="block font-normal text-[#8794a6]">todos, de qualquer origem</small></div>
            {/* ⚠ NUNCA ROLAGEM LATERAL (Gabriel 23/11 17:09): até 2 arquivos, os cartões; 3 ou mais, UM cartão de resumo de largura fixa */}
            <div className="h-[52px] min-w-0 overflow-hidden" data-testid="painel-arquivos-faixa">
              {arquivos.length === 0
                ? <p className="pt-[18px] text-[11px] text-muted-foreground" data-testid="painel-sem-arquivos">
                    {comprovantes === null ? 'Não consegui ler os arquivos do mês.' : 'Nenhum arquivo neste mês.'}</p>
                : arquivos.length > MAX_CARTOES_NA_FAIXA
                ? <ResumoDosArquivos arquivos={arquivos} ligado={listaAberta} aoAbrir={abrirLista} />
                : (
                  /* uma TABELA de uma linha: o nome do arquivo corta com "…" e o nome inteiro no `title` (a regra de corte é a de tabela) */
                  <table className="table-fixed border-separate" style={{ borderSpacing: '8px 0', marginLeft: -8, width: arquivos.length * 218 }}>
                    <colgroup>{arquivos.map((a) => <col key={a.chave} style={{ width: 210 }} />)}</colgroup>
                    <tbody><tr>{arquivos.map((a) => (
                      <td key={a.chave} className="p-0 align-top">
                        <CartaoDoArquivo a={a} ligado={arquivoAberto?.chave === a.chave}
                          aoVer={() => setDireita({ k: 'arquivo', chave: a.chave })}
                          aoBaixar={() => baixar(a)}
                          aoDesfazer={() => desfazer(a)} />
                      </td>
                    ))}</tr></tbody>
                  </table>
                )}
            </div>
            <AreaDeArquivo regra={REGRA_DO_PAINEL} className="h-[48px] w-[200px] justify-center px-2.5 text-[10px]" testId="painel-arrastar" detalhe=""
              convite="Arraste aqui OFX, PDF ou foto" onArquivos={([f]) => { if (f) setDireita({ k: 'soltou', arquivo: f }); }} />
          </div>

          {/* ─── corpo: passos (430) | trabalho (550) ─── */}
          <div className="grid min-h-0" style={{ gridTemplateColumns: `${PAINEL.passos}px ${PAINEL.trabalho}px` }}>
            <div className="min-h-0 overflow-y-auto border-r border-[#e3e8ef]">
              <div className="h-[32px] whitespace-nowrap border-b border-[#eef1f5] px-4 pt-[8px] text-[11px] text-[#55657a]" data-testid="painel-tipo">
                Tipo: <b className="text-[#1d2838]">{ROTULO_DO_TIPO[tipo].nome}</b> · {ROTULO_DO_TIPO[tipo].frase}
              </div>
              {passos.map((p) => (
                <button key={p.id} type="button" onClick={() => setDireita({ k: 'passo', id: p.id })}
                  className={cn('grid h-[56px] w-full items-start gap-2.5 border-b border-[#eef1f5] px-4 py-3 text-left hover:bg-[#f6f8fb]',
                    passoAberto === p.id && 'bg-[#eef4ff] shadow-[inset_3px_0_0_#1f5fbf]')}
                  style={{ gridTemplateColumns: '22px minmax(0,1fr) 104px' }}
                  data-testid={`painel-passo-${p.id}`} data-estado={p.estado}>
                  <span className={cn('flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white', BOLA[p.estado])}>
                    {p.estado === 'ok' ? '✓' : p.n}
                  </span>
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-[12px] font-semibold">{p.titulo}</span>
                    <span className="block whitespace-nowrap text-[11px] text-[#6b7a8f]" data-testid={`painel-passo-${p.id}-frase`}>{p.frase}</span>
                  </span>
                  <span className={cn('whitespace-nowrap text-right text-[12px] font-semibold tabular-nums', p.negativo && 'text-[#c0392b]')}
                    data-testid={`painel-passo-${p.id}-valor`}>{p.valor}</span>
                </button>
              ))}
              <ResumoDoMes linha={linha} saldoSistema={saldos.saldo_sistema} />
              <p className="mx-4 mb-3.5 text-[11px] text-[#6b7a8f]">O mês desta conta fecha quando todos os passos ficam verdes.</p>
            </div>

            <div className="grid min-h-0" style={{ gridTemplateRows: '40px minmax(0,1fr) 52px' }} data-testid="painel-trabalho">
              {direita.k === 'arquivo' && arquivoAberto && clienteId
                ? <VerArquivo key={arquivoAberto.chave} a={arquivoAberto} clienteId={clienteId} aoVoltar={abrirLista} aoDesfazer={() => desfazer(arquivoAberto)} />
                : direita.k === 'lista'
                ? <Trabalho testid="painel-trabalho-lista" titulo="Arquivos do mês" sub={resumoDosArquivos(arquivos).total} semMargem
                    botoes={<button type="button" className={BOTAO_PRI} style={{ background: AZUL_ATIVO }} onClick={() => aoImportar(conta.id)} data-testid="painel-importar">
                      {fonte.tipo === 'open_finance' ? 'Buscar do banco' : 'Importar banco'}</button>}>{lista}</Trabalho>
                : direita.k === 'desfazer' && arquivoAberto && clienteId
                  ? <DesfazerComprovante key={arquivoAberto.chave} a={arquivoAberto} clienteId={clienteId}
                      aoVoltar={() => setDireita({ k: 'arquivo', chave: arquivoAberto.chave })}
                      aoDesfeito={() => { aoMudarArquivos(); voltarAoPasso(); }} />
                  : direita.k === 'fatura' && clienteId
                    ? <PreviaDaFatura key={`${direita.arquivo.name}-${direita.arquivo.size}`} clienteId={clienteId} contaId={conta.id} arquivo={direita.arquivo}
                        nomeDaConta={nomeDe} aoVoltar={voltarAoPasso} />
                  : direita.k === 'soltou' && clienteId
                    ? <ArquivoSolto key={`${direita.arquivo.name}-${direita.arquivo.size}`} arquivo={direita.arquivo} clienteId={clienteId} contaId={conta.id} anoMes={anoMes}
                        aoVoltar={voltarAoPasso} aoAnexado={() => { aoMudarArquivos(); voltarAoPasso(); }} aoImportar={(f) => aoImportar(conta.id, f)}
                        aoLerFatura={tipo === 'cartao' ? (f) => setDireita({ k: 'fatura', arquivo: f }) : undefined} />
                    : <TrabalhoDoPasso id={passoAberto ?? passoInicial(passos)} tipo={tipo} clienteId={clienteId} contaId={conta.id}
                        anoMes={anoMes} linha={linha} saldos={saldos} fonteOF={fonte.tipo === 'open_finance'} arquivos={arquivos} lista={lista}
                        comprovante={comprovanteDoMes}
                        aoVerArquivo={(chave) => setDireita({ k: 'arquivo', chave })}
                        aoImportar={() => aoImportar(conta.id)} aoCasar={() => aoCasar(conta.id)} aoInformarSaldo={() => aoInformarSaldo(conta.id)}
                        aoAbrirPalco={() => setSobrePalco(true)} aoAbrirSistema={() => setSobreSistema(true)} />}
            </div>
          </div>

          {/* ─── rodapé: ← anterior · conta i de N · Próxima pendente → (uma tabela: o nome da conta corta com "…" + title) ─── */}
          <table className="h-[44px] w-full table-fixed border-t border-[#e3e8ef] text-[11px]" data-testid="painel-rodape">
            <colgroup><col style={{ width: 300 }} /><col /><col style={{ width: 330 }} /></colgroup>
            <tbody><tr>
              <td className="overflow-hidden text-ellipsis whitespace-nowrap px-4" title={viz.anterior ? nomeDe(viz.anterior) : undefined}>
                {viz.anterior && <button type="button" className="text-[#1f5fbf] hover:underline" onClick={() => aoTrocarConta(viz.anterior ?? '')}
                  data-testid="painel-anterior">← {nomeDe(viz.anterior)}</button>}
              </td>
              <td className="overflow-hidden text-ellipsis whitespace-nowrap text-center text-[#6b7a8f]" data-testid="painel-contador">
                {viz.total === 0 ? 'nenhuma conta pendente no mês · fechar volta à linha'
                  : viz.posicao ? `conta ${viz.posicao} de ${viz.total} pendentes · fechar volta à linha`
                  : `${viz.total} ${viz.total === 1 ? 'conta pendente' : 'contas pendentes'} · fechar volta à linha`}
              </td>
              <td className="overflow-hidden text-ellipsis whitespace-nowrap px-4 text-right" title={viz.proxima ? nomeDe(viz.proxima) : undefined}>
                {viz.proxima && <button type="button" className="font-semibold text-[#1f5fbf] hover:underline" onClick={() => aoTrocarConta(viz.proxima ?? '')}
                  data-testid="painel-proxima">Próxima pendente: {nomeDe(viz.proxima)} →</button>}
              </td>
            </tr></tbody>
          </table>
        </SheetContent>
      </Sheet>
      {alvoDesfazer && <DesfazerArquivoModal alvo={alvoDesfazer} onClose={() => setAlvoDesfazer(null)}
        onDesfeito={() => { setAlvoDesfazer(null); void releImportacoes(); aoMudarArquivos(); voltarAoPasso(); }} />}
      {sobrePalco && clienteId && <PalcoDoMes clienteId={clienteId} contaId={conta.id} contaNome={conta.nome}
        ano={Number(anoMes.slice(0, 4))} mes={Number(anoMes.slice(5, 7))} aoFechar={() => setSobrePalco(false)} />}
      {sobreSistema && clienteId && <ExtratoDoSistemaDialog aberto clienteId={clienteId} contaId={conta.id} contaNome={conta.nome} anoMes={anoMes}
        onFechar={() => setSobreSistema(false)} />}
    </>
  );
}

function CartaoDoArquivo({ a, ligado, aoVer, aoBaixar, aoDesfazer }: {
  a: ArquivoDoMes; ligado: boolean; aoVer: () => void; aoBaixar: () => void; aoDesfazer: () => void;
}) {
  const LINK = 'text-[10px] text-[#1f5fbf] hover:underline disabled:cursor-not-allowed disabled:text-[#9aa7b8] disabled:no-underline';
  return (
    <div className={cn('grid h-[48px] w-[210px] gap-1.5 rounded-md border bg-white px-2 py-[5px]', ligado ? 'border-[#1f5fbf] shadow-[0_0_0_2px_#cfe0fb]' : 'border-[#d5dce6]')}
      style={{ gridTemplateColumns: '30px minmax(0,1fr)' }} data-testid="painel-arquivo" data-origem={a.origem} data-formato={a.formato}>
      <span className={cn('flex h-[36px] w-[30px] items-center justify-center rounded-[3px] text-[9px] font-bold text-white', ICONE[a.formato])}>{a.formato}</span>
      <span className="min-w-0 leading-[12px]">
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold" title={a.nome} data-testid="painel-arquivo-nome">{a.nome}</span>
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[#8794a6]" title={a.detalhe}>{a.detalhe}</span>
        <span className="flex gap-1.5">
          <button type="button" className={LINK} disabled={!a.podeVer} onClick={aoVer} data-testid="painel-arquivo-ver"
            title={a.podeVer ? undefined : 'o arquivo não está guardado'}>Ver</button>
          <button type="button" className={LINK} disabled={!a.podeBaixar} onClick={aoBaixar} data-testid="painel-arquivo-baixar"
            title={a.podeBaixar ? undefined : a.origem === 'importacao' ? 'o arquivo original não foi guardado' : 'o arquivo não subiu'}>Baixar</button>
          <button type="button" className={LINK} onClick={aoDesfazer} data-testid="painel-arquivo-desfazer">Desfazer</button>
        </span>
      </span>
    </div>
  );
}

/** 3 ou mais arquivos: UM cartão de LARGURA FIXA ("10 arquivos" · "OFX 9 · PDF 1" · ver lista) — clicar abre a lista à direita. Numa
 *  tabela de uma linha, como os cartões: os formatos cortam com "…" e o inteiro no `title`. */
function ResumoDosArquivos({ arquivos, ligado, aoAbrir }: { arquivos: readonly ArquivoDoMes[]; ligado: boolean; aoAbrir: () => void }) {
  const r = resumoDosArquivos(arquivos);
  return (
    <table className="table-fixed" style={{ width: 260 }}><tbody><tr><td className="p-0 align-top">
      <button type="button" onClick={aoAbrir} title={`${r.total} · ${r.formatos} — ver a lista`}
        className={cn('grid h-[48px] w-[260px] gap-1.5 rounded-md border bg-white px-2 py-[5px] text-left hover:bg-[#f6f8fb]',
          ligado ? 'border-[#1f5fbf] shadow-[0_0_0_2px_#cfe0fb]' : 'border-[#d5dce6]')}
        style={{ gridTemplateColumns: '30px minmax(0,1fr)' }} data-testid="painel-arquivos-resumo">
        <span className="flex h-[36px] w-[30px] items-center justify-center rounded-[3px] bg-[#1d2838] text-[11px] font-bold tabular-nums text-white">{arquivos.length}</span>
        <span className="min-w-0 leading-[12px]">
          <span className="block whitespace-nowrap text-[11px] font-semibold" data-testid="painel-arquivos-resumo-total">{r.total}</span>
          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[#8794a6]" data-testid="painel-arquivos-resumo-formatos">{r.formatos}</span>
          <span className="block text-[10px] text-[#1f5fbf]">ver lista</span>
        </span>
      </button>
    </td></tr></tbody></table>
  );
}

const COLUNAS_DA_LISTA: { id: ColunaDosArquivos; rotulo: string; largura: number | null; direita?: boolean }[] = [
  { id: 'nome', rotulo: 'Arquivo', largura: null }, { id: 'formato', rotulo: 'Tipo', largura: 30 }, { id: 'periodo', rotulo: 'Período', largura: 96 },
  { id: 'enviado', rotulo: 'Importado em', largura: 70 }, { id: 'movimentos', rotulo: 'Mov.', largura: 34, direita: true },
  { id: 'saldo', rotulo: 'Saldo final', largura: 98, direita: true },
];
const LARGURA_DAS_ACOES = 106;

/** A LISTA dos arquivos do mês (CONC-PAINEL-02 ajuste, Gabriel 23/11 17:09): colunas fixas e ordenáveis; Ver abre no mesmo lado (com
 *  "← voltar à lista"); embaixo, o aviso quando dois arquivos cobrem os mesmos dias. */
function ListaDeArquivos({ arquivos, aoVer, aoBaixar, aoDesfazer }: {
  arquivos: readonly ArquivoDoMes[]; aoVer: (a: ArquivoDoMes) => void; aoBaixar: (a: ArquivoDoMes) => void; aoDesfazer: (a: ArquivoDoMes) => void;
}) {
  const [ordem, setOrdem] = useState<{ coluna: ColunaDosArquivos; crescente: boolean } | null>(null);
  const linhas = ordem ? ordenarArquivos(arquivos, ordem.coluna, ordem.crescente) : arquivos;
  const sobre = sobreposicoesDePeriodo(arquivos);
  const marcados = new Map<string, string[]>();
  for (const x of sobre) {
    marcados.set(x.a.chave, [...(marcados.get(x.a.chave) ?? []), x.b.nome]);
    marcados.set(x.b.chave, [...(marcados.get(x.b.chave) ?? []), x.a.nome]);
  }
  const LINK = 'text-[10px] text-[#1f5fbf] hover:underline disabled:cursor-not-allowed disabled:text-[#9aa7b8] disabled:no-underline';
  const clicar = (c: ColunaDosArquivos) => setOrdem((o) => (o?.coluna === c ? { coluna: c, crescente: !o.crescente } : { coluna: c, crescente: true }));
  return (
    <div className="px-2 pb-2" data-testid="painel-lista">
      <table className="w-full table-fixed border-collapse tabular-nums">
        <colgroup>{COLUNAS_DA_LISTA.map((c) => <col key={c.id} style={c.largura ? { width: c.largura } : undefined} />)}<col style={{ width: LARGURA_DAS_ACOES }} /></colgroup>
        <thead className="sticky top-0 z-[1]"><tr className="text-white" style={{ background: FUNDO_ESCURO }}>
          {COLUNAS_DA_LISTA.map((c) => (
            <th key={c.id} className={cn(TH, c.direita && 'text-right')} aria-sort={ordem?.coluna === c.id ? (ordem.crescente ? 'ascending' : 'descending') : undefined}>
              <button type="button" className="whitespace-nowrap hover:underline" onClick={() => clicar(c.id)} data-testid={`painel-lista-ordenar-${c.id}`}>
                {c.rotulo}{ordem?.coluna === c.id ? (ordem.crescente ? ' ▲' : ' ▼') : ''}</button>
            </th>
          ))}
          <th className={TH} />
        </tr></thead>
        <tbody>{linhas.map((a) => {
          const outros = marcados.get(a.chave);
          return (
            <tr key={a.chave} className="border-t border-border" data-testid="painel-lista-linha" data-chave={a.chave} data-sobreposto={outros ? 'sim' : undefined}>
              <td className={TD} title={outros ? `⚠ ${a.nome} — cobre dias de: ${outros.join(', ')}` : a.nome} data-testid="painel-lista-nome">
                {outros && <span className="text-[#b7791f]">⚠ </span>}{a.nome}</td>
              <td className={TD}>{a.formato}</td>
              <td className={TD} data-testid="painel-lista-periodo" title={a.periodoDe && a.periodoAte ? `${ddmmaaaa(a.periodoDe)} a ${ddmmaaaa(a.periodoAte)}` : undefined}>{periodoCurto(a.periodoDe, a.periodoAte)}</td>
              <td className={TD}>{a.enviadoEm ? ddmmaaaa(a.enviadoEm) : '—'}</td>
              <td className={cn(TD, 'text-right')}>{a.movimentos ?? '—'}</td>
              <td className={cn(TD, 'text-right', a.saldoFinal != null && a.saldoFinal < 0 && 'text-[#c0392b]')}>{a.saldoFinal == null ? '—' : moeda(a.saldoFinal)}</td>
              <td className={TD}>
                <span className="flex gap-1.5">
                  <button type="button" className={LINK} disabled={!a.podeVer} onClick={() => aoVer(a)} data-testid="painel-lista-ver"
                    title={a.podeVer ? undefined : 'o arquivo não está guardado'}>Ver</button>
                  <button type="button" className={LINK} disabled={!a.podeBaixar} onClick={() => aoBaixar(a)} data-testid="painel-lista-baixar"
                    title={a.podeBaixar ? undefined : a.origem === 'importacao' ? 'o arquivo original não foi guardado' : 'o arquivo não subiu'}>Baixar</button>
                  <button type="button" className={LINK} onClick={() => aoDesfazer(a)} data-testid="painel-lista-desfazer">Desfazer</button>
                </span>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
      {sobre.length > 0 && (
        <p className="mt-1.5 break-words text-[10px] text-[#8a5a00]" data-testid="painel-lista-sobreposicao">
          {sobre.length === 1
            ? `⚠ ${sobre[0].a.nome} e ${sobre[0].b.nome} cobrem os mesmos dias (${ddmmaaaa(sobre[0].de)}–${ddmmaaaa(sobre[0].ate)}).`
            : `⚠ ${marcados.size} arquivos cobrem dias que outro arquivo também cobre (sobreposição de período): marcados com ⚠ na lista.`}
        </p>
      )}
    </div>
  );
}

function ResumoDoMes({ linha, saldoSistema }: { linha: LinhaResumo | null; saldoSistema: number | null }) {
  const linhas: [string, number | null][] = [
    ['Saldo inicial', linha?.saldo_inicial ?? null], ['Entradas', linha?.entradas ?? null],
    ['Saídas', linha ? -Math.abs(linha.saidas) : null], ['Saldo no sistema', saldoSistema]];
  return (
    <div className="mx-4 my-3 rounded-md border border-[#e3e8ef]" data-testid="painel-resumo">
      {linhas.map(([r, v], i) => (
        <div key={r} className={cn('grid h-[23px] items-center px-2.5 text-[11px]', i < linhas.length - 1 ? 'border-b border-[#f0f2f6]' : 'font-bold')}
          style={{ gridTemplateColumns: 'minmax(0,1fr) 130px' }}>
          <span className="whitespace-nowrap">{r}</span><span className="whitespace-nowrap text-right tabular-nums">{moeda(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** A moldura da área da direita: o cabeçalho (40), o conteúdo (rola) e os botões (52). */
function Trabalho({ titulo, sub, extra, children, botoes, testid, semMargem = false }: {
  titulo: string; sub?: string; extra?: ReactNode; children: ReactNode; botoes?: ReactNode; testid: string;
  /** a lista de arquivos: o cabeçalho da tabela preso no topo do quadro (sem o vão da margem) */
  semMargem?: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[#e3e8ef] px-4" data-testid={testid}>
        <span className="min-w-0 whitespace-nowrap text-[12px] font-semibold">{titulo}{sub && <small className="ml-1.5 font-normal text-[#6b7a8f]">{sub}</small>}</span>
        {extra}
      </div>
      <div className={cn('min-h-0 overflow-auto text-[11px]', !semMargem && 'px-4 py-3')}>{children}</div>
      <div className="flex items-center justify-end gap-2 border-t border-[#e3e8ef] px-4">{botoes}</div>
    </>
  );
}

type Saldos = ReturnType<typeof saldosDaLinha>;

function TrabalhoDoPasso(p: {
  id: IdDoPasso; tipo: TipoDoPainel; clienteId: string | null; contaId: string; anoMes: string;
  linha: LinhaResumo | null; saldos: Saldos; fonteOF: boolean; arquivos: readonly ArquivoDoMes[]; lista: ReactNode;
  comprovante: ArquivoDoMes | null; aoVerArquivo: (chave: string) => void; aoImportar: () => void; aoCasar: () => void;
  aoInformarSaldo: () => void; aoAbrirPalco: () => void; aoAbrirSistema: () => void;
}) {
  const { linha, saldos } = p;
  const soBanco = linha?.extratos_sem_par.qtde ?? 0;
  const soSistema = linha?.lancamentos_sem_par.qtde ?? 0;
  const comprovante = p.comprovante;
  const verComprovante = comprovante && <button type="button" className={BOTAO} style={CONTORNO}
    onClick={() => p.aoVerArquivo(comprovante.chave)} data-testid="painel-ver-comprovante">Ver o comprovante</button>;
  const informar = <button type="button" className={BOTAO} style={CONTORNO} onClick={p.aoInformarSaldo}
    data-testid="painel-informar-saldo">✎ Informar o saldo</button>;

  if (p.id === 'extrato' || p.id === 'fatura') {
    const temExtrato = !!linha?.tem_extrato;
    return (
      <Trabalho testid="painel-trabalho-extrato" titulo={p.id === 'fatura' ? 'Fatura do mês' : 'Extrato'} semMargem={p.arquivos.length > 0}
        sub={temExtrato ? `até ${ddmmaaaa(linha?.saldo_extrato_data)}` : undefined}
        botoes={<button type="button" className={BOTAO_PRI} style={{ background: AZUL_ATIVO }} onClick={p.aoImportar} data-testid="painel-importar">
          {p.fonteOF ? 'Buscar do banco' : 'Importar banco'}</button>}>
        {p.arquivos.length > 0 ? p.lista
          : <p>{p.id === 'fatura' ? 'Nenhuma fatura neste mês. Arraste o PDF da fatura acima.' : 'Nenhum extrato neste mês. Arraste o OFX ou o PDF acima, ou importe.'}</p>}
      </Trabalho>
    );
  }
  if (p.id === 'casar') {
    return <CasarDoPainel clienteId={p.clienteId} contaId={p.contaId} anoMes={p.anoMes} linha={linha}
      aoConferencia={p.aoCasar} aoAbrirPalco={p.aoAbrirPalco} />;
  }
  if (p.id === 'saldo') {
    return (
      <Trabalho testid="painel-trabalho-saldo" titulo="Saldo do banco" sub={saldos.saldo_extrato != null && linha?.saldo_extrato_data ? `em ${ddmmaaaa(linha.saldo_extrato_data)}` : undefined}
        botoes={<>{verComprovante}{informar}</>}>
        <CaixasDoSaldo saldos={saldos} />
      </Trabalho>
    );
  }
  if (p.id === 'movimentos' || p.id === 'compras') {
    return (
      <Trabalho testid="painel-trabalho-movimentos" titulo={p.id === 'compras' ? 'Compras da fatura' : 'Movimentos do mês'}
        botoes={<button type="button" className={BOTAO} style={CONTORNO} onClick={p.aoAbrirSistema}
          data-testid="painel-extrato-sistema">Ver os lançamentos do mês</button>}>
        <CaixasDoSaldo saldos={saldos} entradas={linha?.entradas ?? 0} saidas={linha?.saidas ?? 0} />
      </Trabalho>
    );
  }
  return <ExplicarDiferenca clienteId={p.clienteId} contaId={p.contaId} anoMes={p.anoMes} saldos={saldos}
    dataDoSaldo={linha?.saldo_extrato_data ?? null} titulo={p.id === 'pagamento' ? 'Pagamento da fatura' : 'Explicar a diferença'}
    botoes={<>{verComprovante}{informar}</>} />;
}

const COR_DO_TOM: Record<TomDaSugestao, string> = { exata: 'text-[#1e8449]', conferir: 'text-[#9a6b00]', sem: 'text-[#6b7a8f]', erro: 'text-destructive', nada: 'text-[#9aa7b8]' };
const MARCA_DO_TOM: Record<TomDaSugestao, string> = { exata: '✓ ', conferir: '≈ ', sem: '', erro: '', nada: '' };

/** CONC-PAINEL-02 entrega 2 (o mock aprovado; Gabriel 23/11 17:11) — "Casar lançamentos": as linhas do extrato SEM PAR com a sugestão do
 *  motor (Data · Extrato · Valor · Sugestão do sistema · casar/procurar). "casar"/"procurar" abrem a ESTAÇÃO por cima (onde estão as travas:
 *  casar, procurar no histórico, criar); embaixo "Casar os exatos (prévia)" (o lote do mês) e a "Conferência lado a lado" para o caso difícil. */
function CasarDoPainel({ clienteId, contaId, anoMes, linha, aoConferencia, aoAbrirPalco }: {
  clienteId: string | null; contaId: string; anoMes: string; linha: LinhaResumo | null; aoConferencia: () => void; aoAbrirPalco: () => void;
}) {
  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaId, Number(anoMes.slice(0, 4)), Number(anoMes.slice(5, 7)));
  const [sugestoes, setSugestoes] = useState<Map<string, RespostaDoMotor> | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [estacao, setEstacao] = useState<MovimentoConciliacao | null>(null);
  const semPar = useMemo(() => movimentos.filter((m) => m.situacao !== 'conciliado'), [movimentos]);
  const chave = semPar.map((m) => m.id).join(',');
  const buscar = async () => {
    if (!clienteId || semPar.length === 0) return;
    setBuscando(true);
    const r = await buscarSugestoesDoMes(clienteId, semPar.map((m) => m.id));
    setSugestoes(r); setBuscando(false);
  };
  /* poucas linhas: o motor roda ao abrir; muitas: só pelo gesto (P124) */
  useEffect(() => {
    setSugestoes(null);
    if (semPar.length > 0 && semPar.length <= SUGESTOES_AO_ABRIR_ATE) void buscar();
  }, [chave, clienteId]); // eslint-disable-line react-hooks/exhaustive-deps
  const linhas = linhasParaCasar(movimentos, sugestoes, buscando);
  const soBanco = linha?.extratos_sem_par.qtde ?? 0;
  const soSistema = linha?.lancamentos_sem_par.qtde ?? 0;
  const precisaGesto = sugestoes === null && !buscando && semPar.length > SUGESTOES_AO_ABRIR_ATE;
  return (
    <Trabalho testid="painel-trabalho-casar" titulo="Casar lançamentos" sub={`${soBanco} só no banco · ${soSistema} só no sistema`} semMargem={linhas.length > 0}
      extra={precisaGesto ? <button type="button" className="whitespace-nowrap text-[11px] text-[#1f5fbf] hover:underline" onClick={() => void buscar()}
        data-testid="painel-casar-buscar">Buscar sugestões ({semPar.length})</button> : undefined}
      botoes={<>
        <button type="button" className={BOTAO} style={CONTORNO} onClick={aoConferencia} data-testid="painel-casar">Conferência lado a lado</button>
        <button type="button" className={BOTAO_PRI} style={{ background: AZUL_ATIVO }} onClick={aoAbrirPalco} disabled={!linha?.tem_extrato}
          data-testid="painel-casar-exatos">Casar os exatos (prévia)</button>
      </>}>
      {!linha?.tem_extrato ? <p>Primeiro o extrato do mês.</p>
        : loading && movimentos.length === 0 ? <p className="text-muted-foreground">Lendo o extrato do mês…</p>
        : linhas.length === 0 ? <p data-testid="painel-casar-vazio">Nada sem par: cada linha do extrato tem o seu lançamento.</p>
        : (
          <div className="px-2 pb-2">
            <table className="w-full table-fixed border-collapse tabular-nums" data-testid="painel-casar-linhas">
              <colgroup><col style={{ width: 70 }} /><col style={{ width: 160 }} /><col style={{ width: 92 }} /><col /><col style={{ width: 62 }} /></colgroup>
              <thead className="sticky top-0 z-[1]"><tr className="text-white" style={{ background: FUNDO_ESCURO }}>
                <th className={TH}>Data</th><th className={TH}>Extrato</th><th className={cn(TH, 'text-right')}>Valor</th><th className={TH}>Sugestão do sistema</th><th className={TH} />
              </tr></thead>
              <tbody>{linhas.map((l) => (
                <tr key={l.id} className={cn('border-t border-border', estacao?.id === l.id && 'bg-[#eef4ff]')} data-testid="painel-casar-linha" data-tom={l.tom}>
                  <td className={TD}>{ddmmaaaa(l.data)}</td>
                  <td className={TD} title={l.descricao}>{l.descricao}</td>
                  <td className={cn(TD, 'text-right', l.valor < 0 ? 'text-[#c0392b]' : 'text-[#1e8449]')}>{moeda(l.valor)}</td>
                  <td className={cn(TD, COR_DO_TOM[l.tom])} title={`${MARCA_DO_TOM[l.tom]}${l.titulo}`} data-testid="painel-casar-sugestao">{MARCA_DO_TOM[l.tom]}{l.sugestao}</td>
                  <td className={TD}><button type="button" className="text-[10px] text-[#1f5fbf] hover:underline" data-testid="painel-casar-acao"
                    title={l.acao === 'casar' ? 'abre a estação com a sugestão (a prévia antes de gravar)' : 'procurar no histórico ou criar o lançamento (na estação)'}
                    onClick={() => setEstacao(semPar.find((m) => m.id === l.id) ?? null)}>{l.acao}</button></td>
                </tr>
              ))}</tbody>
            </table>
            {soSistema > 0 && <p className="mt-1.5 text-[10px] text-[#6b7a8f]">E {soSistema} {soSistema === 1 ? 'lançamento do sistema está' : 'lançamentos do sistema estão'} sem extrato: a "Conferência lado a lado" mostra os dois lados.</p>}
          </div>
        )}
      {estacao && <EstacaoConciliar movimento={estacao} contaBancariaId={contaId} aoFechar={() => setEstacao(null)}
        aoMudar={async () => { await recarregar(); }} />}
    </Trabalho>
  );
}

function CaixasDoSaldo({ saldos, entradas, saidas }: { saldos: Saldos; entradas?: number; saidas?: number }) {
  const caixas: [string, number | null][] = entradas !== undefined
    ? [['Entradas', entradas], ['Saídas', -Math.abs(saidas ?? 0)], ['Sistema', saldos.saldo_sistema]]
    : [['Banco', saldos.saldo_extrato], ['Sistema', saldos.saldo_sistema], ['Diferença', saldos.diferenca]];
  return (
    <div className="grid grid-cols-3 gap-2 tabular-nums">
      {caixas.map(([r, v]) => (
        <div key={r} className="min-w-0 rounded border border-border px-2 py-1">
          <div className="text-[9.5px] text-muted-foreground">{r}</div>
          <div className={cn('whitespace-nowrap text-[12px] font-semibold', r === 'Diferença' && v != null && Math.abs(v) >= 0.005 && 'text-destructive')}
            data-testid={`painel-saldo-${r}`}>{moeda(v)}</div>
        </div>
      ))}
    </div>
  );
}

/** "Explicar a diferença" (Gabriel 23/11): 1º o lançamento que JÁ EXISTE com o valor exato (com ou sem conta) — "Casar" abre o modal do
 *  lançamento com a conta, o realizado e a data do saldo, e quem grava é o Salvar dele; ou deixar o mês pendente com observação. */
function ExplicarDiferenca({ clienteId, contaId, anoMes, saldos, dataDoSaldo, titulo, botoes }: {
  clienteId: string | null; contaId: string; anoMes: string; saldos: Saldos; dataDoSaldo: string | null; titulo: string; botoes: ReactNode;
}) {
  const dif = saldos.diferenca;
  const aberta = saldos.saldo_extrato != null && dif != null && Math.abs(dif) >= 0.005;
  const [candidatos, setCandidatos] = useState<LancamentoCandidato[] | null>(null);
  const [casando, setCasando] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [frase, setFrase] = useState<{ erro: boolean; texto: string } | null>(null);
  useEffect(() => {
    if (!clienteId || !aberta || dif == null) { setCandidatos([]); return; }
    let vivo = true;
    setCandidatos(null);
    void lerLancamentosDeValor(clienteId, dif).then((l) => { if (vivo) setCandidatos(l ? candidatosDaDiferenca(l, { diferenca: dif, contaId, anoMes }) : []); });
    void lerObservacaoDoMes(clienteId, contaId, anoMes).then((o) => { if (vivo) setObs(o ?? ''); });
    return () => { vivo = false; };
  }, [clienteId, contaId, anoMes, aberta, dif]);

  return (
    <Trabalho testid="painel-trabalho-diferenca" titulo={titulo} sub="o sistema explica, você decide" botoes={botoes}>
      {saldos.saldo_extrato == null ? <p>Primeiro o saldo do banco do mês (o PDF do banco e o "✎ Informar o saldo").</p>
        : !aberta ? <p data-testid="painel-diferenca-zero">Saldo do sistema = saldo do banco. Nada a explicar.</p>
        : (
          <>
            <p className="mb-2">Saldo do sistema <b className="tabular-nums">{moeda(saldos.saldo_sistema)}</b> × saldo do banco <b className="tabular-nums">{moeda(saldos.saldo_extrato)}</b> = <b className="tabular-nums text-[#c0392b]">{moeda(dif)}</b>.</p>
            <div className="mb-3 rounded-md border border-[#e3e8ef]" data-testid="painel-candidatos">
              <div className="border-b border-[#eef1f5] bg-[#f6f8fb] px-2.5 py-1 text-[11px] font-semibold">Lançamento que já existe com o valor exato</div>
              {candidatos === null ? <p className="px-2.5 py-1.5 text-muted-foreground">Procurando…</p>
                : candidatos.length === 0 ? <p className="px-2.5 py-1.5 text-muted-foreground" data-testid="painel-sem-candidato">Nenhum lançamento de {moeda(Math.abs(dif ?? 0))} sem conta ou nesta conta.</p>
                : (
                  <table className="w-full table-fixed border-collapse tabular-nums">
                    <colgroup><col style={{ width: 70 }} /><col /><col style={{ width: 82 }} /><col style={{ width: 76 }} /><col style={{ width: 52 }} /></colgroup>
                    <thead><tr className="text-white" style={{ background: FUNDO_ESCURO }}>
                      <th className={TH}>Data</th><th className={TH}>Descrição</th><th className={TH}>Situação</th><th className={cn(TH, 'text-right')}>Valor</th><th className={TH} />
                    </tr></thead>
                    <tbody>{candidatos.map((c) => (
                      <tr key={c.id} className="border-t border-border" data-testid="painel-candidato">
                        <td className={TD}>{ddmmaaaa(c.data_pagamento ?? c.data_vencimento)}</td>
                        <td className={TD} title={c.descricao ?? '—'}>{c.descricao ?? '—'}</td>
                        <td className={TD} title={c.conta_bancaria_id ? c.status_transacao ?? '' : `${c.status_transacao ?? ''} · sem conta`}>
                          {c.conta_bancaria_id ? c.status_transacao : 'sem conta'}</td>
                        <td className={cn(TD, 'text-right')}>{moeda(c.valor)}</td>
                        <td className={TD}><button type="button" className="text-[#1f5fbf] hover:underline" onClick={() => setCasando(c.id)}
                          data-testid="painel-candidato-casar">Casar</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
            </div>
            <div className="rounded-md border border-[#e3e8ef] p-2.5">
              <div className="mb-1 text-[11px] font-semibold">Ou deixar o mês pendente, com observação</div>
              <textarea className="h-[44px] w-full resize-none rounded border border-border px-1.5 py-1 text-[11px]" value={obs} maxLength={500}
                onChange={(e) => setObs(e.target.value)} placeholder="ex.: rendimento negativo do mês, conferir o PDF do banco" data-testid="painel-obs" />
              <div className="mt-1 flex h-[24px] items-center gap-2">
                <span className={cn('min-w-0 flex-1 text-[10px]', frase?.erro ? 'text-destructive' : 'text-[#6b7a8f]')} data-testid="painel-obs-frase">{frase?.texto ?? ''}</span>
                <button type="button" className={BOTAO} style={CONTORNO} disabled={!clienteId}
                  onClick={() => { if (clienteId) void gravarObservacaoDoMes({ clienteId, contaId, anoMes, texto: obs }).then((e) => setFrase(e ? { erro: true, texto: e } : { erro: false, texto: 'Observação gravada.' })); }}
                  data-testid="painel-obs-gravar">Gravar observação</button>
              </div>
            </div>
          </>
        )}
      {casando && clienteId && <CasarComLancamento id={casando} clienteId={clienteId} contaId={contaId} data={dataDoSaldo ?? fimDoMes(anoMes)}
        aoFechar={() => setCasando(null)} />}
    </Trabalho>
  );
}

/** O lançamento escolhido no modal de sempre, JÁ com a conta desta linha, realizado e a data do saldo: a prévia é o próprio modal; nada
 *  grava antes do Salvar dele (`fin.editarLancamento`). Montado só quando escolhido (os catálogos não carregam à toa). */
function CasarComLancamento({ id, clienteId, contaId, data, aoFechar }: { id: string; clienteId: string; contaId: string; data: string; aoFechar: () => void }) {
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const [editando, setEditando] = useState<LancamentoV2 | null>(null);
  useEffect(() => {
    void fin.loadContas(); void fin.loadClassificacoes(); void fin.loadFornecedores(); void fin.loadSafras();
  }, [fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);
  useEffect(() => {
    let vivo = true;
    void fin.buscarLancamentoPorId(id).then((l) => {
      if (vivo && l) setEditando({ ...l, conta_bancaria_id: contaId, status_transacao: 'realizado', data_pagamento: l.data_pagamento ?? data });
    });
    return () => { vivo = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const prontos = fin.contasBancarias.length > 0 && fin.classificacoes.length > 0;
  return (
    <LancamentoV2Dialog open={!!editando} carregando={!prontos} lancamento={editando} fazendas={fazendas} contas={fin.contasBancarias}
      classificacoes={fin.classificacoes} fornecedores={fin.fornecedores} safras={fin.safras} onCriarFornecedor={fin.criarFornecedor}
      onClose={aoFechar}
      onSave={async (form, lid) => {
        const ok = lid ? await fin.editarLancamento(lid, form) : false;
        if (ok) { notificarLancamentosMudaram(clienteId); aoFechar(); }
        return ok;
      }} />
  );
}

/** "Ver" DENTRO do painel: o PDF no visualizador embutido, a foto, ou os movimentos que a importação trouxe. */
function VerArquivo({ a, clienteId, aoVoltar, aoDesfazer }: { a: ArquivoDoMes; clienteId: string; aoVoltar: () => void; aoDesfazer: () => void }) {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [movs, setMovs] = useState<MovimentoDoArquivo[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (a.origem === 'importacao') void lerMovimentosDaImportacao(clienteId, a.id).then((m) => { if (vivo) { if (m) setMovs(m); else setFalhou(true); } });
    else if (a.caminho && a.formato === 'PDF') void bytesDoComprovante(a.caminho).then((b) => { if (vivo) { if (b) setBytes(b); else setFalhou(true); } });
    else if (a.caminho) void urlAssinadaSaldoDocumento(a.caminho).then((u) => { if (vivo) { if (u) setUrl(u); else setFalhou(true); } });
    return () => { vivo = false; };
  }, [a, clienteId]);
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[#e3e8ef] px-4">
        <table className="w-[440px] table-fixed"><tbody><tr>
          <td className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold" title={`${a.nome} — ${a.detalhe}`} data-testid="painel-ver-nome">{a.nome}</td>
        </tr></tbody></table>
        <button type="button" className="whitespace-nowrap text-[11px] text-[#1f5fbf] hover:underline" onClick={aoVoltar} data-testid="painel-ver-voltar">← voltar à lista</button>
      </div>
      <div className="min-h-0 overflow-hidden" data-testid="painel-ver" data-origem={a.origem}>
        {falhou ? <p className="p-4 text-[11px] text-muted-foreground">Não consegui abrir o arquivo aqui.</p>
          : a.origem === 'importacao'
            ? (movs === null ? <p className="p-4 text-[11px] text-muted-foreground">Lendo…</p> : (
              <div className="h-full overflow-y-auto px-4 py-2">
                <p className="mb-1.5 text-[10px] text-[#6b7a8f]" data-testid="painel-ver-original">Os {movs.length} movimentos que este arquivo trouxe. {a.caminho ? 'O original está guardado: "Baixar" abaixo.' : 'O arquivo original não foi guardado.'}</p>
                <table className="w-full table-fixed border-collapse tabular-nums" data-testid="painel-ver-movimentos">
                  <colgroup><col style={{ width: 76 }} /><col /><col style={{ width: 104 }} /></colgroup>
                  <thead className="sticky top-0"><tr className="text-white" style={{ background: FUNDO_ESCURO }}>
                    <th className={TH}>Data</th><th className={TH}>Histórico</th><th className={cn(TH, 'text-right')}>Valor</th></tr></thead>
                  <tbody>{movs.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className={TD}>{ddmmaaaa(m.data)}</td><td className={TD} title={m.descricao}>{m.descricao}</td>
                      <td className={cn(TD, 'text-right', m.valor < 0 && 'text-[#c0392b]')}>{moeda(m.valor)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))
            : a.formato === 'PDF'
              ? (bytes ? <VisualizadorDeDocumento embutido open bytes={bytes} nome={a.nome} onFechar={aoVoltar} onNovaAba={() => {}} />
                : <p className="p-4 text-[11px] text-muted-foreground">Lendo…</p>)
              : (url ? <div className="flex h-full items-center justify-center overflow-auto bg-[#e9ecf0] p-3"><img src={url} alt={a.nome} className="max-h-full max-w-full" /></div>
                : <p className="p-4 text-[11px] text-muted-foreground">Lendo…</p>)}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[#e3e8ef] px-4">
        {a.podeBaixar && <button type="button" className={BOTAO} style={CONTORNO}
          onClick={() => { if (a.caminho) void baixarComprovante(a.caminho, a.nome); }} data-testid="painel-ver-baixar">Baixar</button>}
        <button type="button" className={BOTAO} style={{ borderColor: '#c0392b', color: '#c0392b' }} onClick={aoDesfazer} data-testid="painel-ver-desfazer">Desfazer arquivo</button>
      </div>
    </>
  );
}

/** Desfazer o COMPROVANTE: ele se cancela (com motivo, a trilha), nunca some (AUDIT-DELETE-01a). */
function DesfazerComprovante({ a, clienteId, aoVoltar, aoDesfeito }: { a: ArquivoDoMes; clienteId: string; aoVoltar: () => void; aoDesfeito: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const curto = motivo.trim().length < 3;
  return (
    <Trabalho testid="painel-desfazer-comprovante" titulo="Desfazer o arquivo" sub="o comprovante sai do mês; não é apagado"
      extra={<button type="button" className="whitespace-nowrap text-[11px] text-[#1f5fbf] hover:underline" onClick={aoVoltar}>voltar</button>}
      botoes={<button type="button" className={BOTAO_PRI} style={{ background: '#c0392b' }} disabled={curto || gravando}
        title={curto ? 'Escreva o motivo' : undefined} data-testid="painel-desfazer-confirmar"
        onClick={() => { setGravando(true); void cancelarSaldoDocumento({ documentoId: a.id, clienteId, motivo: motivo.trim() }).then((r) => {
          setGravando(false); if (r.ok) aoDesfeito(); else setErro(r.erro ?? 'Não consegui desfazer.'); }); }}>
        {gravando ? 'Desfazendo…' : 'Desfazer arquivo'}</button>}>
      <table className="mb-2 w-full table-fixed"><tbody><tr><td className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold" title={a.nome}>{a.nome}</td></tr></tbody></table>
      <label className="mb-1 block text-[10px] text-muted-foreground" htmlFor="painel-motivo">Motivo (fica na trilha)</label>
      <input id="painel-motivo" className="h-[26px] w-full rounded border border-border px-1.5 text-[11px]" value={motivo} onChange={(e) => setMotivo(e.target.value)}
        maxLength={200} data-testid="painel-desfazer-motivo" />
      <p className="mt-1 h-[14px] text-[10px] text-destructive" role={erro ? 'alert' : undefined}>{erro ?? ''}</p>
    </Trabalho>
  );
}

/** O que se arrastou: PDF/foto = comprovante do saldo deste mês (prévia: o que, onde; nada grava antes do "Anexar"); OFX/CSV/planilha =
 *  extrato — a prévia da importação é a do Importar banco desta conta, com o arquivo já escolhido. */
function ArquivoSolto({ arquivo, clienteId, contaId, anoMes, aoVoltar, aoAnexado, aoImportar, aoLerFatura }: {
  arquivo: File; clienteId: string; contaId: string; anoMes: string; aoVoltar: () => void; aoAnexado: () => void; aoImportar: (f: File) => void;
  /** CARTAO-FATURA-IMPORT-01: só no painel do cartão — o PDF pode ser LIDO como fatura (a prévia das compras) */
  aoLerFatura?: (f: File) => void;
}) {
  const formato = formatoDoArquivo(arquivo.name, arquivo.type);
  const documento = formato === 'PDF' || formato === 'IMG';
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const mesTxt = `${anoMes.slice(5)}/${anoMes.slice(0, 4)}`;
  return (
    <Trabalho testid="painel-soltou" titulo={documento ? 'Anexar o comprovante' : 'Importar o extrato'} sub={`${formato} · ${Math.max(1, Math.round(arquivo.size / 1024))} KB`}
      extra={<button type="button" className="whitespace-nowrap text-[11px] text-[#1f5fbf] hover:underline" onClick={aoVoltar}>cancelar</button>}
      botoes={documento
        ? <>{aoLerFatura && formato === 'PDF' && <button type="button" className={BOTAO} style={CONTORNO} onClick={() => aoLerFatura(arquivo)}
              data-testid="painel-soltou-ler-fatura">Ler a fatura</button>}
          <button type="button" className={BOTAO_PRI} style={{ background: AZUL_ATIVO }} disabled={gravando} data-testid="painel-soltou-anexar"
            onClick={() => { setGravando(true); void anexarSaldoDocumento({ clienteId, contaId, anoMes, file: arquivo }).then((r) => {
              setGravando(false); if (r.ok) aoAnexado(); else setErro(r.erro ?? 'Não consegui anexar.'); }); }}>{gravando ? 'Anexando…' : 'Anexar'}</button></>
        : <button type="button" className={BOTAO_PRI} style={{ background: AZUL_ATIVO }} onClick={() => aoImportar(arquivo)} data-testid="painel-soltou-importar">Abrir a prévia</button>}>
      <table className="mb-2 w-full table-fixed"><tbody><tr><td className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold" title={arquivo.name}>{arquivo.name}</td></tr></tbody></table>
      <p>{documento
        ? `Vai como comprovante do saldo de ${mesTxt} desta conta (o PDF do banco, da seguradora ou a fatura). Nada é gravado antes do "Anexar".`
        : 'É um extrato: a prévia abre no Importar banco desta conta, com o arquivo já escolhido. Nada é gravado antes do "Importar".'}</p>
      <p className="mt-1 h-[14px] text-[10px] text-destructive" role={erro ? 'alert' : undefined}>{erro ?? ''}</p>
    </Trabalho>
  );
}
