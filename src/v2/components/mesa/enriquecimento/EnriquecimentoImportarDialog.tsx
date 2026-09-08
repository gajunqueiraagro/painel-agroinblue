// EnriquecimentoImportarDialog — modal de importação (ação pontual).
// Arquivo .xlsx → preview → DE/PARA de conta (obrigatório quando há contas
// distintas) → Popular (fn_classificacao_populate_staging, via hook compartilhado).
// Escrita SOMENTE em staging. NUNCA toca financeiro_lancamentos_v2.
//
// ⚠ OS CARDS NASCERAM DE UMA TELA QUE NÃO SE LIA — 133g item 8. Os blocos de conta eram
// caixas brancas sobre fundo branco, com o texto da planilha em fonte MONO e um checkbox
// de linha inteira embaixo do select: quinze contas viravam uma parede sem começo nem fim.
// Aqui cada conta é um card sobre `bg-muted/40`, e o que já está resolvido colapsa para
// UMA linha — a tela passa a mostrar o que falta, não tudo o que existe.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { reportarErro } from '@/lib/erroOperacional';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import type { ContaResolvivel } from '@/v2/lib/mesa/resolverConta';
import { useImportarClassificacao } from '@/v2/hooks/useImportarClassificacao';
import { useClassificacaoStaging } from '@/v2/hooks/useClassificacaoStaging';
import { fmtBRL, fmtData } from './fmt';

export interface EnriquecimentoImportarDialogProps {
  open: boolean;
  onClose: () => void;
  clienteId: string | null;
  onImportado: (sessaoId: string) => void;
  /** O mês da régua da tela, 'YYYY-MM' — é ele que o casador usa, não o da planilha. */
  anoMes: string;
}

