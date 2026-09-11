import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  carregarLogoBase64, criarDocRetratoA4, addHeader, addTituloSecao, addCardsKPI, addTabelaExecutiva, addFooterComPaginacao,
} from '@/lib/pdf/pdfChassi';
import { STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { format, parseISO } from 'date-fns';
import type { LancamentoV2, DimensaoDataFinanceiro } from '@/hooks/useFinanceiroV2';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import { formatMoeda } from '@/lib/calculos/formatters';
import { formatDocumento } from '@/lib/financeiro/documentoHelper';
import { normalizarAtividade } from '@/lib/financeiro/filtrosListaV2';
import { contasExibidasDoLancamento, type ContasExibidas } from '@/lib/financeiro/contaPayload';
import { ErroConjuntoIncompleto } from '@/lib/financeiro/listaPaginadaV2';
import { normalizarErro } from '@/lib/erroOperacional';

interface FornecedorMap {
  id: string;
  nome: string;
}

/** Qualquer cadastro que o exportador só precisa traduzir de id para nome. */
export interface NomePorId {
  id: string;
  nome: string;
}

const nomeDe = (lista: readonly NomePorId[] | undefined, id: string | null | undefined) =>
  (id ? lista?.find((x) => x.id === id)?.nome : '') || '';

/**
 * ⚠ A TRANSFERÊNCIA MOSTRA AS DUAS PONTAS na mesma célula, com a seta apontando o caminho do
 * dinheiro. Uma ponta só esconderia metade do fato — quem confere extrato precisa saber de
 * onde saiu E onde entrou.
 * ⚠ NOME DESCONHECIDO VIRA VAZIO, NUNCA O UUID: um identificador numa planilha é ruído que
 * o operador não tem como interpretar, e ainda entra no filtro do Excel como uma opção.
 */
function nomeDaConta(contas: ContasExibidas, mapa: readonly NomePorId[] | undefined): string {
  if (contas.forma === 'par') {
    const origem = nomeDe(mapa, contas.origemId);
    const destino = nomeDe(mapa, contas.destinoId);
    if (origem && destino) return `${origem} → ${destino}`;
    return origem || destino;
  }
  return nomeDe(mapa, contas.contaId);
}

/**
 * ⚠ O PREFIXO NUMÉRICO DE `tipo_operacao` É CHAVE DE ORDENAÇÃO, NÃO NOME. O banco guarda
 * `1-Entradas`, `2-Saídas` e `3-Transferências` (medido em 10/09/2026, mais 7 linhas legadas
 * em `3-Transferência`), e o número existe para ordenar. Numa planilha ele vira ruído na
 * frente de toda linha e atrapalha o filtro do Excel, que passa a ordenar por dígito.
 */
const semPrefixo = (t: string | null | undefined) => (t || '').replace(/^\d+-/, '');

/**
 * O rótulo da atividade na planilha.
 *
 * ⚠ SILVICULTURA FALTAVA, e a falta era invisível: sem a chave o `?? ''` devolvia célula
 * vazia, exatamente como para 'outros' — os 35 lançamentos de silvicultura do proto saíam
 * sem atividade, e ninguém tinha como notar que era omissão e não ausência de dado.
 * ⚠ AQUI DIZ "Agricultura" E A TELA DIZ "Lavoura", DE PROPÓSITO ATÉ SEGUNDA ORDEM. O adendo
 * do PR-FIN-SAFRA-ADM-01 trocou o rótulo do FILTRO para o do card; trocar também o da
 * planilha mudaria o conteúdo de uma coluna que já circula em arquivos exportados, e isso
 * é decisão de quem lê os relatórios, não efeito colateral de um PR de filtro.
 */
const ATIVIDADE_LABEL: Record<string, string> = {
  pecuaria: 'Pecuária',
  agricultura: 'Agricultura',
  silvicultura: 'Silvicultura',
  administrativo: 'Administrativo',
  outros: '',
};

// PR-FIN-GRADE-DATAS-03 — rótulo humano da dimensão temporal soberana usada no recorte da grade.
const DIMENSAO_LABEL: Record<DimensaoDataFinanceiro, string> = {
  financeira: 'Financeira',
  competencia: 'Competência',
  vencimento: 'Vencimento',
  pagamento: 'Pagamento',
};

interface Props {
  /**
   * PR-FIN-LISTA-VENCIMENTO-03 · 2C-3 — a exportacao deixou de receber o array
   * da tela e passou a BUSCAR o conjunto do filtro no servidor, no clique.
   *
   * Antes recebia `lancamentos`, o mesmo array que alimenta a grade. Enquanto a
   * grade carregava tudo em memoria isso funcionava por acidente; no momento em
   * que a lista virar paginada de 30, o arquivo sairia com 30 linhas e ninguem
   * notaria. Receber a FUNCAO em vez do array remove a possibilidade.
   *
   * Deve devolver o conjunto completo dos filtros APLICADOS, ja ordenado.
   * Deve levantar erro em vez de devolver conjunto parcial.
   */
  carregarConjunto: () => Promise<LancamentoV2[]>;
  fornecedores: FornecedorMap[];
  /* ⚠ OS TRÊS CADASTROS VÊM DA TELA, e não de uma busca nova: ela já os tem em memória para
     desenhar a lista e os filtros (`fazendas`, `hook.contasBancarias`, `hook.safras`). Uma
     segunda leitura aqui daria a chance de o arquivo discordar da tela sobre o nome de uma
     safra — e o operador conferiria a planilha contra a tela sem entender a diferença.
     ⚠ OBRIGATÓRIAS, e isso é o conserto — PR-EXPORT-FINANCEIRO-02. Elas nasceram opcionais
     no 01, e a tela monta este menu DUAS vezes (`:1263` e `:1299`, desktop e a barra
     compacta). Liguei a primeira e não vi a segunda; o compilador ficou calado porque
     opcional é exatamente a permissão de esquecer. Quem exportava pela segunda recebia as
     três colunas VAZIAS — nome nenhum para cruzar. Prop obrigatória é o compilador
     impedindo a próxima montagem esquecida. */
  fazendas: readonly NomePorId[];
  contas: readonly NomePorId[];
  safras: readonly NomePorId[];
  ano: string;
  fazendaNome?: string;
  totalCount: number;
  dimensao: DimensaoDataFinanceiro;   // PR-FIN-GRADE-DATAS-03 — dimensão usada; identificada no arquivo
}

function fmtDate(d: string | null) {
  if (!d) return '';
  try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; }
}




