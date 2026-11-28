import { siglaDaForma } from '@/lib/financeiro/aprovacaoV3';
import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ResumoDoLancamento — P121 (FIN-MODAL-RESUMO-01, Gabriel 27/10, mock `mock-resumo-lancamento-v1_1.html`; D1 = 240px, a largura de hoje).
 *
 * A coluna "Resumo do lançamento" do modal Editar/Novo lançamento. Era montada DENTRO do `LancamentoV2Dialog` com as peças
 * compartilhadas (`ui/linha-resumo`, usadas por mais 9 modais — Abate, Venda, Compra, Morte, Nascimento…), e rolava: favorecido ou
 * subcentro longos empurravam o resto e o fim sumia. Aqui ela é DO FINANCEIRO, com layout próprio; as peças compartilhadas não mudam.
 *
 * ⚠ A CONTA DAS ALTURAS (medida no navegador, 28/10): título 16 + 2 + linhas de 16 (o favorecido 41, os pares 17) → 123 · 90 · 98 · 69 · 34,
 *   gaps de 2 e o rodapé de 24 (2 linhas) = ~452px. BOLETO D1d D3 (17/11): o Documento ganhou a linha "Boleto" (34 → 50) e o rodapé
 *   ficou com 1 linha (24 → 12, frase mais curta) = ~456px. A menor janela em que o resumo aparece (≥900px de largura) é 1126×579, com 457px úteis.
 *   Linha nova num bloco = refazer a conta e medir nos tamanhos do gate.
 * ⚠ NADA ROLA E NADA MUDA DE ALTURA: cada bloco tem ALTURA FIXA (o nome grande nunca empurra o resto). Texto longo termina em "…" com o
 *   texto inteiro no `title`; o favorecido tem até 2 linhas. O Valor ocupa a linha INTEIRA do bloco (a 20px, "R$ 99.999.999,99" não cabe
 *   ao lado do rótulo em 240px).
 * ⚠ SÓ APRESENTAÇÃO: tudo vem pronto por props — os mesmos valores que o diálogo já calculava. Nenhum estado, regra ou soma.
 */
export interface ResumoDoLancamentoProps {
  tipo: { rotulo: string; cor: string };
  competencia: string | null;
  favorecido: string | null;
  /** "CNPJ · Cidade/UF" do cadastro (P117, `linhaDoDocumento`); "sem CNPJ/CPF"; vazio sem favorecido */
  favorecidoDocumento: string;
  descricao: string | null;
  fazenda: string | null;
  valor: string | null;
  /** saída = vermelho; entrada = azul; transferência = cor do texto */
  sentido: 'saida' | 'entrada' | 'transferencia';
  conta: { rotulo: string; nome: string | null }[];
  atividade: string | null;
  safra: string | null;
  fase: string | null;
  centro: string | null;
  subcentro: string | null;
  status: { rotulo: string | null; cor?: string };
  forma: string | null;
  vencimento: string | null;
  pagamento: string | null;
  modalidade: string | null;
  parcelas: string | null;
  /** P121b: o NÚMERO do documento ("NF 000.521.110", inteiro, logo depois do rótulo), o selo da origem ("da compra" · "ligado") e o
   *  `title` com tudo. Sem número: null ("—"). */
  documento: { numero: string; selo: string | null; titulo: string } | null;
  /** BOLETO D1d D3 (+ Gabriel 18/11 14:40): o boleto VIVO ligado ("venc dd/mm/aaaa") e o 👁 que abre o PDF dele (null = sem PDF
   *  guardado: o 👁 apagado). Sem boleto: null ("—"). */
  boleto?: { selo: string; onVer: (() => void) | null } | null;
  /** NOTA-ENTREGA-FUTURA-01 (B, mock aprovado 25/11 07:44) — a compra com entrega futura: a linha "Nota" vira "Compra", e entram "Entregas"
   *  (quantas · o que falta) e "LCDPR" (a NF da compra). Sem entrega: null (o bloco de sempre). */
  entregas?: { compra: string | null; entregas: string } | null;
}

/** Título de bloco: pequeno, maiúsculo, navy, com a linha embaixo. */
function Bloco({ titulo, altura, children, testid }: { titulo: string; altura: string; children: ReactNode; testid: string }) {
  return (
    <section className={cn('shrink-0 overflow-hidden', altura)} data-testid={testid}>
      <h4 className="h-[16px] border-b border-border pt-[3px] text-[9.5px] font-bold uppercase leading-[12px] tracking-wide text-primary">{titulo}</h4>
      <div className="pt-[2px]">{children}</div>
    </section>
  );
}

