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
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import type { EnriquecimentoListaProps } from './EnriquecimentoLista';
import type { EnriquecimentoDetalheProps } from './EnriquecimentoDetalhe';
import type { EnriquecimentoActionsProps } from './EnriquecimentoActions';
import { MesaCamposTabela } from './MesaCamposTabela';
import { STATUS_META } from './fmt';
import { grupoDaLinha, diferencasDoResultado } from '@/v2/lib/mesa/enriquecimentoView';
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
  /**
   * 133h item 6 — o cadastro de contas do cliente, para o filtro agrupar por tipo.
   *
   * ⚠ ELE VEM DE FORA porque o tipo NÃO está na sessão: o staging carimba id e nome, e a
   * gaveta (`cc`/`inv`/`cartao`) mora em `financeiro_contas_bancarias`. Sem a lista, o
   * filtro ainda funciona — só cai todo em "Outros", que é o comportamento honesto de quem
   * não sabe o tipo, e não uma tela quebrada.
   */
  contas?: ContaSelecionavel[];
  /**
   * 133h item 12 — os lançamentos com vínculo ativo ao extrato, por id.
   *
   * ⚠ PASSA POR AQUI SEM SER LIDO por este componente: quem decide o que travar é a tabela
   * de campos, que sabe QUAIS campos o extrato manda. Guardar a regra aqui espalharia a
   * decisão por duas camadas.
   */
  conciliadosIds?: ReadonlySet<string>;
}