export function EnriquecimentoImportarDialog({ open, onClose, clienteId, onImportado, anoMes }: EnriquecimentoImportarDialogProps) {
  const hookFin = useFinanceiroV2();
  const imp = useImportarClassificacao(clienteId);
  /* ⚠ O CASADOR RODA DEPOIS DE TODAS AS FATIAS, uma vez, sobre a sessão inteira: ele
     compara cada linha com os lançamentos do mês, e rodá-lo por fatia veria só um pedaço
     do universo. O `sessao_id` vem do populate; o `ano_mes`, da régua da tela. */
  const { casarSessao } = useClassificacaoStaging(null, clienteId);
  /* Cards que o operador abriu à mão — os resolvidos pela memória nascem fechados. */
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  // Contas do cliente (lazy) para o DE/PARA — carrega ao abrir.
  useEffect(() => {
    if (open && clienteId) hookFin.loadContas();
  }, [open, clienteId, hookFin.loadContas]);

  const contas = hookFin.contasBancarias;

  /* O que o resolvedor precisa de cada conta — os apelidos validados entram aqui, e é a
     camada que decide o caso do cartão do BB antes que a agência+número o mande para a
     conta corrente de mesma agência. */
  const contasResolviveis = useMemo<ContaResolvivel[]>(
    () => contas.map((c) => ({
      id: c.id,
      nome_conta: c.nome_conta,
      nome_exibicao: c.nome_exibicao,
      banco: c.banco,
      agencia: c.agencia,
      numero_conta: c.numero_conta,
      aliases: c.aliases,
    })),
    [contas]);

  const contasSelecionaveis = useMemo<ContaSelecionavel[]>(
    () => contas.map((c) => ({
      id: c.id,
      nome_conta: c.nome_conta,
      nome_exibicao: c.nome_exibicao,
      tipo_conta: c.tipo_conta,
      banco: c.banco,
    })),
    [contas]);

  const lote = imp.lote;

  /* ⚠ UMA VEZ POR LOTE, E DEPOIS QUE O CADASTRO CHEGOU. A identidade do objeto `lote` é o
     guard: arquivo novo, objeto novo, memória de novo. Enquanto `contas` está vazio o
     efeito sai sem marcar nada — senão a única passagem seria a que não tinha catálogo. */
  const lotePreResolvido = useRef<typeof lote>(null);
  useEffect(() => {
    if (!lote || contasResolviveis.length === 0) return;
    if (lotePreResolvido.current === lote) return;
    lotePreResolvido.current = lote;
    imp.preResolverPelaMemoria(contasResolviveis);
    // `imp` é recriado a cada render; a dependência real é o par (lote, cadastro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote, contasResolviveis]);

  const podePopular = !!lote && lote.linhasValidas > 0 && imp.todasResolvidasOuIgnoradas && !imp.isPopulating;
  const pendentes = imp.contasDistintas.filter((c) => {
    const it = imp.contaMap[c.texto];
    return !it?.ignorar && !it?.contaId;
  }).length;

  /* Quantas linhas o botão vai popular: as válidas menos as das contas que o operador
     mandou ignorar. É o número do gesto, não o do arquivo. */
  const linhasIgnoradas = imp.contasDistintas
    .filter((c) => imp.contaMap[c.texto]?.ignorar)
    .reduce((s, c) => s + c.qtd, 0);
  const linhasAPopular = Math.max(0, (lote?.linhasValidas ?? 0) - linhasIgnoradas);

  async function handleSelect(file: File | null) {
    try {
      setExpandidos({});
      const parsed = await imp.selecionarArquivo(file);
      if (!parsed) return;
      if (parsed.linhasValidas === 0 && parsed.linhasComErro > 0) toast.error(`Nenhuma linha válida — ${parsed.linhasComErro} rejeitada(s).`);
      else if (parsed.linhasComErro > 0) toast.warning(`${parsed.linhasValidas} válida(s) · ${parsed.linhasComErro} rejeitada(s).`);
      else toast.success(`Excel lido: ${parsed.linhasValidas} linha(s) válida(s).`);
    } catch (e: unknown) {
      // As rejeições de linha do parser continuam visíveis na lista `errosParser`
      // do preview; aqui só a falha global da leitura, já sanitizada.
      reportarErro(e, 'lerExcelClassificacao', toast.error);
    }
  }

  async function handlePopular() {
    try {
      const res = await imp.popular();
      if (!res) return;
      /* ⚠ O TOAST TÉCNICO SAIU — [ENRIQUECER-MOTOR-01] (133a). "Staging populada (492
         linhas). ambiguo: 26 · sem_match: 590" é o vocabulário do banco despejado na tela:
         "staging" e "match" não são palavras do operador, e o número de status somava mais
         que as linhas. Em vez dele, o resultado do CASADOR, em português. */
      const r = await casarSessao({ sessao_id: res.sessaoId, ano_mes: anoMes });
      const agrupam = r.sugestaoGrupo + r.sugestaoSplit;
      toast.success(
        `${r.casou} atualizam · ${r.ambiguo} você decide · ${agrupam} agrupam · ${r.semPar + r.semConta} sem par`);
      onImportado(res.sessaoId);
      imp.reset();
    } catch (e: unknown) {
      reportarErro(e, 'popularStagingClassificacao', toast.error);
    }
  }

  const nomeDaConta = (id: string | null | undefined): string => {
    if (!id) return '—';
    const c = contas.find((x) => x.id === id);
    return c ? (c.nome_exibicao || c.nome_conta) : '—';
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* ⚠ TAMANHO FIXO E UM SCROLLPORT SÓ (A21): o diálogo crescia com o arquivo, e com
          quinze contas o rodapé saía da tela — o operador mapeava tudo e não achava o
          botão. Aqui só a lista de cards rola; cabeçalho e rodapé ficam. */}
      <DialogContent className="flex h-[560px] max-h-[92vh] w-[720px] max-w-[96vw] flex-col gap-0 overflow-hidden bg-muted/40 p-0">
        <DialogHeader className="shrink-0 space-y-0.5 border-b bg-card px-3 py-2">
          <DialogTitle className="text-[13px] font-medium">Importar Excel de classificação</DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {lote
              ? <>{lote.linhasValidas} válidas · {lote.linhasComErro} rejeitadas{pendentes > 0 ? ` · ${pendentes} conta(s) a mapear` : ''}</>
              : 'Escolha a planilha do mês.'}
          </p>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-1.5">
          <input type="file" accept=".xlsx" className="text-[11px]"
            onChange={(e) => handleSelect(e.target.files?.[0] ?? null)} />
          {imp.parsing && <span className="text-[10px] text-muted-foreground">Lendo…</span>}
        </div>

        {/* ⚠ O SCROLLPORT — e é o único da tela. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {imp.errosParser.length > 0 && (
            <div className="mb-2 rounded-md border border-red-200 bg-red-50/60 px-2 py-1.5 dark:border-red-900 dark:bg-red-950/20">
              <div className="text-[10px] font-medium text-red-700 dark:text-red-400">
                {imp.errosParser.length} linha(s) rejeitada(s) pelo leitor
              </div>
              <ul className="mt-0.5 list-disc pl-4 text-[10px] text-red-700 dark:text-red-400">
                {imp.errosParser.slice(0, 8).map((er, i) => <li key={i}>L{er.linha}: {er.motivo}</li>)}
                {imp.errosParser.length > 8 && <li>… +{imp.errosParser.length - 8}</li>}
              </ul>
            </div>
          )}

          {imp.contasDistintas.length === 0 ? (
            <p className="py-8 text-center text-[11px] text-muted-foreground">
              {lote ? 'A planilha não trouxe conta nenhuma para mapear.' : 'Nenhuma planilha escolhida.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {imp.contasDistintas.map((c) => {
                const item = imp.contaMap[c.texto];
                const ignorar = !!item?.ignorar;
                const resolvida = !!item?.contaId;
                const pelaMemoria = imp.origemConta[c.texto] === 'memoria' && resolvida;
                /* Colapsa só o que a memória resolveu: pendente e decidido-à-mão ficam
                   abertos, porque um ainda pede trabalho e o outro acabou de recebê-lo. */
                const aberto = expandidos[c.texto] ?? !pelaMemoria;
                const pendente = !resolvida && !ignorar;
                return (
                  <div key={c.texto}
                    className={`rounded-md border bg-card px-3 py-2.5 ${
                      pendente ? 'border-amber-300 dark:border-amber-800' : 'border-border'}`}>
                    {/* Cabeçalho do card, em UMA linha. Clicar alterna o corpo. */}
                    <button type="button"
                      onClick={() => setExpandidos((p) => ({ ...p, [c.texto]: !aberto }))}
                      className="flex w-full items-baseline gap-2 text-left">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={c.texto}>
                        {c.texto}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{c.qtd} linhas</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {fmtData(c.primeiraData)} · {fmtBRL(c.soma)}
                      </span>
                    </button>

                    {!aberto && (
                      <div className="mt-1 flex items-center gap-1.5">
                        {pelaMemoria && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            pela memória
                          </span>
                        )}
                        <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                          {nomeDaConta(item?.contaId)}
                        </span>
                      </div>
                    )}

                    {aberto && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <ContaBancariaSelect
                            value={item?.contaId ?? ''}
                            onValueChange={(id) => imp.resolverConta(c.texto, { contaId: id || null })}
                            contas={contasSelecionaveis}
                            placeholder="Selecione a conta…"
                            disabled={ignorar}
                            showBankDetails="banco"
                            className="h-7 text-[11px]"
                          />
                        </div>
                        {pelaMemoria && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            pela memória
                          </span>
                        )}
                        {/* ⚠ LINK, NÃO CHECKBOX DE LINHA INTEIRA: ignorar é a exceção, e um
                            controle de largura total ao lado do select dava às duas
                            respostas o mesmo peso visual. */}
                        <button type="button"
                          onClick={() => imp.resolverConta(c.texto, { ignorar: !ignorar })}
                          className={`shrink-0 text-[10px] underline-offset-2 hover:underline ${
                            ignorar ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          {ignorar ? 'Ignorada — voltar' : 'Ignorar esta conta'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-card px-3 py-2">
          {pendentes > 0 && (
            /* O botão desabilitado diz por quê, ao lado, em 10px — e é a MESMA frase do
               `title`, para não haver duas explicações da mesma trava. */
            <span className="mr-auto text-[10px] text-muted-foreground">
              {pendentes} conta(s) sem resposta — escolha a conta ou marque "ignorar".
            </span>
          )}
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="h-7 text-[11px]" disabled={!podePopular} onClick={handlePopular}
            title={pendentes > 0 ? `${pendentes} conta(s) sem resposta — escolha a conta ou marque "ignorar".` : undefined}>
            {imp.isPopulating
              ? (imp.progresso ? `Populando… ${imp.progresso.feitas}/${imp.progresso.total}` : 'Populando…')
              : `Popular ${linhasAPopular} linhas`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