/* ⚠ CADA BLOCO É UMA TABELA (rótulo e valor em `td`): é a regra de corte da casa — nome/texto termina em "…" SÓ em célula, com o
   texto inteiro no `title` (fora de tabela, "…" reprova no gate). Régua fixa: rótulo 78px, valor o resto. */
const ROTULO = 'w-[78px] truncate pr-2 align-middle text-[10.5px] text-muted-foreground';

/** Uma linha: rótulo curto + valor numa linha com "…" e o texto inteiro no `title`. Sem valor, "—". */
function Linha({ rotulo, valor, className, testid }: { rotulo: string; valor: string | null; className?: string; testid?: string }) {
  return (
    <tr className="h-[16px] text-[11px] leading-[14px]">
      <td className={ROTULO} title={rotulo}>{rotulo}</td>
      <td className={cn('truncate align-middle', !valor && 'text-muted-foreground', className)} title={valor ?? undefined} data-testid={testid}>{valor || '—'}</td>
    </tr>
  );
}

function Tabela({ children, colunas = ['78px', undefined] }: { children: ReactNode; colunas?: (string | undefined)[] }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>{colunas.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
      <tbody>{children}</tbody>
    </table>
  );
}

/** Duas linhas lado a lado (Status/Forma, Venc./Pgto., Modalid./Parcelas): rótulo curto, valor numa linha.
 *  ⚠ EM 240px A DATA CABE JUSTA (medido 28/10, na largura útil de 218px): rótulo 9,5px em 41px ("Modalid." ≈ 39 + 1 de recuo), valor 10,5px
 *  tabular em 69px (recuo de 3) e 67px (sem recuo) — "10/10/2026" = 63px — e a célula sem o padding de 1px do navegador. Data nunca
 *  corta: mexeu, medir no gate. */
type LadoDoPar = { rotulo: string; valor: string | null; cor?: string; testid?: string; titulo?: string };
function Par({ a, b }: { a: LadoDoPar; b: LadoDoPar }) {
  const lado = (x: LadoDoPar, ultimo: boolean) => (<>
    <td className="truncate px-0 pr-px align-middle text-[9.5px] text-muted-foreground" title={x.rotulo}>{x.rotulo}</td>
    <td className={cn('truncate px-0 align-middle text-[10.5px] tabular-nums', !ultimo && 'pr-[3px]', !x.valor && 'text-muted-foreground')} title={x.titulo ?? x.valor ?? undefined}>
      {/* o status leva a cor DE HOJE (`STATUS_PALETA`, calculada no diálogo): texto colorido ou a pílula — num span, nunca na célula */}
      <span className={cn(x.valor && x.cor)} data-testid={x.testid}>{x.valor || '—'}</span>
    </td>
  </>);
  return <tr className="h-[17px] text-[11px] leading-[14px]">{lado(a, false)}{lado(b, true)}</tr>;
}

/** RESUMO-LATERAL-FORMA-01 (Gabriel 27/11 17:00, NF 469.017: "Forma: Cartão de c…" cortado) — o valor CURTO da Forma, pela classificação
 *  ÚNICA da forma (`siglaDaForma`, a da Aprovação), nos nomes curtos do sistema: Cartão · Boleto · Pix · TED · Débito · Dinheiro · DA (débito
 *  automático) · Outro. Cabe nos 69px do Par sem "…"; a forma inteira vai no title. O lugar da Forma não muda (o Par é fixo). */
export function formaCurta(f: string | null): string | null {
  if (!f || !f.trim()) return null;
  const s = siglaDaForma(f).sigla;
  return s === 'Bol' ? 'Boleto' : s === 'Déb.' ? 'Débito' : s === 'Din.' ? 'Dinheiro' : s;
}
/** O valor CURTO da Modalidade (cabe nos 69px do Par sem "…"; o inteiro vai no title). */
export function modalidadeCurta(m: string | null): string | null {
  if (m === 'Compra parcelada') return 'Parcelada';
  if (m === 'Parcela solta') return 'Solta';
  return m;
}
/** O title da linha "Nota": o número + a origem por extenso (o selo saiu da linha). */
export function tituloDaNota(d: ResumoDoLancamentoProps['documento']): string | undefined {
  if (!d) return undefined;
  const origem = d.selo === 'da compra' ? 'da compra: a nota está na compra parcelada e vale para as parcelas'
    : d.selo === 'ligado' ? 'documento ligado a este lançamento' : null;
  return origem ? `${d.titulo} · ${origem}` : d.titulo;
}

