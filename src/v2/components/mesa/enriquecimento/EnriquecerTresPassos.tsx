/**
 * A aba Enriquecer, em três passos — [ENRIQUECER-TELA-01] (133b).
 *
 * ⚠ ERAM DOIS BLOCOS FAZENDO O MESMO TRABALHO. O importador de planilha em cima
 * (`V2ImportLancamentosExcel` em modo veste) e a Mesa embaixo respondiam à mesma pergunta
 * — "esta linha da planilha é qual lançamento?" — por caminhos diferentes e com números
 * diferentes, e o operador não sabia qual usar. Aqui há um caminho só, na ordem em que o
 * trabalho acontece: ler e ensinar o de-para · revisar · gravar.
 *
 * ⚠ O MOTOR É O DA MESA: staging + `fn_classificacao_casar_sessao` + `apply_row`. O que o
 * bloco de cima contribui é a LEITURA DO ARQUIVO e o DE-PARA COM MEMÓRIA; o Confirmar dele
 * e o laço de `editarLancamento` não são montados nesta aba. A rota do menu ("Importação
 * de lançamentos") segue com a tela completa — lá se cria, aqui só se veste.
 *
 * ⚠ DOIS HOOKS SOBRE O MESMO ARQUIVO, e é deliberado: `useImportLancamentosExcel` sabe
 * ler a planilha e memorizar apelidos; `useImportarClassificacao` sabe pôr as linhas no
 * staging. Fundir os dois parsers seria reescrever um motor homologado para poupar uma
 * leitura de arquivo no navegador — e é a leitura, não a escrita, que é barata.
 *
 * ⚠ O DE-PARA DE CONTA ATRAVESSA. O que o operador resolve no passo 1 é copiado para o
 * mapa de contas do importador de staging antes de popular: sem isso, a conta ensinada
 * aqui não chegaria ao casador e as linhas cairiam em "sem conta bancária na planilha".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useImportLancamentosExcel } from '@/v2/hooks/useImportLancamentosExcel';
import { tipoPorContaPlano } from '@/v2/lib/importLanc/importLancamentosView';
import { useImportarClassificacao } from '@/v2/hooks/useImportarClassificacao';
import { useClassificacaoStaging, useSessoesClassificacao } from '@/v2/hooks/useClassificacaoStaging';
import { resumirGrupos } from '@/v2/lib/mesa/enriquecimentoView';
import { classificarConta } from '@/v2/lib/mesa/resolverConta';
import { EnriquecerPasso1DePara } from './EnriquecerPasso1DePara';
import { MesaEnriquecimentoTab } from './MesaEnriquecimentoTab';
import { dataHoraCurta, mesAbrev } from './fmt';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type Passo = 1 | 2 | 3;

export interface EnriquecerTresPassosProps {
  ano: number;
  mes: number;
  clienteNome?: string;
  /** A conta da régua — só contexto do cabeçalho; a partição de trabalho é do passo 2. */
  contaNome?: string;
  /** 133c — o destino do "Ver no Financeiro" no relatório final do lote. */
  onVerNoFinanceiro?: () => void;
}

