/**
 * CASAR COM O BANCO — PR-ESPELHO-03b.
 *
 * ⚠ O RESUMO É DA RPC, NUNCA DO FRONT. Os três números (no extrato, soma, diferença) vêm do
 * retorno de `fn_espelho_casar` a cada mudança. Somar aqui daria uma segunda régua: o front
 * arredondaria de um jeito, o servidor de outro, e o operador veria "0,00" num botão que
 * depois recusa. Quem valida é quem grava.
 *
 * ⚠ `soma_nao_bate` NÃO É ERRO — é o estado normal enquanto a conta não fecha. A RPC devolve
 * `ok:false` com os três números, e é justamente esse payload que alimenta o resumo. Tratá-lo
 * como falha encheria a tela de vermelho durante o trabalho inteiro.
 *
 * ⚠ NUNCA RATEIO PROPORCIONAL (regra do Gabriel). A tela não distribui a diferença entre os
 * lançamentos: quem sabe quanto cada um vale é o operador. Ele ajusta um valor, remove um do
 * casamento, ou cria o que falta — gestos explícitos, nenhum palpite.
 * ⚠ E O BANCO PREVALECE (PR-CONC-CASAR-VALOR-BANCO-01): "Usar valor do banco" (um levado) e
 * "absorver a diferença" (vários, numa linha escolhida) põem o valor no CAMPO com um clique. É o
 * mesmo gesto de digitar, só que sem digitar — e a `fn_espelho_casar` grava esse valor no próprio
 * lançamento ao Conciliar (`UPDATE ... SET valor`, com a data do extrato e status realizado): o
 * previsto vira o real. Nada concilia sozinho; o operador ainda clica Conciliar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Segmentado } from '@/components/ui/segmentado';
import { CriarLancamentoDaLinha } from '@/components/conciliacao/CriarLancamentoDaLinha';
import { MOTIVO_CASAR_LABEL } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { STATUS_PALETA, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');

export interface ExtratoAlvo {
  extrato_id: string; data: string | null; historico: string | null; valor: number;
}
export interface LevadoInicial {
  lancamento_id: string; descricao: string | null; fornecedor?: string | null; valor_assinado: number;
  /** PR-CONC-SUGESTOES-CASAR-01: a sugestão "nome · valor diferente" abre com o VALOR DO BANCO no campo, e a linha
   *  diz "era R$ X". É o mesmo gesto do "Usar valor do banco", feito pela sugestão; o Conciliar não muda. */
  usarValorDoBanco?: boolean;
  /** PR-CONC-SUGESTOES-CASAR-01: a linha de identificação mostra vencimento e status; ausentes, "—". */
  data_vencimento?: string | null;
  status_transacao?: string | null;
}

const PALETA_DO_STATUS: Record<string, { texto: string } | undefined> = {
  previsto: STATUS_PALETA.previsto, programado: STATUS_PALETA.programado, agendado: STATUS_PALETA.agendado,
  realizado: STATUS_PALETA.realizado, conciliado: STATUS_PALETA.conciliado,
};
const vencCurto = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');

interface Levado extends LevadoInicial { valorTexto: string; }

/**
 * O SENTIDO DA DIFERENÇA, dito como o operador lê — PR-CONC-CASAR-VALOR-BANCO-01.
 * ⚠ A FRASE ANTIGA ERA INVERTIDA. A RPC devolve `diferenca = soma − no_extrato`, os dois ASSINADOS. Numa
 * saída (extrato −506,51, lançamento −506,84) a diferença é −0,33 e a frase dizia "somam menos" — mas o
 * lançamento é MAIOR que o que o banco pagou. O sentido se mede contra o sinal do extrato: diferença do
 * MESMO sinal que ele = os lançamentos passam do banco ("a mais").
 */
export function sentidoDaDiferenca(diferenca: number, noExtrato: number): 'a_mais' | 'a_menos' | 'confere' {
  if (Math.abs(diferenca) <= 0.01) return 'confere';
  return diferenca * Math.sign(noExtrato || 1) > 0 ? 'a_mais' : 'a_menos';
}

/**
 * O VALOR DA LINHA QUE ABSORVE A DIFERENÇA INTEIRA — PR-CONC-CASAR-VALOR-BANCO-01. `valorAtual` é o do campo
 * (em módulo, como o campo trabalha) e `sinalDaLinha` o do lançamento (+1 entrada, −1 saída): a contribuição
 * da linha na soma é `sinal × valor`, e tirar dela a diferença deixa a soma igual ao extrato. Devolve `null`
 * quando a linha ficaria zerada ou negativa — aí a ação fica desabilitada com o motivo.
 */
export function valorAbsorvendo(valorAtual: number, sinalDaLinha: number, diferenca: number): number | null {
  const novo = Math.round((valorAtual - diferenca * Math.sign(sinalDaLinha || 1)) * 100) / 100;
  return novo > 0 ? novo : null;
}

const paraCampo = (v: number) => Math.abs(v).toFixed(2).replace('.', ',');

/** O que a última simulação disse. `null` enquanto viaja. */
interface Simulacao { ok: boolean; noExtrato: number; soma: number; diferenca: number; erro: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  extrato: ExtratoAlvo | null;
  iniciais: readonly LevadoInicial[];
  nomeConta?: string;
  contaBancariaId: string | null;
  onConciliado: () => void;
}

