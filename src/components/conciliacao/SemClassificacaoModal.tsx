/**
 * "SEM CLASSIFICAÇÃO" — o modal de classificar na linha (CONC-SEM-CLASSIFICACAO-01, Gabriel 06/10/2026).
 *
 * ⚠ A TELA NÃO CONTA, NÃO SOMA E NÃO DECIDE: a lista, os valores, "com sugestão" e "sem sugestão" vêm de
 *   `fn_conciliacao_sem_classificacao_lista` (`useListaSemClassificacao`). A única contagem local é "classificados nesta
 *   sessão" — é estado da tela (o que ESTE modal gravou desde que abriu), não dado do banco.
 * ⚠ GRAVAR É PELO ESCRITOR DO MODAL DO LANÇAMENTO — `fin.editarLancamento`, com o form que nasce da linha inteira do banco
 *   (`formParaClassificar`). Nenhum UPDATE próprio: o gatilho de classificação e as cópias em texto são os de sempre.
 * ⚠ TODO GESTO TEM O CONTRÁRIO: a linha classificada fica na lista com "desfazer", que regrava o form de ANTES.
 * ⚠ TAMANHO FIXO: o modal tem altura fixa; só a lista rola (um scrollport), com o cabeçalho da tabela preso NELA; os
 *   cartões, os filtros e o rodapé de totais ficam fora da rolagem. Erro e motivo ficam escritos ao lado do botão — sem toast.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  useFinanceiroV2, notificarLancamentosMudaram, type ClassificacaoItem, type FornecedorV2, type LancamentoV2,
} from '@/hooks/useFinanceiroV2';
import { useListaSemClassificacao } from '@/hooks/useSemClassificacao';
import { COR_SINAL } from '@/lib/oc/contaCorrente';
import {
  FRASE_NADA_GRAVADO, MOTIVO_AGUARDA_CONTA, ORDEM_PADRAO, contasDoPlano, ehEntrada, filtrarLinhas, formDoLancamento,
  formParaClassificar, historicoDaLinha, motivoNaoGrava, ordenarLinhas, origemDaSugestao, proximaOrdem,
  type ColunaSemClassificacao, type FiltroSemClassificacao, type LinhaSemClassificacao, type OrdemSemClassificacao,
} from '@/lib/conciliacao/semClassificacao';

const NUM = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATA = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesPorExtenso = (anoMes: string) => `${MESES[Number(anoMes.slice(5, 7)) - 1] ?? anoMes.slice(5, 7)}/${anoMes.slice(0, 4)}`;

/** A régua da tabela, em px (o Histórico fica com o resto). Cabeçalho, linhas e rodapé usam a MESMA. */
export const REGUA_SEM_CLASSIFICACAO = { data: 58, valor: 112, falta: 46, fornecedor: 214, subcentro: 236, acao: 92 } as const;
const GATILHO = 'h-[17px] px-1 text-[10px] rounded-[3px]';

/** Valor com sinal e cor: ▲ verde na entrada, ▼ vermelho na saída. Zero fica apagado, sem seta. */
function Valor({ valor, entrada, forte }: { valor: number; entrada: boolean; forte?: boolean }) {
  if (valor === 0) return <span className="tabular-nums whitespace-nowrap text-muted-foreground">0,00</span>;
  return (
    <span className={`tabular-nums whitespace-nowrap ${forte ? 'font-semibold' : ''} ${entrada ? COR_SINAL.pos : COR_SINAL.neg}`}
          data-sinal={entrada ? 'entrada' : 'saida'}>
      {entrada ? '▲' : '▼'}&nbsp;{NUM(valor)}
    </span>
  );
}

function Cartao({ rotulo, testId, children }: { rotulo: string; testId: string; children: ReactNode }) {
  return (
    <td className="border border-border bg-card px-2 py-[3px] align-top" data-testid={testId}>
      <div className="text-[9.5px] leading-[12px] text-muted-foreground whitespace-nowrap">{rotulo}</div>
      <div className="text-[12px] leading-[16px] font-medium whitespace-nowrap">{children}</div>
    </td>
  );
}

