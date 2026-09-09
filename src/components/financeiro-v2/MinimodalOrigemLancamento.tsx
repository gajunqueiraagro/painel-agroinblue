/**
 * O QUE O BANCO MUDOU — PR-CONC-B-2. O minimodal do ícone de origem.
 *
 * ⚠ PRIMEIRO LEITOR DOS SNAPSHOTS. `conciliacao_bancaria_itens` grava desde sempre o valor,
 * a data e o favorecido do lançamento NO MOMENTO do vínculo, e nenhum arquivo de `src/` lia
 * essas colunas — medido em 09/09/2026. Sem elas, "o banco corrigiu o quê?" só se responde
 * comparando de cabeça com o extrato; com elas, a tela mostra antes → depois.
 *
 * ⚠ UMA CONSULTA POR ABERTURA, NUNCA POR LINHA. Quatro selects pequenos em `Promise.all`,
 * disparados no clique. A lista tem centenas de linhas e nenhuma delas paga por este modal
 * enquanto ninguém o abre.
 *
 * ⚠ SÓ DIFERENÇA VIRA LINHA. O bloco "o que o banco mudou" omite o que confere, porque uma
 * lista de três linhas em que duas dizem "igual" esconde a que diz "mudou". Quando nada
 * mudou, a ausência é dita em palavras — nunca deixada em branco.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COMBOBOX_PALETA } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { desfazerVinculo, desfazerGrupo } from '@/hooks/useConciliacaoDoMes';
import {
  type IconeOrigemLancamento,
  rotuloOrigem,
  TITULO_ICONE,
  vinculoVencedor,
} from '@/v2/lib/origemLancamento';

/** A tolerância do dinheiro, a mesma do resto da conciliação: um centavo não é diferença. */
const TOL_CENTAVO = 0.01;

interface VinculoDetalhe {
  id: string;
  extrato_id: string | null;
  grupo_id: string | null;
  tipo_aprovacao: string | null;
  valor_aplicado: number | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string | null;
  snapshot_extrato_valor: number | null;
  snapshot_extrato_data: string | null;
  snapshot_lancamento_valor: number | null;
  snapshot_lancamento_data: string | null;
  snapshot_favorecido_id: string | null;
  snapshot_historico_banco: string | null;
}

interface ExtratoDetalhe {
  id: string;
  data_movimento: string | null;
  descricao: string | null;
  valor: number | null;
  importacao_id: string | null;
}

interface ImportacaoDetalhe {
  id: string;
  nome_arquivo: string | null;
  data_importacao: string | null;
  tipo_arquivo: string | null;
}

interface DadosMinimodal {
  vinculos: VinculoDetalhe[];
  extratos: Map<string, ExtratoDetalhe>;
  importacoes: Map<string, ImportacaoDetalhe>;
  nomes: Map<string, string>;
}

function fmtData(d: string | null | undefined): string {
  if (!d) return '—';
  const so = d.slice(0, 10);
  const [a, m, dia] = so.split('-');
  return dia ? `${dia}/${m}/${a.slice(2)}` : '—';
}