export function ResumoDoLancamento(p: ResumoDoLancamentoProps) {
  const corValor = p.sentido === 'saida' ? 'text-destructive' : p.sentido === 'entrada' ? 'text-blue-600' : '';
  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-md border bg-card shadow-sm" data-testid="resumo-lancamento">
      {/* a faixa de 18px de hoje (a do `FaixaTituloResumo` no formato "pares", copiada: fora do `AsideResumo` não há o formato) */}
      <div className="shrink-0 h-[18px] border-b border-border bg-accent/40 flex items-center gap-2 px-2.5 text-[11px] font-semibold leading-4 text-primary">
        Resumo do lançamento
      </div>
      {/* ⚠ overflow-hidden, NUNCA auto: o resumo não rola (P121) — as alturas fixas dos blocos são a garantia de que cabe */}
      <div className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-hidden px-2.5 pb-1">
        <Bloco titulo="Identificação" altura="h-[123px]" testid="resumo-identificacao">
          <Tabela>
            <Linha rotulo="Tipo" valor={p.tipo.rotulo} className={p.tipo.cor} />
            <Linha rotulo="Comp." valor={p.competencia} />
            {/* o favorecido: até 2 linhas (o resto "…", o nome inteiro no title) e, colado embaixo, "CNPJ · Cidade/UF" pequeno e cinza */}
            <tr className="h-[41px] text-[11px] leading-[14px]">
              <td className={cn(ROTULO, 'align-top pt-px')}>Favorecido</td>
              <td className="py-0 align-top" title={p.favorecido ?? undefined}>
                <div className={cn('line-clamp-2 h-[28px] break-words', !p.favorecido && 'text-muted-foreground')} data-testid="resumo-favorecido">{p.favorecido || '—'}</div>
                <div className="h-[13px] truncate text-[9.5px] leading-[13px] text-muted-foreground" title={p.favorecidoDocumento || undefined}
                  data-testid="resumo-favorecido-documento">{p.favorecidoDocumento}</div>
              </td>
            </tr>
            <Linha rotulo="Descrição" valor={p.descricao} testid="resumo-descricao" />
            <Linha rotulo="Fazenda" valor={p.fazenda} />
          </Tabela>
        </Bloco>

        <Bloco titulo="Financeiro" altura="h-[90px]" testid="resumo-financeiro">
          <div className="h-[40px]">
            <div className="text-[10.5px] leading-[13px] text-muted-foreground">Valor</div>
            <div className={cn('whitespace-nowrap text-[20px] font-bold leading-[26px] tabular-nums', corValor, !p.valor && 'text-muted-foreground')}
              data-testid="resumo-valor">{p.valor || '—'}</div>
          </div>
          <Tabela>{p.conta.slice(0, 2).map((c) => <Linha key={c.rotulo} rotulo={c.rotulo} valor={c.nome} />)}</Tabela>
        </Bloco>

        <Bloco titulo="Classificação" altura="h-[98px]" testid="resumo-classificacao">
          <Tabela>
            <Linha rotulo="Atividade" valor={p.atividade} />
            <Linha rotulo="Safra" valor={p.safra} />
            <Linha rotulo="Fase" valor={p.fase} />
            <Linha rotulo="Centro" valor={p.centro} />
            <Linha rotulo="Subcentro" valor={p.subcentro} className="font-semibold" testid="resumo-subcentro" />
          </Tabela>
        </Bloco>

        <Bloco titulo="Pagamento" altura="h-[69px]" testid="resumo-pagamento">
          <Tabela colunas={['41px', '69px', '41px', undefined]}>
            <Par a={{ rotulo: 'Status', valor: p.status.rotulo, cor: p.status.cor, testid: 'resumo-status' }} b={{ rotulo: 'Forma', valor: formaCurta(p.forma), titulo: p.forma ?? undefined, testid: 'resumo-forma' }} />
            <Par a={{ rotulo: 'Venc.', valor: p.vencimento }} b={{ rotulo: 'Pgto.', valor: p.pagamento }} />
            {/* P143 (Code Notas) preenche a Modalidade e as Parcelas na edição; aqui só o lugar e o que o lançamento já tem hoje */}
            {/* Gabriel 18/11 14:40 ("Compra pa…"): o valor da Modalid. é CURTO (cabe nos 69px; o inteiro no title) — `modalidadeCurta` */}
            <Par a={{ rotulo: 'Modalid.', valor: modalidadeCurta(p.modalidade), titulo: p.modalidade ?? undefined, testid: 'resumo-modalidade' }}
              b={{ rotulo: 'Parcelas', valor: p.parcelas, testid: 'resumo-parcelas' }} />
          </Tabela>
        </Bloco>

        <Bloco titulo="Documento" altura={p.entregas ? 'h-[66px]' : 'h-[50px]'} testid="resumo-documento">
          {/* P121b: o número NUNCA corta (sem `truncate`, sem encolher). Gabriel 18/11 14:40 ("da co…"): a ORIGEM ("da compra" = a nota está
              na compra parcelada, vale para as parcelas · "ligado" = documento ligado) sai da linha e vai para o title do número — nada cortado */}
          <Tabela>
            {p.entregas ? (<>
              {/* a NF da compra É a do LCDPR: uma linha só ("NF … · LCDPR"), para o Resumo seguir sem rolar a 1126×579 (P121) */}
              <tr className="h-[16px] text-[11px] leading-[14px]">
                <td className={ROTULO} title="Compra: a NF que gera a conta">Compra</td>
                <td className="align-middle" title={p.entregas.compra ? `NF ${p.entregas.compra}: a NF do lançamento e a do LCDPR` : undefined}>
                  <span className={cn('whitespace-nowrap tabular-nums', !p.entregas.compra && 'text-muted-foreground')} data-testid="resumo-compra">
                    {p.entregas.compra ? `NF ${p.entregas.compra}` : '—'}</span>
                  {p.entregas.compra && <span className="ml-1 whitespace-nowrap text-[10px] text-muted-foreground" data-testid="resumo-lcdpr">· LCDPR</span>}</td>
              </tr>
              <tr className="h-[16px] text-[11px] leading-[14px]">
                <td className={ROTULO} title="Entregas (remessas) ligadas">Entregas</td>
                <td className="align-middle"><span className="whitespace-nowrap tabular-nums" data-testid="resumo-entregas">{p.entregas.entregas}</span></td>
              </tr>
            </>) : (
            <tr className="h-[16px] text-[11px] leading-[14px]">
              <td className={ROTULO} title="Nota">Nota</td>
              <td className="align-middle" title={tituloDaNota(p.documento)}>
                <span className={cn('shrink-0 whitespace-nowrap tabular-nums', !p.documento && 'text-muted-foreground')} data-testid="resumo-nota">
                  {p.documento?.numero || '—'}
                </span>
              </td>
            </tr>
            )}
            {/* BOLETO D1d D3 (+ 14:40): "venc dd/mm/aaaa" (a data nunca corta) e o 👁 do PDF num lugar fixo; sem boleto ligado, "—" */}
            <tr className="h-[16px] text-[11px] leading-[14px]">
              <td className={ROTULO} title="Boleto">Boleto</td>
              <td className="align-middle">
                <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                  {p.boleto ? (
                    <>
                      <span className="shrink-0 whitespace-nowrap tabular-nums" data-testid="resumo-boleto">{p.boleto.selo}</span>
                      <button type="button" className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] text-primary hover:bg-muted disabled:opacity-30"
                        onClick={p.boleto.onVer ?? undefined} disabled={!p.boleto.onVer} aria-label="Ver o PDF do boleto"
                        title={p.boleto.onVer ? 'ver o PDF do boleto' : 'o boleto não tem PDF guardado'} data-testid="resumo-boleto-ver"><Eye className="h-3 w-3" /></button>
                    </>
                  ) : <span className="text-muted-foreground" data-testid="resumo-boleto">—</span>}
                </div>
              </td>
            </tr>
          </Tabela>
        </Bloco>

        {/* fora de tabela nada termina em "…": a frase cabe em 1 linha (o Documento ganhou a linha do Boleto) */}
        {/* com as entregas o Documento ganha uma linha: a dica sai (o lugar dela) para o Resumo seguir sem rolar */}
        <p className={cn('mt-auto h-[12px] shrink-0 whitespace-nowrap text-[9.5px] leading-[12px] text-muted-foreground', p.entregas && 'hidden')}>
          Nome cortado: passe o mouse.
        </p>
      </div>
    </aside>
  );
}