function buildRows(
  lancamentos: LancamentoV2[], fornecedores: FornecedorMap[],
  cadastros: { fazendas?: readonly NomePorId[]; contas?: readonly NomePorId[]; safras?: readonly NomePorId[] } = {},
) {
  return lancamentos.map(l => {
    const forn = fornecedores.find(f => f.id === l.favorecido_id)?.nome || '';
    const valor = l.sinal >= 0 ? l.valor : -l.valor;
    const doc = formatDocumento((l as any).tipo_documento, l.numero_documento);
    return {
      comp: fmtDate(l.data_competencia),
      // PR-FIN-GRADE-DATAS-03 — VENC. e PGTO. exportadas como colunas independentes (cada uma a sua coluna
      //   real; nunca fundidas; nunca a data financeira derivada). fmtDate(null) → '' (padrão do formato).
      venc: fmtDate(l.data_vencimento),
      pgto: fmtDate(l.data_pagamento),
      produto: l.descricao || '',
      fornecedor: forn,
      valor,
      valorFmt: formatMoeda(Math.abs(l.valor)),
      documento: doc,
      status: l.status_transacao || '',
      macro: l.macro_custo || '',
      centro: l.centro_custo || '',
      subcentro: l.subcentro || '',
      sinal: l.sinal,
      /* ⚠ AUSÊNCIA É VAZIO, NUNCA "-": numa planilha o traço é um VALOR — ele entra no
         filtro do Excel como uma opção a mais e quebra a soma de quem seleciona a coluna.
         Célula vazia é o que o Excel entende como "não tem". */
      tipo: semPrefixo(l.tipo_operacao),
      tipoDocumento: (l as any).tipo_documento || '',
      numeroDocumento: l.numero_documento || '',
      atividade: ATIVIDADE_LABEL[normalizarAtividade(l.escopo_negocio)] ?? '',
      safra: nomeDe(cadastros.safras, l.safra_id),
      fazenda: nomeDe(cadastros.fazendas, l.fazenda_id),
      /* ⚠ A CONTA DEPENDE DO TIPO DA LINHA, e ler `conta_bancaria_id` direto deixava TODA
         entrada sem conta: a convenção do repo guarda em `conta_destino_id` a conta que
         RECEBEU. A regra mora em `contaPayload`, ao lado da de escrita — aqui só se
         traduzem os ids em nomes. */
      contaBancaria: nomeDaConta(
        contasExibidasDoLancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id),
        cadastros.contas,
      ),
    };
  });
}

