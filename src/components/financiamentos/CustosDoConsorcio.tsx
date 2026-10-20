/**
 * FIN-CONSORCIO-04 — a aba "Custos e parcelas" do consórcio (mock "Consórcio pelas Faixas", Gabriel 20/10/2026): o bloco Prazos numa linha que
 * quebra (prazo, transcorridas, "Montar os custos por" Faixas (R$) | Regras (%) e, nas regras, os campos delas), a tabela das faixas — editável
 * nas faixas, só leitura nas regras — e a conferência do banco. A tela não soma: totais, faixas geradas e a conferência são do gerador.
 */
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { CampoMoeda, CampoPercentual } from '@/components/ui/campo-moeda';
import { Segmentado } from '@/components/ui/segmentado';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { BLOCO_FORMULARIO, REGUA_CAMPO, REGUA_ROTULO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import {
  ROTULO_AJUSTE, ROTULO_TIPO_DA_FAIXA, TIPOS_DA_FAIXA, brl, dicaDoFundoComum, faixaGeradaDe, intervaloDaFaixa, qtdeDaFaixa, tituloDoAjuste,
  type BaseDoSeguro, type Cronograma, type FaixaDigitada, type FormDoConsorcio, type ModoDeMontar,
} from '@/lib/financiamentos/consorcio';

/* o bloco Prazos usa a régua de 24px do mock (as regras inteiras cabem em menos linhas; a tabela fica com mais altura) */
const CAMPO = `${REGUA_CAMPO} !h-6`;
const LEITURA = 'uma-linha-que-rola flex h-6 items-center rounded-md bg-background/60 px-2 text-[11px] text-muted-foreground';
const BASES_DO_SEGURO: readonly BaseDoSeguro[] = ['credito_e_taxas', 'credito', 'saldo_devedor'];
const ROTULO_BASE: Record<BaseDoSeguro, string> = { credito_e_taxas: 'crédito e taxas', credito: 'crédito', saldo_devedor: 'saldo devedor' };

export const TEXTO_RODAPE_FAIXAS = 'faixas digitadas · trocar para "Regras (%)" recalcula e pede confirmação antes de apagar o que você digitou';
export const TEXTO_RODAPE_REGRAS = 'regras geram as faixas · passe para "Faixas (R$)" para ajustar um valor';
export const TEXTO_DIGITE_AS_FAIXAS = 'Digite as faixas como no termo ou no boleto · o sistema confere com a carta';

export function Campo({ rotulo, obrig, children, className = '', campo }: { rotulo: string; obrig?: boolean; children: ReactNode; className?: string; campo?: string }) {
  return (
    <div className={`min-w-0 ${className}`} data-campo={campo}>
      <div className={REGUA_ROTULO} title={rotulo}>{rotulo}{obrig ? ' *' : ''}</div>
      {children}
    </div>
  );
}

type Set = <K extends keyof FormDoConsorcio>(k: K, v: FormDoConsorcio[K]) => void;
const inteiro = (s: string) => (s ? Number(s.replace(/\D/g, '')) : null);

/** O bloco Prazos: uma linha que quebra; nas regras os campos delas entram na MESMA linha (sem pilha de blocos) */
export function BlocoPrazos({ form, set, setForm, previa, aoTrocarModo, aoMudarPrazo }: {
  form: FormDoConsorcio; set: Set; setForm: (f: (x: FormDoConsorcio) => FormDoConsorcio) => void; previa: Cronograma | null;
  aoTrocarModo: (m: ModoDeMontar) => void; aoMudarPrazo: (prazo: number | null) => void;
}) {
  const regras = form.modo === 'regras';
  return (
    <section className={`${BLOCO_FORMULARIO} !pb-1 !pt-1`} data-testid="bloco-prazos">
      {/* a dica: o valor da carta (da aba Consórcio); nas regras, também "a pagar agora" e o restante da carta (números do gerador) */}
      <TituloDoBloco nome="Prazos" acao={<span className="uma-linha-que-rola block max-w-[560px] text-[10px] leading-[15px] text-muted-foreground" data-testid="dica-fundo-comum">
        {[`valor da carta R$ ${brl(form.carta)} (aba Consórcio)`, ...(regras ? [`a pagar agora ${previa?.aPagarAgora ?? '—'}`, dicaDoFundoComum(form, previa)] : [])].filter(Boolean).join(' · ')}
      </span>} />
      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-0.5">
        <Campo rotulo="Prazo do grupo" obrig campo="prazoGrupo" className="w-[84px]">
          <Input className={CAMPO} inputMode="numeric" value={form.prazoGrupo ?? ''} onChange={(e) => aoMudarPrazo(inteiro(e.target.value))} />
        </Campo>
        <Campo rotulo="Já transcorridas" className="w-[84px]">
          <Input className={CAMPO} inputMode="numeric" value={form.jaTranscorridas ?? ''} onChange={(e) => set('jaTranscorridas', inteiro(e.target.value) ?? 0)} />
        </Campo>
        <Campo rotulo="Transcorridas">
          <Segmentado altura={22} valor={form.transcorridas} onEscolher={(v) => set('transcorridas', v)}
            opcoes={[{ valor: 'diluidas', rotulo: 'Diluídas', title: 'Diluídas nas parcelas a pagar' }, { valor: 'adiadas', rotulo: 'Adiadas', title: 'Adiadas até a contemplação' },
              { valor: 'adesao', rotulo: 'Na adesão', title: 'Pagas na adesão' }]} />
        </Campo>
        <Campo rotulo="Montar os custos por" campo="montarPor">
          <Segmentado altura={22} valor={form.modo} onEscolher={aoTrocarModo}
            opcoes={[{ valor: 'faixas', rotulo: 'Faixas (R$)' }, { valor: 'regras', rotulo: 'Regras (%)' }]} />
        </Campo>
        {/* nas faixas os dois % totais só servem à conferência (o banco compara; nada é corrigido) */}
        <Campo rotulo="Taxa adm. total" className="w-[84px]">
          <CampoPercentual className={CAMPO} valor={form.taxaTotalPct} onChange={(v) => set('taxaTotalPct', v)} casas={4} />
        </Campo>
        {regras && (<>
          <Campo rotulo="Cobrança">
            <Segmentado altura={22} valor={form.formaTaxa} onEscolher={(v) => set('formaTaxa', v)}
              opcoes={[{ valor: 'igual', rotulo: 'Igual' }, { valor: 'antecipada', rotulo: 'Antecipada' }, { valor: 'manual', rotulo: 'Manual' }]} />
          </Campo>
          <Campo rotulo="Por parcela" className="w-[84px]"><CampoPercentual className={CAMPO} valor={form.taxaPctParcela} onChange={(v) => set('taxaPctParcela', v)} casas={4} disabled={form.formaTaxa === 'manual'} /></Campo>
          <Campo rotulo="Nas primeiras" className="w-[70px]"><Input className={CAMPO} inputMode="numeric" disabled={form.formaTaxa !== 'antecipada'} value={form.taxaPrimeiras ?? ''}
            onChange={(e) => set('taxaPrimeiras', inteiro(e.target.value))} /></Campo>
          <Campo rotulo="Adesão" className="w-[84px]"><CampoPercentual className={CAMPO} valor={form.taxaAdesaoPct} onChange={(v) => set('taxaAdesaoPct', v)} casas={4} /></Campo>
          <Campo rotulo="Fundo comum por parcela" campo="fundoComumModo">
            <Segmentado altura={22} valor={form.fundoComum.modo === 'pct_total' ? 'pct_parcela' : form.fundoComum.modo}
              onEscolher={(v) => set('fundoComum', v === 'auto' ? { modo: 'auto', valor: null } : { modo: v, valor: v === form.fundoComum.modo ? form.fundoComum.valor : null })}
              opcoes={[{ valor: 'auto', rotulo: 'Automático' }, { valor: 'pct_parcela', rotulo: '% parc.' }, { valor: 'valor', rotulo: 'R$' }]} />
          </Campo>
          {form.fundoComum.modo === 'auto'
            ? <Campo rotulo="Fundo comum" className="w-[124px]"><span className={LEITURA} data-testid="fundo-comum-auto">{brl(previa?.faixas.find((x) => !x.adiada)?.fundoComum ?? null)}</span></Campo>
            : form.fundoComum.modo === 'valor'
              ? <Campo rotulo="Fundo comum" className="w-[124px]"><CampoMoeda className={CAMPO} valor={form.fundoComum.valor} onChange={(v) => set('fundoComum', { modo: 'valor', valor: v })} /></Campo>
              : <Campo rotulo="Fundo comum" className="w-[124px]"><CampoPercentual className={CAMPO} valor={form.fundoComum.valor} onChange={(v) => set('fundoComum', { ...form.fundoComum, valor: v })} casas={4} /></Campo>}
          <Campo rotulo="Fundo de reserva">
            <Segmentado altura={22} valor={form.reserva.modo === 'auto' ? 'pct_total' : form.reserva.modo} onEscolher={(v) => set('reserva', { ...form.reserva, modo: v })}
              opcoes={[{ valor: 'pct_parcela', rotulo: '% parc.' }, { valor: 'pct_total', rotulo: '% total' }, { valor: 'valor', rotulo: 'R$' }]} />
          </Campo>
          {form.reserva.modo === 'valor'
            ? <Campo rotulo="Reserva" className="w-[124px]"><CampoMoeda className={CAMPO} valor={form.reserva.valor} onChange={(v) => set('reserva', { ...form.reserva, valor: v })} /></Campo>
            : form.reserva.modo === 'pct_parcela'
              ? <Campo rotulo="Reserva" className="w-[90px]"><CampoPercentual className={CAMPO} valor={form.reserva.valor} onChange={(v) => set('reserva', { ...form.reserva, valor: v })} casas={4} /></Campo>
              : null}
        </>)}
        <Campo rotulo="Reserva total" className="w-[84px]">
          <CampoPercentual className={CAMPO} valor={form.reserva.modo === 'pct_total' && regras ? form.reserva.valor : form.reserva.totalPct ?? null}
            onChange={(v) => set('reserva', form.reserva.modo === 'pct_total' && regras ? { ...form.reserva, valor: v } : { ...form.reserva, totalPct: v })} casas={4} />
        </Campo>
        {regras && (<>
          {form.seguroModo === 'valor'
            ? <Campo rotulo="Seguro" className="w-[124px]"><CampoMoeda className={CAMPO} valor={form.seguroValor} onChange={(v) => set('seguroValor', v)} /></Campo>
            : <Campo rotulo="Seguro %/mês" className="w-[84px]"><CampoPercentual className={CAMPO} valor={form.seguroValor} onChange={(v) => set('seguroValor', v)} casas={4} /></Campo>}
          <Campo rotulo="Seguro é" className="w-[132px]">
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
          <Campo rotulo="Seguro começa" className="w-[110px]">
            <Select value={form.seguroInicio} onValueChange={(v) => set('seguroInicio', v === 'contemplacao' ? 'contemplacao' : 'primeira')}>
              <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="primeira">1ª parcela</SelectItem><SelectItem value="contemplacao">Contemplação</SelectItem></SelectContent>
            </Select>
          </Campo>
        </>)}
      </div>
    </section>
  );
}

const TH = 'sticky top-0 z-10 h-[20px] whitespace-nowrap bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground';
/* a linha editável tem 22px (campo de 18); a só leitura (regras), 20px */
const TD = 'h-[22px] whitespace-nowrap px-1.5 py-0 text-[10.5px] leading-[20px] tabular-nums';
const TDL = 'h-[20px] whitespace-nowrap px-1.5 py-0 text-[10.5px] leading-[18px] tabular-nums';
const TDE = 'h-[22px] whitespace-nowrap px-[3px] py-0 leading-[20px]';
const TF = 'sticky bottom-0 z-10 h-[20px] whitespace-nowrap bg-[#e4e9ef] px-1.5 text-[10.5px] font-semibold tabular-nums';
const CE = 'h-[18px] rounded px-1 text-[10.5px]';
/* a régua: o campo de valor recebe 999.999.999,99 sem cortar (124px); abaixo disso a tabela rola DENTRO do cartão, a página nunca */
const LARGURA_MINIMA_DA_TABELA = 'min-w-[830px]';

/** As faixas: editáveis nas Faixas (R$), só leitura nas Regras (%). Adiadas em azul claro; cabeçalho e Total presos; só a lista rola. */
export function TabelaDeFaixas({ form, previa, aoMudar, aoTirar, faixaErro }: {
  form: FormDoConsorcio; previa: Cronograma | null; aoMudar: (i: number, x: FaixaDigitada) => void; aoTirar: (i: number) => void; faixaErro: number | null;
}) {
  const faixas = form.modo === 'faixas';
  const t = previa && !previa.recusa ? previa.totais : null;
  const qtdeTotal = previa && !previa.recusa ? previa.parcelas : null;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded border bg-card" data-testid="lista-faixas-consorcio">
      <table className={`w-full table-fixed ${LARGURA_MINIMA_DA_TABELA}`}>
        <colgroup><col className="w-[92px]" /><col className="w-[40px]" /><col /><col /><col /><col /><col className="w-[92px]" /><col className="w-[92px]" /><col className="w-[24px]" /></colgroup>
        <thead><tr>
          <th className={`${TH} text-left`}>Parcelas</th><th className={`${TH} text-center`}>Qtde</th><th className={`${TH} text-right`}>Fundo comum</th>
          <th className={`${TH} text-right`}>Taxa adm.</th><th className={`${TH} text-right`}>Reserva</th><th className={`${TH} text-right`}>Seguro</th>
          <th className={`${TH} text-right`}>Total da parcela</th><th className={`${TH} text-left`}>Tipo</th><th className={TH} />
        </tr></thead>
        <tbody>
          {faixas
            ? form.faixas.map((x, i) => {
              const g = faixaGeradaDe(previa && !previa.recusa ? previa : null, x.de);
              const adiada = x.tipo === 'adiada';
              const muda = (k: keyof FaixaDigitada, v: FaixaDigitada[keyof FaixaDigitada]) => aoMudar(i, { ...x, [k]: v });
              return (
                <tr key={i} className={`border-b ${adiada ? 'bg-[#e8f0fb]' : ''} ${faixaErro === i ? 'outline outline-1 -outline-offset-1 outline-destructive' : ''}`}
                  data-testid="faixa-digitada" data-faixa={i}>
                  <td className={TDE}>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Input className={`${CE} w-[34px] text-center tabular-nums`} inputMode="numeric" value={x.de ?? ''} onChange={(e) => muda('de', inteiro(e.target.value))} aria-label="de" />
                      a
                      <Input className={`${CE} w-[34px] text-center tabular-nums`} inputMode="numeric" value={x.ate ?? ''} onChange={(e) => muda('ate', inteiro(e.target.value))} aria-label="até" />
                    </div>
                  </td>
                  <td className={`${TD} text-center`}>{qtdeDaFaixa(x) ?? '—'}</td>
                  <td className={TDE}><CampoMoeda className={CE} valor={x.fundoComum} onChange={(v) => muda('fundoComum', v)} /></td>
                  <td className={TDE}><CampoMoeda className={CE} valor={x.taxaAdm} onChange={(v) => muda('taxaAdm', v)} /></td>
                  <td className={TDE}><CampoMoeda className={CE} valor={x.reserva} onChange={(v) => muda('reserva', v)} /></td>
                  <td className={TDE}><CampoMoeda className={CE} valor={x.seguro} onChange={(v) => muda('seguro', v)} /></td>
                  <td className={`${TD} text-right font-semibold`} data-testid="total-da-faixa">{brl(g?.total ?? null)}</td>
                  <td className={TDE}>
                    <Select value={x.tipo} onValueChange={(v) => muda('tipo', TIPOS_DA_FAIXA.find((k) => k === v) ?? 'a_pagar')}>
                      <SelectTrigger className={`${CE} !h-[18px] text-[10.5px]`} data-testid="tipo-da-faixa"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS_DA_FAIXA.map((k) => <SelectItem key={k} value={k}>{ROTULO_TIPO_DA_FAIXA[k]}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="h-[22px] px-0.5 py-0 text-center leading-none">
                    <button type="button" className="mx-auto flex h-4 w-4 items-center justify-center text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-30"
                      disabled={form.faixas.length === 1} title={form.faixas.length === 1 ? 'a única faixa não sai' : 'tirar a faixa'} onClick={() => aoTirar(i)}
                      data-testid="tirar-faixa">✕</button>
                  </td>
                </tr>
              );
            })
            : (previa?.faixas ?? []).map((f) => (
              <tr key={f.faixa} className={`border-b ${f.adiada ? 'bg-[#e8f0fb]' : ''}`} data-testid="faixa-gerada">
                <td className={TDL}>{intervaloDaFaixa(f).replace('–', ' a ')}</td>
                <td className={`${TDL} text-center`}>{f.parcelas}</td>
                <td className={`${TDL} text-right`} title={f.ajusteArredondamento != null ? tituloDoAjuste(f.ajusteArredondamento) : undefined}
                  data-testid={f.ajusteArredondamento != null ? 'faixa-com-ajuste' : undefined}>
                  {f.ajusteArredondamento != null && <span className="mr-1 text-[9.5px] text-amber-700">{ROTULO_AJUSTE}</span>}{brl(f.fundoComum)}</td>
                <td className={`${TDL} text-right`}>{brl(f.taxaAdm)}</td><td className={`${TDL} text-right`}>{brl(f.reserva)}</td><td className={`${TDL} text-right`}>{brl(f.seguro)}</td>
                <td className={`${TDL} text-right font-semibold`}>{brl(f.total)}</td>
                <td className={TDL}>{(previa?.numerosNaAdesao ?? []).includes(f.de) ? ROTULO_TIPO_DA_FAIXA.adesao : f.adiada ? ROTULO_TIPO_DA_FAIXA.adiada : ROTULO_TIPO_DA_FAIXA.a_pagar}</td>
                <td className={TDL} />
              </tr>
            ))}
          {!faixas && !(previa?.faixas.length) && <tr><td colSpan={9} className={`${TD} text-muted-foreground`}>{previa?.recusa ?? 'Preencha carta, 1ª parcela e prazo para ver as faixas.'}</td></tr>}
        </tbody>
        <tfoot><tr>
          <td className={TF}>Total</td><td className={`${TF} text-center`}>{qtdeTotal ?? '—'}</td>
          <td className={`${TF} text-right`}>{brl(t?.fundoComum ?? null)}</td><td className={`${TF} text-right`}>{brl(t?.taxaAdm ?? null)}</td>
          <td className={`${TF} text-right`}>{brl(t?.reserva ?? null)}</td><td className={`${TF} text-right`}>{brl(t?.seguro ?? null)}</td>
          <td className={`${TF} text-right`}>{brl(t?.total ?? null)}</td><td className={TF} colSpan={2} />
        </tr></tfoot>
      </table>
    </div>
  );
}

/** Os avisos do gerador que a conferência já diz (fundo comum, taxa, reserva) não se repetem; o resto vira item "!" */
export const avisosForaDaConferencia = (avisos: string[]) => avisos.filter((a) => !/^(fundo comum|taxa de administração|reserva):/.test(a));

/** A conferência do banco: sempre presente, UMA linha de altura fixa (o que não cabe rola dentro dela; o texto inteiro no `title`);
    ✓ verde, ! âmbar — nunca corrige, não impede salvar */
export function ConfereDoConsorcio({ previa }: { previa: Cronograma | null }) {
  const itens: { chave: string; ok: boolean; texto: string }[] = previa && !previa.recusa ? [...previa.confere, ...avisosForaDaConferencia(previa.avisos).map((a, i) => ({ chave: `aviso-${i}`, ok: false, texto: a }))] : [];
  return (
    <section className="flex h-[24px] shrink-0 items-center gap-3 rounded-lg border bg-card px-2.5 text-[11px]" data-testid="confere-do-consorcio"
      title={itens.map((c) => `${c.ok ? '✓' : '!'} ${c.texto}`).join('\n')}>
      <b className="shrink-0 font-semibold">Confere</b>
      <span className="uma-linha-que-rola min-w-0 flex-1"><span className="inline-flex gap-3">
        {itens.length === 0 && <span className="text-muted-foreground">{previa?.recusa ? 'a conferência volta quando as faixas fecharem' : '—'}</span>}
        {itens.map((c) => (
          <span key={c.chave} className={`shrink-0 whitespace-nowrap ${c.ok ? 'text-[#15803d]' : 'text-amber-700'}`} data-testid={`confere-${c.chave}`} data-ok={c.ok ? 'sim' : 'nao'}>
            {c.ok ? '✓' : '!'} {c.texto}
          </span>
        ))}
      </span></span>
    </section>
  );
}

/** Faixas → Regras com faixa digitada: pergunta antes de descartar */
export function ConfirmarRegras({ aberto, aoConfirmar, aoVoltar }: { aberto: boolean; aoConfirmar: () => void; aoVoltar: () => void }) {
  return (
    <AlertDialog open={aberto} onOpenChange={(v) => { if (!v) aoVoltar(); }}>
      <AlertDialogContent className="max-w-[420px]" data-testid="confirmar-regras">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[13px]">Passar para Regras (%)?</AlertDialogTitle>
          <AlertDialogDescription className="text-[11px]">As faixas digitadas são descartadas: as faixas passam a sair das regras. Para ajustar um valor depois, volte para Faixas (R$).</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-[24px] text-[10px]" data-testid="voltar-faixas">Voltar</AlertDialogCancel>
          <AlertDialogAction className="h-[24px] text-[10px]" onClick={aoConfirmar} data-testid="confirmar-passar-regras">Passar para Regras</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
