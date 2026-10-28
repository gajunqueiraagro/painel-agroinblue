import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ResumoDoLancamento — P121 (FIN-MODAL-RESUMO-01, Gabriel 27/10, mock `mock-resumo-lancamento-v1_1.html`; D1 = 240px, a largura de hoje).
 *
 * A coluna "Resumo do lançamento" do modal Editar/Novo lançamento. Era montada DENTRO do `LancamentoV2Dialog` com as peças
 * compartilhadas (`ui/linha-resumo`, usadas por mais 9 modais — Abate, Venda, Compra, Morte, Nascimento…), e rolava: favorecido ou
 * subcentro longos empurravam o resto e o fim sumia. Aqui ela é DO FINANCEIRO, com layout próprio; as peças compartilhadas não mudam.
 *
 * ⚠ A CONTA DAS ALTURAS (medida no navegador, 28/10): título 16 + 2 + linhas de 16 (o favorecido 41, os pares 17) → 123 · 90 · 98 · 69 · 34,
 *   gaps de 2 e o rodapé de 24 (2 linhas) = ~452px. A menor janela em que o resumo aparece (≥900px de largura) é 1126×579, com 457px úteis.
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
  /** "Nota Fiscal · 000.544.330" numa linha */
  documento: string | null;
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
function Par({ a, b }: { a: { rotulo: string; valor: string | null; cor?: string; testid?: string }; b: { rotulo: string; valor: string | null; testid?: string } }) {
  const lado = (x: { rotulo: string; valor: string | null; cor?: string; testid?: string }, ultimo: boolean) => (<>
    <td className="truncate px-0 pr-px align-middle text-[9.5px] text-muted-foreground" title={x.rotulo}>{x.rotulo}</td>
    <td className={cn('truncate px-0 align-middle text-[10.5px] tabular-nums', !ultimo && 'pr-[3px]', !x.valor && 'text-muted-foreground')} title={x.valor ?? undefined}>
      {/* o status leva a cor DE HOJE (`STATUS_PALETA`, calculada no diálogo): texto colorido ou a pílula — num span, nunca na célula */}
      <span className={cn(x.valor && x.cor)} data-testid={x.testid}>{x.valor || '—'}</span>
    </td>
  </>);
  return <tr className="h-[17px] text-[11px] leading-[14px]">{lado(a, false)}{lado(b, true)}</tr>;
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
            <Par a={{ rotulo: 'Status', valor: p.status.rotulo, cor: p.status.cor, testid: 'resumo-status' }} b={{ rotulo: 'Forma', valor: p.forma }} />
            <Par a={{ rotulo: 'Venc.', valor: p.vencimento }} b={{ rotulo: 'Pgto.', valor: p.pagamento }} />
            {/* P143 (Code Notas) preenche a Modalidade e as Parcelas na edição; aqui só o lugar e o que o lançamento já tem hoje */}
            <Par a={{ rotulo: 'Modalid.', valor: p.modalidade, testid: 'resumo-modalidade' }} b={{ rotulo: 'Parcelas', valor: p.parcelas, testid: 'resumo-parcelas' }} />
          </Tabela>
        </Bloco>

        <Bloco titulo="Documento" altura="h-[34px]" testid="resumo-documento">
          <Tabela><Linha rotulo="Nota" valor={p.documento} testid="resumo-nota" /></Tabela>
        </Bloco>

        {/* fora de tabela nada termina em "…": a frase (228px a 9,5px) quebra em 2 linhas reservadas */}
        <p className="mt-auto h-[24px] shrink-0 text-[9.5px] leading-[12px] text-muted-foreground">
          Passe o mouse num nome cortado para ver inteiro.
        </p>
      </div>
    </aside>
  );
}
