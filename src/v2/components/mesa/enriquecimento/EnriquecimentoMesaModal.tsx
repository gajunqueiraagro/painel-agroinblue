// ============================================================================
// EnriquecimentoMesaModal — a Mesa de Revisão ampla (MESA-ENR-UX-01, envelope 129).
//
// ⚠ A MOLDURA NÃO ROLA. Cabeçalho, bloco de topo, cabeçalho das colunas e rodapé são
// fixos; rolam DUAS coisas e só elas: a lista da esquerda e a tabela de campos da direita
// (A21). A cadeia que sustenta isso é `h-[92vh]` → `flex-col` → `flex-1 min-h-0` no corpo
// → `min-h-0` em cada card → `overflow-y-auto` só nos dois scrollports. Tirar qualquer
// `min-h-0` faz o filho crescer e a moldura voltar a rolar — foi assim nas duas vezes em
// que o `sticky` "existia e não grudava".
//
// ⚠ COMPONENTE BURRO. Recebe os mesmos prop-bags que a aba usa (lista/detalhe/actions) e
// mais o que só a superfície ampla tem: agrupamento, filtros com contagem e "aplicar ao
// grupo". Nada é buscado nem calculado aqui além de agrupar e somar o que já veio.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EnriquecimentoListaProps } from './EnriquecimentoLista';
import type { EnriquecimentoDetalheProps } from './EnriquecimentoDetalhe';
import type { EnriquecimentoActionsProps } from './EnriquecimentoActions';
import { MesaCamposTabela } from './MesaCamposTabela';
import { STATUS_META } from './fmt';
import { grupoDaLinha } from '@/v2/lib/mesa/enriquecimentoView';
import type { EnriqRowVM } from './types';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Como a lista da esquerda é organizada. Desde 133e a Mesa só agrupa por DIA. */
type Agrupamento = 'dia';
/**
 * Os recortes da mesa ampliada. 'todas' quando nenhum chip está ligado.
 *
 * ⚠ O VOCABULÁRIO É O DOS SEIS GRUPOS — 133b-a correção 5. Eram "Divergentes" e "Exatas"
 * (nomes do banco, e ambos significam "Atualizam" para quem opera) e "Sem vínculo", que
 * juntava ambíguo com sem-par. Agora os chips falam a mesma língua do topo do passo 2;
 * "A revisar", "Entradas" e "Saídas" continuam porque são recortes ORTOGONAIS ao grupo.
 */
type FiltroEstado = 'todas' | 'atualizam' | 'decide' | 'agrupam' | 'sem_par' | 'revisar' | 'entradas' | 'saidas';

/** O subcentro que a linha exibe como contexto — o proposto, que é o que se revisa. */
const subcentroDa = (r: EnriqRowVM) => r.edicao.subcentro ?? '— sem subcentro';

/* ⚠ COR E SINAL SAEM DO MESMO LUGAR — 129d item 4. Duas funções para a mesma pergunta
   divergiriam no dia em que alguém trocasse uma delas. `null` (sem lançamento) não pinta
   nem prefixa: a tela não afirma um sentido que não conhece. */
const corDoSinal = (s: 'entrada' | 'saida' | null) =>
  s === 'saida' ? 'text-red-600 dark:text-red-400'
  : s === 'entrada' ? 'text-emerald-600 dark:text-emerald-400'
  : '';
const sinalPrefixo = (s: 'entrada' | 'saida' | null) => (s === 'saida' ? '−' : s === 'entrada' ? '+' : '');
const rotuloSentido = (s: 'entrada' | 'saida' | null) => (s === 'saida' ? 'Saída' : s === 'entrada' ? 'Entrada' : '—');

/**
 * ⚠ O RECORTE SAI DO ESTADO QUE O ADAPTER JÁ CALCULOU, não de uma regra nova aqui:
 * `estado` distingue revisar / sem_vinculo / aplicado, e `status` distingue exato de
 * divergente. Recalcular no front seria a segunda resposta para "o que falta revisar".
 */
