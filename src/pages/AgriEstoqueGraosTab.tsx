/**
 * ESTOQUE DE GRÃOS — Produção › Agricultura › Estoque de Grãos (PR-ESTOQUE-GRAOS-F1).
 *
 * ⚠ A PERGUNTA É UMA SÓ: quanto grão ainda está comigo, e quanto ele vale. A colheita diz o que
 * entrou e o barter diz o que saiu; até aqui a diferença entre os dois — o que o produtor tem
 * em mãos para vender — não estava em tela nenhuma.
 * ⚠ FATIA 1 É LEITURA. Registrar saída e baixar por quebra são as fatias 2 e 3; os botões já
 * existem desabilitados porque a tela precisa mostrar, desde o primeiro dia, o que ela vai
 * saber fazer — um saldo sem saída aparente parece um número que ninguém pode mexer.
 *
 * ⚠ SAFRA + CULTURA, como o Painel da Safra. A primeira versão desta tela tinha só a safra,
 * porque a RPC não aceitava cultura e um seletor que não muda número nenhum é pior que seletor
 * nenhum; a RPC ganhou o parâmetro e o filtro veio junto.
 * ⚠ A CULTURA SAI DOS TALHÕES DAQUELA SAFRA, não de uma lista fixa: só se estoca o que se
 * plantou, e oferecer milho numa safra que só teve amendoim abriria a tela zerada sem dizer
 * por quê.
 */