/** O que este modal gravou desde que abriu: a linha, o lançamento de ANTES (o form do desfazer) e o que ficou. */
interface Classificada { linha: LinhaSemClassificacao; antes: LancamentoV2; subcentro: string; fornecedorNome: string | null }
interface Escolha { subcentro: string; favorecidoId: string }

export interface SemClassificacaoModalProps {
  aberto: boolean;
  aoFechar: () => void;
  clienteId: string;
  clienteNome: string;
  anoMes: string;
  /** `null` = todas as contas. */
  contaId: string | null;
  contaNome: string;
}

export function SemClassificacaoModal({ aberto, aoFechar, clienteId, clienteNome, anoMes, contaId, contaNome }: SemClassificacaoModalProps) {
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const listaQ = useListaSemClassificacao(clienteId, anoMes, contaId, aberto);

  /* ⚠ OS CATÁLOGOS NÃO SE CARREGAM SOZINHOS (a lição do Espelho): sem eles o seletor abre vazio. */
  useEffect(() => {
    if (!aberto) return;
    void fin.loadContas(); void fin.loadClassificacoes(); void fin.loadFornecedores(); void fin.loadSafras();
  }, [aberto, fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);
  const catalogosProntos = fin.contasBancarias.length > 0 && fin.fornecedores.length > 0 && fin.safras.length > 0 && fin.classificacoes.length > 0;
  const planos = useMemo(() => contasDoPlano(fin.classificacoes), [fin.classificacoes]);
  /* ⚠ PARA CLASSIFICAR NA LINHA BASTA O PLANO: cliente sem fornecedor ou sem safra cadastrados (o Teste) tem catálogo VAZIO de
     verdade, e esperar os quatro "prontos" deixaria os seletores apagados para sempre (medido no navegador). Os quatro só
     são exigidos pelo modal do lançamento, como no Espelho. */
  const planoPronto = planos.length > 0;

  const [filtro, setFiltro] = useState<FiltroSemClassificacao>('todos');
  const [ordem, setOrdem] = useState<OrdemSemClassificacao>(ORDEM_PADRAO);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [sessao, setSessao] = useState<Record<string, Classificada>>({});
  const [gravando, setGravando] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [editando, setEditando] = useState<LancamentoV2 | null>(null);

  /* A sessão é do modal ABERTO: fechar e abrir de novo começa limpo (a conta, o mês e o cliente podem ter mudado). */
  useEffect(() => {
    if (aberto) return;
    setFiltro('todos'); setOrdem(ORDEM_PADRAO); setEscolhas({}); setSessao({}); setErros({}); setErroGeral(null); setEditando(null);
  }, [aberto]);

  const resumo = listaQ.data?.resumo ?? null;
  const pendentes = useMemo(() => (listaQ.data?.linhas ?? []).filter((l) => !(l.id in sessao)), [listaQ.data, sessao]);
  const classificadas = useMemo(() => Object.values(sessao), [sessao]);
  const visiveis = useMemo(
    () => ordenarLinhas(filtrarLinhas([...pendentes, ...classificadas.map((c) => c.linha)], filtro), ordem),
    [pendentes, classificadas, filtro, ordem],
  );

  const escolhaDe = (l: LinhaSemClassificacao): Escolha =>
    escolhas[l.id] ?? { subcentro: l.sugestao?.subcentro ?? '', favorecidoId: l.favorecidoId ?? '' };
  const contaDe = (l: LinhaSemClassificacao): ClassificacaoItem | null => {
    const e = escolhaDe(l);
    if (!e.subcentro) return null;
    /* a sugestão aponta a conta pela CHAVE; a escolha do operador, pelo item que o seletor entregou (mesmo nome e tipo) */
    return planos.find((c) => c.subcentro === e.subcentro && (l.sugestao?.subcentro === e.subcentro ? c.id === l.sugestao.planoContaId : c.tipo_operacao === l.tipoOperacao))
      ?? planos.find((c) => c.subcentro === e.subcentro) ?? null;
  };
  const motivoDe = (l: LinhaSemClassificacao): string | null =>
    motivoNaoGrava({ conta: contaDe(l), favorecidoId: escolhaDe(l).favorecidoId || null }, l.tipoOperacao);

  const marcarErro = (id: string, msg: string | null) => setErros((e) => {
    const { [id]: _fora, ...resto } = e;
    return msg ? { ...resto, [id]: msg } : resto;
  });

  /** Grava UMA linha pelo escritor do modal do lançamento. Devolve a mensagem de erro, ou nulo quando gravou. */
  const gravarLinha = async (l: LinhaSemClassificacao): Promise<string | null> => {
    const conta = contaDe(l);
    const e = escolhaDe(l);
    const motivo = motivoNaoGrava({ conta, favorecidoId: e.favorecidoId || null }, l.tipoOperacao);
    if (motivo) return motivo;
    const antes = await fin.buscarLancamentoPorId(l.id);
    if (!antes) return 'não foi possível ler o lançamento';
    const form = formParaClassificar(antes, { conta, favorecidoId: e.favorecidoId || null });
    if (!form || !conta) return 'escolha o subcentro';
    let msg: string | null = null;
    const ok = await fin.editarLancamento(l.id, form, { silent: true, onErro: (m) => { msg = m; } });
    if (!ok) return msg ?? 'o lançamento não foi gravado';
    const fornecedorNome = fin.fornecedores.find((f) => f.id === (form.favorecido_id ?? ''))?.nome ?? l.favorecidoNome;
    setSessao((s) => ({ ...s, [l.id]: { linha: l, antes, subcentro: conta.subcentro, fornecedorNome } }));
    return null;
  };

  const aceitar = async (l: LinhaSemClassificacao) => {
    setGravando(l.id); marcarErro(l.id, null); setErroGeral(null);
    const erro = await gravarLinha(l);
    marcarErro(l.id, erro);
    if (erro) setErroGeral(`${DATA(l.data)} · ${NUM(l.valor)}: ${erro}`);
    setGravando(null);
    if (!erro) notificarLancamentosMudaram(clienteId);
  };

  const desfazer = async (c: Classificada) => {
    const id = c.linha.id;
    setGravando(id); marcarErro(id, null); setErroGeral(null);
    let msg: string | null = null;
    const ok = await fin.editarLancamento(id, formDoLancamento(c.antes), { silent: true, onErro: (m) => { msg = m; } });
    if (ok) setSessao((s) => { const { [id]: _fora, ...resto } = s; return resto; });
    else { marcarErro(id, msg ?? 'não foi possível desfazer'); setErroGeral(`${DATA(c.linha.data)} · ${NUM(c.linha.valor)}: ${msg ?? 'não foi possível desfazer'}`); }
    setGravando(null);
    if (ok) notificarLancamentosMudaram(clienteId);
  };

  /* "Aceitar as N sugestões": as pendentes cuja escolha AINDA É a sugestão do banco. Para na primeira recusa. */
  const comSugestaoIntacta = pendentes.filter((l) => l.sugestao !== null && escolhaDe(l).subcentro === l.sugestao.subcentro);
  const aceitarTodas = async () => {
    setGravando('todas'); setErroGeral(null);
    let gravou = false;
    for (const l of comSugestaoIntacta) {
      const erro = await gravarLinha(l);
      if (erro) { marcarErro(l.id, erro); setErroGeral(`parou em ${DATA(l.data)} · ${NUM(l.valor)}: ${erro}`); break; }
      gravou = true;
    }
    setGravando(null);
    if (gravou) notificarLancamentosMudaram(clienteId);
  };

  const abrirLancamento = (id: string) => {
    void (async () => { const linha = await fin.buscarLancamentoPorId(id); if (linha) setEditando(linha); })();
  };

  const nClassificados = classificadas.length;
  const motivoAceitarTodas = !planoPronto ? 'carregando o plano de contas…'
    : comSugestaoIntacta.length === 0 ? 'nenhuma sugestão para aceitar' : null;

  const Th = ({ coluna, children, alinhar = 'left' }: { coluna: ColunaSemClassificacao; children: ReactNode; alinhar?: 'left' | 'right' | 'center' }) => (
    <th className="sticky top-0 z-[2] h-[18px] bg-primary px-1.5 py-0 text-[9.5px] font-medium text-primary-foreground"
        style={{ textAlign: alinhar }} aria-sort={ordem.coluna === coluna ? (ordem.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer hover:underline"
              onClick={() => setOrdem((o) => proximaOrdem(o, coluna))} data-testid={`ordenar-${coluna}`}>
        {children}
        {ordem.coluna === coluna && (ordem.sentido === 'asc' ? <ArrowUp className="h-2.5 w-2.5" aria-hidden /> : <ArrowDown className="h-2.5 w-2.5" aria-hidden />)}
      </button>
    </th>
  );

  const Colunas = () => (
    <colgroup>
      <col style={{ width: REGUA_SEM_CLASSIFICACAO.data }} />
      <col />
      <col style={{ width: REGUA_SEM_CLASSIFICACAO.valor }} />
      <col style={{ width: REGUA_SEM_CLASSIFICACAO.falta }} />
      <col style={{ width: REGUA_SEM_CLASSIFICACAO.fornecedor }} />
      <col style={{ width: REGUA_SEM_CLASSIFICACAO.subcentro }} />
      <col style={{ width: REGUA_SEM_CLASSIFICACAO.acao }} />
    </colgroup>
  );

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
        <DialogContent className="flex h-[calc(100vh-32px)] max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[1090px] flex-col gap-0 overflow-hidden p-0"
                       data-testid="modal-sem-classificacao">
          <div className="flex h-9 shrink-0 items-center bg-primary px-4 pr-10">
            <DialogTitle className="truncate text-[13px] font-semibold leading-none text-primary-foreground"
                         title={`Sem classificação · ${clienteNome} · ${contaNome} · ${mesPorExtenso(anoMes)}`}>
              Sem classificação · {clienteNome} · {contaNome} · {mesPorExtenso(anoMes)}
            </DialogTitle>
            <DialogDescription className="sr-only">Lançamentos realizados sem plano de contas, para classificar na linha.</DialogDescription>
          </div>

          {/* cartões (lidos do dono) e filtros — fora da rolagem */}
          <div className="shrink-0 px-3 pt-2">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }} data-testid="cartoes-sem-classificacao">
              <tbody>
                <tr>
                  <Cartao rotulo="Sem classificação" testId="cartao-sem-classificacao">
                    {resumo ? (
                      <span className="inline-flex items-baseline gap-2">
                        <span className="tabular-nums text-destructive" data-testid="cartao-qtde">{resumo.qtde}</span>
                        <span className="text-[10px]"><Valor valor={resumo.valorEntradas} entrada /></span>
                        <span className="text-[10px]"><Valor valor={resumo.valorSaidas} entrada={false} /></span>
                      </span>
                    ) : '…'}
                  </Cartao>
                  <Cartao rotulo="Com sugestão" testId="cartao-com-sugestao"><span className="tabular-nums">{resumo ? resumo.comSugestao : '…'}</span></Cartao>
                  <Cartao rotulo="Sem sugestão" testId="cartao-sem-sugestao"><span className="tabular-nums">{resumo ? resumo.semSugestao : '…'}</span></Cartao>
                  <Cartao rotulo="Classificados nesta sessão" testId="cartao-sessao"><span className="tabular-nums text-success">{nClassificados}</span></Cartao>
                </tr>
              </tbody>
            </table>
            <div className="flex h-[26px] items-center gap-2">
              <Segmentado<FiltroSemClassificacao> altura={22} valor={filtro} onEscolher={setFiltro}
                opcoes={[{ valor: 'todos', rotulo: 'Todos' }, { valor: 'com_sugestao', rotulo: 'Com sugestão' }, { valor: 'sem_sugestao', rotulo: 'Sem sugestão' }]} />
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title="clique na linha para abrir o lançamento inteiro">
                clique na linha para abrir o lançamento inteiro
              </span>
            </div>
          </div>

          {/* A LISTA — o único scrollport; o cabeçalho da tabela gruda NELA */}
          <div className="mx-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden border border-border" data-testid="lista-sem-classificacao">
            <table className="w-full border-collapse text-[10px]" style={{ tableLayout: 'fixed' }}>
              <Colunas />
              <thead>
                <tr>
                  <Th coluna="data">Data</Th>
                  <Th coluna="historico">Histórico do banco</Th>
                  <Th coluna="valor" alinhar="right">Valor (R$)</Th>
                  <Th coluna="falta" alinhar="center">Falta</Th>
                  <Th coluna="fornecedor">Fornecedor</Th>
                  <Th coluna="subcentro">Subcentro</Th>
                  <th className="sticky top-0 z-[2] h-[18px] bg-primary px-1.5 py-0 text-center text-[9.5px] font-medium text-primary-foreground">Ação</th>
                </tr>
              </thead>
              <tbody>
                {listaQ.isLoading && <tr><td colSpan={7} className="h-[19px] px-2 text-muted-foreground">lendo…</td></tr>}
                {listaQ.isError && (
                  <tr><td colSpan={7} className="h-[19px] px-2 text-destructive" data-testid="erro-lista">
                    Não foi possível ler a lista: {listaQ.error instanceof Error ? listaQ.error.message : 'erro desconhecido'}
                  </td></tr>
                )}
                {!listaQ.isLoading && !listaQ.isError && visiveis.length === 0 && (
                  <tr><td colSpan={7} className="h-[19px] px-2 text-muted-foreground" data-testid="lista-vazia">
                    {filtro === 'todos' ? 'Nenhum lançamento sem classificação neste mês.' : 'Nenhum lançamento neste filtro.'}
                  </td></tr>
                )}
                {visiveis.map((l) => {
                  const feita = sessao[l.id];
                  return feita
                    ? <LinhaClassificada key={l.id} c={feita} ocupado={gravando !== null} erro={erros[l.id] ?? null}
                        aoDesfazer={() => { void desfazer(feita); }} aoAbrir={() => abrirLancamento(l.id)} />
                    : <LinhaPendente key={l.id} l={l} escolha={escolhaDe(l)} planos={planos} fornecedores={fin.fornecedores}
                        pronto={planoPronto} ocupado={gravando !== null} motivo={motivoDe(l)} erro={erros[l.id] ?? null}
                        aoEscolher={(e) => { setEscolhas((x) => ({ ...x, [l.id]: e })); marcarErro(l.id, null); }}
                        aoAceitar={() => { void aceitar(l); }} aoAbrir={() => abrirLancamento(l.id)} />;
                })}
              </tbody>
            </table>
          </div>

          {/* rodapé congelado: totais do DONO, a frase e os botões */}
          <div className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-card px-3 text-[10px]" data-testid="rodape-sem-classificacao">
            <span className="whitespace-nowrap font-medium tabular-nums" data-testid="rodape-qtde">{resumo ? resumo.qtde : '…'} sem classificação</span>
            {resumo && <Valor valor={resumo.valorEntradas} entrada forte />}
            {resumo && <Valor valor={resumo.valorSaidas} entrada={false} forte />}
            <span className="whitespace-nowrap tabular-nums text-muted-foreground" data-testid="rodape-andamento">
              {nClassificados} classificados · {resumo ? resumo.qtde : '…'} faltam
            </span>
            <span className={`min-w-0 flex-1 truncate ${erroGeral ? 'text-destructive' : 'text-muted-foreground'}`}
                  title={erroGeral ?? FRASE_NADA_GRAVADO} data-testid="rodape-frase">
              {erroGeral ?? FRASE_NADA_GRAVADO}
            </span>
            {motivoAceitarTodas && <span className="whitespace-nowrap text-muted-foreground" data-testid="aceitar-todas-motivo">{motivoAceitarTodas}</span>}
            <Button variant="outline" size="sm" className="h-[22px] px-[9px] text-[10px]" onClick={aoFechar} data-testid="fechar-sem-classificacao">Fechar</Button>
            <Button size="sm" className="h-[22px] px-[9px] text-[10px]" disabled={motivoAceitarTodas !== null || gravando !== null}
                    title={motivoAceitarTodas ?? undefined} onClick={() => { void aceitarTodas(); }} data-testid="aceitar-todas">
              {gravando === 'todas' ? 'Gravando…' : `Aceitar as ${comSugestaoIntacta.length} sugestões`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* o modal do lançamento que já existe, para editar inteiro (a fiação do Espelho) */}
      <LancamentoV2Dialog
        open={!!editando}
        carregando={!catalogosProntos}
        lancamento={editando}
        fazendas={fazendas}
        contas={fin.contasBancarias}
        classificacoes={fin.classificacoes}
        fornecedores={fin.fornecedores}
        safras={fin.safras}
        onCriarFornecedor={fin.criarFornecedor}
        onClose={() => setEditando(null)}
        onSave={async (form, id) => {
          const ok = id ? await fin.editarLancamento(id, form) : false;
          if (ok) { setEditando(null); notificarLancamentosMudaram(clienteId); }
          return ok;
        }}
      />
    </>
  );
}