function fmtDataHora(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return fmtData(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${String(dt.getFullYear()).slice(2)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** Um par rótulo-valor do A17: rótulo estreito à esquerda, valor ocupando o resto. */
function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[62px_1fr] gap-2 items-start">
      <span className="text-[10px] text-zinc-400 leading-[14px]">{rotulo}</span>
      <span className="text-[10px] text-zinc-100 leading-[14px] min-w-0">{children}</span>
    </div>
  );
}

/**
 * ⚠ PEDE OS SETE CAMPOS QUE LÊ, NÃO A LINHA INTEIRA — PR-CONC-B-3. O Extrato Gerencial
 * carrega uma projeção estreita de `financeiro_lancamentos_v2`, não um `LancamentoV2`
 * completo, e exigir o tipo cheio obrigaria aquela tela a buscar vinte colunas que não usa
 * — ou a fabricar um objeto com campos falsos só para satisfazer o compilador. A lista do
 * Financeiro continua passando o `LancamentoV2` inteiro; nada mudou para ela.
 */
export type LancamentoDoMinimodal = Pick<
  LancamentoV2,
  'id' | 'created_by' | 'created_at' | 'origem_lancamento' | 'data_pagamento' | 'valor' | 'favorecido_id'
>;

interface Props {
  lancamento: LancamentoDoMinimodal;
  icone: IconeOrigemLancamento;
  /** Nome do favorecido pelo catálogo que a lista já tem — nunca uma consulta a mais. */
  nomeFavorecido: (id: string | null | undefined) => string | undefined;
  onAbrirLancamento: () => void;
  /** Relê os vínculos do cliente: a linha troca de ícone sem F5. */
  onVinculoDesfeito: () => void;
  children: React.ReactNode;
}

export function MinimodalOrigemLancamento({
  lancamento, icone, nomeFavorecido, onAbrirLancamento, onVinculoDesfeito, children,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<DadosMinimodal | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) { setConfirmando(false); setErro(null); return; }
    let cancelado = false;
    setCarregando(true);
    (async () => {
      /* Os vínculos primeiro: são eles que dizem QUAIS extratos e QUAIS pessoas buscar.
         Os três selects seguintes não dependem um do outro e vão juntos. */
      const { data: vinc } = await supabase
        .from('conciliacao_bancaria_itens')
        .select('id, extrato_id, grupo_id, tipo_aprovacao, valor_aplicado, aprovado_por, aprovado_em, created_at, snapshot_extrato_valor, snapshot_extrato_data, snapshot_lancamento_valor, snapshot_lancamento_data, snapshot_favorecido_id, snapshot_historico_banco')
        .eq('lancamento_id', lancamento.id)
        .is('desfeito_em', null);

      const vinculos = (vinc ?? []) as VinculoDetalhe[];
      const extratoIds = vinculos.map((v) => v.extrato_id).filter((x): x is string => !!x);
      const pessoaIds = [lancamento.created_by, ...vinculos.map((v) => v.aprovado_por)]
        .filter((x): x is string => !!x);

      const [resExtratos, resPessoas] = await Promise.all([
        extratoIds.length
          ? supabase.from('extrato_bancario_v2')
              .select('id, data_movimento, descricao, valor, importacao_id').in('id', extratoIds)
          : Promise.resolve({ data: [] }),
        pessoaIds.length
          ? supabase.from('profiles').select('user_id, nome').in('user_id', pessoaIds)
          : Promise.resolve({ data: [] }),
      ]);

      const extratos = new Map<string, ExtratoDetalhe>();
      for (const e of (resExtratos.data ?? []) as ExtratoDetalhe[]) extratos.set(e.id, e);

      const impIds = [...extratos.values()].map((e) => e.importacao_id).filter((x): x is string => !!x);
      const importacoes = new Map<string, ImportacaoDetalhe>();
      if (impIds.length) {
        const { data: imps } = await supabase
          .from('financeiro_importacoes_v2')
          .select('id, nome_arquivo, data_importacao, tipo_arquivo').in('id', impIds);
        for (const i of (imps ?? []) as ImportacaoDetalhe[]) importacoes.set(i.id, i);
      }

      const nomes = new Map<string, string>();
      for (const pr of (resPessoas.data ?? []) as { user_id: string; nome: string | null }[]) {
        if (pr.user_id && pr.nome) nomes.set(pr.user_id, pr.nome);
      }

      if (!cancelado) { setDados({ vinculos, extratos, importacoes, nomes }); setCarregando(false); }
    })();
    return () => { cancelado = true; };
  }, [aberto, lancamento.id, lancamento.created_by]);

  const vinculos = dados?.vinculos ?? [];
  /* O bloco "mudou" sai do MESMO vínculo que decide o ícone — mesma função. */
  const vencedor = vinculoVencedor(vinculos, (v) => v.tipo_aprovacao);
  const umVinculoSo = vinculos.length === 1;
  /* Desfazer só no ✓ e só com um vínculo: com dois, a RPC recusa e o botão prometeria
     uma ação que o banco nega. Botão que some é melhor que botão que erra. */
  const podeDesfazer = icone.simbolo === '✓' && umVinculoSo;

  const rodape = icone.simbolo === '✓'
    ? 'Desfazer devolve o extrato a “sem par”. O lançamento não muda.'
    : icone.simbolo === 'B'
      ? 'Este lançamento nasceu do banco. Desfazer aqui o deixaria solto sem extrato. Para retirar, use Conciliação › Desfazer por arquivo.'
      : icone.simbolo === '↺'
        ? 'O banco substituiu os dados do lançamento. Desfazer não devolve os dados anteriores. Use Conciliação › Desfazer por arquivo.'
        : null;

  /* ⚠ ABS NOS DOIS LADOS: o lançamento carrega sinal e o snapshot guarda o valor como o
     extrato o viu. Comparar com sinal acusaria diferença em toda saída de caixa. */
  const mudancas: { rotulo: string; antes: string | null; depois: string }[] = [];
  if (vencedor) {
    const dAntes = vencedor.snapshot_lancamento_data;
    if (!dAntes || dAntes.slice(0, 10) !== (lancamento.data_pagamento ?? '').slice(0, 10)) {
      mudancas.push({ rotulo: 'Data', antes: dAntes ? fmtData(dAntes) : null, depois: fmtData(lancamento.data_pagamento) });
    }
    const vAntes = vencedor.snapshot_lancamento_valor;
    if (vAntes == null || Math.abs(Math.abs(Number(vAntes)) - Math.abs(Number(lancamento.valor))) > TOL_CENTAVO) {
      mudancas.push({
        rotulo: 'Valor',
        antes: vAntes == null ? null : formatMoeda(Math.abs(Number(vAntes))),
        depois: formatMoeda(Math.abs(Number(lancamento.valor))),
      });
    }
    const fAntes = vencedor.snapshot_favorecido_id;
    if (!fAntes || fAntes !== lancamento.favorecido_id) {
      mudancas.push({
        rotulo: 'Favorecido',
        antes: fAntes ? (nomeFavorecido(fAntes) ?? 'fornecedor fora do catálogo') : null,
        depois: nomeFavorecido(lancamento.favorecido_id) ?? '—',
      });
    }
  }

  const confirmarDesfazer = async () => {
    const v = vinculos[0];
    if (!v) return;
    setDesfazendo(true);
    setErro(null);
    const r = v.grupo_id
      ? await desfazerGrupo(v.grupo_id, 'desfeito_no_financeiro')
      : v.extrato_id
        ? await desfazerVinculo(v.extrato_id, 'desfeito_no_financeiro')
        : { ok: false, erro: 'Vínculo sem extrato: nada a desfazer.' };
    setDesfazendo(false);
    if (!r.ok) { setErro(r.erro ?? 'Não foi possível desfazer.'); setConfirmando(false); return; }
    setAberto(false);
    onVinculoDesfeito();
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn('w-[340px] p-3 not-italic', COMBOBOX_PALETA)}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span className={cn('text-[14px] font-semibold leading-none', icone.cor)}>{icone.simbolo}</span>
          <span className="text-[12px] font-medium text-zinc-100">
            {TITULO_ICONE[icone.simbolo] ?? icone.significado}
          </span>
        </div>

        {carregando && !dados ? (
          <p className="text-[10px] text-zinc-400">Carregando…</p>
        ) : (
          <div className="space-y-1">
            <Linha rotulo="Origem">{rotuloOrigem(lancamento.origem_lancamento)}</Linha>
            <Linha rotulo="Lançado por">
              {(lancamento.created_by && dados?.nomes.get(lancamento.created_by)) || '—'}
              {lancamento.created_at && <span className="text-zinc-400"> · {fmtDataHora(lancamento.created_at)}</span>}
            </Linha>

            {vencedor && (
              <Linha rotulo="Conciliado">
                {(vencedor.aprovado_por && dados?.nomes.get(vencedor.aprovado_por)) || '—'}
                <span className="text-zinc-400"> · {fmtDataHora(vencedor.aprovado_em ?? vencedor.created_at)}</span>
              </Linha>
            )}

            {vinculos.length > 0 && (
              <Linha rotulo="Arquivo">
                {(() => {
                  const ext = vencedor?.extrato_id ? dados?.extratos.get(vencedor.extrato_id) : undefined;
                  const imp = ext?.importacao_id ? dados?.importacoes.get(ext.importacao_id) : undefined;
                  if (!imp) return '—';
                  return (
                    <>
                      <span className="break-all">{imp.nome_arquivo ?? '—'}</span>
                      <span className="text-zinc-400"> · {fmtData(imp.data_importacao)}</span>
                    </>
                  );
                })()}
              </Linha>
            )}

            {vinculos.length > 0 && (
              <Linha rotulo="Extrato">
                {/* Um vínculo por linha: com dois extratos, dizer só o primeiro faria a
                    evidência contradizer o valor conciliado. */}
                <span className="block space-y-0.5">
                  {vinculos.map((v) => {
                    const e = v.extrato_id ? dados?.extratos.get(v.extrato_id) : undefined;
                    return (
                      <span key={v.id} className="block">
                        {fmtData(e?.data_movimento)}
                        <span className="text-zinc-400"> · </span>
                        <span className="inline-block max-w-[150px] truncate align-bottom" title={e?.descricao ?? ''}>
                          {e?.descricao ?? '—'}
                        </span>
                        <span className="text-zinc-400"> · </span>
                        {e?.valor == null ? '—' : formatMoeda(Math.abs(Number(e.valor)))}
                      </span>
                    );
                  })}
                </span>
              </Linha>
            )}

            {vencedor && (
              <div className="pt-2 mt-1 border-t border-zinc-700/40">
                <p className="text-[10px] font-medium text-zinc-100 mb-1">O que o banco mudou</p>
                {mudancas.length === 0 ? (
                  <p className="text-[10px] text-zinc-400">Nada: lançamento e extrato conferem.</p>
                ) : (
                  <div className="space-y-0.5">
                    {mudancas.map((m) => (
                      <div key={m.rotulo} className="grid grid-cols-[62px_1fr] gap-2 items-start">
                        <span className="text-[10px] text-zinc-400 leading-[14px]">{m.rotulo}</span>
                        <span className="text-[10px] leading-[14px] min-w-0">
                          {m.antes === null ? (
                            <span className="text-muted-foreground">sem registro do momento do vínculo</span>
                          ) : (
                            <span className="text-zinc-400">{m.antes}</span>
                          )}
                          <span className="text-zinc-400"> → </span>
                          <span className="text-zinc-100">{m.depois}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {rodape && (
              <p className="text-[10px] text-zinc-400 leading-[14px] pt-2 mt-1 border-t border-zinc-700/40">{rodape}</p>
            )}

            {erro && <p className="text-[10px] text-destructive leading-[14px] pt-1">{erro}</p>}

            <div className="flex items-center gap-1.5 pt-2">
              <Button
                size="sm" variant="ghost"
                className="h-6 px-2 text-[10px] text-zinc-100 hover:bg-zinc-800/60"
                onClick={() => { setAberto(false); onAbrirLancamento(); }}
              >
                Abrir lançamento
              </Button>
              {podeDesfazer && (
                confirmando ? (
                  <Button
                    size="sm" variant="ghost" disabled={desfazendo}
                    className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                    onClick={confirmarDesfazer}
                  >
                    {desfazendo ? 'Desfazendo…' : 'Confirmar'}
                  </Button>
                ) : (
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 px-2 text-[10px] text-zinc-400 hover:bg-zinc-800/60"
                    onClick={() => setConfirmando(true)}
                  >
                    Desfazer?
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