import { useState, useEffect, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { PageHeader } from '@/components/ui/page-header';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, TrendingDown, Loader2, AlertTriangle, LineChart, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Cartao } from '@/components/ui/cartao';
import { BalancoSafrasModal } from '@/components/agri/BalancoSafrasModal';
import { CINZA_CABECALHO, TH_CINZA as TH } from '@/lib/idiomaVisual';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { unidadeDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import { useEstoqueGraos, totaisDoEstoque, useEstoqueGraosResumo } from '@/hooks/useEstoqueGraos';
import { VendaAvulsaModal, type VendaAvulsaPayload } from '@/components/agri/VendaAvulsaModal';
import { CotacaoGraosModal, type CotacaoGraosPayload } from '@/components/agri/CotacaoGraosModal';
import { formatIsoToBr } from '@/components/ui/date-picker';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ⚠ O MESMO CINZA DOS MODAIS DO BARTER, e de propósito: esta tela lê a mesma operação que
   aquelas listas — o grão que entrou e o que saiu. Um azul próprio faria parecer outro assunto.
   A régua mora em `idiomaVisual` desde o PR-UI-EXTRAIR-CARTAO-TH; o alias mantém o nome curto
   que as vinte e poucas células deste arquivo já usam. */

/**
 * A DIVISA ENTRE O PREÇO DE VENDA E O DE MERCADO.
 *
 * ⚠ ELA NÃO É ENFEITE: sem a linha, oito colunas de número à direita leem como uma sequência só, e
 * a soma mental de "Valor" com "Valor a mercado" é o erro natural de quem varre a tabela — os dois
 * são o MESMO grão avaliado de duas maneiras, nunca duas parcelas.
 * ⚠ SÃO DUAS CLASSES PORQUE SÃO DOIS FUNDOS: no cabeçalho e no total o fundo é o azul escuro, e um
 * cinza de tabela desapareceria nele; no corpo o fundo é branco, e o branco translúcido sumiria.
 */
const SEP_TH = 'border-l-2 border-white/40';
const SEP_TD = 'border-l-2 border-slate-300';

/**
 * ⚠ O VALOR SENTINELA DO "TODAS", e ele NÃO pode ser string vazia: o `Select` do Radix trata
 * `''` como "nada escolhido" e o seletor voltaria ao placeholder em vez de mostrar "Todas".
 * Um token improvável é o que distingue "escolhi ver todas" de "ainda não escolhi".
 */
const TODAS = '__todas__';

/**
 * AS TRÊS COLUNAS DE UNIDADE DA VISÃO "TODAS".
 *
 * ⚠ ELAS EXISTEM PORQUE SACA E TONELADA NÃO SOMAM. A coluna única de antes — "Sacas em estoque" —
 * punha amendoim (saca de 25 kg) e mandioca (tonelada) na mesma célula e somava as duas no total.
 * O número resultante não media nada: não era saca, não era tonelada.
 * ⚠ SÃO FIXAS, aparecem mesmo vazias. Uma coluna que só nasce quando há dado esconde a pergunta:
 * "60 kg" vazia diz que o sistema conhece a saca de soja e não tem estoque dela, enquanto a
 * ausência da coluna não diz nada.
 * ⚠ A DE 60 kg ESTÁ VAZIA HOJE, E ISSO É CORRETO: `unidadeDaCultura` (colheita.ts) só dá saca ao
 * amendoim, porque "a saca de 60 kg é convenção de mercado para soja e milho, mas convenção não é
 * decisão". Enquanto ninguém decidir, soja e milho se medem em tonelada e caem na terceira
 * coluna. No dia em que a decisão entrar em `UNIDADES`, esta tabela a mostra sozinha.
 */
const COLUNAS_UNIDADE = [
  { chave: 'sc25', titulo: 'Sacas 25kg', kgPorSaca: 25 },
  { chave: 'sc60', titulo: 'Sacas 60kg', kgPorSaca: 60 },
  { chave: 't', titulo: 'Toneladas', kgPorSaca: null },
] as const;

type ChaveUnidade = typeof COLUNAS_UNIDADE[number]['chave'];

/**
 * EM QUAL DAS TRÊS COLUNAS ESTA CULTURA ENTRA.
 *
 * ⚠ `null` QUANDO NENHUMA SERVE, e não um chute na tonelada: uma cultura medida em saca de outro
 * peso — 50 kg, digamos — não é tonelada, e jogá-la ali afirmaria um peso errado num total que o
 * operador vai somar. Hoje `UNIDADES` não produz esse caso; a linha existe para que, se produzir,
 * a tela diga que não sabe em vez de mentir.
 */
function colunaDaCultura(cultura: string): ChaveUnidade | null {
  const u = unidadeDaCultura(cultura);
  if (u.unidadeTotal !== 'sacas') return 't';
  return COLUNAS_UNIDADE.find(c => c.kgPorSaca === u.kgPorSaca)?.chave ?? null;
}

export function AgriEstoqueGraosTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { safras } = useSafrasLavoura(clienteId);
  const [safraId, setSafraId] = useState('');

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  /* ⚠ AS CULTURAS SAEM DOS TALHÕES, o mesmo caminho da colheita e do Painel da Safra. */
  const { talhoes } = useTalhoesDaSafra(clienteId, safraId || null);
  const culturasDaSafra = useMemo(
    () => Array.from(new Set(talhoes.map(t => t.cultura))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [talhoes]);
  /**
   * ⚠ ABRE EM "TODAS", não na primeira cultura: a pergunta do estoque é "o que eu tenho", e numa
   * safra com duas culturas abrir numa delas esconde metade da resposta sem dizer que escondeu.
   * ⚠ E "TODAS" SOBREVIVE À TROCA DE SAFRA — só a cultura ESPECÍFICA que não existe na nova é que
   * cai de volta para o resumo. Quem está comparando safras pelo total não quer ser jogado numa
   * cultura a cada troca.
   */
  const [cultura, setCultura] = useState(TODAS);
  useEffect(() => {
    if (cultura === TODAS) return;
    if (culturasDaSafra.length === 0 || !culturasDaSafra.includes(cultura)) setCultura(TODAS);
  }, [culturasDaSafra, cultura]);

  const verTodas = cultura === TODAS;

  /* ⚠ UMA CONTA SO' PARA O CO'DIGO DA SAFRA: ele era refeito inline em cada modal, e agora o
     breadcrumb e' um terceiro leitor. Tres copias da mesma expressao e' onde uma delas fica para
     tras. E' o `codigo` como o seletor o mostra ("25/26-Lav"), sem cirurgia de string: inventar um
     recorte aqui faria o cabecalho chamar a safra por um nome que nenhum outro lugar usa. */
  const safraRotulo = useMemo(() => {
    const sf = safras.find(x => x.id === safraId);
    return sf?.codigo || sf?.nome || '';
  }, [safras, safraId]);

  /**
   * O TI'TULO E' UM BREADCRUMB — PR-ESTOQUE-BREADCRUMB-ORDEM.
   *
   * ⚠ A UNIDADE VEM DE `unidadeDaCultura`, NUNCA de uma lista escrita aqui: `colheita.ts` e' a
   * fonte unica, e ela diz que SO' o amendoim tem saca (25 kg) — soja, milho, cana e mandioca
   * caem em tonelada, de proposito, porque "a saca de 60 kg e' convencao de mercado, e convencao
   * nao e' decisao". Escrever "(60kg saca)" aqui faria a tela afirmar um peso que ninguem
   * confirmou.
   * ⚠ SO' A RAIZ E' CLICA'VEL. O `›` e o nome da cultura sao texto: se tudo fosse alvo, o gesto de
   * "voltar" competiria com o de "estou aqui", e o operador clicaria no proprio lugar em que ja'
   * esta'.
   */
  const unidade = unidadeDaCultura(verTodas ? null : cultura);
  const rotuloUnidade = unidade.kgPorSaca ? `${unidade.kgPorSaca}kg saca` : 'tonelada';
  const tituloTela = verTodas ? 'Estoque de Grãos' : (
    <>
      <button type="button" onClick={() => setCultura(TODAS)}
        title="Voltar para todas as culturas"
        className="rounded underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        Estoque de Grãos
      </button>
      <span className="mx-1 font-normal text-muted-foreground">›</span>
      {labelDaCultura(cultura)}
    </>
  );

  /**
   * O RECORTE — unidade e safra, logo acima da tabela.
   *
   * ⚠ ELES SAÍRAM DO BREADCRUMB, não sumiram. O título responde "onde estou" e a resposta é um
   * caminho: Estoque de Grãos › Amendoim. Unidade e safra não são lugar — são o RECORTE do que a
   * tabela abaixo mostra, e é ao lado dela que eles fazem trabalho.
   * ⚠ E É POR ISSO QUE ELE NÃO EXISTE EM "TODAS": lá a tabela tem uma linha por cultura, cada uma
   * com a sua unidade em coluna própria, e não há um recorte único a declarar. Repetir a safra ali
   * seria dizer o que o seletor do topo já diz.
   * ⚠ A SAFRA SÓ ENTRA QUANDO HÁ UMA: sem `safraRotulo` o " · Safra " sairia pendurado.
   */
  const rotuloRecorte = verTodas ? null : (
    <p className="text-[11px] text-muted-foreground">
      {labelDaCultura(cultura)} ({rotuloUnidade})
      {safraRotulo && <> · Safra {safraRotulo}</>}
    </p>
  );

  const { linhas, carregando, erro } = useEstoqueGraos(
    clienteId, safraId || null, verTodas ? null : (cultura || null));
  const resumo = useEstoqueGraosResumo(clienteId, safraId || null, verTodas);
  const t = useMemo(() => totaisDoEstoque(linhas), [linhas]);
  /* ⚠ SÓ O `valor`, e a ausência do `saldo` é deliberada: somar o saldo de culturas em unidades
     diferentes não mede nada (saca de 25 kg com tonelada), e era o que o cartão "Em estoque" fazia
     em "Todas". Quem quer saldo em "Todas" lê a tabela, que separa por unidade e soma por coluna.
     O `valor` soma porque real é real. */
  const totalResumo = useMemo(() => ({
    valor: resumo.culturas.reduce((a, c) => a + c.valor, 0),
  }), [resumo.culturas]);

  /**
   * O TOTAL DE CADA COLUNA DE UNIDADE — e cada uma soma SÓ o que é da mesma unidade.
   *
   * ⚠ `null` NÃO É ZERO, e a distinção é a razão de esta conta existir: `null` significa que
   * NENHUMA cultura da safra se mede naquela unidade (a coluna de 60 kg, hoje), e a tela mostra
   * "—". Zero significa que há cultura naquela unidade e ela está sem estoque — é o caso da
   * mandioca em toneladas na 25/26. "0,00" onde não há cultura nenhuma afirmaria um estoque
   * vazio de algo que nem existe na safra.
   */
  const totaisPorUnidade = useMemo(() => {
    const acc = new Map<ChaveUnidade, number>();
    for (const c of resumo.culturas) {
      const col = colunaDaCultura(c.cultura);
      if (!col) continue;
      acc.set(col, (acc.get(col) ?? 0) + c.saldo);
    }
    return acc;
  }, [resumo.culturas]);

  /* ───────────────────────── A VENDA AVULSA ─────────────────────────
   * ⚠ A FAZENDA SAI DO TALHÃO, não de um contexto global: a RPC exige `p_fazenda_id`, e esta tela
   * não é por fazenda. Todo talhão daquela cultura naquela safra pertence à mesma fazenda —
   * medido no Proto: as cinco combinações safra×cultura têm UMA fazenda cada. Pegar a do primeiro
   * talhão é, hoje, pegar a única.
   * ⚠ E SE UM DIA FOREM DUAS, a venda gravaria na primeira. Não é hipótese remota: o modelo
   * permite, e é por isso que o botão desliga quando não há fazenda em vez de gravar `null`.
   */
  const fazendaId = useMemo(
    () => talhoes.find(x => x.cultura === cultura)?.fazendaId ?? null,
    [talhoes, cultura]);

  const fin = useFinanceiroV2();
  useEffect(() => {
    void fin.loadContas();
    void fin.loadFornecedores();
  }, [fin.loadContas, fin.loadFornecedores]);

  const queryClient = useQueryClient();
  const [modalVenda, setModalVenda] = useState(false);
  const [salvandoVenda, setSalvandoVenda] = useState(false);

  const registrarVenda = async (p: VendaAvulsaPayload) => {
    if (!clienteId || !safraId || !cultura || !fazendaId) return;
    setSalvandoVenda(true);
    try {
      const { data, error } = await (supabase as any).rpc('agri_venda_avulsa_registrar', {
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
        p_fazenda_id: fazendaId, p_comprador_id: p.comprador_id, p_data: p.data,
        p_condicao: p.condicao, p_conta_id: p.conta_id, p_vencimento: p.vencimento,
        p_itens: p.itens,
      });
      if (error) { toast.error(error.message ?? 'Não foi possível registrar a venda.'); return; }
      const r = (data ?? {}) as { valor?: number };
      toast.success(`Venda registrada — ${formatMoeda(Number(r.valor) || 0)}.`);
      setModalVenda(false);
      /* ⚠ O ESTOQUE RECARREGA PORQUE O SALDO É DERIVADO: a venda virou entrega, e
         `fn_estoque_graos` já vai devolver o saldo menor. Não há baixa a escrever — há uma
         leitura a refazer. */
      await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
    } finally {
      setSalvandoVenda(false);
    }
  };

  /* ───────────────────────── A COTAÇÃO DE MERCADO ─────────────────────────
   * ⚠ ELA NÃO É UM LANÇAMENTO, e por isso não passa pelo financeiro: nada entrou, nada saiu, nada
   * mudou de mão. É a opinião do mercado sobre o grão que continua no armazém — o outro número da
   * decisão de vender, ao lado do preço que já se praticou.
   */
  const [modalCotacao, setModalCotacao] = useState(false);
  const [modalBalanco, setModalBalanco] = useState(false);
  const [salvandoCotacao, setSalvandoCotacao] = useState(false);

  const registrarCotacao = async (p: CotacaoGraosPayload) => {
    if (!clienteId || verTodas || !cultura) return;
    setSalvandoCotacao(true);
    try {
      const { data, error } = await (supabase as any).rpc('agri_cotacao_graos_registrar', {
        p_cliente: clienteId, p_cultura: cultura, p_data: p.data, p_fonte: p.fonte,
        p_itens: p.itens,
      });
      if (error) { toast.error(error.message ?? 'Não foi possível gravar a cotação.'); return; }
      /* ⚠ O CONTADOR DA RPC É O QUE SE ANUNCIA, não o que se mandou: ela pula item sem preço, e
         dizer "3 gravadas" quando ela gravou 1 seria a tela mentindo sobre o próprio efeito. */
      const r = (data ?? {}) as { gravadas?: number };
      const n = Number(r.gravadas) || 0;
      toast.success(`Cotação gravada — ${n} ${n === 1 ? 'classe' : 'classes'}.`);
      setModalCotacao(false);
      /* ⚠ RECARREGA PELO MESMO MOTIVO DA VENDA: o valor a mercado é DERIVADO da cotação dentro da
         RPC do estoque. Não há número a atualizar na tela — há uma leitura a refazer. */
      await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
    } finally {
      setSalvandoCotacao(false);
    }
  };

  /* ⚠ A ORDEM DAS CLASSES É A DA QUALIDADE, não a do valor: bom, fora de faixa, refugo. É como o
     produtor pensa o lote, e é a mesma ordem das entregas do barter. */
  const ordem = ['ate_20', 'acima_20', 'roca'];
  const ordenadas = useMemo(
    () => [...linhas].sort((a, b) => ordem.indexOf(a.classe) - ordem.indexOf(b.classe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas]);

  /** ⚠ ZERO EM SACAS É DADO ("colheu e entregou tudo"); zero em DINHEIRO é ausência. */
  const dinheiro = (v: number, saldo: number) => (saldo > 0 ? formatMoeda(v) : '—');

  /**
   * O lado do MERCADO — e ele exige mais que o lado da venda.
   *
   * ⚠ SÃO DUAS AUSÊNCIAS DIFERENTES CAINDO NO MESMO "—": não há grão (saldo zero) ou não há preço
   * (nunca se cotou). A do preço precisa dos DOIS testes, porque nenhum sozinho é fiel: a RPC
   * devolve `preco_mercado = 0` tanto para "nunca cotada" quanto para uma cotação real de zero, e
   * `data_mercado` sozinha não distingue essas duas. Exigir data E preço maior que zero é a
   * mesma regra que o modal de cotação aplica — se as duas telas divergissem, uma mostraria um
   * preço que a outra chama de ausente.
   */
  const temCotacao = (l: { data_mercado: string | null; preco_mercado: number }) =>
    !!l.data_mercado && l.preco_mercado > 0;

  return (
    <div className="w-full space-y-2 p-3 animate-fade-in">
      {/* ⚠ `items-start`, NÃO `items-end` — PR-HEADER-PADRAO. Com `items-end` o título de uma
          linha era empurrado para o rodapé de uma fila de 49px (rótulo + campo) e nascia 34px
          abaixo do topo, enquanto o da Conciliação nasce a 12px: era este o "título baixo". O
          par rótulo+campo continua alinhado por baixo entre si, no `div` da direita. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader titulo={tituloTela} />
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[170px]">
            <Label className="text-[10px]">Safra</Label>
            <Select value={safraId} onValueChange={setSafraId}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {safras.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-[12px]">
                    {s.codigo || s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[150px]">
            <Label className="text-[10px]">Cultura</Label>
            <Select value={cultura} onValueChange={setCultura}
              disabled={culturasDaSafra.length === 0}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder={culturasDaSafra.length === 0 ? 'Safra sem área' : 'Escolha'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS} className="text-[12px]">Todas</SelectItem>
                {culturasDaSafra.map(c => (
                  <SelectItem key={c} value={c} className="text-[12px]">{labelDaCultura(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* ⚠ O BOTÃO SÓ EXISTE NO DETALHE, e não é restrição de tela — é do dado: a cotação é por
              CULTURA e por classe, e em "Todas" não há cultura a cotar nem classes a listar. Deixá-lo
              visível e desligado pediria uma explicação para uma ação que ali não faz sentido nenhum.
              ⚠ E ELE FICA NO TOPO, junto dos seletores, não na barra de baixo: aqueles dois botões
              MOVIMENTAM grão; este só registra uma opinião de preço. Misturá-los sugeriria que
              atualizar a cotação mexe no estoque. */}
          {!verTodas && (
            <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
              title="Registrar o preço de mercado de hoje, por classe"
              onClick={() => setModalCotacao(true)}>
              <LineChart className="h-3.5 w-3.5" /> Atualizar cotação
            </Button>
          )}
          {/* ⚠ A MESMA REGRA DO VIZINHO, e isso é decisão, não coincidência: em "Todas" ele SOME,
              não fica visível e desligado. O balanço é POR CULTURA — a RPC é `(cliente, cultura)`
              e grão de culturas diferentes nem se mede na mesma unidade. Dois botões lado a lado
              seguindo regras opostas ensinariam que a ausência de um deles significa outra coisa.
              ⚠ E O LAYOUT NÃO SE DESLOCA porque os dois desaparecem juntos: a fila da direita
              encolhe como já encolhia, e o título continua onde estava, à esquerda. */}
          {!verTodas && (
            <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
              title="O estoque desta cultura safra a safra — o que entrou, o que saiu e o que atravessou"
              onClick={() => setModalBalanco(true)}>
              <History className="h-3.5 w-3.5" /> Balanço por safra
            </Button>
          )}
        </div>
      </div>

      {/* ── OS TRÊS NÚMEROS DO TOPO ──
          ⚠ ELES SOMAM O MESMO ARRAY QUE A TABELA MOSTRA, nunca uma segunda consulta: é o que
          garante que o cartão e a linha de total não possam discordar. */}
      {/* ⚠ EM "TODAS" OS CARTÕES SOMAM O RESUMO, não o detalhe: com nenhuma cultura escolhida o
          detalhe por classe nem foi buscado, e somar um array vazio mostraria zero sobre uma
          safra cheia de grão. */}
      {/* ⚠ SÃO DOIS EM "TODAS" E CINCO NO DETALHE. Os três que faltam lá faltam por motivos
          diferentes, e vale distinguir: "Cotação de" e "Valor de venda" dependem da CLASSE, e o
          resumo não desce a classe; "Em estoque" saiu por outra razão, abaixo. */}
      <div className={cn('grid gap-1.5', verTodas ? 'md:grid-cols-2' : 'md:grid-cols-5')}>
        {/* ⚠⚠ O CARTÃO DE ESTOQUE NÃO EXISTE EM "TODAS", e a ausência é a correção: ele somava o
            saldo de TODAS as culturas num número só e o rotulava "sc" — saca de amendoim com
            tonelada de mandioca, a mesma conta que a coluna única da tabela fazia antes de virar
            três colunas por unidade. Acertava por acaso enquanto a mandioca estava zerada, e
            viraria mentira no primeiro lançamento dela.
            ⚠ NÃO FOI SUBSTITUÍDO POR TRÊS CARTÕES porque a tabela logo abaixo já responde, por
            unidade, com total por coluna. Dois lugares para o mesmo número é onde um deles
            envelhece.
            ⚠ E O `saldo` SAIU DO `totalResumo` JUNTO: uma soma crua de unidades diferentes sem
            ninguém para lê-la é um convite para o próximo consumidor. O que sobrou lá é o `valor`,
            que soma legitimamente — real é real, venha de saca ou de tonelada. */}
        {!verTodas && (
          <Cartao rotulo="Em estoque" escopo="esta safra" unidade="sc"
            valor={formatNum(t.saldo, 2)} />
        )}
        {/* ⚠ O NOME DIZ DE QUE PREÇO SE FALA, e é essa regra que renomeou o cartão do "Todas". Os
            dois são estimativa; o que os separa é a ORIGEM do preço — um já foi praticado, o outro
            é a cotação de hoje. Enquanto o resumo avaliava pelo preço médio de venda, "Valor
            estimado" servia; agora ele avalia A MERCADO, e manter o nome antigo faria a MESMA
            conta ter dois nomes entre a lista e o detalhe — que é a divergência que este PR
            fechou no banco. */}
        <Cartao rotulo={verTodas ? 'Valor a mercado' : 'Valor de venda'}
          escopo={verTodas ? 'esta safra' : undefined} unidade="R$"
          valor={formatNum(verTodas ? totalResumo.valor : t.valor, 2)}
          titulo={formatMoeda(verTodas ? totalResumo.valor : t.valor)} cor="text-success" />
        {!verTodas && (
          <Cartao rotulo="Valor a mercado" escopo="esta safra" unidade="R$"
            valor={formatNum(t.valorMercado, 2)}
            titulo={formatMoeda(t.valorMercado)} cor="text-success" />
        )}
        {/* ⚠ O CARTÃO DA DATA É O QUE DÁ VALIDADE AO OUTRO: "R$ 1,39 mi a mercado" sem dizer de
            quando é o preço convida a usar uma cotação de três meses atrás numa negociação de hoje.
            ⚠ "—" QUANDO NUNCA SE COTOU, e o cartão continua na tela: sumir com ele esconderia que
            existe uma cotação a preencher. */}
        {!verTodas && (
          <Cartao rotulo="Cotação de"
            valor={t.dataMercado ? formatIsoToBr(t.dataMercado) : '—'} />
        )}
        {/* ⚠ O "% PARADO" NÃO GANHA COR: estoque alto não é bom nem ruim por si — depende do
            preço que o produtor está esperando. Pintá-lo de vermelho seria dar um conselho que
            a tela não tem como sustentar.
            ⚠ E EM "TODAS" ELE É "—", não zero: `fn_estoque_graos_resumo` devolve saldo e valor,
            não o COLHIDO — sem denominador não há percentual, e 0,0% afirmaria que nada ficou
            parado quando o que falta é a conta. */}
        <Cartao rotulo="% colhido parado" unidade={verTodas ? undefined : '%'}
          valor={verTodas ? '—' : formatNum(t.pctParado, 1)} />
      </div>

      {rotuloRecorte}

      {/* ── "TODAS": UMA LINHA POR CULTURA ──
          ⚠ ELA NÃO REPETE O DETALHE POR CLASSE, e é de propósito: a pergunta de quem abre em
          "Todas" é "onde está meu grão", não "como ele se divide". O detalhe fica a um clique. */}
      {verTodas ? (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {['28%', '16%', '16%', '16%', '24%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className={cn(TH, 'text-left')}>Cultura</th>
                {COLUNAS_UNIDADE.map(c => (
                  <th key={c.chave} className={cn(TH, 'text-right')}>{c.titulo}</th>
                ))}
                <th className={cn(TH, 'text-right')}>Valor a mercado</th>
              </tr>
            </thead>
            <tbody>
              {resumo.erro ? (
                <tr><td colSpan={5} className="px-2 py-6 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Não foi possível carregar o estoque.
                  </span>
                  <div className="mt-1 text-[10px] text-muted-foreground" title={resumo.erro.message}>
                    O saldo não foi lido — o dado continua no banco.
                  </div>
                </td></tr>
              ) : resumo.carregando ? (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                  </span>
                </td></tr>
              ) : resumo.culturas.length === 0 ? (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                  Esta safra ainda não tem área cadastrada.
                </td></tr>
              ) : resumo.culturas.map(c => (
                /* ⚠ A LINHA INTEIRA É O BOTÃO, não um ícone no fim: o gesto é "quero ver esta
                    cultura", e o alvo é o nome dela. */
                <tr key={c.cultura}
                  className="cursor-pointer border-t border-slate-100 hover:bg-[#1e3a5f]/[0.06]"
                  onClick={() => setCultura(c.cultura)}
                  tabIndex={0} role="button"
                  aria-label={`Ver o estoque de ${labelDaCultura(c.cultura)} por classe`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCultura(c.cultura); }
                  }}>
                  <td className="truncate px-2 py-1 text-[11px] font-medium">
                    {labelDaCultura(c.cultura)}
                    {/* ⚠ A MARCA SÓ APARECE SE A UNIDADE NÃO COUBER EM COLUNA NENHUMA, e aí ela é
                        obrigatória: sem ela a linha mostraria três traços e o operador leria
                        "sem estoque" onde o certo é "não sei em que coluna pôr". */}
                    {colunaDaCultura(c.cultura) === null && (
                      <span className="ml-1 text-[10px] text-destructive"
                        title="Esta cultura se mede numa unidade que ainda não tem coluna — o saldo não está somado em nenhum total.">
                        ⚠
                      </span>
                    )}
                  </td>
                  {/* ⚠ CADA CULTURA PREENCHE UMA COLUNA SÓ, a da sua unidade; as outras duas são
                      "—". E o "—" aqui não é ausência de dado — é "esta cultura não se mede
                      assim", que é por que a coluna própria mostra `0,00` quando o estoque é zero
                      em vez de traço: zero em tonelada é resposta, tonelada de amendoim não é
                      pergunta. */}
                  {COLUNAS_UNIDADE.map(col => {
                    const minha = colunaDaCultura(c.cultura) === col.chave;
                    return (
                      <td key={col.chave}
                        className={cn('px-2 py-1 text-right text-[11px] tabular-nums',
                          minha && c.saldo > 0 && 'text-success',
                          !minha && 'text-muted-foreground')}>
                        {minha ? formatNum(c.saldo, 2) : '—'}
                      </td>
                    );
                  })}
                  {/* ⚠ "—" QUANDO O VALOR É ZERO, nunca "R$ 0,00": a RPC devolve zero quando
                      NENHUMA CLASSE daquela cultura foi cotada — é o caso da mandioca na 25/26.
                      "R$ 0,00" ao lado de 44 mil sacas afirmaria que elas não valem nada, e o que
                      falta é o preço, não o valor.
                      ⚠ E É `valor > 0` PORQUE NÃO HÁ OUTRA SENTINELA: o payload do resumo não traz
                      `data_mercado` como o do detalhe. Uma cotação registrada a R$ 0,00 — o CHECK
                      admite — apareceria aqui como ausência. */}
                  <td className="px-2 py-1 text-right text-[11px] font-medium tabular-nums">
                    {c.valor > 0 ? formatMoeda(c.valor) : '—'}
                  </td>
                </tr>
              ))}
              {resumo.culturas.length > 0 && !resumo.erro && !resumo.carregando && (
                <tr className={cn(CINZA_CABECALHO, 'text-white')}>
                  <td className="px-2 py-1 text-[11px] font-bold">Total</td>
                  {/* ⚠ CADA COLUNA SOMA A SUA, e é só isso que torna este total legítimo: antes
                      havia UM total somando saca com tonelada, e o número não media nada. Aqui
                      não existe "o total de sacas" — existe o de 25 kg, o de 60 kg e o de
                      toneladas, e eles não se somam entre si nem aqui nem em lugar nenhum. */}
                  {COLUNAS_UNIDADE.map(col => {
                    const soma = totaisPorUnidade.get(col.chave);
                    return (
                      <td key={col.chave} className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                        {soma === undefined ? '—' : formatNum(soma, 2)}
                      </td>
                    );
                  })}
                  {/* ⚠ O R$ SOMA TUDO, e é a única coluna que pode: real é real, venha de saca ou
                      de tonelada. É por isso que ele fica do lado de fora das três — a linha
                      inteira ensina onde a soma vale e onde não vale. */}
                  <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                    {totalResumo.valor > 0 ? formatMoeda(totalResumo.valor) : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed border-collapse">
          {/* ⚠ A LARGURA ANDOU COM A COLUNA, e isto nao e' detalhe: `colgroup` e' POSICIONAL.
              Mover "Saldo sc" no `thead` sem mover o `10%` dele aqui nao quebraria nada visivel —
              so' daria a largura do saldo para a coluna de Venda e a de Venda para o saldo, calado.
              A soma continua 100%: 18+10+10+8+10+11+10+11+12. */}
          <colgroup>
            {['18%', '10%', '10%', '8%', '10%', '11%', '10%', '11%', '12%'].map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>Classe</th>
              <th className={cn(TH, 'text-right')}>Colhido</th>
              <th className={cn(TH, 'text-right')}>Entregue</th>
              <th className={cn(TH, 'text-right')}>Quebra</th>
              {/* ⚠ OS DOIS GRUPOS SÃO DOIS PREÇOS DIFERENTES SOBRE O MESMO GRÃO, e a borda existe
                  para que ninguém some as duas colunas de valor. À esquerda, o que JÁ SE VENDEU
                  (média ponderada das entregas); à direita, o que o mercado paga HOJE. "R$ 1,2 mi"
                  numa e "R$ 1,39 mi" na outra não são duas parcelas — são duas respostas para a
                  mesma pergunta, e o operador escolhe qual usar.
                  ⚠ OS RÓTULOS SÃO CURTOS PORQUE NOVE COLUNAS NÃO CABEM COM NOMES LONGOS, e a conta
                  é literal: com "R$ / sc venda" e "Valor a mercado" o cabeçalho passava a duas
                  linhas abaixo de 920px de tabela; com estes, abaixo de 635px. Guardar a unidade no
                  rótulo quase não ajudava — "Venda R$/sc" só desceria para 872px —, então ela saiu
                  do cabeçalho e ficou no `title` e na nota do rodapé, que é onde há espaço para
                  dizer que uma coluna é preço por saca e a outra é o total.
                  ⚠ E É A BORDA QUE DESAMBIGUA OS DOIS "VALOR": sozinhos, "Valor" e "A mercado" não
                  diriam de que lado cada um está. O rótulo encurtou porque a divisa carrega o
                  sentido — tirar a borda e manter estes nomes seria pior que o cabeçalho de duas
                  linhas. */}
              <th className={cn(TH, 'text-right')} title="Preço médio por saca já praticado nas entregas">
                Venda
              </th>
              <th className={cn(TH, 'text-right')} title="Saldo × preço médio já praticado">
                Valor
              </th>
              {/* ⚠ O SALDO FECHA O GRUPO DA ESQUERDA, encostado na divisa: ele e' a quantidade que
                  as duas colunas de valor multiplicam, e' o que o `Mercado` do outro lado tambem
                  multiplica, e a leitura da linha termina nele — Colhido, Entregue, Quebra, a que
                  preco, quanto da', e o que sobrou. */}
              <th className={cn(TH, 'text-right')}>Saldo sc</th>
              <th className={cn(TH, SEP_TH, 'text-right')} title="Última cotação de mercado por saca">
                Mercado
              </th>
              <th className={cn(TH, 'text-right')} title="Saldo × última cotação de mercado">
                A mercado
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ⚠ OS TRÊS ESTADOS SEPARADOS, a lição das listas do barter: uma falha de leitura
                renderizada como "nenhum grão" afirmaria que não há o que vender. */}
            {erro ? (
              <tr><td colSpan={9} className="px-2 py-6 text-center">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Não foi possível carregar o estoque.
                </span>
                <div className="mt-1 text-[10px] text-muted-foreground" title={erro.message}>
                  O saldo não foi lido — o dado continua no banco.
                </div>
              </td></tr>
            ) : carregando ? (
              <tr><td colSpan={9} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                </span>
              </td></tr>
            ) : ordenadas.length === 0 ? (
              <tr><td colSpan={9} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                Esta cultura ainda não tem colheita lançada nesta safra.
              </td></tr>
            ) : ordenadas.map(l => (
              <tr key={l.classe} className="border-t border-slate-100">
                <td className="truncate px-2 py-0.5 text-[11px]">
                  {/* ⚠ O PONTO ACOMPANHA O RÓTULO, nunca o substitui: quem não distingue as
                      cores continua lendo "Acima de 20 ppb". A cor é a mesma da composição do
                      barter — o mesmo grão, o mesmo código visual. */}
                  <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                    corDaClasse(l.classe))} />
                  {labelDaClasse(l.classe)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                  {formatNum(l.colhido, 2)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatNum(l.entregue, 2)}
                </td>
                {/* ⚠ QUEBRA É SEMPRE ZERO NESTA FATIA — a baixa por quebra é a F2. A coluna já
                    existe para a tabela não mudar de forma quando ela chegar, e o zero aqui é
                    verdade: nada foi baixado ainda. */}
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatNum(0, 2)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                  {dinheiro(l.preco_ref, l.saldo)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                  {dinheiro(l.valor, l.saldo)}
                </td>
                <td className={cn('px-2 py-0.5 text-right text-[11px] font-medium tabular-nums',
                  l.saldo > 0 && 'text-success')}>
                  {formatNum(l.saldo, 2)}
                </td>
                {/* ⚠ O PREÇO DE MERCADO APARECE MESMO COM SALDO ZERO, e o de venda não: eles
                    respondem coisas diferentes. "R$/sc venda" com zero saca seria a média de um
                    lote que já saiu inteiro — informação de arquivo. A cotação, não: ela é do
                    mercado, vale para a classe que ainda vai colher, e escondê-la faria o operador
                    achar que a cotação não foi gravada. O VALOR, sim, depende do saldo. */}
                <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground',
                  SEP_TD)}>
                  {temCotacao(l) ? formatMoeda(l.preco_mercado) : '—'}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                  {temCotacao(l) && l.saldo > 0 ? formatMoeda(l.valor_mercado) : '—'}
                </td>
              </tr>
            ))}
            {ordenadas.length > 0 && !erro && !carregando && (
              <tr className={cn(CINZA_CABECALHO, 'text-white')}>
                <td className="px-2 py-1 text-[11px] font-bold">Total</td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(t.colhido, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(t.entregue, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(0, 2)}
                </td>
                {/* ⚠ NENHUMA DAS DUAS COLUNAS DE R$/sc TEM TOTAL: a média de três preços de
                    classes diferentes não é um preço que alguém pratica. Vazio aqui é mais honesto
                    que um número — e vale igual para a venda e para o mercado. */}
                <td className="px-2 py-1" />
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {t.saldo > 0 ? formatMoeda(t.valor) : '—'}
                </td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(t.saldo, 2)}
                </td>
                <td className={cn('px-2 py-1', SEP_TH)} />
                {/* ⚠ O TOTAL A MERCADO SOMA SÓ AS CLASSES COTADAS, porque é isso que `valor_mercado`
                    já é: a RPC multiplica pelo preço da classe, e quem não tem cotação contribui
                    com zero. O número é honesto, mas PARCIAL quando falta cotar alguma classe — e é
                    o cartão "Cotação de" que denuncia a idade do preço. */}
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {t.saldo > 0 && t.valorMercado > 0 ? formatMoeda(t.valorMercado) : '—'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* ⚠ OS DOIS BOTÕES NASCEM DESABILITADOS E DIZEM POR QUÊ — a regra da OC: o motivo fica
          escrito, não só no `title`. Eles existem desde já porque um saldo sem nenhuma ação à
          vista parece um número que ninguém pode mexer, e o operador iria procurar a saída em
          outra tela. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* ⚠ O MOTIVO DE ESTAR DESLIGADO FICA ESCRITO AO LADO, não só no `title` — regra da OC.
            E são motivos DIFERENTES: sem saldo não há o que vender; sem fazenda a venda não tem
            onde ser gravada, e gravar `null` poria a receita fora de qualquer fazenda. */}
        {/* ⚠ EM "TODAS" NÃO SE VENDE: a venda grava UMA cultura na operação, e o modal pede as
            classes de uma só. Escolher a cultura é o primeiro passo da venda, não um detalhe —
            e o motivo fica escrito, como os outros dois. */}
        <Button size="sm" variant="acao" className="h-8 gap-1 px-2 text-[11px]"
          disabled={verTodas || t.saldo <= 0 || !fazendaId}
          title={verTodas ? 'Escolha uma cultura para vender.'
            : t.saldo <= 0 ? 'Não há grão em estoque para vender.'
              : !fazendaId ? 'Esta cultura não tem fazenda resolvida nesta safra.'
                : 'Registrar uma venda do estoque'}
          onClick={() => setModalVenda(true)}>
          <Plus className="h-3.5 w-3.5" /> Registrar saída (venda avulsa)
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]" disabled
          title="Em breve — a baixa por quebra é a próxima fatia.">
          <TrendingDown className="h-3.5 w-3.5" /> Baixar por quebra
        </Button>
        {verTodas ? (
          <span className="text-[10px] text-muted-foreground">Escolha uma cultura para vender.</span>
        ) : t.saldo <= 0 && !carregando && !erro && (
          <span className="text-[10px] text-muted-foreground">Sem grão em estoque.</span>
        )}
      </div>

      <VendaAvulsaModal
        aberto={modalVenda}
        onFechar={() => setModalVenda(false)}
        onRegistrar={p => { void registrarVenda(p); }}
        salvando={salvandoVenda}
        estoque={linhas}
        cultura={cultura}
        safraRotulo={safraRotulo}
        fornecedores={fin.fornecedores}
        contas={fin.contasBancarias}
      />

      {/* ⚠ A DATA DA COTAÇÃO VEM DAQUI, não da RPC do balanço: `fn_estoque_graos_balanco` não
          devolve data, e `t.dataMercado` já é a mais recente entre as classes — a consulta que a
          alimenta NÃO filtra cotação por safra, então ela é a da cultura. Mudar a RPC por um
          rodapé seria alterar contrato versionado para ler algo que a tela já tem na mão.
          ⚠ O LIMITE, E ELE É REAL: `linhas` traz as classes que existem NA SAFRA ABERTA. Uma
          classe cotada que não aparece naquela safra não entra nesta conta, e o rodapé mostraria
          uma data mais velha que a última cotação. Hoje o amendoim tem as três classes em todas
          as safras com colheita, então não acontece. */}
      <BalancoSafrasModal
        aberto={modalBalanco}
        onFechar={() => setModalBalanco(false)}
        clienteId={clienteId}
        cultura={verTodas ? '' : cultura}
        dataCotacao={t.dataMercado}
      />

      <CotacaoGraosModal
        aberto={modalCotacao}
        onFechar={() => setModalCotacao(false)}
        onRegistrar={p => { void registrarCotacao(p); }}
        salvando={salvandoCotacao}
        estoque={linhas}
        cultura={cultura}
        safraRotulo={safraRotulo}
      />

      <p className="text-[10px] leading-snug text-muted-foreground">
        {/* ⚠ A RESSALVA DA SAFRA INTEIRA SAIU COM O FILTRO: enquanto a RPC não aceitava cultura,
            as sacas de duas culturas colhidas somavam na mesma classe e a nota tinha de avisar.
            Agora o recorte é o que o topo diz, e repetir o aviso confundiria. */}
        {verTodas
          /* ⚠ A NOTA MUDA COM A VISÃO porque a conta muda: no resumo o valor é uma ESTIMATIVA
              pela última cotação lançada, e dizer isso é o que impede o operador de levar o
              número a uma negociação como se fosse preço firme.
              ⚠ E ELA DIZ QUE O TOTAL SOMA: reais somam entre culturas de unidades diferentes
              (amendoim em saca, mandioca em tonelada) e sacas não. Sem essa linha, um total em R$
              sobre uma coluna de sacas que não somam pareceria erro de conta. */
          ? <>Saldo por cultura = Colhido − Entregue. O valor é <strong>estimativa</strong>: usa a
              última cotação de mercado lançada para cada classe, não um preço já praticado. Sacas
              de <strong>25 kg</strong> (amendoim) e de <strong>60 kg</strong> (soja, milho) e
              <strong> toneladas</strong> (mandioca, cana) não se somam entre si — cada uma na sua
              coluna. O R$ soma tudo.</>
          /* ⚠ A NOTA CARREGA A UNIDADE QUE O CABEÇALHO PERDEU: "Venda" e "Mercado" são R$ por
              SACA, "Valor" e "A mercado" são o total. Com nove colunas o rótulo não comporta a
              distinção, e ela não pode ficar só no `title` — quem lê num relatório impresso ou
              numa captura de tela não tem mouse. */
          : <>Saldo = Colhido − Entregue (barter/venda) − Quebra, por safra, cultura e classe.
              <strong> Venda</strong> e <strong>Mercado</strong> são R$ por saca; <strong>Valor</strong> e
              <strong> A mercado</strong>, o total do saldo. O primeiro par usa o preço médio já
              praticado naquela classe, o segundo a última cotação lançada — os dois avaliam o mesmo
              grão e não se somam.</>}
      </p>
    </div>
  );
}