function exportExcel(
  lancamentos: LancamentoV2[], fornecedores: FornecedorMap[], ano: string,
  dimensao: DimensaoDataFinanceiro, fazendaNome?: string,
  cadastros: { fazendas?: readonly NomePorId[]; contas?: readonly NomePorId[]; safras?: readonly NomePorId[] } = {},
) {
  const rows = buildRows(lancamentos, fornecedores, cadastros);
  /* ⚠ AS COLUNAS SAÍRAM DE 11 PARA 17 — PR-EXPORT-FINANCEIRO-01. O que faltava não era
     enfeite: sem Safra, Fazenda e Conta o cliente não fecha custo de lavoura com o parceiro,
     e a planilha voltava para a tela para ser completada à mão.
     ⚠ E "Documento" VIROU DUAS. Ela era `formatDocumento(tipo, numero)` — "NF 1234" numa
     célula só —, o que impede filtrar por tipo e ordenar por número no Excel. Agora são o
     tipo e o número crus, cada um na sua coluna; quem quiser a forma composta a monta com
     uma fórmula, o que o caminho inverso não permitia. */
  const data = rows.map(r => ({
    // PR-FIN-GRADE-DATAS-03 — Comp. | Venc. | Pgto. em colunas separadas.
    'Comp.': r.comp,
    'Venc.': r.venc,
    'Pgto.': r.pgto,
    'Descrição': r.produto,
    'Fornecedor': r.fornecedor,
    /* ⚠ MÓDULO, e a direção fica na coluna "Tipo". O sinal negativo em toda saída fazia a
       soma da coluna dar a diferença entre entradas e saídas em vez do total gasto — e quem
       abre a planilha para fechar custo quer o total. Aplicado SÓ aqui: o `buildRows`
       continua devolvendo o valor com sinal, que é o que o PDF usa. */
    'Valor': Math.abs(r.valor),
    'Tipo': r.tipo,
    'Tipo de documento': r.tipoDocumento,
    'Número documento': r.numeroDocumento,
    'Status': r.status,
    'Atividade': r.atividade,
    'Safra': r.safra,
    'Fazenda': r.fazenda,
    'Conta bancária': r.contaBancaria,
    'Macro': r.macro,
    'Centro': r.centro,
    'Subcentro': r.subcentro,
  }));

  const faz = fazendaNome ? `_${fazendaNome.replace(/\s+/g, '_')}` : '';
  triggerXlsxDownload({
    filename: `financeiro_v2_${ano}${faz}.xlsx`,
    sheets: [
      {
        name: 'Lançamentos',
        rows: data,
        cols: [
          { wch: 12 }, { wch: 12 }, { wch: 12 },   // Comp. · Venc. · Pgto.
          { wch: 30 }, { wch: 25 }, { wch: 14 },   // Descrição · Fornecedor · Valor
          { wch: 16 }, { wch: 18 }, { wch: 18 },   // Tipo · Tipo de documento · Número documento
          { wch: 12 }, { wch: 14 }, { wch: 16 },   // Status · Atividade · Safra
          { wch: 22 }, { wch: 24 },                // Fazenda · Conta bancária
          { wch: 20 }, { wch: 18 }, { wch: 18 },   // Macro · Centro · Subcentro
        ],
      },
      // PR-FIN-GRADE-DATAS-03 — aba de metadado simples identificando a dimensão temporal do recorte.
      {
        name: 'Filtro',
        mode: 'aoa',
        rows: [
          ['Data por', DIMENSAO_LABEL[dimensao]],
          ['Ano', ano],
        ],
        cols: [{ wch: 12 }, { wch: 18 }],
      },
    ],
  });
}

// Resumo de status (client-side, só sobre os lancamentos recebidos). Ordena os oficiais e agrega os demais.
function contarStatus(lancamentos: LancamentoV2[]): { label: string; valor: string }[] {
  const cont = new Map<string, number>();
  for (const l of lancamentos) {
    const s = (l.status_transacao || '—').toLowerCase();
    cont.set(s, (cont.get(s) ?? 0) + 1);
  }
  const ordem = ['realizado', 'programado', 'agendado', 'previsto'];
  const cards: { label: string; valor: string }[] = [];
  for (const s of ordem) {
    if (cont.has(s)) { cards.push({ label: STATUS_FILTRO_LABEL[s] ?? s, valor: String(cont.get(s)) }); cont.delete(s); }
  }
  for (const [s, n] of cont) cards.push({ label: STATUS_FILTRO_LABEL[s] ?? s, valor: String(n) });
  return cards;
}