/** As três letras do "Falta": acesa (vermelha) a que falta; apagada a que já tem. */
function Falta({ s, f, c }: { s: boolean; f: boolean; c: boolean }) {
  const letra = (acesa: boolean, t: string, nome: string) => (
    <span className={acesa ? 'font-semibold text-destructive' : 'text-muted-foreground/40'} title={`${nome}: ${acesa ? 'falta' : 'tem'}`}
          data-falta={acesa ? 'sim' : 'nao'} data-letra={t}>{t}</span>
  );
  return <span className="inline-flex gap-[3px] tabular-nums">{letra(s, 'S', 'subcentro')}{letra(f, 'F', 'fornecedor')}{letra(c, 'C', 'centro')}</span>;
}

const CEL = 'h-[19px] px-1.5 py-0 align-middle border-b border-border';
const CORTA = 'overflow-hidden text-ellipsis whitespace-nowrap';
const naoAbre = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };

function LinhaPendente({ l, escolha, planos, fornecedores, pronto, ocupado, motivo, erro, aoEscolher, aoAceitar, aoAbrir }: {
  l: LinhaSemClassificacao; escolha: Escolha; planos: ClassificacaoItem[]; fornecedores: FornecedorV2[];
  pronto: boolean; ocupado: boolean; motivo: string | null; erro: string | null;
  aoEscolher: (e: Escolha) => void; aoAceitar: () => void; aoAbrir: () => void;
}) {
  const [buscaFornecedor, setBuscaFornecedor] = useState('');
  const [buscaSubcentro, setBuscaSubcentro] = useState('');
  const historico = historicoDaLinha(l);
  const usaSugestao = l.sugestao !== null && escolha.subcentro === l.sugestao.subcentro;
  const tituloSubcentro = usaSugestao && l.sugestao ? origemDaSugestao(l.sugestao.origem)
    : l.aguardaConta && !escolha.subcentro ? `${MOTIVO_AGUARDA_CONTA} — texto gravado: ${l.subcentroTexto ?? ''}` : undefined;
  return (
    <tr className="cursor-pointer hover:bg-muted/40" onClick={aoAbrir} data-testid="linha-sem-classificacao" data-id={l.id}
        data-aguarda-conta={l.aguardaConta ? 'sim' : undefined}>
      <td className={`${CEL} whitespace-nowrap tabular-nums`}>{DATA(l.data)}</td>
      <td className={`${CEL} ${CORTA}`} title={historico} data-testid="cel-historico">{historico}</td>
      <td className={`${CEL} text-right`} data-testid="cel-valor"><Valor valor={l.valor} entrada={ehEntrada(l.tipoOperacao)} /></td>
      <td className={`${CEL} text-center`}><Falta s f={!escolha.favorecidoId} c={l.falta.centro} /></td>
      <td className={CEL} {...naoAbre} data-testid="cel-fornecedor">
        <FavorecidoSelect value={escolha.favorecidoId} onChange={(id) => aoEscolher({ ...escolha, favorecidoId: id })}
          fornecedores={fornecedores} search={buscaFornecedor} onSearchChange={setBuscaFornecedor}
          size="compact" triggerClassName={GATILHO} placeholder="escolher…" disabled={!pronto || ocupado} />
      </td>
      <td className={CEL} {...naoAbre} title={tituloSubcentro} data-testid="cel-subcentro" data-sugestao={usaSugestao ? 'sim' : undefined}>
        <PlanoSubcentroSelect value={escolha.subcentro} onChange={(s) => aoEscolher({ ...escolha, subcentro: s })}
          classificacoes={planos} tipoOperacao={l.tipoOperacao} search={buscaSubcentro} onSearchChange={setBuscaSubcentro}
          size="compact" triggerClassName={`${GATILHO} ${usaSugestao ? 'border-amber-400 bg-amber-50' : ''}`} disabled={!pronto || ocupado} />
      </td>
      <td className={`${CEL} text-center`} {...naoAbre}>
        <button type="button" disabled={motivo !== null || ocupado || !pronto} onClick={aoAceitar}
                title={erro ?? motivo ?? (usaSugestao ? 'grava a sugestão neste lançamento' : 'grava a escolha neste lançamento')}
                className={`h-[17px] w-full rounded-[3px] border px-1 text-[10px] leading-none ${CORTA} ${
                  erro ? 'border-destructive text-destructive'
                    : motivo !== null ? 'border-border text-muted-foreground cursor-not-allowed'
                      : 'border-primary bg-primary text-primary-foreground cursor-pointer hover:opacity-90'}`}
                data-testid="acao-linha" data-erro={erro ? 'sim' : undefined}>
          {erro ? erro : !escolha.subcentro ? 'escolher' : motivo !== null ? motivo : 'aceitar'}
        </button>
      </td>
    </tr>
  );
}