export function EnriquecimentoMesaModal({
  open, onOpenChange, sessaoLabel, lista, detalhe, actions, onAplicarAoGrupo, aplicandoGrupo, faixas,
  onOrdemVisivel, contas, conciliadosIds,
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

  /**
   * As contas presentes na sessão, POR ID — 133h item 6.
   *
   * ⚠ ERA UMA LISTA DE NOMES, e o filtro comparava `r.contaBancaria === contaSel`. Nome não
   * é identidade: não dá para achar o `tipo_conta` no cadastro a partir dele (então a lista
   * não agrupava), duas contas de mesmo rótulo se confundiriam, e renomear uma trocaria o
   * recorte debaixo do operador. Agora a chave é o id, e o rótulo vem do CADASTRO quando
   * ele existe — o nome carimbado na sessão é do dia da importação.
   * ⚠ A CONTAGEM ENTRA NO RÓTULO, como no filtro do passo 2: é ela que diz onde está o
   * trabalho, e sem ela o operador abre conta por conta para descobrir.
   */
  const contasDaSessao = useMemo(() => {
    const conta = new Map<string, number>();
    for (const r of rows) conta.set(r.contaId, (conta.get(r.contaId) ?? 0) + 1);
    return [...conta.entries()]
      .filter(([id]) => id !== '__sem__')
      .map(([id, n]) => {
        const cad = contas?.find((c) => c.id === id);
        const nome = cad ? (cad.nome_exibicao || cad.nome_conta)
          : (rows.find((r) => r.contaId === id)?.contaBancaria ?? 'Conta');
        return { id, nome_conta: `${nome} (${n})`, nome_exibicao: null, tipo_conta: cad?.tipo_conta ?? null };
      });
  }, [rows, contas]);

  /** "Todas" sempre; "Sem conta" só quando a sessão tem linha sem conta. */
  const sentinelasDeConta = useMemo(() => {
    const n = rows.filter((r) => r.contaId === '__sem__').length;
    const itens = [{ value: '__todas__', label: 'Todas as contas' }];
    if (n > 0) itens.push({ value: '__sem__', label: `Sem conta (${n})` });
    return itens;
  }, [rows]);

  const visiveis = useMemo(
    () => rows.filter(r => passaNoFiltro(r, filtro)
      && (contaSel === '__todas__' || r.contaId === contaSel)),
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
      /* O atalho segue o botão — PR-MESA-SALVAR-UNICO-01: grava e avança, sempre. A única
         exceção é a linha já gravada e sem diferença, onde não há o que gravar. */
      if (actions.soAvanca) { e.preventDefault(); actions.onProximo(); return; }
      if (actions.salvarDisabled) return;
      e.preventDefault();
      actions.onSalvarProximo();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [open, actions]);

  /**
   * ArrowDown / ArrowUp trocam a linha — 133h-b item 7.
   *
   * ⚠ A MESA JÁ ERA NAVEGÁVEL PELO MOUSE E POR DOIS BOTÕES, e o teclado só sabia
   * Ctrl/Cmd+Enter: revisar 300 linhas exigia tirar a mão do teclado a cada linha para
   * clicar em "Próximo". As setas fazem o MESMO que os botões — `onProximo`/`onAnterior` —,
   * então não há um segundo caminho de navegação que possa divergir do primeiro.
   *
   * ⚠ CAMPO DE TEXTO FOCADO MANDA. Dentro de um `input`, `textarea`, `select` ou
   * `contenteditable` — e dentro de qualquer combobox aberto, que usa as setas para
   * percorrer a lista — a seta é do campo. Roubá-la ali quebraria o `PlanoSubcentroSelect`
   * e o `FavorecidoSelect`, que navegam por seta e confirmam com Enter.
   *
   * ⚠ PageDown/PageUp NÃO SÃO INTERCEPTADOS: rolar é do scrollport, e é o que o operador
   * espera deles.
   */
  useEffect(() => {
    if (!open) return;
    const aoNavegar = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target;
      if (alvo instanceof HTMLElement) {
        const tag = alvo.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo.isContentEditable) return;
        /* Combobox/menu aberto navega por seta — o Radix marca com estes atributos. */
        if (alvo.closest('[role="listbox"],[role="combobox"],[role="menu"],[cmdk-root]')) return;
        if (alvo.getAttribute('aria-expanded') === 'true') return;
      }
      e.preventDefault();
      if (e.key === 'ArrowDown') { if (actions.canProximo) actions.onProximo(); }
      else if (actions.canAnterior) actions.onAnterior();
    };
    document.addEventListener('keydown', aoNavegar);
    return () => document.removeEventListener('keydown', aoNavegar);
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

        <div className="grid min-h-0 flex-1 gap-2.5 p-2.5 md:[grid-template-columns:220px_1fr]">
          {/* ═══ ESQUERDA: navegação, e só ═══════════════════════════════════════
              ⚠ 220px E UMA ALTURA DE 28px — 133e item A, estreitada em 133g item 2: só data e
              valor cabem em 220, e os 40px que sobram vão para a tabela, onde a Conta do
              plano e o Fornecedor truncavam. A coluna tinha descrição,
              fornecedor, contexto e pílula: quatro informações que o painel direito repete
              inteiras, ocupando 380px de largura e duas alturas por linha. Aqui ela é
              NAVEGAÇÃO — data, valor e a bolinha da situação —, e a largura que sobra vai
              para a tabela, onde o trabalho acontece.
              ⚠ O AGRUPAMENTO POR FORNECEDOR/SUBCENTRO SAIU DA MESA: ele serve para varrer a
              sessão, e varrer é a tela principal do passo 2. Aqui se revisa uma linha. */}
          <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
            {/* Dois selects de 10px numa linha — os chips saíram (item A). */}
            <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
              {/* 133h item 6 — o seletor de conta do sistema, agrupado por tipo, compacto. */}
              <div className="min-w-0 flex-1">
                <ContaBancariaSelect
                  value={contaSel}
                  onValueChange={setContaSel}
                  contas={contasDaSessao}
                  prependItems={sentinelasDeConta}
                  size="compact"
                  className="h-6 text-[10px]"
                />
              </div>
              <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroEstado)}>
                <SelectTrigger className="h-6 min-w-0 flex-1 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas ({rows.length})</SelectItem>
                  <SelectItem value="atualizam">Atualizam ({contagens.atualizam})</SelectItem>
                  <SelectItem value="decide">Você decide ({contagens.decide})</SelectItem>
                  <SelectItem value="agrupam">Agrupam ({contagens.agrupam})</SelectItem>
                  <SelectItem value="sem_par">Sem par no banco ({contagens.sem_par})</SelectItem>
                  <SelectItem value="revisar">A revisar ({contagens.revisar})</SelectItem>
                  <SelectItem value="entradas">Entradas ({contagens.entradas})</SelectItem>
                  <SelectItem value="saidas">Saídas ({contagens.saidas})</SelectItem>
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
                      {/* ⚠ CONTA AS DIFERENÇAS REAIS — 133i item 2b, a MESMA lista que decide o
                          rótulo do botão (`diferencasDoResultado`). Antes contava linhas do
                          comparativo com tom 'muda' ou 'difere', que inclui campo de LEITURA
                          e campo que o extrato manda: uma linha inteira em "confere/mantém"
                          dizia "1 campo" (Gabriel, 09:51). Duas contagens para a mesma
                          pergunta é a tela discordando de si mesma. */}
                      <div className="text-[10px] leading-tight text-muted-foreground">O que muda</div>
                      {(() => {
                        const difs = diferencasDoResultado(selecionada.edicao);
                        return (
                          <div className={`truncate text-[14px] font-medium leading-tight ${difs.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                            title={difs.join(' · ') || 'Nada muda: o Resultado já confere com o sistema.'}>
                            {difs.length === 0 ? 'nada muda' : `${difs.length} campo${difs.length > 1 ? 's' : ''}`}
                          </div>
                        );
                      })()}
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
                  conciliado={selecionada.lancId ? conciliadosIds?.has(selecionada.lancId) : false}
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
            {/* ⚠ 133h itens 11 e 12 — UMA LINHA ACIMA DO RODAPÉ, e só quando tem o que
                dizer. Ela responde às duas perguntas que a Mesa não respondia: qual dos
                dois botões toca o Financeiro, e em que a planilha discorda do extrato.
                Fora do rodapé de 32px de propósito: ele não pode crescer nem cortar botão. */}
            <div className="shrink-0 border-t px-2 py-0.5 text-[10px] leading-tight">
              {actions.erroBanco ? (
                /* 133h adendo item 15 — o erro do banco fica escrito, não só no toast. */
                <span className="font-medium text-red-700 dark:text-red-400" title={actions.erroBanco}>
                  Não gravou — o banco recusou: {actions.erroBanco}
                </span>
              ) : actions.divergenciasDoExtrato && actions.divergenciasDoExtrato.length > 0 ? (
                <span className="text-amber-700 dark:text-amber-400">
                  Planilha diverge do extrato em: {actions.divergenciasDoExtrato.join(' · ')} — o
                  extrato manda, e estes campos não serão gravados.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  <b>Salvar</b> e <b>Salvar e próximo</b> gravam a mesma coisa; o segundo ainda avança.
                </span>
              )}
            </div>

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
              {actions.salvarMotivo && !actions.soAvanca ? (
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
                  ⚠ UM RÓTULO SÓ E UM CAMINHO SÓ — PR-MESA-SALVAR-UNICO-01. O rótulo já era
                  único; o comportamento não era: numa linha sem diferença este botão fugia
                  do `apply_row` e só marcava revisada, enquanto o "Salvar" ao lado gravava.
                  Voltar na linha depois mostrava o trabalho desfeito. Agora ele é o Salvar
                  mais o avanço, e nada mais. */}
              <Button size="sm" className="h-7 shrink-0 whitespace-nowrap bg-cta px-2.5 text-[11px] font-semibold text-cta-foreground hover:bg-cta-hover"
                onClick={actions.soAvanca ? actions.onProximo : actions.onSalvarProximo}
                disabled={actions.soAvanca
                  ? !actions.canProximo : (actions.salvarDisabled || actions.isBusy)}
                title={actions.soAvanca
                  ? 'Esta linha já está gravada e nada mudou: só seguir. (Ctrl/Cmd+Enter)'
                  : `${actions.salvarMotivo ?? 'Grava esta linha no lançamento e vai para a próxima.'} (Ctrl/Cmd+Enter)`}>
                {/* ⚠ "FIM DA LISTA" EM VEZ DE PULAR — 133e adendo item 3. Chegando ao fim do
                    recorte, o botão dizia "e próximo" e a próxima linha vinha de outra conta;
                    agora ele grava e para, e o rótulo diz que parou. */}
                {actions.canProximo ? 'Salvar e próximo' : 'Salvar — fim da lista'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