// PR-FIN-V2-EXPORT-LAYOUT-01 — PDF migrado para o chassi AGROinBLUE "Versão PDF v2" (pdfChassi).
//   Async por causa do logo (carregarLogoBase64). Sem novo dado de banco; só o que o export já recebe.
async function exportPDF(lancamentos: LancamentoV2[], fornecedores: FornecedorMap[], ano: string, dimensao: DimensaoDataFinanceiro, fazendaNome?: string) {
  const rows = buildRows(lancamentos, fornecedores);
  const totalEnt = rows.filter(r => r.sinal > 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  const totalSai = rows.filter(r => r.sinal < 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  const resultado = totalEnt - totalSai;

  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }

  const doc = criarDocRetratoA4();
  let y = addHeader(doc, {
    titulo: 'Financeiro',
    subtitulo: `${fazendaNome ? fazendaNome + ' · ' : ''}Ano ${ano} · Data por: ${DIMENSAO_LABEL[dimensao]}`,
    infoLinha: `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')} · ${lancamentos.length} lançamento${lancamentos.length !== 1 ? 's' : ''}`,
    logoData,
  });

  // Resumo Executivo — cards financeiros + resumo por status (tudo client-side).
  y = addTituloSecao(doc, 'Resumo Executivo', y);
  y = addCardsKPI(doc, [
    { label: 'Entradas', valor: formatMoeda(totalEnt) },
    { label: 'Saídas', valor: formatMoeda(totalSai) },
    { label: 'Resultado do período', valor: formatMoeda(resultado) },
    { label: 'Lançamentos', valor: String(lancamentos.length) },
  ], y, { colunas: 4 });
  const statusCards = contarStatus(lancamentos);
  if (statusCards.length > 0) y = addCardsKPI(doc, statusCards, y, { colunas: 4 });

  // Tabela padrão v2 (header azul, zebra, linha TOTAL).
  const head = [['Comp.', 'Venc.', 'Pgto.', 'Produto', 'Fornecedor', 'Valor', 'Documento', 'Status']];
  const body = rows.map(r => [
    r.comp, r.venc, r.pgto, r.produto, r.fornecedor,
    formatMoeda(r.sinal >= 0 ? Math.abs(r.valor) : -Math.abs(r.valor)),
    r.documento, r.status,
  ]);
  const foot = [['', '', '', '', 'TOTAL', formatMoeda(resultado), '', '']];
  addTabelaExecutiva(doc, {
    head, body, startY: y,
    opts: { foot, totalVerde: resultado >= 0, columnStyles: { 5: { halign: 'right' } } },
  });

  addFooterComPaginacao(doc);
  const faz = fazendaNome ? `_${fazendaNome.replace(/\s+/g, '_')}` : '';
  doc.save(`financeiro_v2_${ano}${faz}.pdf`);
}

export function FinanceiroV2ExportMenu({ carregarConjunto, fornecedores, ano, fazendaNome, totalCount, dimensao, fazendas, contas, safras }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (totalCount === 0) return null;

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      // Busca o conjunto INTEIRO do filtro. Se falhar — inclusive por exceder o
      // teto de leitura —, nenhum arquivo e gerado: melhor exportacao que falha
      // do que arquivo parcial entregue como completo.
      const lancamentos = await carregarConjunto();
      if (lancamentos.length === 0) {
        toast.info('Nenhum lançamento no filtro atual.');
        return;
      }
      if (type === 'excel') {
        exportExcel(lancamentos, fornecedores, ano, dimensao, fazendaNome, { fazendas, contas, safras });
        toast.success(`Excel exportado! (${lancamentos.length} lançamentos)`);
      } else {
        await exportPDF(lancamentos, fornecedores, ano, dimensao, fazendaNome);
        toast.success(`PDF exportado! (${lancamentos.length} lançamentos)`);
      }
    } catch (e) {
      // `ErroConjuntoIncompleto` traz mensagem acionavel (estreite o filtro);
      // o resto cai na mensagem generica, sem vazar detalhe interno.
      const msg = e instanceof ErroConjuntoIncompleto
        ? e.message
        : normalizarErro(e, 'exportarLista').mensagem;
      toast.error(msg);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-0.5 px-2" disabled={exporting}>
          {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Exportar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="end">
        <p className="text-[9px] text-muted-foreground px-2 py-0.5">{totalCount} lançamentos</p>
        <Button variant="ghost" className="w-full justify-start gap-2 h-7 text-[10px]" onClick={() => handleExport('excel')} disabled={exporting}>
          <FileSpreadsheet className="h-3.5 w-3.5 text-primary" /> Excel
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 h-7 text-[10px]" onClick={() => handleExport('pdf')} disabled={exporting}>
          <FileText className="h-3.5 w-3.5 text-destructive" /> PDF
        </Button>
      </PopoverContent>
    </Popover>
  );
}
