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
export default function CusteioTxtImportTab({ arquivoInicial }: { arquivoInicial?: File } = {}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CusteioParseResult | null>(null);

  // PR-RAUL-02A — linha selecionada que abre o modal oficial.
  const [dialogRow, setDialogRow] = useState<CusteioItem | null>(null);

  // PR-RAUL-02B — linhas já gravadas (id estável = linha_num do parser).
  // Previne duplicidade: após sucesso, a linha vira "Lançado" e perde o botão.
  const [linhasLancadas, setLinhasLancadas] = useState<Set<number>>(new Set());

  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const hookFin = useFinanceiroV2();

  // useFinanceiroV2 é lazy (PR-Mesa-A1): disparar loads de contas/fornecedores/
  // classificações quando o cliente estiver resolvido. Sem isso o modal abre vazio.
  useEffect(() => {
    if (!clienteAtual?.id) return;
    hookFin.loadContas();
    hookFin.loadFornecedores();
    hookFin.loadClassificacoes();
  }, [
    clienteAtual?.id,
    hookFin.loadContas,
    hookFin.loadFornecedores,
    hookFin.loadClassificacoes,
  ]);

  const fazendasReais = useMemo(
    () => fazendas.filter((f) => f.id !== '__global__'),
    [fazendas],
  );

  // Botão "Criar lançamento" só habilita quando os auxiliares chegaram.
  const auxLoaded = hookFin.contasBancarias.length > 0 && fazendasReais.length > 0;

  // Resolve FAZENDA MONTERREY por match exato de nome; se não achar, undefined
  // (usuário escolhe no modal — não inventamos fazenda).
  const fazendaResolvidaId = useMemo(() => {
    if (!resultado?.fazenda_raw) return undefined;
    const alvo = normNome(resultado.fazenda_raw);
    return fazendasReais.find((f) => normNome(f.nome) === alvo)?.id;
  }, [resultado?.fazenda_raw, fazendasReais]);

  const dataMes = ultimoDiaDoMes(resultado?.ano_mes);

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
      // conta_bancaria_id / favorecido_id / subcentro / plano_conta_id:
      // NÃO pré-preenchidos — usuário escolhe no modal oficial.
    };
  }, [dialogRow, fazendaResolvidaId, dataMes]);

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
    setLinhasLancadas(new Set());
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
                    const lancada = linhasLancadas.has(it.linha_num);
                    return (
                      <div key={it.linha_num}
                           className={`px-3 py-[7px] leading-[1.35] ${lancada ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}`}>
                        <div className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{it.produto_raw}</span>
                          <span className="shrink-0 text-[12px] font-medium tabular-nums">{brl(it.valor)}</span>
                          {lancada ? (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              lançado
                            </span>
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
          const ok = await hookFin.criarLancamento(form);
          if (ok) {
            // marca a linha como lançada (id estável = linha_num do parser).
            // O toast de sucesso é o do próprio hookFin.criarLancamento — não duplicar.
            if (row) {
              setLinhasLancadas((prev) => {
                const next = new Set(prev);
                next.add(row.linha_num);
                return next;
              });
            }
            setDialogRow(null);
          }
          return ok;
        }}
        fazendas={fazendasReais}
        contas={hookFin.contasBancarias}
        classificacoes={hookFin.classificacoes}
        fornecedores={hookFin.fornecedores}
        onCriarFornecedor={hookFin.criarFornecedor}
        defaultFazendaId={fazendaResolvidaId}
        prefill={prefill}
        referenciaOperacionalInfo={referencia}
      />
    </div>
  );
}