function passaNoFiltro(r: EnriqRowVM, f: FiltroEstado): boolean {
  switch (f) {
    case 'revisar': return r.estado === 'revisar';
    case 'atualizam': return grupoDaLinha(r.status, r.aplicado) === 'atualizam';
    case 'decide': return grupoDaLinha(r.status, r.aplicado) === 'decide';
    case 'agrupam': return grupoDaLinha(r.status, r.aplicado) === 'agrupam';
    case 'sem_par': return grupoDaLinha(r.status, r.aplicado) === 'sem_par';
    /* 129d item 4 — o sentido é um recorte como os outros: o operador que confere o
       extrato olha um lado de cada vez. */
    case 'entradas': return r.entradaOuSaida === 'entrada';
    case 'saidas': return r.entradaOuSaida === 'saida';
    default: return true;
  }
}

export interface EnriquecimentoMesaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rótulo da sessão ativa (mesmo label do seletor da toolbar). '—' quando não há. */
  sessaoLabel: string | null;
  lista: EnriquecimentoListaProps;
  detalhe: EnriquecimentoDetalheProps;
  actions: EnriquecimentoActionsProps;
  /**
   * Leva Fornecedor, Fazenda e Subcentro da linha atual às demais do grupo marcadas
   * "revisar" — 129. Recebe os ids das linhas alvo; quem grava é o pai, com a MESMA RPC
   * do Salvar, uma chamada por linha.
   * ⚠ SAFRA NÃO VAI JUNTO, e o botão diz isso: `fn_classificacao_apply_row` não grava
   * `safra_id`. Prometer os quatro e entregar três seria pior que entregar três.
   */
  onAplicarAoGrupo?: (ids: string[]) => Promise<void>;
  aplicandoGrupo?: boolean;
  /**
   * 133d item 3 — as faixas de decisão da linha (sobrescrever, desfazer, agrupar,
   * candidatos), que saíram da tela principal do passo 2 e vivem aqui.
   *
   * ⚠ NÓ, E NÃO MAIS PROPS: elas dependem de oito handlers e cinco estados que já vivem no
   * container. Passá-los um a um seria replicar o container inteiro no contrato deste
   * componente — que é burro de propósito.
   */
  faixas?: React.ReactNode;
  /**
   * 133e adendo item 3 — a ORDEM VISÍVEL da Mesa, para o pai navegar por ela.
   *
   * ⚠ A MESA TEM FILTRO PRÓPRIO (conta + situação), e a navegação andava pela lista da ABA.
   * Com a Lavoura filtrada aqui dentro, "Salvar e próximo" pulava para uma linha do Banco do
   * Brasil — que está na lista da aba e não nesta. Quem sabe o que está visível é este
   * componente; quem sabe salvar é o pai. Então a ordem sobe, e a navegação desce.
   */
  onOrdemVisivel?: (ids: string[]) => void;
}