function LinhaClassificada({ c, ocupado, erro, aoDesfazer, aoAbrir }: {
  c: Classificada; ocupado: boolean; erro: string | null; aoDesfazer: () => void; aoAbrir: () => void;
}) {
  const l = c.linha;
  const historico = historicoDaLinha(l);
  return (
    <tr className="cursor-pointer bg-success/5 hover:bg-success/10" onClick={aoAbrir} data-testid="linha-classificada" data-id={l.id}>
      <td className={`${CEL} whitespace-nowrap tabular-nums`}>{DATA(l.data)}</td>
      <td className={`${CEL} ${CORTA}`} title={historico}>{historico}</td>
      <td className={`${CEL} text-right`}><Valor valor={l.valor} entrada={ehEntrada(l.tipoOperacao)} /></td>
      <td className={`${CEL} text-center`}><Falta s={false} f={!c.fornecedorNome} c={false} /></td>
      <td className={`${CEL} ${CORTA}`} title={c.fornecedorNome ?? 'sem fornecedor'}>{c.fornecedorNome ?? '—'}</td>
      <td className={`${CEL} ${CORTA} text-success`} title={c.subcentro}>✓ {c.subcentro}</td>
      <td className={`${CEL} text-center`} {...naoAbre}>
        <button type="button" disabled={ocupado} onClick={aoDesfazer}
                title={erro ?? 'devolve o lançamento ao que era antes desta classificação'}
                className={`h-[17px] w-full rounded-[3px] border px-1 text-[10px] leading-none ${CORTA} ${erro ? 'border-destructive text-destructive' : 'border-border cursor-pointer hover:bg-muted'}`}
                data-testid="desfazer-linha" data-erro={erro ? 'sim' : undefined}>
          {erro ? erro : 'desfazer'}
        </button>
      </td>
    </tr>
  );
}