export function CasarComBancoModal({ open, onClose, extrato, iniciais, nomeConta, contaBancariaId, onConciliado }: Props) {
  const [levados, setLevados] = useState<Levado[]>([]);
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [erroRodape, setErroRodape] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [criando, setCriando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setLevados(iniciais.map((l) => ({
      ...l, valorTexto: paraCampo(l.usarValorDoBanco && extrato ? extrato.valor : l.valor_assinado),
    })));
    setErroRodape(null);
    setSim(null);
  }, [open, iniciais, extrato]);

  const valorDe = (t: string) => Number(t.replace(/\./g, '').replace(',', '.')) || 0;
  const itens = useMemo(
    () => levados.map((l) => ({ lancamento_id: l.lancamento_id, valor: Math.abs(valorDe(l.valorTexto)) })),
    [levados],
  );

  const simular = useCallback(async () => {
    if (!extrato) return;
    /* ⚠ LISTA VAZIA NÃO CHAMA A RPC — PR-ESPELHO-05 parte B. Ela devolveria `sem_itens`, que
       é motivo de erro, e o modal ficaria vermelho no exato instante em que o operador ainda
       não fez nada. O resumo com zero levados é aritmética de uma linha: tudo o que o banco
       pagou está em falta, e é isso que habilita "criar pela diferença". */
    if (itens.length === 0) {
      const alvo = Math.abs(extrato.valor);
      setErroRodape(null);
      setSim({ ok: false, noExtrato: alvo, soma: 0, diferenca: -alvo, erro: null });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_espelho_casar', {
      p_extrato_id: extrato.extrato_id, p_itens: itens, p_simular: true, p_motivo: 'casado_no_espelho',
    });
    if (error) { setSim(null); setErroRodape(error.message); return; }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; no_extrato?: number; soma?: number; diferenca?: number };
    if (r.ok) {
      setErroRodape(null);
      setSim({ ok: true, noExtrato: Number(r.no_extrato ?? 0), soma: Number(r.soma ?? 0), diferenca: 0, erro: null });
      return;
    }
    if (r.motivo === 'soma_nao_bate') {
      setErroRodape(null);
      setSim({ ok: false, noExtrato: Number(r.no_extrato ?? 0), soma: Number(r.soma ?? 0), diferenca: Number(r.diferenca ?? 0), erro: null });
      return;
    }
    setSim(null);
    setErroRodape(MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível simular.');
  }, [extrato, itens]);

  /* Debounce de 300ms: digitar um valor não dispara uma chamada por tecla. */
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void simular(); }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open, simular]);

  const conciliar = async () => {
    if (!extrato) return;
    setGravando(true); setErroRodape(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_espelho_casar', {
      p_extrato_id: extrato.extrato_id, p_itens: itens, p_simular: false, p_motivo: 'casado_no_espelho',
    });
    setGravando(false);
    if (error) { setErroRodape(error.message); return; }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (r.ok === false) { setErroRodape(MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível conciliar.'); return; }
    onClose();
    onConciliado();
  };

  if (!extrato) return null;
  const dataCurta = extrato.data ? `${extrato.data.slice(8, 10)}/${extrato.data.slice(5, 7)}` : '—';
  const semItens = levados.length === 0;
  const podeConciliar = !!sim?.ok && !gravando && !semItens;
  const podeCriar = !!sim && !sim.ok && Math.abs(sim.diferenca) > 0.01;
  const sentido = sim && !semItens ? sentidoDaDiferenca(sim.diferenca, sim.noExtrato) : null;
  const unico = levados.length === 1;
  const valorDoBanco = paraCampo(extrato.valor);
  const poeValor = (id: string, texto: string) =>
    setLevados((v) => v.map((x) => x.lancamento_id === id ? { ...x, valorTexto: texto } : x));
  /* Com a simulação viajando (sim nulo ou erro), "absorver" não tem diferença para absorver. */
  const difAtual = sim && !sim.ok ? sim.diferenca : null;

  return (
    <>
      <Dialog open={open && !criando} onOpenChange={(v) => { if (!v) onClose(); }}>
        {/* ⚠ `grid-cols-[minmax(0,1fr)]` — PR-CONC-CASAR-VALOR-BANCO-01. O `DialogContent` da casa é `grid`, e a coluna
            implícita cresce até o conteúdo mínimo: com o botão "Usar valor do banco" a linha pedia 634px num modal de
            560, e o `overflow-hidden` cortava a conta, o resumo e o Conciliar (medido na tela).
            ⚠ E A DESCRIÇÃO NÃO TRUNCA MAIS — PR-CONC-SUGESTOES-CASAR-01 (Gabriel, print 13:42: "Servico Rastreabilidade
            ..." cortado com espaço sobrando). Cada levado ocupa DUAS linhas: a identificação inteira, uma informação por
            coluna (venc · descrição · fornecedor · status), e embaixo o campo e as ações. O que não couber quebra. */}
        <DialogContent className="w-[640px] max-w-[95vw] max-h-[90vh] flex flex-col grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[11px]">
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
            <span className="text-[12px] font-medium">Casar com o banco</span>
            <div className="flex items-center gap-3">
              {/* Sem `truncate`: cortava "Banco do Br…" num cabeçalho com espaço de sobra (regra da casa: texto não corta com reticência). */}
              <span className="text-[11px] opacity-90 whitespace-nowrap">{[nomeConta, dataCurta].filter(Boolean).join(' · ')}</span>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2.5">
            <div className="rounded-xl bg-muted px-3 py-2 grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 items-baseline">
              <span className="text-[10px] text-muted-foreground">no banco</span>
              <span className={cn('text-[11px] font-semibold tabular-nums', corVal(extrato.valor))}>{fmtBRL(extrato.valor)}</span>
              <span className="text-[10px] text-muted-foreground">histórico</span>
              <span className="text-[11px] break-words">{extrato.historico ?? '—'}</span>
              <span className="text-[10px] text-muted-foreground">conta</span>
              <span className="text-[10px] text-muted-foreground">{[nomeConta, dataCurta].filter(Boolean).join(' · ')}</span>
            </div>

            <div>
              <div className="text-[10px] text-muted-foreground mb-1 whitespace-nowrap">
                lançamentos levados ({levados.length}) — ao conciliar, cada um fica com o valor do campo
              </div>
              {semItens && <div className="text-[10px] text-muted-foreground italic py-1">nenhum lançamento levado</div>}
              {levados.map((l) => (
                <div key={l.lancamento_id} className="py-[4px] border-b last:border-b-0" data-testid="levado">
                  {(() => {
                    const st = (l.status_transacao ?? '').trim().toLowerCase();
                    return (
                      <div className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)_62px] gap-x-2 items-baseline" data-testid="levado-identificacao">
                        <span className="text-[10px] text-muted-foreground tabular-nums" title="vencimento">{vencCurto(l.data_vencimento)}</span>
                        <span className="text-[11px] break-words">{l.descricao ?? '—'}</span>
                        <span className="text-[10px] text-muted-foreground break-words">{l.fornecedor || '—'}</span>
                        <span className={cn('text-right text-[10px] font-medium', PALETA_DO_STATUS[st]?.texto ?? 'text-muted-foreground')}>
                          {st ? (STATUS_FILTRO_LABEL[st] ?? l.status_transacao) : '—'}
                        </span>
                      </div>
                    );
                  })()}
                <div className="mt-[3px] flex min-w-0 items-center gap-2">
                  <input
                    value={l.valorTexto}
                    onChange={(e) => setLevados((v) => v.map((x) => x.lancamento_id === l.lancamento_id ? { ...x, valorTexto: e.target.value } : x))}
                    inputMode="decimal"
                    className={cn('w-24 rounded border px-1 py-0.5 text-right text-[11px] font-medium tabular-nums', corVal(l.valor_assinado))}
                    aria-label={`Valor de ${l.descricao ?? 'lançamento'}`}
                  />
                  {/* ⚠ "era R$ X" TOMA O LUGAR DO BOTÃO, não se soma a ele — PR-CONC-SUGESTOES-CASAR-01. Com os dois na linha
                      de 560px a descrição virava "Folha ..." (medido na tela, NJ · BB · set/26). Com o campo já no valor do
                      banco, o botão estaria desabilitado e não diria nada que o "era" não diga; se o operador mexer no
                      campo, o botão volta. */}
                  {l.usarValorDoBanco && l.valorTexto !== paraCampo(l.valor_assinado) && (
                    <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground tabular-nums" data-testid="era-valor"
                      title="O valor que o lançamento tinha. Ao conciliar, ele fica com o do campo.">
                      era R$ {fmtBRL(Math.abs(l.valor_assinado))}
                    </span>
                  )}
                  {/* ⚠ UM LEVADO: "Usar valor do banco" — o campo recebe o valor do extrato (em módulo, como o campo
                      trabalha) e a diferença vai a zero na próxima simulação. VÁRIOS: "absorver a diferença" põe a
                      diferença inteira NESTA linha; as outras não mudam. */}
                  {unico && l.usarValorDoBanco && l.valorTexto === valorDoBanco ? null : unico ? (
                    /* ⚠ "CORRIGIR O VALOR DO LANÇAMENTO" — CONC-BLOCOS-TELA-01 (decisão do Gabriel): era "Usar valor do
                       banco". É um gesto SEPARADO, com nome próprio, porque muda o valor do lançamento; o comportamento é o
                       mesmo de antes. Na variante bloco ele não existe. */
                    <button type="button" data-testid="usar-valor-banco"
                      disabled={l.valorTexto === valorDoBanco}
                      title={l.valorTexto === valorDoBanco ? 'O campo já tem o valor do banco.' : `muda o valor do lançamento para o do banco (${valorDoBanco})`}
                      onClick={() => poeValor(l.lancamento_id, valorDoBanco)}
                      className={cn('h-[23px] shrink-0 whitespace-nowrap rounded border px-1.5 text-[10px]',
                        l.valorTexto === valorDoBanco ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted')}>
                      Corrigir o valor do lançamento
                    </button>
                  ) : (() => {
                    const novo = difAtual == null ? null : valorAbsorvendo(valorDe(l.valorTexto), l.valor_assinado, difAtual);
                    const motivo = difAtual == null ? 'Confere com o banco: não há diferença para absorver.'
                      : novo == null ? 'Esta linha ficaria zerada ou negativa: escolha outra, ou remova um lançamento.' : null;
                    return (
                      <button type="button" data-testid="absorver-diferenca" disabled={novo == null}
                        title={motivo ?? `Esta linha passa a ${paraCampo(novo ?? 0)}; as outras não mudam e a soma fica igual ao banco.`}
                        onClick={() => { if (novo != null) poeValor(l.lancamento_id, paraCampo(novo)); }}
                        className={cn('shrink-0 whitespace-nowrap text-[10px] underline underline-offset-2',
                          novo == null ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground')}>
                        absorver a diferença
                      </button>
                    );
                  })()}
                  <button type="button" className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    title="Tira este lançamento do casamento. Nada é apagado: ele continua no sistema, sem vínculo com este movimento."
                    onClick={() => setLevados((v) => v.filter((x) => x.lancamento_id !== l.lancamento_id))}>
                    remover deste casamento
                  </button>
                </div>
                </div>
              ))}
            </div>

            <div className={cn('space-y-0.5', !sim && 'text-muted-foreground')}>
              {[['No extrato', sim?.noExtrato], ['Soma dos agrupados', sim?.soma]].map(([rot, val]) => (
                <div key={String(rot)} className="grid grid-cols-[1fr_120px] items-baseline">
                  <span className="text-[10px] text-muted-foreground">{rot}</span>
                  <span className="text-right text-[11px] tabular-nums">{val == null ? '—' : fmtBRL(Number(val))}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_120px] items-baseline">
                <span className="text-[10px] text-muted-foreground">Diferença</span>
                <span className={cn('text-right text-[11px] font-semibold tabular-nums',
                  !sim ? '' : sim.ok ? 'text-emerald-600' : 'text-amber-600')}>
                  {sim == null ? '—' : fmtBRL(sim.diferenca)}
                </span>
              </div>
              {/* ⚠ O SENTIDO E O VALOR, e a 10px (a frase estava a 9, abaixo do piso da casa). */}
              {sim && sentido === 'a_mais' && (
                <div className="text-[10px] text-muted-foreground" data-testid="frase-diferenca">
                  Os lançamentos somam R$ {fmtBRL(Math.abs(sim.diferenca))} a mais que o banco. Corrija o valor do lançamento, ajuste uma linha ou crie um lançamento pela diferença (ex.: desconto).
                </div>
              )}
              {sim && sentido === 'a_menos' && (
                <div className="text-[10px] text-muted-foreground" data-testid="frase-diferenca">
                  Os lançamentos somam R$ {fmtBRL(Math.abs(sim.diferenca))} a menos que o banco. Corrija o valor do lançamento, ajuste uma linha ou crie um lançamento pela diferença (ex.: juros, tarifa).
                </div>
              )}
              {sim?.ok && (
                <div className="text-[10px] text-emerald-600" data-testid="frase-diferenca">Confere com o banco ✓</div>
              )}
            </div>

            {erroRodape && <div className="text-[10px] text-destructive">{erroRodape}</div>}
            {!erroRodape && semItens && (
              /* Sem levados o caminho é criar, não corrigir: o texto convida em vez de acusar. */
              <div className="text-[10px] text-muted-foreground">
                Nenhum lançamento explica este movimento. Crie o que falta pelo botão abaixo.
              </div>
            )}
          </div>

          <div className="flex h-[34px] shrink-0 items-center justify-end gap-2 border-t px-3 whitespace-nowrap">
            <button type="button" onClick={onClose} className="text-[11px] text-muted-foreground underline underline-offset-2">Cancelar</button>
            <button type="button" disabled={!podeCriar} onClick={() => setCriando(true)}
              className={cn('rounded border px-2 py-0.5 text-[11px]',
                podeCriar ? 'hover:bg-muted' : 'opacity-40 cursor-not-allowed')}>
              Criar lançamento pela diferença
            </button>
            <button type="button" disabled={!podeConciliar} onClick={conciliar}
              className={cn('rounded px-2.5 py-0.5 text-[11px] font-medium',
                podeConciliar ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
              {gravando ? 'Conciliando…' : 'Conciliar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ⚠ REUSA O COMPONENTE QUE JÁ FAZ ISSO. `CriarLancamentoDaLinha` monta o Novo Lançamento
          de verdade, trava o que o extrato dita e, com `semVinculo`, CRIA sem vincular —
          exatamente o que o grupo precisa: o vínculo de todos nasce depois, numa gravação só.
          `aoCriado` devolve o id, que é o que o `onSave` do diálogo sozinho não devolve. */}
      {criando && extrato && (
        <CriarLancamentoDaLinha
          movimento={{
            id: extrato.extrato_id,
            data_movimento: extrato.data ?? '',
            descricao: extrato.historico,
            documento: null,
            valor: extrato.valor,
            valorConciliado: 0,
            valorAberto: extrato.valor,
            situacao: 'nao_conciliado',
            lancamentoId: null,
            /* Movimento sintético para o diálogo de criação: ele nasce SEM vínculo por
               construção — os três campos do par existem para a linha do Palco e aqui são o
               estado vazio, não uma informação omitida. */
            vinculos: 0,
            lancamentoDescricao: null,
            lancamentoFavorecido: null,
          }}
          contaBancariaId={contaBancariaId}
          valorSugerido={sim ? Math.abs(sim.diferenca) : undefined}
          semVinculo
          aoFechar={() => setCriando(false)}
          aoCriado={async (idCriado) => {
            setCriando(false);
            if (!idCriado || !sim) return;
            const falta = Math.abs(sim.diferenca);
            setLevados((v) => [...v, {
              lancamento_id: idCriado,
              descricao: extrato.historico,
              fornecedor: null,
              valor_assinado: Math.sign(extrato.valor || 1) * falta,
              valorTexto: falta.toFixed(2).replace('.', ','),
            }]);
          }}
        />
      )}
    </>
  );
}

/**
 * O SENTIDO INVERSO — N extratos explicam 1 lançamento. PR-ESPELHO-05 parte A.
 *
 * ⚠ SEM EDIÇÃO DE VALOR, e é a diferença que justifica um modal próprio em vez do mesmo com
 * os papéis trocados. No 1:N o operador ajusta quanto de cada lançamento o banco pagou —
 * lançamento é declaração nossa. Aqui os valores são do EXTRATO, e extrato não se edita: se
 * a soma não bate, quem está errado é o lançamento, e o caminho é abri-lo e corrigir lá.
 *
 * ⚠ SEM "CRIAR PELA DIFERENÇA" pelo mesmo motivo: o que faltaria criar é um extrato, e
 * extrato não se cria — ele se importa do banco.
 */
export function CasarN1Modal({
  open, onClose, sis, extratos, nomeConta, onConciliado,
}: {
  open: boolean; onClose: () => void;
  sis: { lancamento_id: string; descricao: string | null; fornecedor?: string | null; valor_assinado: number } | null;
  extratos: readonly { extrato_id: string; data: string | null; historico: string | null; valor: number }[];
  nomeConta?: string;
  onConciliado: () => void;
}) {
  const [sim, setSim] = useState<{ ok: boolean; noLancamento: number; soma: number; diferenca: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const ids = useMemo(() => extratos.map((e) => e.extrato_id), [extratos]);

  useEffect(() => {
    if (!open || !sis) return;
    let cancelado = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_espelho_casar_n1', {
        p_lancamento_id: sis.lancamento_id, p_extratos: ids, p_simular: true, p_motivo: 'casado_no_espelho_n1',
      });
      if (cancelado) return;
      if (error) { setSim(null); setErro(error.message); return; }
      const r = (data ?? {}) as { ok?: boolean; motivo?: string; no_lancamento?: number; soma_extratos?: number; diferenca?: number };
      if (r.ok) {
        setErro(null);
        setSim({ ok: true, noLancamento: Number(r.no_lancamento ?? 0), soma: Number(r.soma_extratos ?? 0), diferenca: 0 });
      } else if (r.motivo === 'soma_nao_bate') {
        setErro(null);
        setSim({ ok: false, noLancamento: Number(r.no_lancamento ?? 0), soma: Number(r.soma_extratos ?? 0), diferenca: Number(r.diferenca ?? 0) });
      } else {
        setSim(null);
        setErro(MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível simular.');
      }
    })();
    return () => { cancelado = true; };
  }, [open, sis, ids]);

  const conciliar = async () => {
    if (!sis) return;
    setGravando(true); setErro(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_espelho_casar_n1', {
      p_lancamento_id: sis.lancamento_id, p_extratos: ids, p_simular: false, p_motivo: 'casado_no_espelho_n1',
    });
    setGravando(false);
    if (error) { setErro(error.message); return; }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (r.ok === false) { setErro(MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível conciliar.'); return; }
    onClose();
    onConciliado();
  };

  if (!sis) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ⚠ `grid-cols-[minmax(0,1fr)]` — a MESMA regra da variante 1:N (PR-CONC-CASAR-VALOR-BANCO-01), CONC-CASAR-N1-LARGURA-01.
          O `DialogContent` da casa é `grid`, e a coluna implícita cresce até o conteúdo mínimo: o histórico longo do banco
          ("PAGAMENTO PIX-PIX_DEB 15412257000128 GOVERNO DO ESTADO DE MATO GROSSO DO SUL") alargava a coluna além dos 560px,
          e o `overflow-hidden` cortava os valores, a soma e o Conciliar (homologação do Gabriel, 01/10 08:31). Com a coluna
          presa à largura do modal, o histórico trunca com o texto inteiro no `title`. */}
      <DialogContent className="w-[560px] max-w-[95vw] max-h-[90vh] flex flex-col grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[11px]">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <span className="text-[12px] font-medium">Casar com o banco</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] opacity-90 truncate max-w-[50%]">{nomeConta} · {extratos.length} movimentos</span>
            <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2.5">
          <div className="rounded-xl bg-muted px-3 py-2 grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 items-baseline">
            <span className="text-[10px] text-muted-foreground">no lançamento</span>
            <span className={cn('text-[11px] font-semibold tabular-nums', corVal(sis.valor_assinado))}>{fmtBRL(sis.valor_assinado)}</span>
            <span className="text-[10px] text-muted-foreground">descrição</span>
            <span className="text-[11px] truncate" title={sis.descricao ?? ''}>{sis.descricao ?? '—'}</span>
            <span className="text-[10px] text-muted-foreground">fornecedor</span>
            <span className="text-[10px] text-muted-foreground">{sis.fornecedor || '—'}</span>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">extratos levados ({extratos.length})</div>
            {extratos.map((e) => (
              <div key={e.extrato_id} className="flex items-center gap-2 py-[3px] border-b last:border-b-0">
                <span className="w-10 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {e.data ? `${e.data.slice(8, 10)}/${e.data.slice(5, 7)}` : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px]" title={e.historico ?? ''}>{e.historico ?? '—'}</span>
                <span className={cn('w-24 shrink-0 text-right text-[11px] font-medium tabular-nums', corVal(e.valor))}>{fmtBRL(e.valor)}</span>
              </div>
            ))}
          </div>

          <div className={cn('space-y-0.5', !sim && 'text-muted-foreground')}>
            {[['No lançamento', sim?.noLancamento], ['Soma dos extratos', sim?.soma]].map(([rot, val]) => (
              <div key={String(rot)} className="grid grid-cols-[1fr_120px] items-baseline">
                <span className="text-[10px] text-muted-foreground">{rot}</span>
                <span className="text-right text-[11px] tabular-nums">{val == null ? '—' : fmtBRL(Number(val))}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_120px] items-baseline">
              <span className="text-[10px] text-muted-foreground">Diferença</span>
              <span className={cn('text-right text-[11px] font-semibold tabular-nums',
                !sim ? '' : sim.ok ? 'text-emerald-600' : 'text-amber-600')}>
                {sim == null ? '—' : fmtBRL(sim.diferenca)}
              </span>
            </div>
            {/* ⚠ A MESMA REGRA DO 1:N (`sentidoDaDiferenca`) — PR-CONC-CASAR-VALOR-BANCO-01. Aqui a
                `fn_espelho_casar_n1` trabalha EM MÓDULO (`diferenca = Σ|extratos| − |lançamento|`, conferido no
                `prosrc` em 30/09), e a referência é o lançamento, positivo: a frase antiga não estava invertida no
                N:1 — o que muda é dizer o VALOR, a 10px (estava a 9, abaixo do piso), e o "Confere" quando bate. */}
            {sim && !sim.ok && (() => {
              const sentidoN1 = sentidoDaDiferenca(sim.diferenca, sim.noLancamento);
              return sentidoN1 === 'confere' ? null : (
                <div className="text-[10px] text-muted-foreground" data-testid="frase-diferenca-n1">
                  Os extratos somam R$ {fmtBRL(Math.abs(sim.diferenca))} {sentidoN1 === 'a_mais' ? 'a mais' : 'a menos'} que o lançamento.
                  {' '}O valor do banco não se edita: abra o lançamento e ajuste o valor lá, ou tire um extrato da seleção.
                </div>
              );
            })()}
            {sim?.ok && (
              <div className="text-[10px] text-emerald-600" data-testid="frase-diferenca-n1">Confere com o banco ✓</div>
            )}
          </div>

          {erro && <div className="text-[10px] text-destructive">{erro}</div>}
        </div>

        <div className="flex h-[34px] shrink-0 items-center justify-end gap-2 border-t px-3 whitespace-nowrap">
          <button type="button" onClick={onClose} className="text-[11px] text-muted-foreground underline underline-offset-2">Cancelar</button>
          <button type="button" disabled={!sim?.ok || gravando} onClick={conciliar}
            className={cn('rounded px-2.5 py-0.5 text-[11px] font-medium',
              sim?.ok && !gravando ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
            {gravando ? 'Conciliando…' : 'Conciliar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
   VARIANTE BLOCO — CONC-BLOCOS-TELA-01 (mock aprovado: docs/mocks/mock-casar-bloco-v1.html).
   ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type RegraBloco = 'exato' | 'mais_antigo_primeiro';

export interface ExtratoDoBloco { extrato_id: string; data: string | null; historico: string | null; valor: number }
export interface LancamentoDoBloco {
  lancamento_id: string; data: string | null; descricao: string | null; fornecedor?: string | null; valor_assinado: number;
}

/** O que a `fn_conciliar_bloco` devolve — a matriz e o resumo. A tela só os MOSTRA. */
export interface RespostaBloco {
  matriz: Array<{ extrato_id: string; lancamento_id: string; valor_aplicado: number }>;
  resumo: {
    soma_extratos: number; soma_lancamentos: number; diferenca: number;
    quitados: Array<{ lancamento_id: string }>;
    parcial: { lancamento_id: string; descricao: string; aplicado: number; falta: number } | null;
  };
}

/**
 * A frase da recusa, sem o código: a RPC escreve "codigo: frase legível" (SQLSTATE CBLOC), e o operador lê a frase.
 * ⚠ SÓ O PREFIXO `snake_case:` SAI — a frase em si (com os números da RPC) vai inteira.
 */
export function fraseDaRecusa(msg: string | null | undefined): string {
  return (msg ?? '').replace(/^[a-z_]+:\s*/, '') || 'Não foi possível simular o bloco.';
}

/**
 * O que cada lançamento recebeu, lido da MATRIZ da RPC (soma das células dele) — é a matriz exibida, não um cálculo
 * da tela: quem decide quanto vai para quem é a alocação do banco.
 */
export function aplicadoPorLancamento(r: RespostaBloco): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of r.matriz) m.set(c.lancamento_id, Math.round(((m.get(c.lancamento_id) ?? 0) + Number(c.valor_aplicado)) * 100) / 100);
  return m;
}

const dataCurta = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—');

/**
 * CASAR COM O BANCO · BLOCO — N extratos × M lançamentos, numa gravação só (`fn_conciliar_bloco`).
 *
 * ⚠ A MATRIZ E O RESUMO VÊM SÓ DA RPC: ao abrir e a cada troca de regra, `p_simular = true`; o Conciliar bloco é a
 *   MESMA chamada com `p_simular = false`. Nenhuma soma, nenhuma alocação aqui — a tela que somasse teria a segunda régua.
 * ⚠ NÃO EXISTE "Corrigir o valor do lançamento" NESTA VARIANTE: o valor do lançamento nunca muda num bloco. Valor
 *   errado se corrige no próprio lançamento, ou no 1:N.
 * ⚠ A RECUSA (SQLSTATE CBLOC) FICA NO MODAL, acima do rodapé, em vermelho — nunca em toast (UX-TOAST-01) — e o botão
 *   desabilita dizendo por quê.
 */
export function CasarBlocoModal({
  open, onClose, extratos, lancamentos, nomeConta, regraInicial = 'exato', onConciliado,
}: {
  open: boolean; onClose: () => void;
  extratos: readonly ExtratoDoBloco[]; lancamentos: readonly LancamentoDoBloco[];
  nomeConta?: string; regraInicial?: RegraBloco; onConciliado: () => void;
}) {
  const [regra, setRegra] = useState<RegraBloco>(regraInicial);
  const [resp, setResp] = useState<RespostaBloco | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);
  /* ⚠ TRAVA DE DUPLO CLIQUE SÍNCRONA: o `gravando` do estado só chega no próximo render, e dois cliques no mesmo quadro
     passariam os dois. A ref fecha a porta no mesmo instante. */
  const gravandoRef = useRef(false);
  const idsExt = useMemo(() => extratos.map((e) => e.extrato_id), [extratos]);
  const idsLan = useMemo(() => lancamentos.map((l) => l.lancamento_id), [lancamentos]);

  useEffect(() => { if (open) setRegra(regraInicial); }, [open, regraInicial]);

  useEffect(() => {
    if (!open || idsExt.length === 0 || idsLan.length === 0) return;
    let cancelado = false;
    setCarregando(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conciliar_bloco', {
        p_extratos: idsExt, p_lancamentos: idsLan, p_regra: regra, p_simular: true,
      });
      if (cancelado) return;
      setCarregando(false);
      if (error) { setResp(null); setRecusa(fraseDaRecusa(error.message)); return; }
      setRecusa(null);
      setResp(data ?? null);
    })();
    return () => { cancelado = true; };
  }, [open, idsExt, idsLan, regra]);

  const conciliar = async () => {
    if (gravandoRef.current || !resp) return;
    gravandoRef.current = true;
    setGravando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_conciliar_bloco', {
        p_extratos: idsExt, p_lancamentos: idsLan, p_regra: regra, p_simular: false,
      });
      if (error) { setRecusa(fraseDaRecusa(error.message)); return; }
      onClose();
      onConciliado();
    } finally {
      gravandoRef.current = false;
      setGravando(false);
    }
  };

  /* A ordem das linhas é a da ALOCAÇÃO da RPC (a matriz); quem não está nela (recusa) fica na ordem da seleção. */
  const ordemDaMatriz = (ids: readonly string[], chave: 'extrato_id' | 'lancamento_id') => {
    if (!resp) return [...ids];
    const vistos: string[] = [];
    for (const c of resp.matriz) if (!vistos.includes(c[chave])) vistos.push(c[chave]);
    return [...vistos, ...ids.filter((i) => !vistos.includes(i))];
  };
  const extPorId = new Map(extratos.map((e) => [e.extrato_id, e]));
  const lanPorId = new Map(lancamentos.map((l) => [l.lancamento_id, l]));
  const aplicado = resp ? aplicadoPorLancamento(resp) : null;
  const quitados = new Set((resp?.resumo.quitados ?? []).map((q) => q.lancamento_id));
  const parcial = resp?.resumo.parcial ?? null;
  const dif = resp ? Number(resp.resumo.diferenca) : null;
  const confere = dif != null && Math.abs(dif) <= 0.005 && !parcial;
  const motivoDesabilitado = gravando ? 'Conciliando…'
    : carregando ? 'Simulando o bloco…'
    : recusa ? recusa
    : !resp ? 'Simulando o bloco…' : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ⚠ `grid-cols-[minmax(0,1fr)]` — a MESMA regra do fix N1 (CONC-CASAR-N1-LARGURA-01): o `DialogContent` é grid e a
          coluna implícita cresceria até o histórico mais longo do banco, cortando valores e botões. Largura FIXA de
          700px (o mock), para qualquer texto. */}
      <DialogContent data-testid="casar-bloco"
        className="w-[700px] max-w-[95vw] max-h-[90vh] flex flex-col grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[10px]">
        <div className="flex h-[30px] shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <span className="text-[11px] font-semibold whitespace-nowrap">Casar com o banco · bloco</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] opacity-90 whitespace-nowrap">
              {[nomeConta, `${extratos.length} Pix × ${lancamentos.length} lançamento${lancamentos.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            </span>
            <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-muted-foreground">Regra</span>
            <Segmentado<RegraBloco> valor={regra} onEscolher={setRegra} altura={20}
              opcoes={[{ valor: 'exato', rotulo: 'Soma exata' }, { valor: 'mais_antigo_primeiro', rotulo: 'Mais antigo primeiro' }]} />
          </div>

          <div className="text-[9.5px] text-muted-foreground whitespace-nowrap">Pix levados ({extratos.length})</div>
          <table className="w-full table-fixed border-separate border-spacing-0 text-[10px]" data-testid="tabela-pix">
            <colgroup><col style={{ width: 58 }} /><col /><col style={{ width: 90 }} /></colgroup>
            <thead>
              <tr className="h-[18px] bg-primary text-primary-foreground text-[9.5px]">
                <th className="px-1.5 text-left font-semibold">Data</th>
                <th className="px-1.5 text-left font-semibold">Histórico do banco</th>
                <th className="px-1.5 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {ordemDaMatriz(idsExt, 'extrato_id').map((id) => {
                const e = extPorId.get(id);
                if (!e) return null;
                return (
                  <tr key={id} className="h-[18px]" data-testid="pix-levado">
                    <td className="border-b px-1.5 tabular-nums whitespace-nowrap">{dataCurta(e.data)}</td>
                    {/* SÓ O HISTÓRICO DO BANCO TRUNCA — com o texto inteiro no `title`. */}
                    <td className="border-b px-1.5 truncate" title={e.historico ?? ''}>{e.historico ?? '—'}</td>
                    <td className={cn('border-b px-1.5 text-right tabular-nums whitespace-nowrap', corVal(e.valor))}>{fmtBRL(e.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="text-[9.5px] text-muted-foreground whitespace-nowrap">
            Lançamentos levados ({lancamentos.length}) · valor do lançamento nunca muda
          </div>
          <table className="w-full table-fixed border-separate border-spacing-0 text-[10px]" data-testid="tabela-lancamentos">
            <colgroup>
              {/* As larguras do mock (58 · resto · 172 · 66 · 66 · 78): a Descrição fica com 236px e a NF cabe numa linha de
                  18px (com 72/72/90 ela tinha 212 e quebrava em 37px — medido na tela). */}
              <col style={{ width: 58 }} /><col /><col style={{ width: 172 }} />
              <col style={{ width: 66 }} /><col style={{ width: 66 }} /><col style={{ width: 78 }} />
            </colgroup>
            <thead>
              <tr className="h-[18px] bg-primary text-primary-foreground text-[9.5px]">
                <th className="px-1.5 text-left font-semibold">Data</th>
                <th className="px-1.5 text-left font-semibold">Descrição</th>
                <th className="px-1.5 text-left font-semibold">Fornecedor</th>
                <th className="px-1.5 text-right font-semibold">Valor</th>
                <th className="px-1.5 text-right font-semibold">Aplicado</th>
                <th className="px-1.5 text-left font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {ordemDaMatriz(idsLan, 'lancamento_id').map((id) => {
                const l = lanPorId.get(id);
                if (!l) return null;
                const ap = aplicado?.get(id);
                const ehParcial = parcial?.lancamento_id === id;
                return (
                  <tr key={id} className="h-[18px]" data-testid="lancamento-levado">
                    <td className="border-b px-1.5 tabular-nums whitespace-nowrap">{dataCurta(l.data)}</td>
                    {/* ⚠ DESCRIÇÃO E FORNECEDOR INTEIROS, sem reticência (regra da casa): se não cabem, quebram. */}
                    <td className="border-b px-1.5 break-words" data-testid="descricao-levada">{l.descricao ?? '—'}</td>
                    <td className="border-b px-1.5 break-words">{l.fornecedor || '—'}</td>
                    <td className={cn('border-b px-1.5 text-right tabular-nums whitespace-nowrap', corVal(l.valor_assinado))}>{fmtBRL(l.valor_assinado)}</td>
                    <td className="border-b px-1.5 text-right tabular-nums whitespace-nowrap" data-testid="aplicado">{ap == null ? '—' : fmtBRL(ap)}</td>
                    <td className="border-b px-1.5 whitespace-nowrap" data-testid="situacao">
                      {quitados.has(id)
                        ? <span className="inline-block rounded-[3px] bg-emerald-100 px-1 text-[9.5px] leading-[13px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Quitado</span>
                        : ehParcial && parcial
                          ? <span className="inline-block rounded-[3px] bg-amber-100 px-1 text-[9.5px] leading-[13px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Falta {fmtBRL(parcial.falta)}</span>
                          : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="grid grid-cols-[1fr_110px] gap-y-px border-t pt-1.5">
            <span className="text-muted-foreground">Soma dos Pix</span>
            <span className="text-right tabular-nums">{resp ? fmtBRL(resp.resumo.soma_extratos) : '—'}</span>
            <span className="text-muted-foreground">Soma dos lançamentos</span>
            <span className="text-right tabular-nums">{resp ? fmtBRL(resp.resumo.soma_lancamentos) : '—'}</span>
            <span className="text-muted-foreground">Diferença</span>
            <span className={cn('text-right font-semibold tabular-nums', dif == null ? '' : Math.abs(dif) <= 0.005 ? 'text-emerald-600' : 'text-rose-600')}
              data-testid="diferenca-bloco">{dif == null ? '—' : fmtBRL(dif)}</span>
          </div>
          {resp && (confere
            ? <div className="font-semibold text-emerald-600" data-testid="frase-bloco">
                Confere com o banco ✓ · {quitados.size === 1 ? 'o lançamento fica quitado' : `os ${quitados.size} lançamentos ficam quitados`}
              </div>
            : parcial
              ? <div className="font-semibold text-amber-600" data-testid="frase-bloco">
                  Parcial · falta R$ {fmtBRL(parcial.falta)} na {parcial.descricao} · segue em aberto para o próximo depósito
                </div>
              : null)}

          {/* ⚠ A RECUSA MORA AQUI, num slot acima do rodapé — nunca em toast (UX-TOAST-01). */}
          <div className="min-h-[14px] text-[10px] text-destructive" data-testid="recusa-bloco">{recusa ?? ''}</div>
        </div>

        <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 border-t px-3 whitespace-nowrap">
          <span className="text-muted-foreground">Desfazer fica no "⋯" do bloco depois de conciliado.</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded border px-2.5 py-0.5 text-[11px] hover:bg-muted">Cancelar</button>
            <button type="button" disabled={!!motivoDesabilitado} onClick={() => { void conciliar(); }}
              title={motivoDesabilitado ?? undefined} data-testid="conciliar-bloco"
              className={cn('rounded px-2.5 py-0.5 text-[11px] font-semibold',
                motivoDesabilitado ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]')}>
              {gravando ? 'Conciliando…' : 'Conciliar bloco'}
            </button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