export function EnriquecimentoMesaModal({
  open, onOpenChange, sessaoLabel, lista, detalhe, actions, onAplicarAoGrupo, aplicandoGrupo, faixas,
  onOrdemVisivel,
}: EnriquecimentoMesaModalProps) {
  /* ⚠ O AGRUPAMENTO SAIU DA MESA — 133e item A: varrer a sessão por fornecedor/subcentro é
     trabalho da tela principal do passo 2. Aqui a lista é sempre cronológica, agrupada por
     dia, porque é assim que se navega enquanto se revisa uma linha. */
  const agrupamento: Agrupamento = 'dia';
  const [filtro, setFiltro] = useState<FiltroEstado>('todas');
  /** Filtro de conta PRÓPRIO da Mesa — o da tela principal não atravessa o modal. */
  const [contaSel, setContaSel] = useState<string>('__todas__');

  const rows = lista.rows;
  const contagens = useMemo(() => ({
    revisar: rows.filter(r => r.estado === 'revisar').length,
    atualizam: rows.filter(r => grupoDaLinha(r.status, r.aplicado) === 'atualizam').length,
    decide: rows.filter(r => grupoDaLinha(r.status, r.aplicado) === 'decide').length,
    agrupam: rows.filter(r => grupoDaLinha(r.status, r.aplicado) === 'agrupam').length,
    sem_par: rows.filter(r => grupoDaLinha(r.status, r.aplicado) === 'sem_par').length,
    entradas: rows.filter(r => r.entradaOuSaida === 'entrada').length,
    saidas: rows.filter(r => r.entradaOuSaida === 'saida').length,
  }), [rows]);

  /** As contas presentes na sessão — o select da esquerda. */
  const contasDaSessao = useMemo(
    () => [...new Set(rows.map(r => r.contaBancaria).filter((c): c is string => !!c))].sort(
      (a, b) => a.localeCompare(b, 'pt-BR')),
    [rows]);

  const visiveis = useMemo(
    () => rows.filter(r => passaNoFiltro(r, filtro)
      && (contaSel === '__todas__' || r.contaBancaria === contaSel)),
    [rows, filtro, contaSel]);

  /** Os grupos, na ordem em que aparecem na lista — sem reordenar o que veio do adapter. */
  /** Faixa por DIA, na ordem em que as linhas chegaram — 133e item A. */
  const grupos = useMemo(() => {
    const ordem: string[] = [];
    const mapa = new Map<string, EnriqRowVM[]>();
    for (const r of visiveis) {
      /* A faixa da Mesa segue a mesma data de caixa da tela principal, e marca a
         competência quando é ela que sobrou (133e adendo item 5). */
      const k = (r.dataEhCompetencia ? `${r.data} comp.` : r.data) || '—';
      const atual = mapa.get(k);
      if (atual) atual.push(r); else { mapa.set(k, [r]); ordem.push(k); }
    }
    return ordem.map(nome => ({ nome: nome as string | null, linhas: mapa.get(nome)! }));
  }, [visiveis]);

  const selecionada = rows.find(r => r.id === lista.selecionadoId) ?? null;

  /* A ordem visível sobe a cada mudança de recorte; fechado, o pai volta à lista dele. */
  useEffect(() => {
    if (!open) return;
    onOrdemVisivel?.(visiveis.map((r) => r.id));
  }, [open, visiveis, onOrdemVisivel]);

  /**
   * ⚠ A LINHA SELECIONADA ACOMPANHA A NAVEGAÇÃO — 133e adendo item 4. Sem isto, "Salvar e
   * próximo" mudava o painel da direita e a lista ficava parada: o operador perdia de vista
   * onde estava. `block: 'nearest'` rola o mínimo — não recentra a lista a cada linha.
   */
  const selRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) selRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, lista.selecionadoId]);

  /**
   * Ctrl/Cmd+Enter = Salvar e próximo — 133b-a.
   *
   * ⚠ SÓ COM O MODAL ABERTO, e por isso o listener entra e sai com ele: preso ao
   * `document` de forma permanente, o atalho gravaria a linha selecionada a partir de
   * qualquer tela da aplicação.
   * ⚠ RESPEITA O MESMO `disabled` DO BOTÃO. Um atalho que faz o que o botão apagado recusa
   * é um segundo caminho para o mesmo ato — e é sempre o caminho que ninguém testa.
   */
  useEffect(() => {
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
      if (actions.isBusy) return;
      if (actions.soConfirma) { e.preventDefault(); actions.onConfirmarProximo?.(); return; }
      if (actions.salvarDisabled) return;
      e.preventDefault();
      actions.onSalvarProximo();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [open, actions]);
  /* As outras linhas do grupo da selecionada que ainda pedem revisão — o alvo do
     "aplicar ao grupo". Exatas e já revisadas ficam de fora, como o envelope manda. */
  /**
   * ⚠ O GRUPO DO "APLICAR AO GRUPO" PASSOU A SER O FORNECEDOR — 133e item A. Ele saía do
   * seletor de agrupamento, que deixou de existir na Mesa; o fornecedor é o critério que o
   * gesto sempre serviu ("este fornecedor cai sempre no mesmo subcentro"), e agora ele é
   * explícito em vez de depender de um seletor escondido no cabeçalho.
   */
  const alvosDoGrupo = useMemo(() => {
    if (!selecionada) return [];
    const k = selecionada.fornecedor;
    if (!k || k === '—') return [];
    return rows.filter(r => r.id !== selecionada.id && r.fornecedor === k && r.estado === 'revisar' && !r.aplicado);
  }, [rows, selecionada]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠ `h-[92vh]` E `max-h-[92vh]` JUNTOS: o primeiro dá a altura que a cadeia flex
          precisa para existir; o segundo impede que o conteúdo a estoure. Em 1440×900 são
          828px, e o esqueleto (44 + corpo + 44) cabe sem rolar a moldura. */}
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        {/* ⚠ 40px, 13px/500 e subtítulo 10px — 133b-a. Eram 44px e 14px/600: quatro pixels
            e um grau de peso que o corpo da tela não tem, num cabeçalho que só nomeia. */}
        {/* 36px / 12px / 10px — 133d item 4. */}
        <DialogHeader className="h-9 shrink-0 flex-row items-center gap-2.5 space-y-0 bg-primary px-4">
          <DialogTitle className="text-[12px] font-medium text-primary-foreground">
            Mesa de revisão · Enriquecimento
          </DialogTitle>
          <span className="min-w-0 truncate text-[10px] text-primary-foreground/85" title={sessaoLabel ?? undefined}>
            {sessaoLabel ?? '—'}
          </span>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-2.5 p-2.5 md:[grid-template-columns:260px_1fr]">
          {/* ═══ ESQUERDA: navegação, e só ═══════════════════════════════════════
              ⚠ 260px E UMA ALTURA DE 28px — 133e item A. A coluna tinha descrição,
              fornecedor, contexto e pílula: quatro informações que o painel direito repete
              inteiras, ocupando 380px de largura e duas alturas por linha. Aqui ela é
              NAVEGAÇÃO — data, valor e a bolinha da situação —, e a largura que sobra vai
              para a tabela, onde o trabalho acontece.
              ⚠ O AGRUPAMENTO POR FORNECEDOR/SUBCENTRO SAIU DA MESA: ele serve para varrer a
              sessão, e varrer é a tela principal do passo 2. Aqui se revisa uma linha. */}
          <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
            {/* Dois selects de 10px numa linha — os chips saíram (item A). */}
            <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
              <Select value={contaSel} onValueChange={setContaSel}>
                <SelectTrigger className="h-6 min-w-0 flex-1 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__" className="text-[10px]">Todas as contas</SelectItem>
                  {contasDaSessao.map(c => (
                    <SelectItem key={c} value={c} className="text-[10px]">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroEstado)}>
                <SelectTrigger className="h-6 min-w-0 flex-1 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas" className="text-[10px]">Todas ({rows.length})</SelectItem>
                  <SelectItem value="atualizam" className="text-[10px]">Atualizam ({contagens.atualizam})</SelectItem>
                  <SelectItem value="decide" className="text-[10px]">Você decide ({contagens.decide})</SelectItem>
                  <SelectItem value="agrupam" className="text-[10px]">Agrupam ({contagens.agrupam})</SelectItem>
                  <SelectItem value="sem_par" className="text-[10px]">Sem par no banco ({contagens.sem_par})</SelectItem>
                  <SelectItem value="revisar" className="text-[10px]">A revisar ({contagens.revisar})</SelectItem>
                  <SelectItem value="entradas" className="text-[10px]">Entradas ({contagens.entradas})</SelectItem>
                  <SelectItem value="saidas" className="text-[10px]">Saídas ({contagens.saidas})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ⚠ O ÚNICO SCROLLPORT DESTE LADO. Um `max-h` interno criaria a segunda barra
                que o A21 proíbe — e rolar a de dentro não moveria o cabeçalho. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visiveis.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-muted-foreground">Nenhuma linha neste recorte.</p>
              ) : grupos.map(({ nome, linhas }) => (
                <div key={nome ?? '__lista__'}>
                  {nome !== null && (
                    /* ⚠ FUNDO OPACO E `z` ACIMA — A21. Transparente é pior que não fixar:
                        as linhas passariam por baixo da data que se está conferindo. */
                    <div className="sticky top-0 z-[2] flex items-center gap-1.5 border-b bg-muted px-2 py-0.5 text-[10px] font-medium">
                      <span className="min-w-0 truncate">{nome}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{linhas.length}</span>
                    </div>
                  )}
                  {linhas.map(r => {
                    const sel = r.id === lista.selecionadoId;
                    const meta = STATUS_META[r.status];
                    return (
                      /* ⚠ UMA ALTURA, 28px, E NADA QUEBRA — 133e item A. `whitespace-nowrap`
                         na data e no valor: se não couber, quem cede é o padding, nunca a
                         linha. O nome completo do estado fica no `title` da bolinha. */
                      <button type="button" key={r.id} ref={sel ? selRef : undefined}
                        onClick={() => lista.onSelecionar(r.id)}
                        className={`flex h-7 w-full items-center gap-1.5 border-b border-border/60 px-2 text-left ${
                          sel ? 'border-l-[3px] border-l-primary bg-primary/[0.08] pl-[5px]' : ''}`}>
                        <span className={`w-16 shrink-0 whitespace-nowrap text-[10px] tabular-nums ${
                          r.dataEhCompetencia ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
                          title={r.dataEhCompetencia
                            ? 'Sem data de pagamento: esta é a competência.'
                            : 'Data de pagamento.'}>
                          {r.data}
                        </span>
                        <span className={`min-w-0 flex-1 whitespace-nowrap text-right text-[11px] font-medium tabular-nums ${corDoSinal(r.entradaOuSaida)}`}>
                          {sinalPrefixo(r.entradaOuSaida)}{r.valor}
                        </span>
                        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                          r.aplicado ? 'bg-emerald-500' : (meta?.dot ?? 'bg-muted-foreground')}`}
                          title={r.aplicado ? 'Gravada' : (meta?.label ?? r.statusLabel)} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ DIREITA: a linha selecionada ════════════════════════════════════ */}
          <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
            {!selecionada ? (
              /* ⚠ `flex-1` NO VAZIO TAMBÉM: sem ele o parágrafo mede o próprio texto e o
                 rodapé sobe para debaixo dele, no meio do card. Medido na tela. */
              <p className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[11px] text-muted-foreground">
                Selecione uma linha à esquerda para revisar.
              </p>
            ) : (
              <>
                {/* ⚠ 44px E UMA LINHA POR CARD — 133b-a. O bloco tinha três linhas por card
                    (rótulo, número de 18px e um contexto) e comia 76px do painel; com a
                    tabela em 360px, era o que faltava para os quinze campos caberem sem
                    rolar. Rótulo 10px, valor 16px/500, e o contexto que sobrava foi para o
                    `title` — continua disponível, deixa de custar altura. */}
                {/* 36px — 133d item 4: quatro cards de uma linha, valor 14px/500. */}
                <div className="flex h-9 shrink-0 items-center border-b bg-muted px-3">
                  <div className="grid w-full grid-cols-4 gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">Linha</div>
                      <div className="truncate text-[14px] font-medium leading-tight"
                        title={`${selecionada.fornecedor} · ${selecionada.data}`}>{actions.posicao}</div>
                    </div>
                    {/* ⚠ TIPO E VALOR JUNTOS — 129d item 7. Separados, o operador lia o número
                        sem saber se saiu ou entrou; e o extrato dele tem os dois. */}
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">
                        {rotuloSentido(selecionada.entradaOuSaida)}
                      </div>
                      <div className={`truncate text-[14px] font-medium leading-tight tabular-nums ${corDoSinal(selecionada.entradaOuSaida)}`}
                        title={`Valor: ${selecionada.comparativo.find(c => c.campo === 'Valor')?.resultado ?? '—'}`}>
                        {sinalPrefixo(selecionada.entradaOuSaida)}{selecionada.valor}
                      </div>
                    </div>
                    {/* A conta bancária virou card — 129d item 8: é o que amarra a linha ao
                        extrato que o operador tem na frente. */}
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">Conta bancária</div>
                      <div className="truncate text-[14px] font-medium leading-tight" title={selecionada.contaBancaria ?? undefined}>
                        {selecionada.contaBancaria ?? '—'}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">O que muda</div>
                      <div className={`truncate text-[14px] font-medium leading-tight ${selecionada.mudaAlgo ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                        title={selecionada.comparativo.filter(c => c.tom === 'muda' || c.tom === 'difere')
                          .map(c => c.campo).join(' · ') || 'Nada muda: o Resultado já confere com o sistema.'}>
                        {(() => {
                          const n = selecionada.comparativo.filter(c => c.tom === 'muda' || c.tom === 'difere').length;
                          return n === 0 ? 'nada muda' : `${n} campo${n > 1 ? 's' : ''}`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ⚠ "Sugerido por", EM PORTUGUÊS DE CLIENTE — 129d item 3. "alias · motor v1"
                    era jargão nosso: o operador não sabe o que é tier nem motor; ele sabe se
                    ensinou um apelido. A frase vem pronta do adapter.
                    ⚠ UMA LINHA, TRUNCADA — 133b-a: em `break-words` ela virava duas ou três
                    num subcentro longo, e a altura do painel deixava de ser previsível. */}
                <div className="shrink-0 truncate border-b px-3 py-0.5 text-[10px] leading-tight text-muted-foreground"
                  title={`${selecionada.proveniencia.comoFoiSugerido} · ${subcentroDa(selecionada)}`}>
                  Sugerido por: <b className="font-medium text-foreground">{selecionada.proveniencia.comoFoiSugerido}</b>
                  {' · '}{subcentroDa(selecionada)}
                </div>

                <MesaCamposTabela
                  row={selecionada}
                  classificacoes={detalhe.classificacoes}
                  fornecedores={detalhe.fornecedores}
                  fazendas={detalhe.fazendas}
                  clienteId={detalhe.clienteId}
                  safras={detalhe.safras}
                  contas={detalhe.contas}
                  onEditar={detalhe.onEditar}
                  onCriarFornecedor={detalhe.onCriarFornecedor}
                />
                {faixas}
              </>
            )}

            {/* ═══ RODAPÉ FIXO ══════════════════════════════════════════════════ */}
            {/* ⚠ O RODAPÉ NÃO PODE CORTAR BOTÃO. Medido: em viewport de 1168 o painel
                direito fica com ~750px, e a barra do mock não cabia — "Salvar e próximo"
                saía pela borda (overflowX de 62px). `gap-1.5`, `px-2` e `whitespace-nowrap`
                em tudo, com o contador em `truncate`: quem cede é o texto, nunca o botão.
                Em 1440 sobra folga; em 1168 encaixa. */}
            {/* 32px — 133d item 4; os botões continuam h-7/11px. */}
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-t px-2">
              <Button size="sm" variant="ghost" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onAnterior} disabled={!actions.canAnterior}>◀ Anterior</Button>
              <Button size="sm" variant="ghost" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onProximo} disabled={!actions.canProximo}>Próximo ▶</Button>
              <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onReverter} disabled={actions.reverterDisabled || actions.isBusy}>↺ Reverter</Button>
              <div className="flex-1" />
              {/* ⚠ O MOTIVO DO BLOQUEIO FICA ESCRITO, e não só no `title` — 133b-a
                  correção 1: o operador não passa o mouse num botão apagado, ele procura o
                  que consertar. Quando não há bloqueio, o espaço volta a ser o contador. */}
              {actions.salvarMotivo && !actions.soConfirma ? (
                <span className="min-w-0 shrink truncate text-[10px] text-amber-700 dark:text-amber-400"
                  title={actions.salvarMotivo}>{actions.salvarMotivo}</span>
              ) : null}
              <label className="flex min-w-0 shrink items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
                <input type="checkbox" className="shrink-0" checked={actions.revisado}
                  disabled={actions.aplicarTodosDisabled || actions.isBusy}
                  onChange={e => actions.onRevisado(e.target.checked)} />
                <span className="truncate">Revisado · {actions.posicao}</span>
              </label>
              {onAplicarAoGrupo && (
                <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                  disabled={alvosDoGrupo.length === 0 || !!aplicandoGrupo || actions.isBusy}
                  title={alvosDoGrupo.length === 0
                    ? 'Nenhuma outra linha deste fornecedor pede revisão.'
                    : `Leva Fornecedor, Fazenda, Subcentro e Safra desta linha às outras ${alvosDoGrupo.length} linha(s) do mesmo fornecedor.`}
                  onClick={() => { void onAplicarAoGrupo(alvosDoGrupo.map(r => r.id)); }}>
                  {aplicandoGrupo ? 'Aplicando…' : `Ao fornecedor (${alvosDoGrupo.length})`}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onAplicarTodos}
                disabled={actions.aplicarTodosDisabled || !actions.revisado || actions.isBusy}
                title="Acelerador: aplica todos os Exatos pendentes DA SESSÃO, sem sobrescrever classificações existentes. Marque 'Revisado' para habilitar.">
                Exatos ({actions.nAplicaveis})
              </Button>
              <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onSalvar}
                disabled={actions.salvarDisabled || actions.isBusy}
                title={actions.salvarMotivo ?? undefined}>Salvar</Button>
              {/* ⚠ O CTA É O ÚLTIMO À DIREITA — 133b-a, e alinhado com a borda da tabela: é
                  onde o olho termina a linha e onde a mão volta depois de conferir os quinze
                  campos.
                  ⚠ "CONFIRMAR E PRÓXIMO" QUANDO NÃO HÁ O QUE GRAVAR — correção 1. O botão
                  deixa de prometer uma gravação que o `apply_row` não faria. */}
              <Button size="sm" className="h-7 shrink-0 whitespace-nowrap bg-cta px-2.5 text-[11px] font-semibold text-cta-foreground hover:bg-cta-hover"
                onClick={actions.soConfirma ? actions.onConfirmarProximo : actions.onSalvarProximo}
                disabled={(actions.soConfirma ? false : actions.salvarDisabled) || actions.isBusy}
                title={actions.soConfirma
                  ? 'O Resultado já confere com o sistema: nada a gravar. Marca como revisado e vai para a próxima. (Ctrl/Cmd+Enter)'
                  : `${actions.salvarMotivo ?? 'Grava esta linha no lançamento e vai para a próxima.'} (Ctrl/Cmd+Enter)`}>
                {/* ⚠ "FIM DA LISTA" EM VEZ DE PULAR — 133e adendo item 3. Chegando ao fim do
                    recorte, o botão dizia "e próximo" e a próxima linha vinha de outra conta;
                    agora ele grava e para, e o rótulo diz que parou. */}
                {!actions.canProximo
                  ? (actions.soConfirma ? 'Confirmar — fim da lista' : 'Salvar — fim da lista')
                  : (actions.soConfirma ? 'Confirmar e próximo' : 'Salvar e próximo')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
