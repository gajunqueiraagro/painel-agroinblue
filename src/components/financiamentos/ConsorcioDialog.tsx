/**
 * FIN-CONSORCIO-02 — o cadastro do consórcio (mock "Cadastro de Consórcio", Gabriel 19/10/2026 16:55). Modal FIXO de ~1120 × 560 (limitado
 * pela janela): cabeçalho "Editar consórcio" + a linha curta (administradora · grupo · cota · situação); abas Consórcio · Custos e prazos ·
 * Parcelas (N) · Documentos (N); resumo lateral de 240px que some abaixo de 900px de janela. Nada rola além da lista de parcelas.
 * A tela não faz conta: as faixas, os totais, os avisos e as parcelas vêm do banco (`fn_consorcio_cronograma`, `fn_consorcio_tela`).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, CampoPercentual } from '@/components/ui/campo-moeda';
import { Segmentado } from '@/components/ui/segmentado';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { BlocoDocumentos } from '@/components/financiamentos/ContratoDeCredito';
import { BLOCO_FORMULARIO, GRADE_FORMULARIO, REGUA_CAMPO, REGUA_ROTULO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFinanciamentoCadastro } from '@/hooks/useFinanciamentoCadastro';
import { useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import { useCronogramaDoConsorcio, useGestosDoConsorcio, useTelaDoConsorcio } from '@/hooks/useConsorcio';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import {
  FORM_VAZIO, ROTULO_INDICE, ROTULO_SITUACAO, TEXTO_PLANO_FIXO, TITULO_PLANO_FIXO, TITULO_SITUACAO, brl, dadosDoForm, formDaTela, linhaCurta,
  linhasDoResumo, mostraResumo, regrasDoForm, textoDoVencimento,
  fundoComumDoContrato, faltaParaGerar, dicaDoFundoComum, type ItemQueFalta, type BaseDoSeguro, type FormDoConsorcio, type Indice, type ParcelaDoConsorcio, type Faixa, type SaldoDoConsorcio,
} from '@/lib/financiamentos/consorcio';

type Aba = 'consorcio' | 'custos' | 'parcelas' | 'documentos';
const CAMPO = REGUA_CAMPO;
const LEITURA = 'uma-linha-que-rola flex h-7 items-center rounded-md bg-background/60 px-2 text-[11px] text-muted-foreground';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const INDICES: readonly Indice[] = ['nenhum', 'ipca', 'incc', 'igpm', 'preco_do_bem'];
const BASES_DO_SEGURO: readonly BaseDoSeguro[] = ['credito_e_taxas', 'credito', 'saldo_devedor'];
const ROTULO_BASE: Record<BaseDoSeguro, string> = { credito_e_taxas: 'crédito e taxas', credito: 'crédito', saldo_devedor: 'saldo devedor' };
export const MOTIVO_SALVE_ANTES = 'as parcelas e os documentos nascem quando o consórcio é salvo';

function Bloco({ nome, grade, testId, children, acao }: { nome: string; grade: string; testId: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className={BLOCO_FORMULARIO} data-testid={testId}>
      <TituloDoBloco nome={nome} acao={acao} />
      <div className={`${GRADE_FORMULARIO} ${grade}`}>{children}</div>
    </section>
  );
}
function Campo({ rotulo, obrig, children, className = '', campo }: { rotulo: string; obrig?: boolean; children: ReactNode; className?: string; campo?: string }) {
  return (
    <div className={`min-w-0 ${className}`} data-campo={campo}>
      <div className={REGUA_ROTULO} title={rotulo}>{rotulo}{obrig ? ' *' : ''}</div>
      {children}
    </div>
  );
}

export function ConsorcioDialog({ aberto, aoFechar, financiamentoId, onSalvo, onOutraNatureza }: {
  aberto: boolean; aoFechar: () => void; financiamentoId?: string | null; onSalvo?: (id: string) => void;
  /** no cadastro novo: voltar para financiamento / empréstimo (o seletor de natureza do cadastro de contrato) */
  onOutraNatureza?: () => void;
}) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? '';
  const { fazendas } = useFazenda();
  const { contas, classificacoes } = useFinanciamentoCadastro();
  const [finId, setFinId] = useState<string | null>(financiamentoId ?? null);
  const tela = useTelaDoConsorcio(finId);
  const gestos = useGestosDoConsorcio(clienteId);
  const credito = useContratoDeCredito(finId, clienteId);
  const largura = useLarguraDaJanela();
  const [aba, setAba] = useState<Aba>('consorcio');
  const [form, setForm] = useState<FormDoConsorcio>(FORM_VAZIO);
  const [semeado, setSemeado] = useState(false);
  const [recado, setRecado] = useState<{ texto: string; erro: boolean } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [buscaJ, setBuscaJ] = useState('');
  const [dialogo, setDialogo] = useState<null | 'reajuste' | 'contemplar' | 'regerar' | 'desfazer' | { parcela: ParcelaDoConsorcio }>(null);
  const t = tela.data ?? null;
  const editando = !!finId;

  /* a edição semeia o formulário UMA vez, com a tela do banco */
  useEffect(() => { if (t && !semeado) { setForm(formDaTela(t)); setSemeado(true); } }, [t, semeado]);
  const set = <K extends keyof FormDoConsorcio>(k: K, v: FormDoConsorcio[K]) => setForm((f) => ({ ...f, [k]: v }));
  const regras = useMemo(() => regrasDoForm(form), [form]);
  const previa = useCronogramaDoConsorcio(regras);
  const subDe = (id: string | null) => classificacoes.find((c) => c.id === id)?.subcentro ?? '';

  /* FIN-CONSORCIO-03 — o rodapé lista SÓ o que falta ao gerador; cada item leva à aba e ao campo */
  const falta = useMemo(() => faltaParaGerar(form), [form]);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const irAoCampo = (item: ItemQueFalta) => {
    setAba(item.aba);
    window.setTimeout(() => {
      const alvo = document.querySelector<HTMLElement>(`[data-campo="${item.campo}"] input, [data-campo="${item.campo}"] button`);
      alvo?.focus();
    }, 0);
  };
  const salvar = async () => {
    setTentouSalvar(true);
    if (falta.length > 0) { setRecado(null); return; }
    setGravando(true); setRecado(null);
    const r = await gestos.salvar(finId, dadosDoForm(form, clienteId), false);
    setGravando(false);
    if (!r.ok) { setRecado({ texto: r.recusa ?? 'O banco recusou.', erro: true }); return; }
    const id = typeof r.dado?.financiamento_id === 'string' ? r.dado.financiamento_id : finId;
    if (!finId && id) { setFinId(id); onSalvo?.(id); setRecado({ texto: 'Consórcio salvo · as parcelas nasceram pelas regras', erro: false }); return; }
    setRecado({ texto: r.dado?.cronograma_mudou === true ? 'Salvo · as regras mudaram: use "Regerar em aberto" nas Parcelas' : 'Salvo', erro: false });
  };

  const abas = [
    { valor: 'consorcio' as const, rotulo: 'Consórcio' },
    { valor: 'custos' as const, rotulo: 'Custos e prazos' },
    { valor: 'parcelas' as const, rotulo: `Parcelas${t ? ` (${t.parcelas.length})` : ''}`, desabilitada: !editando, title: editando ? undefined : MOTIVO_SALVE_ANTES },
    { valor: 'documentos' as const, rotulo: `Documentos${t ? ` (${t.documentos})` : ''}`, desabilitada: !editando, title: editando ? undefined : MOTIVO_SALVE_ANTES },
  ];
  const comResumo = mostraResumo(largura);
  const titulo = editando ? `Editar consórcio · ${t?.contrato.descricao ?? ''}` : 'Novo consórcio';
  const curta = t ? linhaCurta(t.contrato) : (clienteAtual?.nome ?? '');

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(560px,calc(100dvh-32px))] w-[min(1120px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="consorcio-dialog">
        <div className="flex h-[36px] shrink-0 items-baseline gap-2 bg-primary pl-3 pr-9 pt-[10px] text-primary-foreground">
          <DialogTitle className="shrink-0 text-[12px] font-semibold" data-testid="titulo-do-consorcio">{titulo}</DialogTitle>
          <DialogDescription className="uma-linha-que-rola min-w-0 text-[10px] text-primary-foreground/80" title={curta} data-testid="linha-curta">{curta}</DialogDescription>
        </div>
        <div className="flex h-[32px] shrink-0 items-center border-b bg-muted px-3">
          <Segmentado altura={22} valor={aba} onEscolher={setAba} opcoes={abas} />
          {onOutraNatureza && !editando && (
            <button type="button" className="ml-auto text-[10px] text-primary underline-offset-2 hover:underline" onClick={onOutraNatureza}
              data-testid="outra-natureza">outra natureza</button>
          )}
        </div>
        <div className={`grid min-h-0 flex-1 ${comResumo ? 'grid-cols-[minmax(0,1fr)_240px]' : 'grid-cols-1'}`}>
          <div className="flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden bg-muted p-2" data-testid={`aba-${aba}`}>
            {aba === 'consorcio' && (<>
              <Bloco nome="Identificação" testId="bloco-identificacao" grade="grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.6fr)]">
                <Campo rotulo="Descrição" obrig><Input className={CAMPO} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} /></Campo>
                <Campo rotulo="Administradora" obrig>
                  <FavorecidoSelect value={form.credorId ?? ''} onChange={(id) => set('credorId', id || null)} clienteId={clienteId} linhaDoDocumento={false}
                    triggerClassName={`${CAMPO} !h-7`} />
                </Campo>
                <Campo rotulo="Grupo"><Input className={CAMPO} value={form.grupo} onChange={(e) => set('grupo', e.target.value)} /></Campo>
                <Campo rotulo="Cota"><Input className={CAMPO} value={form.cota} onChange={(e) => set('cota', e.target.value)} /></Campo>
                <Campo rotulo="Tipo de bem"><Input className={CAMPO} value={form.tipoBem} onChange={(e) => set('tipoBem', e.target.value)} placeholder="máquina, veículo, imóvel…" /></Campo>
                <Campo rotulo="Atividade" obrig>
                  <Segmentado altura={28} valor={form.atividade} onEscolher={(v) => set('atividade', v)} opcoes={[{ valor: 'pecuaria', rotulo: 'Pecuária' }, { valor: 'agricultura', rotulo: 'Agricultura' }]} />
                </Campo>
                <Campo rotulo="Contemplação" className="col-span-2">
                  <div className="flex h-7 items-center gap-2 text-[11px]" data-testid="contemplacao">
                    <span className="uma-linha-que-rola min-w-0 text-muted-foreground">
                      {t?.contrato.contemplado
                        ? `contemplado em ${textoDoVencimento(t.contrato.dataContemplacao)} · ${t.contrato.formaContemplacao === 'lance' ? `lance ${t.contrato.lanceTipo === 'embutido' ? 'embutido' : 'próprio'}` : 'sorteio'}`
                        : 'não contemplado'}
                    </span>
                    {editando && !t?.contrato.contemplado && (
                      <Button variant="outline" size="sm" className="h-[22px] shrink-0 text-[10px]" onClick={() => setDialogo('contemplar')} data-testid="abrir-contemplar">Contemplar</Button>
                    )}
                  </div>
                </Campo>
              </Bloco>
              <Bloco nome="Carta e reajuste" testId="bloco-carta" grade="grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                <Campo rotulo="Carta de crédito" obrig campo="carta"><CampoMoeda className={CAMPO} valor={form.carta} onChange={(v) => set('carta', v)} /></Campo>
                <Campo rotulo="1ª parcela" obrig campo="primeiraParcela"><DatePicker size="compact" className={CAMPO} value={form.primeiraParcela ?? ''} onChange={(v) => set('primeiraParcela', v || null)} /></Campo>
                <Campo rotulo="Adesão"><DatePicker size="compact" className={CAMPO} value={form.dataAdesao ?? ''} onChange={(v) => set('dataAdesao', v || null)} /></Campo>
                <Campo rotulo="Índice de reajuste">
                  <Select value={form.indice} onValueChange={(v) => set('indice', INDICES.find((i) => i === v) ?? 'nenhum')}>
                    <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                    <SelectContent>{INDICES.map((i) => <SelectItem key={i} value={i}>{ROTULO_INDICE[i]}</SelectItem>)}</SelectContent>
                  </Select>
                </Campo>
                <Campo rotulo="Teto (%)"><CampoPercentual className={CAMPO} valor={form.tetoPct} onChange={(v) => set('tetoPct', v)} /></Campo>
                <Campo rotulo="Mês">
                  <Select value={form.mesReajuste ? String(form.mesReajuste) : ''} onValueChange={(v) => set('mesReajuste', v ? Number(v) : null)}>
                    <SelectTrigger className={CAMPO}><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </Campo>
              </Bloco>
              <Bloco nome="Pagamento e classificação" testId="bloco-pagamento" grade="grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1.6fr)]">
                <Campo rotulo="Fazenda" obrig><FazendaSelect value={form.fazendaId ?? ''} onChange={(id) => set('fazendaId', id || null)} fazendas={fazendas} forcaAdministrativo={false} triggerClassName={CAMPO} hideAviso comBusca /></Campo>
                <Campo rotulo="Conta de pagamento" obrig>
                  <ContaBancariaSelect value={form.contaId ?? ''} onValueChange={(v) => set('contaId', v || null)} contas={contas} placeholder="Selecione" showBankDetails="banco" className={CAMPO} comBusca />
                </Campo>
                <Campo rotulo="Fundo comum e reserva"><span className={LEITURA} title={TITULO_PLANO_FIXO} data-testid="plano-fixo">{TEXTO_PLANO_FIXO}</span></Campo>
                <Campo rotulo="Taxas e seguro" obrig>
                  <PlanoSubcentroSelect value={subDe(form.planoJurosId)} onChange={() => undefined} onSelected={(_s, c) => set('planoJurosId', c?.id ?? null)}
                    classificacoes={classificacoes} tipoOperacao="2-Saídas" search={buscaJ} onSearchChange={setBuscaJ} triggerClassName={CAMPO} />
                </Campo>
              </Bloco>
            </>)}

            {aba === 'custos' && (<>
              {/* FIN-CONSORCIO-03 — uma linha só: prazo, transcorridas e o fundo comum por parcela; "a pagar agora" e o restante da carta
                  (números do gerador) moram na linha do título do bloco — nada empurra o modal */}
              <Bloco nome="Prazos" testId="bloco-prazos" grade="grid-cols-[minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1.45fr)_minmax(0,1.45fr)_minmax(0,0.8fr)]"
                acao={<span className="uma-linha-que-rola max-w-[420px] text-[10px] text-muted-foreground" data-testid="dica-fundo-comum">
                  {[`a pagar agora ${previa?.aPagarAgora ?? '—'}`, dicaDoFundoComum(form, previa)].filter(Boolean).join(' · ')}</span>}>
                <Campo rotulo="Prazo do grupo" obrig campo="prazoGrupo"><Input className={CAMPO} inputMode="numeric" value={form.prazoGrupo ?? ''} onChange={(e) => set('prazoGrupo', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null)} /></Campo>
                <Campo rotulo="Já transcorridas"><Input className={CAMPO} inputMode="numeric" value={form.jaTranscorridas ?? ''} onChange={(e) => set('jaTranscorridas', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : 0)} /></Campo>
                <Campo rotulo="Transcorridas">
                  <Segmentado altura={28} valor={form.transcorridas} onEscolher={(v) => set('transcorridas', v)}
                    opcoes={[{ valor: 'diluidas', rotulo: 'Diluídas', title: 'Diluídas nas parcelas a pagar' }, { valor: 'adiadas', rotulo: 'Adiadas', title: 'Adiadas até a contemplação' },
                      { valor: 'adesao', rotulo: 'Na adesão', title: 'Pagas na adesão' }]} />
                </Campo>
                {/* o fundo comum por parcela: automático (a carta dividida) ou o que o termo diz (% por parcela ou R$); o restante da carta
                    vai às adiadas (ou à adesão) pelo gerador */}
                <Campo rotulo="Fundo comum por parcela">
                  <Segmentado altura={28} valor={form.fundoComum.modo === 'pct_total' ? 'pct_parcela' : form.fundoComum.modo}
                    onEscolher={(v) => set('fundoComum', v === 'auto' ? { modo: 'auto', valor: null } : { modo: v, valor: v === form.fundoComum.modo ? form.fundoComum.valor : null })}
                    opcoes={[{ valor: 'auto', rotulo: 'Automático' }, { valor: 'pct_parcela', rotulo: '% parc.' }, { valor: 'valor', rotulo: 'R$' }]} />
                </Campo>
                {form.fundoComum.modo === 'auto'
                  ? <Campo rotulo="Fundo comum"><span className={LEITURA} data-testid="fundo-comum-auto">{brl(previa?.faixas.find((x) => !x.adiada)?.fundoComum ?? null)}</span></Campo>
                  : form.fundoComum.modo === 'valor'
                    ? <Campo rotulo="Fundo comum R$"><CampoMoeda className={CAMPO} valor={form.fundoComum.valor} onChange={(v) => set('fundoComum', { modo: 'valor', valor: v })} /></Campo>
                    : <Campo rotulo={form.fundoComum.modo === 'pct_total' ? 'Fundo comum % total' : 'Fundo comum (%)'}>
                        <CampoPercentual className={CAMPO} valor={form.fundoComum.valor} onChange={(v) => set('fundoComum', { ...form.fundoComum, valor: v })} casas={4} />
                      </Campo>}
              </Bloco>
              <Bloco nome="Taxa de administração" testId="bloco-taxa" grade="grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,0.6fr)]">
                <Campo rotulo="Total (%)"><CampoPercentual className={CAMPO} valor={form.taxaTotalPct} onChange={(v) => set('taxaTotalPct', v)} casas={4} /></Campo>
                <Campo rotulo="Cobrança">
                  <Segmentado altura={28} valor={form.formaTaxa} onEscolher={(v) => set('formaTaxa', v)}
                    opcoes={[{ valor: 'igual', rotulo: 'Igual' }, { valor: 'antecipada', rotulo: 'Antecipada' }, { valor: 'manual', rotulo: 'Manual' }]} />
                </Campo>
                <Campo rotulo="Por parcela (%)"><CampoPercentual className={CAMPO} valor={form.taxaPctParcela} onChange={(v) => set('taxaPctParcela', v)} casas={4} disabled={form.formaTaxa === 'manual'} /></Campo>
                <Campo rotulo="Nas primeiras"><Input className={CAMPO} inputMode="numeric" disabled={form.formaTaxa !== 'antecipada'} value={form.taxaPrimeiras ?? ''}
                  onChange={(e) => set('taxaPrimeiras', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null)} /></Campo>
                <Campo rotulo="Restante por parcela"><span className={LEITURA} data-testid="taxa-restante">{previa && previa.faixas.length > 1 && form.formaTaxa === 'antecipada' ? brl(previa.faixas[1].taxaAdm) : '—'}</span></Campo>
                <Campo rotulo="Adesão (%)"><CampoPercentual className={CAMPO} valor={form.taxaAdesaoPct} onChange={(v) => set('taxaAdesaoPct', v)} casas={4} /></Campo>
              </Bloco>
              <Bloco nome="Outros custos" testId="bloco-outros" grade="grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,1.45fr)_minmax(0,1fr)]">
                <Campo rotulo="Fundo de reserva">
                  <Segmentado altura={28} valor={form.reserva.modo === 'auto' ? 'pct_total' : form.reserva.modo} onEscolher={(v) => set('reserva', { ...form.reserva, modo: v })}
                    opcoes={[{ valor: 'pct_parcela', rotulo: '% parc.' }, { valor: 'pct_total', rotulo: '% total' }, { valor: 'valor', rotulo: 'R$' }]} />
                </Campo>
                {form.reserva.modo === 'valor'
                  ? <Campo rotulo="Reserva R$"><CampoMoeda className={CAMPO} valor={form.reserva.valor} onChange={(v) => set('reserva', { ...form.reserva, valor: v })} /></Campo>
                  : <Campo rotulo="Reserva (%)"><CampoPercentual className={CAMPO} valor={form.reserva.valor} onChange={(v) => set('reserva', { ...form.reserva, valor: v })} casas={4} /></Campo>}
                <Campo rotulo="% total"><CampoPercentual className={CAMPO} valor={form.reserva.totalPct ?? null} onChange={(v) => set('reserva', { ...form.reserva, totalPct: v })} casas={4}
                  disabled={form.reserva.modo === 'pct_total'} /></Campo>
                {form.seguroModo === 'valor'
                  ? <Campo rotulo="Seguro R$"><CampoMoeda className={CAMPO} valor={form.seguroValor} onChange={(v) => set('seguroValor', v)} /></Campo>
                  : <Campo rotulo="Seguro %/mês"><CampoPercentual className={CAMPO} valor={form.seguroValor} onChange={(v) => set('seguroValor', v)} casas={4} /></Campo>}
                <Campo rotulo="Seguro é">
                  <Select value={form.seguroModo === 'valor' ? 'valor' : form.seguroBase}
                    onValueChange={(v) => setForm((f) => (v === 'valor' ? { ...f, seguroModo: 'valor' }
                      : { ...f, seguroModo: 'pct_mes', seguroBase: BASES_DO_SEGURO.find((b) => b === v) ?? 'credito_e_taxas' }))}>
                    <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BASES_DO_SEGURO.map((b) => <SelectItem key={b} value={b}>% {ROTULO_BASE[b]}</SelectItem>)}
                      <SelectItem value="valor">Valor fixo R$</SelectItem>
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo rotulo="Seguro começa">
                  <Select value={form.seguroInicio} onValueChange={(v) => set('seguroInicio', v === 'contemplacao' ? 'contemplacao' : 'primeira')}>
                    <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="primeira">1ª parcela</SelectItem><SelectItem value="contemplacao">Contemplação</SelectItem></SelectContent>
                  </Select>
                </Campo>
              </Bloco>
              <FaixasGeradas faixas={previa?.faixas ?? []} avisos={previa?.avisos ?? []} recusa={previa?.recusa ?? null} />
            </>)}

            {aba === 'parcelas' && t && (
              <ParcelasDoConsorcio parcelas={t.parcelas} faixas={t.faixas} saldo={t.saldo} ultimaOperacao={t.ultimaOperacao}
                onReajuste={() => setDialogo('reajuste')} onRegerar={() => setDialogo('regerar')} onDesfazer={() => setDialogo('desfazer')}
                onEditar={(p) => setDialogo({ parcela: p })} />
            )}
            {aba === 'documentos' && finId && <div className="min-h-0 flex-1 overflow-hidden"><BlocoDocumentos api={credito} /></div>}
          </div>
          {comResumo && (
            <aside className="flex min-h-0 flex-col overflow-hidden border-l bg-card px-3 pt-2" data-testid="resumo-do-consorcio">
              <div className="mb-1 text-[11px] font-semibold">Resumo do consórcio</div>
              <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 text-[11px] leading-4">
                {(t ? linhasDoResumo(t) : [
                  { rotulo: 'Carta', valor: brl(form.carta) },
                  ...(previa?.faixas.length ? previa.faixas.map((f) => ({ rotulo: `Faixa ${f.de}–${f.ate}${f.adiada ? ' adiada' : ''}`, valor: brl(f.total) })) : [{ rotulo: 'Faixas', valor: '—' }]),
                  { rotulo: 'Última a pagar', valor: previa?.vencimentoFinal ? textoDoVencimento(previa.vencimentoFinal) : '—' },
                  { rotulo: 'Taxa adm.', valor: previa?.totais ? brl(previa.totais.taxaAdm) : '—' },
                  { rotulo: 'Reserva', valor: previa?.totais ? brl(previa.totais.reserva) : '—' },
                  { rotulo: 'Total', valor: previa?.totais ? brl(previa.totais.total) : '—' },
                ]).map((l) => (
                  <div key={l.rotulo} className="contents">
                    <span className="whitespace-nowrap text-muted-foreground">{l.rotulo}</span>
                    <span className="whitespace-nowrap text-right font-medium tabular-nums">{l.valor}</span>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
        <div className="flex h-[36px] shrink-0 items-center gap-2 border-t px-3">
          {/* FIN-CONSORCIO-03 — faixa de 11px que quebra a linha (rola por dentro só se passar de duas), vermelha na recusa */}
          <div className={`max-h-[32px] min-w-0 flex-1 overflow-y-auto break-words text-[11px] leading-[14px] ${recado?.erro || (tentouSalvar && falta.length > 0) ? 'text-destructive' : 'text-muted-foreground'}`}
            data-testid="recado-do-consorcio">
            {recado?.texto ?? (falta.length > 0
              ? <span data-testid="falta-do-consorcio">Falta:{falta.map((item, i) => (
                  <span key={item.campo}>{i > 0 ? ' ·' : ''} <button type="button" className="underline-offset-2 hover:underline" onClick={() => irAoCampo(item)}
                    data-testid={`falta-${item.campo}`}>{item.rotulo}</button></span>))}</span>
              : (editando ? 'o cadastro grava direto · as parcelas mudam pelo lápis, pelo reajuste ou pelo "Regerar em aberto"' : 'campos com * são obrigatórios'))}
          </div>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
          <Button size="sm" className="h-[24px] text-[10px]" disabled={gravando} onClick={() => void salvar()} data-testid="salvar-consorcio">
            {gravando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar consórcio'}
          </Button>
        </div>
        {finId && dialogo && (
          <GestoDoConsorcio dialogo={dialogo} finId={finId} gestos={gestos} indice={form.indice} ultimaOperacao={t?.ultimaOperacao ?? null}
            aoFechar={(texto) => { setDialogo(null); if (texto) setRecado({ texto, erro: false }); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** as faixas que as regras geram (só leitura) e os avisos do gerador */
export function FaixasGeradas({ faixas, avisos, recusa }: { faixas: Faixa[]; avisos: string[]; recusa: string | null }) {
  return (
    <section className={`${BLOCO_FORMULARIO} min-h-0 flex-1`} data-testid="faixas-geradas">
      <TituloDoBloco nome="Faixas geradas" />
      <table className="w-full table-fixed text-[10.5px]">
        <colgroup><col className="w-[104px]" /><col /><col /><col /><col /><col /><col className="w-[48px]" /></colgroup>
        <thead><tr className="h-[17px] bg-primary text-[9.5px] text-primary-foreground">
          <th className="px-1.5 text-left font-semibold">Parcelas</th><th className="px-1.5 text-right font-semibold">Fundo comum</th><th className="px-1.5 text-right font-semibold">Taxa adm.</th>
          <th className="px-1.5 text-right font-semibold">Reserva</th><th className="px-1.5 text-right font-semibold">Seguro</th><th className="px-1.5 text-right font-semibold">Total</th>
          <th className="px-1.5 text-center font-semibold">Qtde</th>
        </tr></thead>
        <tbody>
          {faixas.map((f) => (
            <tr key={f.faixa} className="h-[17px] border-b" data-testid="faixa-gerada">
              <td className="whitespace-nowrap px-1.5 tabular-nums">{f.de}–{f.ate}{f.adiada ? ' adiadas' : ''}</td>
              <td className="px-1.5 text-right tabular-nums">{brl(f.fundoComum)}</td><td className="px-1.5 text-right tabular-nums">{brl(f.taxaAdm)}</td>
              <td className="px-1.5 text-right tabular-nums">{brl(f.reserva)}</td><td className="px-1.5 text-right tabular-nums">{brl(f.seguro)}</td>
              <td className="px-1.5 text-right font-semibold tabular-nums">{brl(f.total)}</td><td className="px-1.5 text-center tabular-nums">{f.parcelas}</td>
            </tr>
          ))}
          {faixas.length === 0 && <tr><td colSpan={7} className="h-[17px] px-1.5 text-muted-foreground">{recusa ?? 'Preencha carta, 1ª parcela e prazo para ver as faixas.'}</td></tr>}
        </tbody>
      </table>
      <div className="uma-linha-que-rola mt-0.5 h-[14px] shrink-0 text-[10px] leading-[14px] text-amber-700" data-testid="avisos-do-gerador" title={avisos.join('\n')}>
        {avisos.length ? `! ${avisos.join(' · ')}` : ''}
      </div>
    </section>
  );
}

const TH = 'sticky top-0 z-10 h-[20px] bg-primary px-1.5 text-[9.5px] font-semibold text-primary-foreground';
const TD = 'h-[20px] whitespace-nowrap px-1.5 py-0 text-[10.5px] leading-[18px] tabular-nums';
const TF = 'sticky bottom-0 z-10 h-[20px] bg-[#e4e9ef] px-1.5 text-[10.5px] font-semibold tabular-nums';
const COR_SITUACAO: Record<string, string> = { paga: 'text-[#15803d]', a_ligar: 'text-[#b42318]', a_vencer: 'text-muted-foreground', adiada: 'text-amber-700' };

/** a lista de parcelas: a ÚNICA coisa que rola no modal (cabeçalho e Total presos) */
export function ParcelasDoConsorcio({ parcelas, faixas, saldo, ultimaOperacao, onReajuste, onRegerar, onDesfazer, onEditar }: {
  parcelas: ParcelaDoConsorcio[]; faixas: Faixa[]; saldo: SaldoDoConsorcio; ultimaOperacao: { id: string; tipo: string } | null;
  onReajuste: () => void; onRegerar: () => void; onDesfazer: () => void; onEditar: (p: ParcelaDoConsorcio) => void;
}) {
  const inicioDaFaixa = new Map(faixas.map((f) => [f.de, f]));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex h-[26px] shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" className="h-[22px] text-[10px]" onClick={onReajuste} data-testid="abrir-reajuste">Aplicar reajuste</Button>
        <Button variant="outline" size="sm" className="h-[22px] text-[10px]" onClick={onRegerar} data-testid="abrir-regerar">Regerar em aberto</Button>
        <Button variant="ghost" size="sm" className="h-[22px] text-[10px]" disabled={!ultimaOperacao} onClick={onDesfazer} data-testid="abrir-desfazer"
          title={ultimaOperacao ? `desfazer a última alteração (${ultimaOperacao.tipo})` : 'nenhuma alteração para desfazer'}>Desfazer a última</Button>
        <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">{faixas.length} faixa{faixas.length === 1 ? '' : 's'} · {parcelas.length} parcelas</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded border bg-card" data-testid="lista-parcelas-consorcio">
        <table className="w-full table-fixed">
          <colgroup><col className="w-[40px]" /><col className="w-[86px]" /><col /><col /><col /><col /><col className="w-[64px]" /><col className="w-[66px]" /><col className="w-[24px]" /></colgroup>
          <thead><tr>
            <th className={`${TH} text-left`}>Nº</th><th className={`${TH} text-left`}>Vencimento</th><th className={`${TH} text-right`}>Fundo comum</th>
            <th className={`${TH} text-right`}>Taxa adm.</th><th className={`${TH} text-right`}>Reserva</th><th className={`${TH} text-right`}>Total</th>
            <th className={`${TH} text-left`}>Situação</th><th className={`${TH} text-left`}>Lançamento</th><th className={TH} />
          </tr></thead>
          <tbody>
            {parcelas.map((p) => {
              const faixa = inicioDaFaixa.get(p.numero);
              return [
                faixa ? (
                  <tr key={`f${faixa.faixa}`} className="bg-muted" data-testid="titulo-da-faixa">
                    <td colSpan={9} className="h-[18px] whitespace-nowrap px-1.5 py-0 text-[10px] font-semibold leading-[16px] text-primary">
                      Faixa {faixa.faixa} · parcelas {faixa.de}–{faixa.ate}{faixa.adiada ? ' · adiadas até a contemplação' : ''} · {brl(faixa.total)}
                    </td>
                  </tr>
                ) : null,
                <tr key={p.id} className="border-b" data-testid="parcela-do-consorcio">
                  <td className={TD}>{p.numero}</td>
                  <td className={`${TD} ${p.vencimento ? '' : 'italic text-amber-700'}`} data-testid="vencimento-da-parcela" data-sem-data={p.vencimento ? undefined : ''}>{textoDoVencimento(p.vencimento)}</td>
                  <td className={`${TD} text-right`}>{brl(p.fundoComum)}</td><td className={`${TD} text-right`}>{brl(p.taxaAdm)}</td>
                  <td className={`${TD} text-right`}>{brl(p.reserva)}</td>
                  <td className={`${TD} text-right font-semibold`} title={p.devolvido ? `pago ${brl(p.pago)} · devolvido ${brl(p.devolvido)} · líquido ${brl(p.liquido)}` : undefined}>{brl(p.total)}</td>
                  <td className={`${TD} ${COR_SITUACAO[p.situacao]}`} title={TITULO_SITUACAO[p.situacao]}>{ROTULO_SITUACAO[p.situacao]}{p.ajustada ? ' ·' : ''}</td>
                  <td className={`${TD} whitespace-nowrap text-[10px] text-muted-foreground`} title={p.lancamentoId ? (p.situacao === 'paga' ? 'lançamento pago' : 'lançamento programado') : 'sem lançamento'}>
                    {p.lancamentoId ? (p.situacao === 'paga' ? '↔ pago' : '↔ prog.') : '—'}</td>
                  <td className="h-[20px] px-0.5 py-0 leading-none">
                    <button type="button" className="mx-auto flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={!!p.trava} title={p.trava ?? 'editar a parcela'}
                      onClick={() => onEditar(p)} data-testid="lapis-da-parcela"><Pencil className="h-3 w-3" /></button>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
          <tfoot><tr>
            <td className={TF} colSpan={2}>Total</td>
            <td className={`${TF} text-right`}>{brl(fundoComumDoContrato(saldo))}</td><td className={`${TF} text-right`}>{brl(saldo.taxaAdm)}</td>
            <td className={`${TF} text-right`}>{brl(saldo.reserva)}</td><td className={`${TF} text-right`}>{brl(saldo.total)}</td>
            <td className={TF} colSpan={3} />
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

type Dialogo = 'reajuste' | 'contemplar' | 'regerar' | 'desfazer' | { parcela: ParcelaDoConsorcio };
type Gestos = ReturnType<typeof useGestosDoConsorcio>;
type Resposta = Awaited<ReturnType<Gestos['salvar']>>;

/** Os gestos curtos da aba Parcelas: SIMULA antes (a resposta do banco) e só grava no confirmar; a recusa fica escrita. */
export function GestoDoConsorcio({ dialogo, finId, gestos, indice, ultimaOperacao, aoFechar }: {
  dialogo: Dialogo; finId: string; gestos: Gestos; indice: Indice; ultimaOperacao: { id: string; tipo: string } | null;
  aoFechar: (recado?: string) => void;
}) {
  const p = typeof dialogo === 'object' ? dialogo.parcela : null;
  const tipo = typeof dialogo === 'object' ? 'parcela' : dialogo;
  const [pct, setPct] = useState<number | null>(null);
  const [aPartirDe, setAPartirDe] = useState<string>('');
  const [data, setData] = useState<string>('');
  const [forma, setForma] = useState<'sorteio' | 'lance'>('sorteio');
  const [lanceTipo, setLanceTipo] = useState<'proprio' | 'embutido'>('proprio');
  const [lanceValor, setLanceValor] = useState<number | null>(null);
  const [cartaRecebida, setCartaRecebida] = useState<number | null>(null);
  const [modo, setModo] = useState<'manter_ajustes' | 'recalcular_todas'>('manter_ajustes');
  const [motivo, setMotivo] = useState('');
  const [venc, setVenc] = useState<string>(p?.vencimento ?? '');
  const [fc, setFc] = useState<number | null>(p?.fundoComum ?? null);
  const [adm, setAdm] = useState<number | null>(p?.taxaAdm ?? null);
  const [res, setRes] = useState<number | null>(p?.reserva ?? null);
  const [seg, setSeg] = useState<number | null>(p?.seguro ?? null);
  const [previa, setPrevia] = useState<Resposta | null>(null);
  const [gravando, setGravando] = useState(false);

  const chamar = (simular: boolean): Promise<Resposta> => {
    if (tipo === 'reajuste') return gestos.reajustar(finId, pct ?? 0, aPartirDe, indice === 'nenhum' ? null : indice, simular);
    if (tipo === 'contemplar') return gestos.contemplar(finId, { data, forma, lance_tipo: forma === 'lance' ? lanceTipo : null,
      lance_valor: forma === 'lance' ? lanceValor : null, carta_recebida: cartaRecebida }, simular);
    if (tipo === 'regerar') return gestos.regerar(finId, modo, simular);
    if (tipo === 'desfazer') return gestos.desfazer(finId, ultimaOperacao?.id ?? '', motivo);
    return gestos.editarParcela(finId, { id: p?.id, data_vencimento: p?.adiada && !venc ? null : venc, valor_fundo_comum: fc, valor_taxa_adm: adm,
      valor_fundo_reserva: res, valor_seguro: seg }, simular);
  };
  const simular = async () => { if (tipo === 'desfazer') return; setPrevia(await chamar(true)); };
  const gravar = async () => {
    setGravando(true);
    const r = await chamar(false);
    setGravando(false);
    if (!r.ok) { setPrevia(r); return; }
    aoFechar(tipo === 'desfazer' ? 'Desfeito' : 'Gravado');
  };
  const titulo = { reajuste: 'Aplicar reajuste', contemplar: 'Marcar contemplação', regerar: 'Regerar parcelas em aberto',
    desfazer: 'Desfazer a última alteração', parcela: `Editar a parcela ${p?.numero ?? ''}` }[tipo];
  const fraseDaPrevia = previa
    ? previa.ok ? textoDaPrevia(tipo, previa.dado) : (previa.recusa ?? 'O banco recusou.')
    : tipo === 'desfazer' ? `desfaz: ${ultimaOperacao?.tipo ?? '—'}` : 'Simule para ver o que muda antes de gravar.';
  const podeGravar = tipo === 'desfazer' ? motivo.trim().length > 0 && !!ultimaOperacao : !!previa?.ok;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[300px] w-[min(520px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid={`gesto-${tipo}`}>
        <div className="flex h-[36px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[12px] font-semibold">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{titulo}</DialogDescription>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-3 gap-y-1.5 bg-muted p-3">
          {tipo === 'reajuste' && (<>
            <Campo rotulo="Reajuste (%)" obrig><CampoPercentual className={CAMPO} valor={pct} onChange={(v) => { setPct(v); setPrevia(null); }} casas={4} /></Campo>
            <Campo rotulo="A partir de" obrig><DatePicker size="compact" className={CAMPO} value={aPartirDe} onChange={(v) => { setAPartirDe(v || ''); setPrevia(null); }} /></Campo>
            <div className="col-span-2 text-[10px] text-muted-foreground">índice: {ROTULO_INDICE[indice]} · o teto do contrato vale (o banco limita)</div>
          </>)}
          {tipo === 'contemplar' && (<>
            <Campo rotulo="Data da contemplação" obrig><DatePicker size="compact" className={CAMPO} value={data} onChange={(v) => { setData(v || ''); setPrevia(null); }} /></Campo>
            <Campo rotulo="Forma" obrig><Segmentado altura={28} valor={forma} onEscolher={(v) => { setForma(v); setPrevia(null); }} opcoes={[{ valor: 'sorteio', rotulo: 'Sorteio' }, { valor: 'lance', rotulo: 'Lance' }]} /></Campo>
            <Campo rotulo="Lance"><Segmentado altura={28} valor={lanceTipo} onEscolher={(v) => { setLanceTipo(v); setPrevia(null); }}
              opcoes={[{ valor: 'proprio', rotulo: 'Próprio', desabilitada: forma !== 'lance' }, { valor: 'embutido', rotulo: 'Embutido', desabilitada: forma !== 'lance' }]} /></Campo>
            <Campo rotulo="Valor do lance"><CampoMoeda className={CAMPO} valor={lanceValor} disabled={forma !== 'lance'} onChange={(v) => { setLanceValor(v); setPrevia(null); }} /></Campo>
            <Campo rotulo="Carta recebida"><CampoMoeda className={CAMPO} valor={cartaRecebida} onChange={(v) => { setCartaRecebida(v); setPrevia(null); }} /></Campo>
          </>)}
          {tipo === 'regerar' && (
            <Campo rotulo="Parcelas ajustadas à mão" className="col-span-2">
              <Segmentado altura={28} valor={modo} onEscolher={(v) => { setModo(v); setPrevia(null); }}
                opcoes={[{ valor: 'manter_ajustes', rotulo: 'Manter ajustes' }, { valor: 'recalcular_todas', rotulo: 'Recalcular todas' }]} />
            </Campo>
          )}
          {tipo === 'desfazer' && (
            <Campo rotulo="Motivo" obrig className="col-span-2"><Input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          )}
          {tipo === 'parcela' && p && (<>
            <Campo rotulo="Vencimento" obrig={!p.adiada}><DatePicker size="compact" className={CAMPO} value={venc} onChange={(v) => { setVenc(v || ''); setPrevia(null); }} /></Campo>
            <Campo rotulo="Fundo comum"><CampoMoeda className={CAMPO} valor={fc} onChange={(v) => { setFc(v); setPrevia(null); }} /></Campo>
            <Campo rotulo="Taxa adm."><CampoMoeda className={CAMPO} valor={adm} onChange={(v) => { setAdm(v); setPrevia(null); }} /></Campo>
            <Campo rotulo="Reserva"><CampoMoeda className={CAMPO} valor={res} onChange={(v) => { setRes(v); setPrevia(null); }} /></Campo>
            <Campo rotulo="Seguro"><CampoMoeda className={CAMPO} valor={seg} onChange={(v) => { setSeg(v); setPrevia(null); }} /></Campo>
          </>)}
        </div>
        <div className={`h-[44px] shrink-0 overflow-hidden px-3 py-1 text-[10px] leading-[14px] ${previa && !previa.ok ? 'text-destructive' : 'text-muted-foreground'}`}
          title={fraseDaPrevia} data-testid="previa-do-gesto">{fraseDaPrevia}</div>
        <div className="flex h-[36px] shrink-0 items-center justify-end gap-2 border-t px-3">
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={() => aoFechar()}>Voltar</Button>
          {tipo !== 'desfazer' && <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={() => void simular()} data-testid="simular-gesto">Simular</Button>}
          <Button size="sm" className="h-[24px] text-[10px]" disabled={!podeGravar || gravando} onClick={() => void gravar()} data-testid="gravar-gesto">
            {gravando ? 'Gravando…' : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A frase da simulação, com os números que o banco devolveu (nada calculado aqui). */
export function textoDaPrevia(tipo: string, d: Record<string, unknown> | null): string {
  if (!d) return 'Simulado.';
  const n = (k: string) => (typeof d[k] === 'number' ? Number(d[k]) : null);
  if (tipo === 'reajuste') {
    const teto = d.limitado_pelo_teto === true ? ' (limitado pelo teto)' : '';
    return `Reajuste aplicado ${n('pct_aplicado') ?? '—'}%${teto} em ${n('parcelas') ?? 0} parcelas · carta ${brl(n('carta_antes'))} → ${brl(n('carta_depois'))}.`;
  }
  if (tipo === 'regerar') return `Regera as parcelas em aberto · ${Array.isArray(d.depois) ? d.depois.length : '—'} parcelas depois.`;
  if (tipo === 'contemplar') return 'Contemplação: as adiadas ganham vencimento a partir do mês seguinte; o seguro que começa na contemplação entra.';
  return `Altera ${n('alteradas') ?? 0} parcela · marcada como ajustada.`;
}
