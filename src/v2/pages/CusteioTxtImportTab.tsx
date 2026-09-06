// src/v2/pages/CusteioTxtImportTab.tsx
// PR-RAUL-01 — Tela de preview do Importador de Custeio TXT (Raul / Faz. Monterrey).
// PR-RAUL-02A — Cada linha do preview abre o LancamentoV2Dialog OFICIAL com prefill,
//               para o usuário salvar manualmente. NADA grava sem clicar Salvar no modal.
//
// ESCOPO:
//   - Reaproveita LancamentoV2Dialog + useFinanceiroV2 (sem formulário paralelo).
//   - SEM tabela nova, SEM migration, SEM de-para, SEM importação em lote.
//   - Preview continua client-side; gravação é via hookFin.criarLancamento (fluxo oficial).
//   - Conta, fornecedor e subcentro/plano NÃO são pré-preenchidos — usuário escolhe no modal.
//     macro/grupo/centro/subcentro continuam derivados pelo fluxo oficial.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { safraSugerida } from '@/lib/agri/safraSugerida';
import { hashItemCusteio } from '@/v2/lib/custeio/hashItemCusteio';
import { supabase } from '@/integrations/supabase/client';
import { BlocoTopoAba } from '@/components/ui/bloco-topo-aba';
import {
  parseCusteioTxtFile,
  type CusteioParseResult,
  type CusteioItem,
} from '@/v2/lib/custeio/parseCusteioTxt';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Normaliza nome para match exato (trim, lower, sem acento). */
function normNome(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Último dia do mês de um 'YYYY-MM' → 'YYYY-MM-DD'. Ex.: '2026-04' → '2026-04-30'. */
/** "FAZENDA MONTERREY", "Faz. Monterrey" e "Monterrey" viram a mesma coisa. */
function semPalavraFazenda(s: string): string {
  return normNome(s).replace(/^(FAZENDA|FAZ\.?|SITIO|S[IÍ]TIO)\s+/i, '').trim();
}

function ultimoDiaDoMes(anoMes: string | null | undefined): string | undefined {
  if (!anoMes) return undefined;
  const m = anoMes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return undefined;
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
}

/**
 * ⚠ `arquivoInicial` — o modo HUB (B-36). Quando o hub de importação já escolheu
 * o arquivo, ele chega por prop e o seletor próprio não é renderizado: dois
 * seletores na mesma tela fariam o operador escolher duas vezes, e o segundo
 * poderia contradizer o primeiro. Sem a prop, a tela se comporta como sempre.
 */
export default function CusteioTxtImportTab(
  { arquivoInicial, contaBancariaId }: { arquivoInicial?: File; contaBancariaId?: string } = {},
) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CusteioParseResult | null>(null);

  // PR-RAUL-02A — linha selecionada que abre o modal oficial.
  const [dialogRow, setDialogRow] = useState<CusteioItem | null>(null);

  /* ⚠ O QUE JÁ FOI LANÇADO SAI DO BANCO, NÃO DA MEMÓRIA — CUSTEIO-TXT-02 item 4. Era um
     `Set<number>` por número de linha do TXT: fechar a aba perdia tudo e o Raul recomeçava
     do zero, e o número da linha nem serve como identidade — muda quando o relatório é
     reimpresso com uma família a mais. Agora cada item tem um hash determinístico
     (cliente + competência + valor + descrição normalizada), gravado em
     `hash_importacao` no lançamento e reconsultado ao abrir a prévia.
     ⚠ O MAPA GUARDA O ID, não um booleano: é ele que faz o "lançado" virar link para o
     lançamento em vez de um carimbo sem destino. */
  const [hashPorLinha, setHashPorLinha] = useState<Map<number, string>>(new Map());
  const [lancadoPorHash, setLancadoPorHash] = useState<Map<string, string>>(new Map());
  /* ⚠ FALHAR EM CONFERIR NÃO É "NADA FOI LANÇADO". Sem este estado, uma consulta que
     falhasse pintaria os 43 itens como novos e o operador lançaria tudo em dobro — o
     silêncio mais caro que esta tela pode produzir. */
  const [erroConferencia, setErroConferencia] = useState(false);

  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const hookFin = useFinanceiroV2();
  const navigate = useNavigate();

  // useFinanceiroV2 é lazy (PR-Mesa-A1): disparar loads de contas/fornecedores/
  // classificações quando o cliente estiver resolvido. Sem isso o modal abre vazio.
  useEffect(() => {
    if (!clienteAtual?.id) return;
    hookFin.loadContas();
    hookFin.loadFornecedores();
    hookFin.loadClassificacoes();
    /* ⚠ FALTAVA, E O SELECT DE SAFRA ABRIA COM "Sem safra" SOZINHO — 121e. Os outros três
       auxiliares eram carregados e este não; o modal recebia uma lista vazia e não havia o
       que escolher, nem o que sugerir. Medido na tela: o NJ tem seis safras ativas e
       nenhuma aparecia. */
    hookFin.loadSafras();
  }, [
    clienteAtual?.id,
    hookFin.loadContas,
    hookFin.loadFornecedores,
    hookFin.loadClassificacoes,
    hookFin.loadSafras,
  ]);

  const fazendasReais = useMemo(
    () => fazendas.filter((f) => f.id !== '__global__'),
    [fazendas],
  );

  // Botão "Criar lançamento" só habilita quando os auxiliares chegaram.
  const auxLoaded = hookFin.contasBancarias.length > 0 && fazendasReais.length > 0;

  // Resolve FAZENDA MONTERREY por match exato de nome; se não achar, undefined
  // (usuário escolhe no modal — não inventamos fazenda).
  /* ⚠ "FAZENDA MONTERREY" x "Monterrey" — CUSTEIO-TXT (121e). O match exato só acertava
     quando o cadastro repetia a palavra "Fazenda", e o relatório SEMPRE a traz. Sem isto,
     o campo abria vazio num caso em que a resposta é óbvia.
     ⚠ AMBIGUIDADE NÃO SE RESOLVE POR SORTEIO: com zero ou mais de uma candidata o campo
     fica vazio, para o operador escolher. Duas fazendas "Santa Maria" existem de verdade
     no cadastro do NJ. */
  const fazendaResolvidaId = useMemo(() => {
    if (!resultado?.fazenda_raw) return undefined;
    const alvo = normNome(resultado.fazenda_raw);
    const exatas = fazendasReais.filter((f) => normNome(f.nome) === alvo);
    if (exatas.length === 1) return exatas[0].id;
    const semPrefixo = fazendasReais.filter((f) => semPalavraFazenda(f.nome) === semPalavraFazenda(alvo));
    return semPrefixo.length === 1 ? semPrefixo[0].id : undefined;
  }, [resultado?.fazenda_raw, fazendasReais]);

  const dataMes = ultimoDiaDoMes(resultado?.ano_mes);

  const clienteId = clienteAtual?.id ?? null;
  const competencia = resultado?.ano_mes ?? null;
  const itens = resultado?.itens;

  /* Recalcula os hashes do arquivo e pergunta ao banco quais deles já viraram lançamento.
     ⚠ UMA CONSULTA SÓ, por `in (hashes)`: 43 itens fariam 43 idas se a pergunta fosse por
     item, e o índice `idx_fin_v2_hash_importacao` atende a lista inteira de uma vez.
     ⚠ CANCELADO NÃO CONTA COMO LANÇADO: quem cancelou o lançamento quer poder lançar de
     novo, e esconder o item deixaria o custeio incompleto sem dizer por quê. */
  const conferirLancados = useCallback(async () => {
    if (!clienteId || !competencia || !itens || itens.length === 0) {
      setHashPorLinha(new Map());
      setLancadoPorHash(new Map());
      setErroConferencia(false);
      return;
    }
    try {
      const pares = await Promise.all(itens.map(async (it) => [
        it.linha_num,
        await hashItemCusteio({ clienteId, competencia, valor: it.valor, descricao: it.produto_raw }),
      ] as const));
      setHashPorLinha(new Map(pares));

      const hashes = Array.from(new Set(pares.map(([, h]) => h)));
      const { data, error } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, hash_importacao')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .in('hash_importacao', hashes);
      if (error) throw error;

      const mapa = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.hash_importacao) mapa.set(row.hash_importacao, row.id);
      }
      setLancadoPorHash(mapa);
      setErroConferencia(false);
    } catch (err) {
      console.error('[custeio] falha ao conferir o que já foi lançado', err);
      setLancadoPorHash(new Map());
      setErroConferencia(true);
    }
  }, [clienteId, competencia, itens]);

  useEffect(() => { void conferirLancados(); }, [conferirLancados]);

  // Prefill ESTÁVEL por linha (memo) — evita re-init do form do modal a cada render do pai.
  const prefill = useMemo(() => {
    if (!dialogRow) return undefined;
    return {
      fazenda_id: fazendaResolvidaId,
      data_competencia: dataMes,
      data_pagamento: dataMes,
      valor: dialogRow.valor,
      tipo_operacao: '2-Saídas',
      status_transacao: 'realizado',
      descricao: dialogRow.produto_raw,
      /* A conta que o operador já escolheu na régua da Conciliação — perguntar de novo
         seria pedir que ele repetisse o que acabou de dizer. */
      conta_bancaria_id: contaBancariaId,
      /* ⚠ VENCIMENTO = COMPETÊNCIA no Realizado. O custeio nasce como despesa do mês que
         já correu; para o Previsto a regra é competência + 30, mas este fluxo grava
         Realizado, então a data é a mesma. Editável no modal, como tudo aqui. */
      data_vencimento: dataMes,
      /* Sugestão pela mesma função que o cadastro de safra usa; `null` quando não há
         resposta única, e aí o campo abre vazio de propósito. */
      safra_id: safraSugerida(dataMes ?? null, 'pecuaria', hookFin.safras) ?? undefined,
      // favorecido_id: vazio de propósito — o custeio não nomeia fornecedor.
      // subcentro / plano_conta_id: dependem da memória de apelidos por Sub-Fam
      // (item 2 do 121, ainda não implementado) — ver o relatório.
    };
  }, [dialogRow, fazendaResolvidaId, dataMes, contaBancariaId, hookFin.safras]);

  // Contexto operacional read-only (NÃO vira classificação).
  const referencia = useMemo(() => {
    if (!dialogRow) return undefined;
    return {
      fornecedor_texto: null,
      fazenda_texto: resultado?.fazenda_raw ?? null,
      plano_texto: null,
      centro_texto: `${dialogRow.familia_raw} › ${dialogRow.subfamilia_raw}`,
      produto_texto: dialogRow.produto_raw,
      observacao: null,
      valor: dialogRow.valor,
      data_referencia: resultado?.ano_mes ?? null,
    };
  }, [dialogRow, resultado?.fazenda_raw, resultado?.ano_mes]);

  /** A leitura em si, sem depender de evento — o hub entra por aqui. */
  const lerArquivo = useCallback(async (file: File) => {
    setParsing(true);
    setErro(null);
    setResultado(null);
    setFileName(file.name);
    try {
      const res = await parseCusteioTxtFile(file);
      setResultado(res);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao ler o arquivo.');
    } finally {
      setParsing(false);
    }
  }, []);

  /* No modo hub o arquivo já veio escolhido: ler assim que ele chega, e de novo
     quando o operador trocar de arquivo lá em cima. */
  useEffect(() => {
    if (arquivoInicial) void lerArquivo(arquivoInicial);
  }, [arquivoInicial, lerArquivo]);

  /* O seletor próprio delega a MESMA leitura do modo hub — dois corpos lendo o
     mesmo arquivo divergiriam na primeira mudança de qualquer um deles. */
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await lerArquivo(file);
    } finally {
      // permite reabrir o mesmo arquivo
      e.target.value = '';
    }
  }

  const recOk = resultado?.reconciliacao.ok ?? false;
  /* Toda divergência cabe em cinco centavos? Então é o arredondamento do impresso, não
     leitura errada. `every` sobre lista vazia é `true`, e por isso a guarda do tamanho. */
  const TOL_ARREDONDAMENTO = 0.05;
  const divergencias = resultado?.reconciliacao.divergencias ?? [];
  const soArredondamento = divergencias.length > 0
    && divergencias.every(d => Math.abs(d.diferenca) <= TOL_ARREDONDAMENTO);
  const recConferido = resultado?.reconciliacao.conferido ?? false;

  const subtotalGeral = useMemo(
    () => resultado?.total_geral_impresso ?? null,
    [resultado],
  );

  return (
    <div className="space-y-4">
      {/* ⚠ SEM TÍTULO E SEM O PARÁGRAFO — CUSTEIO-TXT-02. A aba de cima já diz que isto é
          uma importação e qual é o arquivo; repetir "Importador de Custeio (TXT) — Preview"
          gastava a primeira linha da tela para não dizer nada de novo. O contrato ("nada
          grava sem você confirmar") continua, em 10px, onde ele importa: junto do botão. */}
      <Card className={arquivoInicial ? 'border-0 shadow-none' : undefined}>
        <CardContent className={`space-y-3 ${arquivoInicial ? 'p-0' : 'pt-6'}`}>

          {/* No modo hub quem escolhe o arquivo é a aba de cima. */}
          {!arquivoInicial && (
            <label className="inline-flex">
              <input
                type="file"
                accept=".txt"
                className="hidden"
                onChange={onFile}
              />
              <Button asChild variant="outline" disabled={parsing}>
                <span className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  {parsing ? 'Lendo...' : 'Selecionar arquivo .txt'}
                </span>
              </Button>
            </label>
          )}

          {/* ⚠ O NOME DO ARQUIVO NÃO SE REPETE — CUSTEIO-TXT-02b. A faixa da seção acima já
              o mostra ("Relatório de custeio · 082026.txt", 10px mono); aqui ele saía de
              novo em `text-sm`, 14px — o maior texto da tela, para dizer o que já estava
              dito dois centímetros acima. `fileName` continua no state porque o modo sem
              hub (seleção pelo próprio card) ainda o usa no fluxo de leitura. */}

          {erro && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro ao ler o arquivo</AlertTitle>
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {resultado && (
        <>
          {/* ⚠ O QUE SE CONFERE NÃO ROLA — A21, e agora é regra da casa. O bloco de números
              e a faixa de reconciliação são a resposta da tela: rolar 43 itens e perder de
              vista o total e o aviso de divergência é perder justamente o que se estava
              conferindo. Fundo opaco e `z` acima das linhas, senão os itens passam por
              baixo — transparente é pior que não fixar.
              A altura vem do app-shell: a seção `conciliacao` já está em
              `SECOES_APP_SHELL` (V2Index) desde antes do 117. */}
          <div className="sticky top-[30px] z-20 space-y-3 bg-card pb-2">
          {/* O mesmo bloco cinza das abas da OC: o operador aprende a olhar um lugar só. */}
          <BlocoTopoAba itens={[
            { rotulo: 'Fazenda', valor: resultado.fazenda_raw ?? null },
            { rotulo: 'Competência', valor: resultado.ano_mes ?? resultado.periodo_raw ?? null },
            { rotulo: 'Itens', valor: String(resultado.total_itens) },
            { rotulo: 'Soma dos itens', valor: brl(resultado.soma_valores) },
          ]} />

          {/* Reconciliação */}
          {recConferido ? (
            recOk ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Reconciliação OK</AlertTitle>
                <AlertDescription>
                  A soma dos itens-folha bate com os subtotais impressos no TXT.
                  {subtotalGeral !== null && (
                    <> Total geral impresso: <strong>{brl(subtotalGeral)}</strong>.</>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              /* ⚠ CENTAVO DE RELATÓRIO NÃO É ERRO DE LEITURA — CUSTEIO-TXT-02. Em ago/2026 a
                 família INVESTIMENTOS divergiu R$ 0,01: os itens somam 54.962,05 e o impresso
                 traz 54.962,04, porque o relatório arredonda o subtotal. Em vermelho, isso diz
                 ao operador que o parser errou e que o arquivo não presta — e ele para de
                 confiar nos alarmes que importam. Âmbar até 5 centavos nomeia o que é:
                 arredondamento do relatório. Acima disso continua vermelho, porque aí a
                 hipótese de dupla contagem ou linha perdida volta a valer.
                 ⚠ A FAIXA NÃO SOME EM NENHUM DOS DOIS CASOS: divergência é informação. */
              <Alert variant={soArredondamento ? 'default' : 'destructive'}
                     className={soArredondamento ? 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200' : undefined}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {soArredondamento ? 'Diferença de arredondamento do relatório' : 'Divergência de reconciliação'}
                </AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>
                    {soArredondamento
                      ? 'A soma dos itens difere do subtotal impresso por centavos — o relatório arredonda o subtotal. Os itens são a fonte.'
                      : 'A soma dos itens não bate com algum subtotal impresso. Verifique se um subtotal foi lido como item (dupla contagem) ou se o parser perdeu linhas.'}
                  </p>
                  <ul className="ml-4 list-disc text-sm">
                    {resultado.reconciliacao.divergencias.map((d, idx) => (
                      <li key={idx}>
                        {d.escopo}: itens {brl(d.soma_itens)} × impresso{' '}
                        {brl(d.subtotal_impresso)} (dif. {brl(d.diferenca)})
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sem subtotais para conferir</AlertTitle>
              <AlertDescription>
                O TXT não trouxe subtotais/total reconhecíveis. A soma dos itens é{' '}
                <strong>{brl(resultado.soma_valores)}</strong> — confira manualmente contra o total do relatório.
              </AlertDescription>
            </Alert>
          )}

          {/* Avisos do parser */}
          {resultado.avisos.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Avisos do parser</AlertTitle>
              <AlertDescription>
                <ul className="ml-4 list-disc text-sm">
                  {resultado.avisos.map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          </div>{/* fim do topo fixo */}

          {/* ⚠ SEM CABEÇALHO PRÓPRIO: "Itens (43)" já está no bloco cinza acima, e repetir
              gastava uma faixa inteira para dizer o mesmo número duas vezes. */}
          <Card>
            <CardContent className="p-0">
              {!auxLoaded && (
                <p className="px-4 pb-2 text-xs text-muted-foreground">
                  Carregando contas e classificações do cliente… o botão de criar lançamento
                  habilita quando terminar.
                </p>
              )}
              {/* ⚠ "NÃO SEI" É DIFERENTE DE "NENHUM": sem esta faixa, a lista voltaria a
                  parecer inteiramente nova e o operador lançaria em dobro sem aviso. */}
              {erroConferencia && (
                <p className="border-b border-amber-400 bg-amber-50 px-3 py-1 text-[10px] leading-tight text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Não foi possível conferir o que já foi lançado deste relatório. Confira no
                  Financeiro antes de lançar — os itens abaixo podem já existir.
                </p>
              )}
              {/* ⚠ LISTA DE DUAS ALTURAS, NÃO TABELA — CUSTEIO-TXT-02 (A18). Sete colunas
                  para quatro dados obrigavam a ler na horizontal item por item; o número
                  da linha do TXT e as duas colunas da hierarquia gastavam largura que a
                  descrição precisava. Agora a linha 1 responde "o que é e quanto" e a
                  linha 2 diz de onde veio — o mesmo par que o cartão da OC usa.
                  ⚠ SÓ A LISTA ROLA (A21): o bloco de números e a reconciliação ficam
                  fixos acima, senão some justamente o que o operador confere. */}
              {/* ⚠ SEM SCROLLER PRÓPRIO — A21. O `max-h-[60vh] overflow-y-auto` que estava
                  aqui criava um SEGUNDO scrollport dentro do da aba: duas barras, e rolar
                  a de dentro não move o topo fixo, então o operador via a lista andar sem
                  entender por que o resto ficava. A rolagem já mora no nível certo — o
                  `md:flex-1 md:min-h-0 md:overflow-y-auto` da ConciliacaoBancariaTab, que
                  tem altura porque a seção está no app-shell. Aqui a lista só cresce. */}
              <div>
                <div className="divide-y divide-border/70">
                  {resultado.itens.map((it) => {
                    const hash = hashPorLinha.get(it.linha_num);
                    const lancamentoId = hash ? lancadoPorHash.get(hash) : undefined;
                    const lancada = !!lancamentoId;
                    return (
                      <div key={it.linha_num}
                           className={`px-3 py-[7px] leading-[1.35] ${lancada ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}`}>
                        <div className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{it.produto_raw}</span>
                          <span className="shrink-0 text-[12px] font-medium tabular-nums">{brl(it.valor)}</span>
                          {lancada ? (
                            /* ⚠ O CARIMBO VIRA ENDEREÇO. `?flancId=` é o drill que já existe
                               (V2Index troca de seção e abre o modal oficial no lançamento):
                               nenhuma rota nova, e o operador confere o que lançou sem
                               refazer o caminho. */
                            <button type="button"
                              title="Abrir o lançamento no Financeiro"
                              onClick={() => navigate(`/v2?section=financeiro-lanc&flancId=${lancamentoId}`)}
                              className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] text-emerald-700 underline-offset-2 hover:underline dark:bg-emerald-900/40 dark:text-emerald-300">
                              lançado
                            </button>
                          ) : (
                            <button type="button" disabled={!auxLoaded}
                              title={auxLoaded ? 'Abrir o formulário oficial de lançamento' : 'Carregando contas e classificações…'}
                              onClick={() => setDialogRow(it)}
                              className="shrink-0 rounded-full border px-2 py-px text-[10px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                              lançar
                            </button>
                          )}
                        </div>
                        {/* ⚠ A HIERARQUIA É CONTEXTO, NÃO IDENTIDADE: 10px, cinza, na segunda
                            linha. Ela responde "de onde veio" depois de a linha 1 já ter dito
                            o que é — e é onde a sugestão do de-para vai aparecer. */}
                        <div className="truncate text-[10px] text-muted-foreground">
                          {it.familia_raw} › {it.subfamilia_raw}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {resultado.itens.length === 0 && (
                  <p className="py-8 text-center text-[11px] text-muted-foreground">
                    Nenhum item reconhecido no arquivo.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* O contrato da tela, numa linha e onde ele importa: ao lado da lista. */}
          <p className="text-[10px] text-muted-foreground">
            Cada item abre o formulário oficial; nada é gravado sem a sua confirmação.
          </p>
        </>
      )}

      {/* Modal oficial de lançamento financeiro — reaproveitado, não alterado.
          Conta e subcentro vêm vazios; usuário preenche e salva via fluxo oficial. */}
      <LancamentoV2Dialog
        open={!!dialogRow}
        onClose={() => setDialogRow(null)}
        onSave={async (form) => {
          const row = dialogRow;
          /* ⚠ O HASH VAI JUNTO DA ESCRITA, não depois: um UPDATE em segundo gesto pode
             falhar sozinho e deixar no banco um lançamento que a prévia nunca reconhece —
             o item voltaria a ser proposto para sempre. */
          const hash = row ? hashPorLinha.get(row.linha_num) : undefined;
          const ok = await hookFin.criarLancamento(form, { hashImportacao: hash });
          if (ok) {
            /* Reconsulta em vez de marcar na memória: é a mesma pergunta da abertura, e a
               resposta traz o id que o link precisa. O toast de sucesso é o do próprio
               `criarLancamento` — não duplicar. */
            await conferirLancados();
            setDialogRow(null);
          }
          return ok;
        }}
        fazendas={fazendasReais}
        contas={hookFin.contasBancarias}
        classificacoes={hookFin.classificacoes}
        fornecedores={hookFin.fornecedores}
        /* Sem esta prop o select nasce vazio, e não adianta sugerir uma safra que a lista
           do modal não conhece — a sugestão viraria um id sem opção correspondente. */
        safras={hookFin.safras}
        onCriarFornecedor={hookFin.criarFornecedor}
        defaultFazendaId={fazendaResolvidaId}
        prefill={prefill}
        referenciaOperacionalInfo={referencia}
      />
    </div>
  );
}