export function EnriquecerTresPassos({ ano, mes, clienteNome, contaNome, onVerNoFinanceiro }: EnriquecerTresPassosProps) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const anoMesRegua = `${ano}-${String(mes).padStart(2, '0')}`;

  const [passo, setPasso] = useState<Passo>(1);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  /* Uma vez que o operador escolheu um passo à mão, a tela para de decidir por ele: abrir
     sozinha no 2 é conveniência da PRIMEIRA vez, não uma correção contínua. */
  const escolheuPasso = useRef(false);

  // ── Leitura do arquivo + de-para com memória (o bloco de cima, sem o Confirmar dele) ──
  const {
    dePara, pendentes, parse, arquivo, lendo, erro,
    classificacoes, fornecedores, fazendas, contasBancarias, safras,
    lerArquivo, resolverManualmente, alternarDescarte, limpar,
  } = useImportLancamentosExcel(true);

  // ── O mesmo arquivo, no motor que põe as linhas no staging ──
  const imp = useImportarClassificacao(clienteId);

  const { data: sessoes } = useSessoesClassificacao(clienteId);
  const { staging } = useClassificacaoStaging(sessaoId, clienteId);
  const { casarSessao, isCasando } = useClassificacaoStaging(null, clienteId);

  /**
   * A sessão da régua — a mais recente DO MÊS que a tela mostra.
   *
   * ⚠ NÃO É "A MAIS RECENTE DE TODAS". São 166 sessões acumuladas; abrir a última
   * importada colocaria a tela de agosto mostrando o arquivo de maio, que foi exatamente
   * o defeito que o B-40 item 5 pagou no seletor da Mesa.
   */
  const sessaoDaRegua = useMemo(() => {
    const doMes = (sessoes ?? []).filter((s) => s.excel_ano_mes === anoMesRegua);
    if (doMes.length === 0) return null;
    return [...doMes].sort((a, b) => b.criada_em.localeCompare(a.criada_em))[0];
  }, [sessoes, anoMesRegua]);

  useEffect(() => {
    if (escolheuPasso.current) return;
    if (sessaoDaRegua) { setSessaoId(sessaoDaRegua.sessao_id); setPasso(2); }
  }, [sessaoDaRegua]);

  const irParaPasso = useCallback((p: Passo) => { escolheuPasso.current = true; setPasso(p); }, []);

  // ── Números da barra de passos ──────────────────────────────────────────────
  const resumo = useMemo(() => resumirGrupos(staging ?? []), [staging]);
  const valoresDePara = useMemo(() => (dePara
    ? Object.keys(dePara.subcentro).length + Object.keys(dePara.fazenda).length
      + Object.keys(dePara.fornecedor).length + Object.keys(dePara.conta).length
      + Object.keys(dePara.safra).length
    : 0), [dePara]);

  /* O tipo de operação por texto de conta do plano — filtra a subárvore do seletor,
     exatamente como o painel da rota do menu faz. */
  const tipoPorTexto = useMemo(() => (parse ? tipoPorContaPlano(parse.rows) : {}), [parse]);

  /**
   * Os candidatos de CONTA por texto — a correção do 133b.
   *
   * ⚠ SUBSTRING VIROU SUGESTÃO, NÃO VEREDITO: `resolverContaPorTexto` deixou de resolver
   * por "contém", e `classificarConta` devolve os candidatos ordenados do nome mais longo
   * para o mais curto. É o que impede "Cartão Sicredi Lavoura Ag. 0903…" de ser gravado
   * como a conta corrente "Sicredi Lavoura" sem o operador ter visto a conta escolhida.
   */
  const candidatosDeConta = useMemo(() => {
    if (!dePara) return {};
    const mapa: Record<string, Array<{ id: string; rotulo: string }>> = {};
    for (const texto of Object.keys(dePara.conta)) {
      const c = classificarConta(texto, contasBancarias);
      if (c.candidatos.length === 0) continue;
      mapa[texto] = c.candidatos.map((k) => ({ id: k.id, rotulo: k.nome_exibicao }));
    }
    return mapa;
  }, [dePara, contasBancarias]);

  // ── Escolher o arquivo: os DOIS motores leem o mesmo File ───────────────────
  /* ⚠ O ERRO DE LEITURA MORRE AQUI, e não como rejeição solta: `selecionarArquivo` lança
     quando o arquivo não é uma planilha legível, e a Promise não capturada derrubaria a
     aba sem dizer nada. O que o operador precisa saber é qual arquivo falhou. */
  async function escolherArquivo(f: File) {
    try {
      await Promise.all([lerArquivo(f), imp.selecionarArquivo(f)]);
    } catch (e: unknown) {
      toast.error(`Não foi possível ler ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Ir para a Revisão — popula o staging (ou recasa, quando já há sessão).
   *
   * ⚠ RECASAR EM VEZ DE REPOPULAR quando a sessão já existe: `fn_classificacao_casar_sessao`
   * não toca em linha aplicada nem resolvida à mão, e popular de novo duplicaria as linhas
   * (a RPC de populate acumula sobre a mesma sessão — conferido: zero DELETE no corpo dela).
   */
  const [preparando, setPreparando] = useState(false);
  async function irParaRevisao() {
    if (!clienteId) return;
    setPreparando(true);
    try {
      if (sessaoId && !imp.lote) {
        await casarSessao({ sessao_id: sessaoId, ano_mes: anoMesRegua });
        irParaPasso(2);
        return;
      }
      if (!imp.lote) { toast.error('Escolha a planilha primeiro.'); return; }
      /* O de-para de conta que o operador resolveu no passo 1 desce para o importador de
         staging: é a mesma pergunta, respondida uma vez. */
      if (dePara) {
        for (const [texto, item] of Object.entries(dePara.conta)) {
          if (item.valor) imp.resolverConta(texto, { contaId: item.valor });
          else if (item.descartado) imp.resolverConta(texto, { ignorar: true });
        }
      }
      const res = await imp.popular();
      if (!res) return;
      const r = await casarSessao({ sessao_id: res.sessaoId, ano_mes: anoMesRegua });
      toast.success(
        `${r.casou} atualizam · ${r.ambiguo} você decide · ${r.sugestaoGrupo + r.sugestaoSplit} agrupam · ${r.semPar + r.semConta} sem par`);
      setSessaoId(res.sessaoId);
      imp.reset();
      irParaPasso(2);
    } catch (e: unknown) {
      toast.error(`Não foi possível preparar a Revisão: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreparando(false);
    }
  }

  /* O motivo do botão desabilitado é a fonte ÚNICA do `disabled`, do `title` e da dica —
     a regra do botão que diz por quê. */
  const motivoIrRevisao =
    !clienteId ? 'Escolha um cliente.'
    : !imp.lote && !sessaoId ? 'Escolha a planilha do mês primeiro.'
    : !imp.todasResolvidasOuIgnoradas && imp.lote ? 'Resolva ou ignore as contas da planilha no card Conta bancária.'
    : null;

  const carimbo = sessaoDaRegua ? dataHoraCurta(sessaoDaRegua.criada_em) : '';
  const subtitulo = [
    arquivo?.name ?? (sessaoDaRegua ? `importação de ${mesAbrev(sessaoDaRegua.excel_ano_mes)}` : null),
    parse?.nomeSheet ? `aba ${parse.nomeSheet}` : null,
    parse ? `${parse.rows.length} linhas` : sessaoDaRegua ? `${sessaoDaRegua.total} linhas` : null,
    carimbo ? `importada ${carimbo}` : null,
    contaNome || null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-1.5 md:min-h-0 md:flex-1">
      {/* ═══ CABEÇALHO ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0">
        <div className="text-[13px] font-medium leading-tight">
          Enriquecer {MESES[mes - 1] ?? '—'}/{ano} — {clienteNome ?? '—'}
        </div>
        <div className="truncate text-[10px] leading-tight text-muted-foreground" title={subtitulo}>
          {subtitulo || 'Nenhuma planilha lida ainda.'}
        </div>
      </div>

      {/* ═══ BARRA DE PASSOS ════════════════════════════════════════════════════ */}
      <div className="flex shrink-0 gap-1 border-b">
        <PassoBotao n={1} titulo="Planilha e de-para" ativo={passo === 1}
          concluido={!!dePara && (pendentes?.total ?? 0) === 0}
          detalhe={dePara ? `${valoresDePara} valores · ${pendentes?.total ?? 0} a resolver` : 'escolher a planilha'}
          onClick={() => irParaPasso(1)} />
        <PassoBotao n={2} titulo="Revisão" ativo={passo === 2}
          concluido={false}
          detalhe={sessaoId
            ? `${resumo.atualizam.qtd} atualizam · ${resumo.decide.qtd} você decide · ${resumo.agrupam.qtd} agrupam · ${resumo.sem_par.qtd} sem par`
            : 'sem importação neste mês'}
          onClick={() => irParaPasso(2)} />
        <PassoBotao n={3} titulo="Gravar" ativo={passo === 3} concluido={false}
          detalhe="—" onClick={() => irParaPasso(3)} />
      </div>

      {/* ═══ PASSO 1 ════════════════════════════════════════════════════════════ */}
      {passo === 1 && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex shrink-0 flex-wrap items-end gap-2 rounded-lg border bg-card px-2 py-1.5">
            <div className="min-w-[220px]">
              <Label className="text-[10px]">Planilha do mês (.xlsx, .xls)</Label>
              <Input type="file" accept=".xlsx,.xls" className="h-7 text-[11px]"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void escolherArquivo(f);
                  e.target.value = '';
                }} />
            </div>
            {arquivo && (
              <Button variant="ghost" className="h-7 text-[10px]" disabled={lendo}
                onClick={() => { limpar(); imp.reset(); }}>
                Trocar planilha
              </Button>
            )}
            {(lendo || imp.parsing) && <span className="text-[10px] text-muted-foreground">Lendo a planilha…</span>}
            {erro && <span className="text-[10px] text-destructive">{erro}</span>}
            {imp.isPopulating && imp.progresso && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Preparando {imp.progresso.feitas} de {imp.progresso.total}…
              </span>
            )}
          </div>

          {dePara && pendentes ? (
            <EnriquecerPasso1DePara
              dePara={dePara}
              pendentes={pendentes}
              linhasLidas={parse?.rows.length ?? 0}
              classificacoes={classificacoes}
              fazendas={fazendas}
              fornecedores={fornecedores}
              contas={contasBancarias}
              safras={safras}
              tipoPorTexto={tipoPorTexto}
              candidatosPorTexto={candidatosDeConta}
              onResolver={resolverManualmente}
              onDescartar={alternarDescarte}
              /* ⚠ O CADASTRO DE FORNECEDOR NOVO AINDA NÃO ABRE DAQUI, e o botão só
                 aparece depois de buscar e não achar. O diálogo de criação mora em
                 `ImportLancDeParaPanel`; trazê-lo é trabalho próprio, e um "+" que não
                 abre nada seria pior que nenhum. Reportado. */
              onIrParaRevisao={() => { void irParaRevisao(); }}
              irParaRevisaoOcupado={preparando || imp.isPopulating || isCasando}
              irParaRevisaoMotivo={motivoIrRevisao}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
              <p className="max-w-[520px] px-4 py-8 text-center text-[11px] leading-relaxed text-muted-foreground">
                Escolha a planilha do mês acima. Ela é lida aqui no navegador: nada é gravado até você
                passar pela Revisão. As respostas que você der no de-para ficam memorizadas para as
                próximas importações deste cliente.
                {sessaoId && (
                  <>
                    {' '}Já existe uma importação deste mês —{' '}
                    <button type="button" className="underline underline-offset-2" onClick={() => irParaPasso(2)}>
                      ir direto para a Revisão
                    </button>.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ PASSO 2 ════════════════════════════════════════════════════════════ */}
      {passo === 2 && (
        <MesaEnriquecimentoTab
          anoMesRegua={anoMesRegua}
          sessaoId={sessaoId}
          onSessaoId={setSessaoId}
          onVerNoFinanceiro={onVerNoFinanceiro}
        />
      )}

      {/* ═══ PASSO 3 ════════════════════════════════════════════════════════════ */}
      {passo === 3 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed">
          <div className="max-w-[560px] px-4 py-8 text-center">
            <p className="text-[12px] font-medium">
              {resumo.atualizam.qtd} atualizam · {resumo.decide.qtd} você decidiu · {resumo.agrupam.qtd} agrupam
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              A gravação em lote entra na próxima parte. Até lá, o que já está decidido pode ser
              gravado linha a linha pela mesa ampliada, no passo 2.
            </p>
            <Button size="sm" className="mt-2 h-7 text-[11px]" disabled title="em construção — 133c">
              Gravar {resumo.atualizam.qtd} + {resumo.decide.qtd} decididos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Um passo da barra. Ativo com borda inferior em `bg-primary`; concluído com ✓ verde.
 *
 * ⚠ CLICAR TROCA DE PASSO, sempre — inclusive "para trás". O operador que já está na
 * Revisão e percebe um de-para errado precisa voltar sem perder a sessão, e é para isso
 * que a sessão mora na casca e não no passo.
 */
function PassoBotao({
  n, titulo, detalhe, ativo, concluido, onClick,
}: { n: number; titulo: string; detalhe: string; ativo: boolean; concluido: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`min-w-0 flex-1 border-b-2 px-2 py-1 text-left transition-colors ${
        ativo ? 'border-primary' : 'border-transparent hover:bg-muted/40'}`}>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[11px] font-medium tabular-nums ${ativo ? '' : 'text-muted-foreground'}`}>{n}</span>
        <span className={`truncate text-[12px] font-medium ${ativo ? '' : 'text-muted-foreground'}`}>{titulo}</span>
        {concluido && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">✓</span>}
      </div>
      <div className="truncate text-[10px] leading-tight text-muted-foreground" title={detalhe}>{detalhe}</div>
    </button>
  );
}
