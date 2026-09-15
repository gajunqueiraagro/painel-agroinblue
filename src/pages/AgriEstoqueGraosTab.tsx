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
import { QuebraModal, type QuebraPayload } from '@/components/agri/QuebraModal';
import { MovimentacoesEstoqueModal, type QuebraEdicaoPayload } from '@/components/agri/MovimentacoesEstoqueModal';
import { VendasGraosModal } from '@/components/agri/VendasGraosModal';
import { CINZA_CABECALHO, TH_CINZA as TH } from '@/lib/idiomaVisual';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { unidadeDaCultura, kgPorUnidade, rotuloCulturaUnidade, unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import { useEstoqueGraos, totaisDoEstoque, useEstoqueGraosResumo, useEstoqueMovimentacoes, useVendasGraos, useLancamentosSubstituiveis } from '@/hooks/useEstoqueGraos';
import type { VendaGrao } from '@/hooks/useEstoqueGraos';
import { VendaGraosModal, type VendaGraosPayload } from '@/components/agri/VendaGraosModal';
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
 * A DIVISA ENTRE O QUE JÁ ACONTECEU E A POSIÇÃO DE HOJE — abre em "Saldo sc".
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

/**
 * Cabeçalho de duas linhas: nome em cima, unidade embaixo — a mesma peça do histórico de vendas.
 *
 * ⚠ A UNIDADE SAIU DO NOME E DESCEU UMA LINHA. Com ela no rótulo ("Venda R$/sc") o cabeçalho
 * quebrava em duas linhas abaixo de 872px e o `title` virava o único lugar que dizia se a coluna
 * era preço ou total. Em duas linhas o nome fica curto, a unidade fica escrita, e a altura é a
 * mesma para as nove colunas.
 */
const Th2 = ({ nome, unidade, esq, className }: {
  nome: string; unidade?: string; esq?: boolean; className?: string;
}) => (
  <th className={cn(TH, 'whitespace-nowrap align-bottom', esq ? 'text-left' : 'text-right', className)}>
    <div className="text-[11px] font-medium normal-case leading-[1.15] tracking-normal">{nome}</div>
    <div className="text-[10px] font-normal normal-case leading-[1.15] tracking-normal opacity-70">{unidade || ' '}</div>
  </th>
);

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
   * ⚠ SO' A RAIZ E' CLICA'VEL. O `›` e o nome da cultura sao texto: se tudo fosse alvo, o gesto de
   * "voltar" competiria com o de "estou aqui", e o operador clicaria no proprio lugar em que ja'
   * esta'.
   * ⚠ A UNIDADE SAIU DAQUI no PR-ESTOQUE-POLISH — ela vive no rótulo do recorte, abaixo, e o
   * `rotuloUnidade` que a montava à mão morreu com ela: quem escreve a unidade agora é
   * `rotuloCulturaUnidade`, em `colheita.ts`.
   */
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
   * O RECORTE — a legenda da tabela: cultura, unidade e safra.
   *
   * ⚠ ELE SAIU DO BREADCRUMB, não sumiu. O título responde "onde estou" e a resposta é um caminho:
   * Estoque de Grãos › Amendoim. Unidade e safra não são lugar — são o RECORTE do que a tabela
   * abaixo mostra, e é ao lado dela que fazem trabalho.
   * ⚠ A SAFRA VOLTOU. Ela saiu daqui um PR atrás com o argumento de que o seletor do topo já a
   * mostrava; na tela não se sustentou — quem lê a tabela olha para a tabela, e "de que safra é
   * este saldo" é pergunta da legenda, não do controle que fica dois blocos acima. Decisão do
   * Gabriel, 15/09/2026.
   * ⚠ E É POR ISSO QUE ELE NÃO EXISTE EM "TODAS": lá a tabela tem uma linha por cultura, cada uma
   * com a sua unidade em coluna própria, e não há um recorte único a declarar.
   * ⚠ A CULTURA E A UNIDADE VÊM DE `rotuloCulturaUnidade`, a MESMA função que o modal de venda e o
   * do balanço usam — três textos escritos à mão é a lição do `Cartao` e do cinza do cabeçalho. A
   * seta e a safra são decoração DESTA tela e não entram no helper: nos modais não há "Todas" para
   * onde voltar, e o contexto da safra já está no cabeçalho deles.
   * ⚠ A SETA É O SEGUNDO CAMINHO DE VOLTA, ao lado do "Estoque de Grãos" clicável do título. Dois
   * caminhos para o mesmo gesto não é duplicação: o operador que está lendo a tabela tem a mão
   * aqui embaixo, e subir até o título para voltar é o tipo de viagem que faz ninguém voltar.
   * ⚠ SÓ A SETA É ALVO. O resto é texto — se a linha inteira clicasse, ler a legenda viraria
   * navegar sem querer.
   * ⚠ `-mb-1.5` COLA NA TABELA: o container é `space-y-2` (8px entre irmãos), e uma legenda a 8px
   * da tabela que ela legenda flutua no meio do caminho. Com −6px sobram 2px — perto o bastante
   * para o olho ler as duas como uma coisa só.
   */
  /**
   * A TEMPORADA, sem o sufixo de escopo — "25/26" a partir de "25/26-Lav".
   *
   * ⚠ NÃO HÁ COLUNA LIMPA NO BANCO, e eu procurei antes de recortar: `financeiro_safras` tem
   * `codigo` ("25/26-Lav"), `nome` ("Safra 25/26 Lavoura") e `ciclo` ("anual"). Nenhuma guarda a
   * temporada sozinha. MEDIDO nas 9 safras de agricultura do Proto: todas têm `-`, e o pedaço
   * antes dele é exatamente a temporada (23/24, 24/25, 25/26, 26/27).
   * ⚠ SEM `-`, FICA INTEIRO. É o caso de uma safra que caia no `nome` por falta de `codigo`:
   * melhor um rótulo longo e verdadeiro que um recorte no lugar errado.
   */
  const temporada = safraRotulo.split('-')[0].trim();

  const rotuloRecorte = verTodas ? (
    /* ⚠ MESMA POSIÇÃO E MESMAS CLASSES do rótulo por cultura — é o SLOT, não dois enfeites
       parecidos. Só o conteúdo muda: aqui não há seta, porque "Todas" É a raiz e não há para
       onde voltar; uma seta inerte ensinaria que existe um nível acima.
       ⚠ A TEMPORADA SÓ ENTRA QUANDO HÁ SAFRA: sem ela, "· safra " sairia pendurado. */
    <p className="-mb-1.5 text-[11px] text-foreground">
      Estoque ativo{temporada && <> · safra {temporada}</>}
    </p>
  ) : (
    <p className="-mb-1.5 text-[11px] text-foreground">
      <button type="button" onClick={() => setCultura(TODAS)}
        title="Voltar para todas as culturas"
        className="mr-1 rounded px-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        ‹
      </button>
      {rotuloCulturaUnidade(cultura)}
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
   * O "% COLHIDO PARADO" DA SAFRA INTEIRA — o cartão que em "Todas" mostrava "—".
   *
   * ⚠ A CONTA É EM QUILO, e é a única forma de ela existir: duas culturas da mesma safra podem
   * estar em unidades diferentes (amendoim em saca de 25 kg, mandioca em tonelada), e somar
   * "sacas" com "toneladas" para dividir uma soma pela outra daria um número que não mede nada.
   * O quilo é o denominador comum, e o peso vem de `kgPorUnidade` — nunca de um 25 ou um 1000
   * escrito aqui.
   * ⚠ O QUILO NÃO APARECE NA TELA. Ele entra na divisão e sai dela: o operador vê só o
   * percentual, porque quilo é unidade de cálculo e saca é a unidade em que ele pensa.
   * ⚠ `null` QUANDO NÃO HÁ COLHEITA, nunca 0,0%: safra sem colheita não tem grão parado — ela
   * não tem grão nenhum, e 0,0% afirmaria que tudo foi vendido.
   * ⚠ E NÃO TOCA NO DETALHE: com uma cultura escolhida o percentual continua saindo de
   * `totaisDoEstoque.pctParado`, em sacas, onde a unidade é uma só e a conversão seria ruído.
   */
  const pctParadoTodas = useMemo(() => {
    let paradoKg = 0;
    let colhidoKg = 0;
    for (const c of resumo.culturas) {
      const kg = kgPorUnidade(c.cultura);
      paradoKg += c.saldo * kg;
      colhidoKg += c.colhido * kg;
    }
    return colhidoKg > 0 ? (paradoKg / colhidoKg) * 100 : null;
  }, [resumo.culturas]);

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
  /* ⚠ AQUI EM CIMA, e não junto do cancelamento: `substituiveis` lê este estado para saber se
     há uma correção aberta, e o gate de TDZ acusa uso acima da declaração. É ordem, não lógica. */
  const [vendaAberta, setVendaAberta] = useState<{ venda: VendaGrao; modo: 'visualizar' | 'editar' | 'corrigir' } | null>(null);
  const [salvandoVenda, setSalvandoVenda] = useState(false);

  /* ⚠ TAMBÉM NA CORREÇÃO: quem corrige uma venda pode estar justamente substituindo um
     lançamento manual que ficou de fora da primeira vez. Os lançamentos da venda ANTIGA não
     entram na lista — a RPC os cancela sozinha, por outro caminho. */
  const substituiveis = useLancamentosSubstituiveis(
    clienteId, safraId || null, verTodas ? null : (cultura || null),
    modalVenda || vendaAberta?.modo === 'corrigir');

  /**
   * ⚠ UMA CHAMADA SÓ — `agri_venda_graos_registrar` grava a operação, as entregas, o Senar, os
   * descontos e UM lançamento por parcela, e ainda cancela os manuais substituídos. Fatiar isso em
   * várias chamadas do front seria recriar, sem transação, o que a RPC faz dentro de uma.
   * ⚠ DOIS ERROS VIRAM FRASE porque são decisões do operador, não defeitos: parcelas que não
   * fecham e lançamento conciliado na substituição. Os outros vão crus — são nomeados e legíveis.
   */
  const erroDaVendaNova = (msg: string) => (
    /PARCELAS_NAO_FECHAM_LIQUIDO/.test(msg)
      ? 'As parcelas não somam o líquido da venda.'
      : /SUBSTITUIR_LANCAMENTO_CANCELADO_OU_CONCILIADO/.test(msg)
        ? 'Um dos lançamentos marcados já foi cancelado ou conciliado — desmarque e tente de novo.'
        : msg || 'Não foi possível registrar a venda.');

  const registrarVenda = async (p: VendaGraosPayload) => {
    if (!clienteId || !safraId || !cultura || !fazendaId) return;
    setSalvandoVenda(true);
    try {
      const { data, error } = await (supabase as any).rpc('agri_venda_graos_registrar', {
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
        p_fazenda_id: fazendaId, p_comprador_id: p.comprador_id, p_data: p.data,
        p_itens: p.itens, p_valor_bruto: p.valor_bruto, p_senar: p.senar,
        p_descontos: p.descontos, p_parcelas: p.parcelas,
        p_observacoes: p.observacoes, p_substituir: p.substituir,
        /* ⚠ A CHAMADA É POR NOME, e por isso a assinatura nova (15 argumentos) não a quebrou:
           `supabase-js` manda um objeto e o PostgREST casa por nome de parâmetro. Fosse
           posicional, acrescentar dois argumentos teria trocado o significado de todos. */
        p_documento: p.documento, p_tipo_documento: p.tipo_documento,
      });
      if (error) { toast.error(erroDaVendaNova(error.message ?? '')); return; }
      const r = (data ?? {}) as { lancamentos?: unknown[]; liquido?: number };
      const n = Array.isArray(r.lancamentos) ? r.lancamentos.length : 0;
      toast.success(`Venda registrada: ${n} lançamento${n === 1 ? '' : 's'} no Financeiro.`);
      setModalVenda(false);
      /* ⚠ AS TRÊS LEITURAS: o saldo caiu (estoque), a lista de saídas cresceu (vendas) e os
         candidatos a substituição mudaram (os marcados foram cancelados). */
      await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
      await queryClient.invalidateQueries({ queryKey: ['vendas-graos'] });
      await queryClient.invalidateQueries({ queryKey: ['lancamentos-substituiveis'] });
    } finally {
      setSalvandoVenda(false);
    }
  };

  /* ───────────────────────── A BAIXA POR QUEBRA (F2) ─────────────────────────
   * ⚠ ELA MORA AQUI, ao lado da venda, e não num hook: é o mesmo lugar de onde
   * `agri_venda_avulsa_registrar` é chamada, e separar as duas escritas da mesma tela em camadas
   * diferentes faria a próxima pessoa procurar a segunda no lugar errado.
   * ⚠ E É UMA CHAMADA POR CLASSE — DÍVIDA CONHECIDA, a mesma da venda em outra forma. A RPC é
   * `(classe, quantidade)`, então baixar três classes são três `rpc`, SEM transação: se a segunda
   * falhar, a primeira já gravou. Aceitável hoje porque a guarda do banco é por classe e uma falha
   * parcial deixa o estoque CORRETO (só menos baixado do que se quis), e porque o operador vê o
   * resultado na tela recarregada. Uma `agri_quebra_registrar_lote(p_itens jsonb)` resolveria —
   * é frente própria, não deste PR.
   */
  const [modalQuebra, setModalQuebra] = useState(false);
  const [salvandoQuebra, setSalvandoQuebra] = useState(false);

  const registrarQuebra = async (p: QuebraPayload) => {
    if (!clienteId || !safraId || !cultura) return;
    setSalvandoQuebra(true);
    try {
      let gravadas = 0;
      for (const it of p.itens) {
        const { error } = await (supabase as any).rpc('agri_quebra_registrar', {
          p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
          p_classe: it.classe, p_quantidade: it.quantidade, p_data: p.data,
          p_motivo: p.motivo, p_observacoes: p.observacoes,
        });
        if (error) {
          /* ⚠ A MENSAGEM DA RPC VAI INTEIRA PARA O TOAST — `QUEBRA_ACIMA_DO_SALDO: 50 > 10` diz
             o que a tela precisaria repetir, e com os números do BANCO, que são os que valem.
             ⚠ E O MODAL FICA ABERTO: o operador corrige a linha e tenta de novo, sem redigitar as
             outras classes. */
          toast.error(error.message ?? 'Não foi possível registrar a quebra.');
          if (gravadas > 0) await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
          return;
        }
        gravadas++;
      }
      toast.success(`Quebra registrada — ${gravadas} classe${gravadas > 1 ? 's' : ''}.`);
      setModalQuebra(false);
      /* ⚠ O ESTOQUE RECARREGA PORQUE O SALDO É DERIVADO, exatamente como na venda: a quebra virou
         linha em `agri_estoque_movimentacoes` e `fn_estoque_graos` já subtrai. Mesma chave, mesma
         invalidação — não há um segundo caminho de reload. */
      await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
    } finally {
      setSalvandoQuebra(false);
    }
  };

  /* ───────────────────────── O HISTÓRICO DA QUEBRA (F2.1) ─────────────────────────
   * ⚠ A LISTA SÓ CARREGA COM O MODAL ABERTO: é o mesmo `enabled` do resumo e do balanço. Buscar
   * o histórico a cada troca de cultura seria uma ida ao banco por gesto de navegação, sem
   * ninguém para ler.
   * ⚠ CANCELAR INVALIDA AS DUAS CHAVES, EDITAR SÓ UMA — e a diferença é a conta: cancelar tira a
   * quebra do saldo (`ativo=false`, e as três leituras filtram `ativo`), então a tabela atrás
   * muda; editar mexe em data, motivo e observação, que não entram em conta nenhuma.
   */
  const [modalMovimentacoes, setModalMovimentacoes] = useState(false);
  const [salvandoMov, setSalvandoMov] = useState(false);
  const mov = useEstoqueMovimentacoes(
    clienteId, safraId || null, verTodas ? null : (cultura || null), modalMovimentacoes);

  const recarregarMovimentacoes = () =>
    queryClient.invalidateQueries({ queryKey: ['estoque-movimentacoes'] });

  const cancelarQuebra = async (id: string, motivo: string) => {
    setSalvandoMov(true);
    try {
      const { error } = await (supabase as any).rpc('agri_quebra_cancelar', {
        p_id: id, p_motivo: motivo,
      });
      if (error) { toast.error(error.message ?? 'Não foi possível cancelar a quebra.'); return; }
      toast.success('Quebra cancelada — o grão voltou ao saldo.');
      await recarregarMovimentacoes();
      /* ⚠ O ESTOQUE TAMBÉM: a linha saiu do saldo, e a tabela atrás precisa refletir isso sem
         recarregar a página. Mesma chave da venda e da quebra — não há um segundo reload. */
      await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
    } finally {
      setSalvandoMov(false);
    }
  };

  const editarQuebra = async (p: QuebraEdicaoPayload) => {
    setSalvandoMov(true);
    try {
      const { error } = await (supabase as any).rpc('agri_quebra_editar', {
        p_id: p.id, p_data: p.data, p_motivo: p.motivo, p_observacoes: p.observacoes,
      });
      if (error) { toast.error(error.message ?? 'Não foi possível salvar a correção.'); return; }
      toast.success('Movimentação corrigida.');
      /* ⚠ SÓ A LISTA: data, motivo e observação não entram no saldo, então invalidar
         `estoque-graos` aqui seria uma consulta que não muda um número na tela. */
      await recarregarMovimentacoes();
    } finally {
      setSalvandoMov(false);
    }
  };

  /* ───────────────────────── O HISTÓRICO DA VENDA (F3) ─────────────────────────
   * ⚠ MESMO DESENHO DO HISTÓRICO DA QUEBRA, uma chave ao lado da outra — e a diferença que importa
   * está no cancelamento: aqui ele mexe no FINANCEIRO. `agri_venda_avulsa_cancelar` cancela o
   * lançamento junto, então invalidar só a lista deixaria a receita viva na outra tela.
   * ⚠ EDITAR TAMBÉM PODE TOCAR O LANÇAMENTO (data e favorecido, se ainda não foi pago) — mas não
   * muda saldo nem valor, então a invalidação continua sendo só a da lista.
   */
  const [modalVendas, setModalVendas] = useState(false);
  /**
   * A VENDA ABERTA EM VER/EDITAR — e ela mora na PÁGINA, não dentro do histórico.
   *
   * ⚠ DOIS `Dialog` ANINHADOS SERIAM O CAMINHO FÁCIL E O ERRADO: o Radix empilha overlays, o foco
   * fica preso no de dentro e fechar um fecha os dois. Com o estado aqui, os dois modais são
   * irmãos — o histórico continua aberto atrás, e voltar para ele é fechar a venda.
   */
  const [salvandoVenda2, setSalvandoVenda2] = useState(false);
  const vendasHist = useVendasGraos(
    clienteId, safraId || null, verTodas ? null : (cultura || null), modalVendas);

  const recarregarVendas = () => queryClient.invalidateQueries({ queryKey: ['vendas-graos'] });

  /* ⚠ A MENSAGEM CRUA DA RPC VAI PARA O TOAST, MENOS UMA: `VENDA_JA_PAGA_CANCELE_NO_FINANCEIRO`
     não é frase — é um código que só quem escreveu a função entende, e ele aparece justamente no
     momento em que o operador precisa saber PARA ONDE ir. As outras são legíveis e vão inteiras. */
  const erroDaVenda = (msg: string) => (/VENDA_JA_PAGA_CANCELE_NO_FINANCEIRO/.test(msg)
    ? 'Esta venda já foi paga ou conciliada. Cancele pelo Financeiro.'
    : msg || 'Não foi possível concluir a operação.');

  const cancelarVenda = async (id: string, motivo: string) => {
    setSalvandoVenda2(true);
    try {
      const { error } = await (supabase as any).rpc('agri_venda_avulsa_cancelar', {
        p_op_id: id, p_motivo: motivo,
      });
      if (error) { toast.error(erroDaVenda(error.message ?? '')); return; }
      toast.success('Venda cancelada — o grão voltou ao saldo e o lançamento foi cancelado.');
      /* ⚠ FECHA A VENDA ABERTA: cancelar de dentro do modal de leitura deixaria na tela um
         documento que acabou de deixar de valer. */
      setVendaAberta(null);
      await recarregarVendas();
      await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
    } finally {
      setSalvandoVenda2(false);
    }
  };

  /* ⚠ O TIPO VEM DO `VendaGraosModal` AGORA: quem define a forma da edição é quem a oferece, e
     desde o F3.3 quem a oferece é o modal da venda, não o histórico. */
  const editarVenda = async (p: { id: string; data: string; comprador_id: string | null; observacoes: string | null }) => {
    setSalvandoVenda2(true);
    try {
      const { error } = await (supabase as any).rpc('agri_venda_avulsa_editar', {
        p_op_id: p.id, p_data: p.data, p_comprador_id: p.comprador_id,
        p_observacoes: p.observacoes,
      });
      if (error) { toast.error(erroDaVenda(error.message ?? '')); return; }
      toast.success('Venda corrigida.');
      /* ⚠ SÓ A LISTA: data, comprador e observação não entram em saldo nenhum. */
      await recarregarVendas();
      setVendaAberta(null);
    } finally {
      setSalvandoVenda2(false);
    }
  };

  /**
   * CORRIGIR UMA VENDA — cancela a antiga e grava a nova numa transação só.
   *
   * ⚠ UMA CHAMADA, NÃO DUAS: `agri_venda_graos_corrigir` faz o cancelamento, o registro e o
   * vínculo `substitui_operacao_id` dentro da mesma transação. Fatiar isso no front deixaria a
   * janela em que a venda antiga já foi cancelada e a nova ainda não existe — o estoque voltaria
   * e o Financeiro ficaria sem a receita, sem ninguém para desfazer.
   * ⚠ OS ERROS COM NOME PRÓPRIO VIRAM FRASE; os outros vão crus, porque são legíveis.
   */
  const erroDaCorrecao = (msg: string) => (
    /VENDA_JA_PAGA_CORRIJA_NO_FINANCEIRO/.test(msg)
      ? 'Esta venda tem lançamento conciliado — corrija no Financeiro.'
      : /VENDA_JA_CANCELADA/.test(msg)
        ? 'Esta venda já está cancelada.'
        : /VENDA_NAO_AVULSA_CORRIJA_NO_BARTER/.test(msg)
          ? 'Entrega de barter se corrige no próprio Barter.'
          : /CORRECAO_SEM_MOTIVO/.test(msg)
            ? 'Informe o motivo da correção.'
            : erroDaVendaNova(msg));

  const corrigirVenda = async (p: VendaGraosPayload & { venda_id: string; motivo: string }) => {
    if (!clienteId || !safraId || !cultura || !fazendaId) return;
    setSalvandoVenda2(true);
    try {
      const { data, error } = await (supabase as any).rpc('agri_venda_graos_corrigir', {
        p_venda_id: p.venda_id, p_motivo: p.motivo,
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
        p_fazenda_id: fazendaId, p_comprador_id: p.comprador_id, p_data: p.data,
        p_itens: p.itens, p_valor_bruto: p.valor_bruto, p_senar: p.senar,
        p_descontos: p.descontos, p_parcelas: p.parcelas,
        p_observacoes: p.observacoes, p_substituir: p.substituir,
        p_documento: p.documento, p_tipo_documento: p.tipo_documento,
      });
      if (error) { toast.error(erroDaCorrecao(error.message ?? '')); return; }
      const r = (data ?? {}) as { lancamentos?: unknown[] };
      const n = Array.isArray(r.lancamentos) ? r.lancamentos.length : 0;
      toast.success(`Venda corrigida: a anterior foi cancelada e ${n} lançamento${n === 1 ? '' : 's'} refeito${n === 1 ? '' : 's'}.`);
      setVendaAberta(null);
      await recarregarVendas();
      await queryClient.invalidateQueries({ queryKey: ['estoque-graos'] });
      await queryClient.invalidateQueries({ queryKey: ['lancamentos-substituiveis'] });
    } finally {
      setSalvandoVenda2(false);
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
      {/* ⚠ O TÍTULO TEM A LINHA SÓ PARA ELE. Antes ele dividia um `flex flex-wrap justify-between`
          com a fila de seletores, que ficava à DIREITA, e o Gabriel relatou na homologação que ao
          escolher uma cultura a fila ia para uma linha própria à esquerda, empurrando os cartões.
          ⚠ A CAUSA DAQUELE SALTO NÃO FOI REPRODUZIDA. Remontei o cabeçalho antigo num harness com
          o CSS do build e varri a largura de 1440 a 700px: em toda ela a fila permaneceu à direita
          nas duas visões, salto 0px. A hipótese óbvia — o `flex-wrap` quebrando quando os dois
          botões entram — NÃO se confirmou, porque o `min-w-0` do título deixa ele encolher em vez
          de empurrar. Não sei o que dispara aquilo na tela real, e prefiro dizer isso a escrever
          aqui uma explicação que a medição não sustenta.
          ⚠ O QUE A CORREÇÃO GARANTE INDEPENDE DA CAUSA, e é por isso que ela vale mesmo sem o
          diagnóstico: com duas linhas DECLARADAS, a posição dos filtros deixa de ser resultado de
          caber ou não caber. Não há wrap possível entre título e filtros porque eles não dividem
          mais uma linha. Medido: filtros e cartões no mesmo topo nas duas visões, ida e volta. */}
      {/* ⚠ O SUBTITULO E' DA TELA, nao da visao: ele diz o que a tela responde, e isso nao muda
          entre "Todas" e o detalhe de uma cultura. A mesma forma da Conciliacao. */}
      <PageHeader titulo={tituloTela}
        subtitulo="O que você colheu e ainda não vendeu, por safra e classe" />

      {/* SLOT 2 — A LINHA DE FILTROS, IGUAL NAS DUAS VISÕES.
          ⚠ OS DOIS GRUPOS SÃO DECLARADOS SEMPRE, e o da direita fica VAZIO em "Todas" em vez de
          não existir: `justify-between` com um filho só alinharia o primeiro grupo de um jeito
          diferente, e é exatamente esse tipo de layout-por-consequência que este PR veio tirar. */}
      <div className="flex flex-wrap items-end justify-between gap-2">
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
        </div>

        {/* O grupo da DIREITA — os dois botões, e só eles.
            ⚠ ESCONDÊ-LOS NÃO MOVE OS FILTROS: eles moram noutro grupo, no fim da linha, e o
            `justify-between` mantém a esquerda ancorada com a direita vazia. */}
        <div className="flex flex-wrap items-end gap-2">
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
              ⚠ E AGORA O LAYOUT REALMENTE NÃO SE DESLOCA — antes esta linha dizia que não, e
              estava errada: a fila encolhia, sim, mas era a PRESENÇA dos botões que fazia o bloco
              inteiro quebrar de linha e mudar de lado. Com os filtros num grupo próprio, sumir
              daqui não move nada lá. */}
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
        {/* ⚠ O "sc" ERA CRAVADO AQUI, e estava errado para metade das culturas: mandioca e cana
            se medem em tonelada, e o cartão diria "sc" sobre um número de toneladas. Agora a
            unidade sai de `unidadeCurtaDaCultura` — a mesma fonte do rótulo acima da tabela.
            ⚠ E ELA VAI DEPOIS DO NÚMERO: unidade de medida vem depois em português, ao contrário
            da moeda. Os cartões de R$ ao lado continuam com o "R$" na frente. */}
        {!verTodas && (
          <Cartao rotulo="Em estoque" escopo="esta safra"
            unidade={unidadeCurtaDaCultura(cultura)} posicaoUnidade="depois"
            valor={formatNum(t.saldo, 2)} />
        )}
        {/* ⚠ O NOME DIZ DE QUE PREÇO SE FALA, e é essa regra que renomeou o cartão do "Todas". Os
            dois são estimativa; o que os separa é a ORIGEM do preço — um já foi praticado, o outro
            é a cotação de hoje. Enquanto o resumo avaliava pelo preço médio de venda, "Valor
            estimado" servia; agora ele avalia A MERCADO, e manter o nome antigo faria a MESMA
            conta ter dois nomes entre a lista e o detalhe — que é a divergência que este PR
            fechou no banco. */}
        {/* ⚠⚠ "VALOR DE VENDA" ERA O SALDO VALORIZADO pelo preço já praticado, e virou VENDIDO:
            o que entrou de verdade, com a quantidade que o produziu no rótulo de baixo. O cartão
            antigo e a coluna antiga eram o mesmo número e o mesmo engano — uma projeção com cara
            de realizado, no lugar do realizado.
            ⚠ O SUBRÓTULO É A QUANTIDADE, não "esta safra": R$ sozinho não deixa conferir com o
            histórico, e "{entregue} sc" ao lado do dinheiro dá as duas metades do preço médio
            que a tabela mostra na coluna ao lado.
            ⚠ EM "TODAS" ELE CONTINUA SENDO O VALOR A MERCADO do resumo: aquela RPC não desce à
            classe e não devolve recebido — trocar o rótulo lá afirmaria um número que não existe. */}
        <Cartao rotulo={verTodas ? 'Valor a mercado' : 'Vendido'}
          escopo={verTodas ? 'esta safra' : `${formatNum(t.entregue, 2)} ${unidadeCurtaDaCultura(cultura)}`}
          unidade="R$"
          valor={formatNum(verTodas ? totalResumo.valor : t.recebido, 2)}
          titulo={formatMoeda(verTodas ? totalResumo.valor : t.recebido)} cor="text-success" />
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
            ⚠ ELE DEIXOU DE SER "—" EM "TODAS": a RPC do resumo passou a devolver o COLHIDO, que
            era o denominador que faltava. A conta ali soma as culturas EM QUILO, porque saca e
            tonelada não se somam — ver `pctParadoTodas`, acima.
            ⚠ O "—" SOBREVIVE PARA O CASO CERTO: safra sem colheita nenhuma. Ali 0,0% afirmaria
            que tudo foi vendido, quando não houve o que vender. */}
        <Cartao rotulo="% colhido parado"
          escopo={verTodas ? 'todas as culturas' : undefined}
          unidade={verTodas && pctParadoTodas === null ? undefined : '%'}
          valor={verTodas
            ? (pctParadoTodas === null ? '—' : formatNum(pctParadoTodas, 1))
            : formatNum(t.pctParado, 1)} />
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
      /* ⚠ `overflow-x-auto`, NÃO `overflow-hidden`: com as colunas em px a tabela tem largura
         mínima, e `hidden` CORTARIA as últimas numa janela estreita — número escondido, que é
         exatamente o que a régua da casa proíbe. Com `auto` nasce a barra e nada some. */
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full table-fixed border-collapse">
          {/* ⚠ A LARGURA ANDOU COM A COLUNA, e isto nao e' detalhe: `colgroup` e' POSICIONAL.
              Mover "Saldo sc" no `thead` sem mover a largura dele aqui nao quebraria nada visivel —
              so' daria a largura do saldo para a coluna de preco e a de preco para o saldo, calado.
              ⚠⚠ px, NÃO PORCENTAGEM, e medido pelo maior conteúdo real: "R$ 1.536.232,09" a 11px
              são 82,3px de texto, e com o padding de 16 a coluna precisa de 99. Com porcentagem a
              mesma coluna encolhia junto com a janela e o número quebrava — é a mesma correção
              que a tabela do histórico de vendas já recebeu.
              ⚠ A CLASSE TEM PISO, não largura livre: medido, "Acima de 20 ppb" com a bolinha pede
              104,8px, e sem piso ela chegava a ZERO numa janela estreita — a linha de Total ficava
              sem a palavra "Total". Com 120px nada some em largura nenhuma; a tabela para de
              encolher em 906px e nasce a barra horizontal. Ela ainda cede antes dos números, que
              é o que se queria: número não encolhe sem mentir. */}
          <colgroup>
            {['120px', '92px', '92px', '86px', '96px', '116px', '92px', '96px', '116px'].map((w, i) => (
              <col key={i} style={w ? { width: w } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <Th2 nome="Classe" esq />
              <Th2 nome="Colhido" unidade={unidadeCurtaDaCultura(cultura)} />
              <Th2 nome="Entregue" unidade={unidadeCurtaDaCultura(cultura)} />
              <Th2 nome="Quebra" unidade={unidadeCurtaDaCultura(cultura)} />
              {/* ⚠⚠ AS DUAS COLUNAS DO MEIO MUDARAM DE SIGNIFICADO, e é o defeito deste PR.
                  Eram "Venda" (preço praticado) e "Valor" — e "Valor" era o SALDO valorizado por
                  aquele preço: 4.165,85 × 95 = R$ 395.755,57, um número que não é realizado nem é
                  mercado. Ele respondia "quanto valeria se eu vendesse o resto pelo preço de
                  antes", pergunta que ninguém fez, e ocupava o lugar da que todos fazem.
                  ⚠ AGORA AS DUAS OLHAM PARA TRÁS, as duas da direita para frente: quanto saiu e
                  por quanto (Preço venda, Recebido) contra o que sobrou e quanto vale hoje
                  (Saldo, Mercado, A mercado). A divisa separa exatamente isso. */}
              <Th2 nome="Preço venda" unidade={`R$ / ${unidadeCurtaDaCultura(cultura)}`} />
              <Th2 nome="Recebido" unidade="R$" />
              {/* ⚠ O SALDO ABRE O GRUPO DA DIREITA, encostado na divisa: é a quantidade que as
                  duas colunas de mercado multiplicam. */}
              <Th2 nome="Saldo" unidade={unidadeCurtaDaCultura(cultura)} className={SEP_TH} />
              <Th2 nome="Mercado" unidade={`R$ / ${unidadeCurtaDaCultura(cultura)}`} />
              <Th2 nome="A mercado" unidade="R$" />
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
                <td className="truncate px-2 py-0.5 text-[11px]" title={labelDaClasse(l.classe)}>
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
                {/* ⚠ O MESMO GESTO DA COLUNA QUEBRA: o número é o alvo, porque é ele que resume
                    o que se quer ver. Zero também abre — pode haver venda CANCELADA, que não soma
                    e existe. Nada muda de tamanho (A23): o mesmo `<td>`, `underline` só no hover. */}
                <td className={cn('cursor-pointer px-2 py-0.5 text-right text-[11px] tabular-nums',
                  'text-muted-foreground underline-offset-2 hover:underline')}
                  role="button" tabIndex={0}
                  title="Ver vendas e entregas" aria-label="Ver vendas e entregas do estoque"
                  onClick={() => setModalVendas(true)}
                  onKeyDown={ev => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setModalVendas(true); }
                  }}>
                  {formatNum(l.entregue, 2)}
                </td>
                {/* ⚠ A COLUNA LÊ A CHAVE — F2. Ela imprimiu `formatNum(0, 2)` FIXO desde a F1: um
                    zero que não vinha de lugar nenhum, sobrevivendo ao motivo dele. Agora
                    `fn_estoque_graos` devolve `quebra`, e o que está aqui é o que o banco tem.
                    ⚠ ZERO É VALOR, NUNCA "—": "não houve perda" é uma resposta, e um traço diria
                    que a tela não sabe. */}
                {/* ⚠ O NÚMERO É O ALVO, não um ícone ao lado: o gesto é "quero ver estas quebras",
                    e o alvo natural é a quantidade que as resume. Zero também abre — pode haver
                    CANCELADA, que não soma e existe.
                    ⚠ NADA MUDA DE TAMANHO ao virar clicável (A23): é o mesmo `<td>`, com
                    `underline` só no hover. Um `<button>` aqui traria padding e altura próprios. */}
                <td className={cn('cursor-pointer px-2 py-0.5 text-right text-[11px] tabular-nums',
                  'underline-offset-2 hover:underline',
                  l.quebra > 0 ? 'text-destructive' : 'text-muted-foreground')}
                  role="button" tabIndex={0}
                  title="Ver movimentações" aria-label="Ver movimentações do estoque"
                  onClick={() => setModalMovimentacoes(true)}
                  onKeyDown={ev => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setModalMovimentacoes(true); }
                  }}>
                  {formatNum(l.quebra, 2)}
                </td>
                {/* ⚠ O TRAÇO AQUI DEPENDE DO ENTREGUE, NÃO DO SALDO — e a troca é o conserto.
                    `dinheiro(v, saldo)` escondia o preço praticado quando o saldo zerava, porque
                    a coluna antiga valorizava o saldo. Estas duas falam do que JÁ SAIU: a roça de
                    23/24 vendeu tudo e continua tendo preço e recebido. Sem entrega, aí sim não
                    há o que dizer. */}
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                  {l.entregue > 0 ? formatMoeda(l.preco_ref) : '—'}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                  {l.recebido > 0 ? formatMoeda(l.recebido) : '—'}
                </td>
                <td className={cn('px-2 py-0.5 text-right text-[11px] font-medium tabular-nums',
                  SEP_TD, l.saldo > 0 && 'text-success')}>
                  {formatNum(l.saldo, 2)}
                </td>
                {/* ⚠ O PREÇO DE MERCADO APARECE MESMO COM SALDO ZERO, e o de venda não: eles
                    respondem coisas diferentes. "R$/sc venda" com zero saca seria a média de um
                    lote que já saiu inteiro — informação de arquivo. A cotação, não: ela é do
                    mercado, vale para a classe que ainda vai colher, e escondê-la faria o operador
                    achar que a cotação não foi gravada. O VALOR, sim, depende do saldo. */}
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
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
                <td className="cursor-pointer px-2 py-1 text-right text-[11px] font-bold tabular-nums underline-offset-2 hover:underline"
                  role="button" tabIndex={0}
                  title="Ver vendas e entregas" aria-label="Ver vendas e entregas do estoque"
                  onClick={() => setModalVendas(true)}
                  onKeyDown={ev => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setModalVendas(true); }
                  }}>
                  {formatNum(t.entregue, 2)}
                </td>
                <td className="cursor-pointer px-2 py-1 text-right text-[11px] font-bold tabular-nums underline-offset-2 hover:underline"
                  role="button" tabIndex={0}
                  title="Ver movimentações" aria-label="Ver movimentações do estoque"
                  onClick={() => setModalMovimentacoes(true)}
                  onKeyDown={ev => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setModalMovimentacoes(true); }
                  }}>
                  {formatNum(t.quebra, 2)}
                </td>
                {/* ⚠ O PREÇO DE VENDA TEM TOTAL E O DE MERCADO NÃO, e a diferença é real: o da
                    venda é `recebido ÷ entregue`, uma média PONDERADA pelo que de fato saiu — um
                    preço que a safra praticou. O de mercado seria a média de três cotações sem
                    peso nenhum, que não é preço de coisa alguma.
                    ⚠ E ELE NÃO É A MÉDIA DOS `preco_ref` DAS LINHAS: três classes a 95, 65 e 60
                    não dão 73,33 quando as quantidades diferem. A ponderação mora na divisão. */}
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {t.entregue > 0 ? formatMoeda(t.precoVenda) : '—'}
                </td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {t.recebido > 0 ? formatMoeda(t.recebido) : '—'}
                </td>
                <td className={cn('px-2 py-1 text-right text-[11px] font-bold tabular-nums', SEP_TH)}>
                  {formatNum(t.saldo, 2)}
                </td>
                <td className="px-2 py-1" />
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
        {/* ⚠ AS MESMAS CONDIÇÕES DO BOTÃO DE VENDA, menos a fazenda: a quebra não gera receita,
            então não precisa de fazenda resolvida — `agri_quebra_registrar` não recebe
            `p_fazenda_id`. Exigi-la aqui seria copiar um impedimento que não é desta ação. */}
        <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
          disabled={verTodas || t.saldo <= 0}
          title={verTodas ? 'Escolha uma cultura para baixar por quebra.'
            : t.saldo <= 0 ? 'Não há grão em estoque para baixar.'
              : 'Registrar uma perda física do estoque'}
          onClick={() => setModalQuebra(true)}>
          <TrendingDown className="h-3.5 w-3.5" /> Baixar por quebra
        </Button>
        {verTodas ? (
          <span className="text-[10px] text-muted-foreground">Escolha uma cultura para vender.</span>
        ) : t.saldo <= 0 && !carregando && !erro && (
          <span className="text-[10px] text-muted-foreground">Sem grão em estoque.</span>
        )}
      </div>

      <VendaGraosModal
        aberto={modalVenda}
        onFechar={() => setModalVenda(false)}
        onRegistrar={p => { void registrarVenda(p); }}
        salvando={salvandoVenda}
        estoque={linhas}
        cultura={cultura}
        safraRotulo={safraRotulo}
        clienteId={clienteId ?? ''}
        contas={fin.contasBancarias}
        substituiveis={substituiveis.lancamentos}
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

      <VendasGraosModal
        aberto={modalVendas}
        onFechar={() => setModalVendas(false)}
        vendas={vendasHist.vendas}
        carregando={vendasHist.carregando}
        erro={vendasHist.erro}
        cultura={cultura}
        safraRotulo={safraRotulo}
        onCancelar={(id, motivo) => { void cancelarVenda(id, motivo); }}
        onAbrirVenda={(v, m) => setVendaAberta({ venda: v, modo: m })}
        salvando={salvandoVenda2}
      />

      {/* ⚠ O MESMO COMPONENTE DE VENDER, em outro modo — irmão do histórico, não aninhado nele.
          `key` pelo id força o remount ao trocar de venda: sem ele, abrir a segunda venda traria o
          estado da primeira nos campos editáveis. */}
      {vendaAberta && (
        <VendaGraosModal
          /* ⚠ A `key` LEVA O MODO: corrigir monta o formulário inteiro a partir da venda, e
             trocar de ver para corrigir sem remontar deixaria o estado da leitura por baixo. */
          key={`${vendaAberta.venda.id}:${vendaAberta.modo}`}
          aberto
          modo={vendaAberta.modo}
          venda={vendaAberta.venda}
          onFechar={() => setVendaAberta(null)}
          onRegistrar={() => {}}
          onEditar={p => { void editarVenda(p); }}
          onCorrigir={p => { void corrigirVenda(p); }}
          /* ⚠ O MODAL PEDE E A PÁGINA REABRE: trocar `modo` no estado é o que força o remount
             pela `key`, e é o remount que preenche o formulário a partir da venda. Trocar o modo
             por dentro do modal deixaria o estado da leitura por baixo do formulário. */
          onPedirCorrecao={v => setVendaAberta({ venda: v, modo: 'corrigir' })}
          onCancelar={(id, motivo) => { void cancelarVenda(id, motivo); }}
          salvando={salvandoVenda2}
          estoque={linhas}
          cultura={cultura}
          safraRotulo={safraRotulo}
          clienteId={clienteId ?? ''}
          contas={fin.contasBancarias}
          substituiveis={vendaAberta.modo === 'corrigir' ? substituiveis.lancamentos : []}
        />
      )}

      <MovimentacoesEstoqueModal
        aberto={modalMovimentacoes}
        onFechar={() => setModalMovimentacoes(false)}
        movimentacoes={mov.movimentacoes}
        carregando={mov.carregando}
        erro={mov.erro}
        cultura={cultura}
        safraRotulo={safraRotulo}
        onCancelar={(id, motivo) => { void cancelarQuebra(id, motivo); }}
        onEditar={p => { void editarQuebra(p); }}
        salvando={salvandoMov}
      />

      <QuebraModal
        aberto={modalQuebra}
        onFechar={() => setModalQuebra(false)}
        onRegistrar={p => { void registrarQuebra(p); }}
        salvando={salvandoQuebra}
        estoque={linhas}
        cultura={cultura}
        safraRotulo={safraRotulo}
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
          /* ⚠ A NOTA DIZ QUAL METADE DA TABELA OLHA PARA TRÁS. A unidade saiu daqui porque agora
              está escrita no cabeçalho, em duas linhas; o que a nota carrega é o que o cabeçalho
              não tem como dizer — que as duas colunas do meio são PASSADO (o que saiu e o que
              entrou) e as duas da direita são PRESENTE (o que sobrou e quanto vale hoje). */
          : <>Saldo = Colhido − Entregue − Quebra. <strong>Preço venda</strong> e
              <strong> Recebido</strong> são o que já saiu (barter e dinheiro); <strong>Mercado</strong> e
              <strong> A mercado</strong> avaliam o que ainda está no estoque pela última cotação.</>}
      </p>
    </div>
  );
}
