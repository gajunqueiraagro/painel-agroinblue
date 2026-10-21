/**
 * FIN-V2-COLUNAS-OC-01 — a lista de Lançamentos Financeiros: o ícone da OC em coluna própria antes do Produto, e as larguras
 * remedidas. A tabela não se monta em teste (o hook da lista é a tela inteira): o contrato é lido da FONTE; as medidas
 * renderizadas (larguras, fontes, altura da linha) vão no relatório.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

const colgroup = tela.slice(tela.indexOf('<colgroup>'), tela.indexOf('</colgroup>'));
/** FIN-V2-COLUNAS-02 — as larguras do colgroup num modo: 'normal', 'amp' (Ampliado com as contas) e 'ampSem' (Ampliado com o chip
    das contas desligado). `modoIntensivo ? (contasAmpliado ? A : B) : C`, `modoIntensivo ? A : C` e `{modoIntensivo && contasAmpliado && <col …/>}`. */
type Modo = 'normal' | 'amp' | 'ampSem';
function larguras(modo: Modo): number[] {
  const out: number[] = [];
  const re = /(\{modoIntensivo && contasAmpliado && )?<col style=\{\{ width: (?:modoIntensivo \? \(contasAmpliado \? (\d+) : (\d+)\) : (\d+)|modoIntensivo \? (\d+) : (\d+)|(\d+)) \}\} \/>/g;
  for (const m of colgroup.matchAll(re)) {
    if (m[1] && modo !== 'amp') continue;
    if (m[2]) out.push(Number(modo === 'normal' ? m[4] : modo === 'amp' ? m[2] : m[3]));
    else if (m[5]) out.push(Number(modo === 'normal' ? m[6] : m[5]));
    else out.push(Number(m[7]));
  }
  return out;
}
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe('a coluna Vínc. (FIN-V2-COLUNAS-02; era "OC")', () => {
  const linha = tela.slice(tela.indexOf('<tr key={l.id}'), tela.indexOf('<MenuDaLinhaSobDemanda', tela.indexOf('<tr key={l.id}')));
  const celulaProduto = linha.slice(linha.indexOf('title={isParcelaFinanciamento ? `Parcela de financiamento'), linha.indexOf('title={fornNome || \'\'}'));
  const celulaVinc = linha.slice(linha.indexOf('data-testid="celula-oc"'), linha.indexOf('title={isParcelaFinanciamento ? `Parcela de financiamento'));
  it('a busca sabe achar: a célula do Produto e a dos vínculos foram recortadas da linha', () => {
    expect(celulaProduto).toContain('{descExibida || \'-\'}');
    expect(celulaProduto).toContain('Gerado a partir de lançamento zootécnico');   // o ícone do zootécnico (não é vínculo) fica
    expect(celulaVinc.length).toBeGreaterThan(200);
  });
  it('os vínculos NÃO estão no Produto: moram na coluna própria, pelo dono, uma vez só; o 🏦 saiu (o selo F diz)', () => {
    for (const x of ['icone-oc', 'marca-oc', 'lancamentosComOC', 'CelulaVinculos', '🏦']) expect(celulaProduto, x).not.toContain(x);
    expect(celulaVinc).toContain('<CelulaVinculos vinculos={vinculos} abrir={{');
    expect(celulaVinc).toContain('const vinculos = vinculosDaLinha({');
    expect(celulaVinc).toContain('O: oc && podeAbrirOC ? () => abrirOCFinanceiro(oc.operacaoId, oc.tipo) : undefined,');
    expect(tela.match(/<CelulaVinculos /g)?.length).toBe(1);
    expect(linha).not.toContain('🏦');
  });
  it('vem depois das congeladas e NÃO é sticky; a cadeia é 0/28/68/108', () => {
    expect(linha.indexOf('data-testid="celula-oc"')).toBeGreaterThan(linha.indexOf('sticky left-[108px]'));
    expect(/<td className="[^"]*sticky[^"]*" data-testid="celula-oc"/.test(linha)).toBe(false);
    for (const left of ['left-0', 'left-[28px]', 'left-[68px]', 'left-[108px]']) expect(linha, left).toContain(`sticky ${left}`);
    for (const velho of ['left-[42px]', 'left-[82px]', 'left-[122px]']) expect(tela, velho).not.toContain(`sticky ${velho}`);
    expect(tela.match(/sticky left-\[(28|68|108)px\]/g)?.length).toBe(6);
    expect(larguras('normal').slice(0, 4)).toEqual([28, 40, 40, 40]);
    expect(tela).toContain('>Vínc.</th>');
  });
});

describe('as larguras (FIN-V2-COLUNAS-02)', () => {
  it('normal: Vínc 36 · Produto 128 · Fornecedor 122 · Classificação 124 · Faz 30 · Safra 50 · Valor 88 · Doc 78 · Status 60 = 906', () => {
    const n = larguras('normal');
    expect(n).toEqual([28, 40, 40, 40, 36, 128, 122, 124, 30, 50, 88, 14, 78, 60, 28]);
    expect(soma(n)).toBe(906);
  });
  it('Ampliado com e sem as contas: a mesma soma (1.088); desligadas, os 184px vão para Produto, Fornecedor e Classificação', () => {
    const a = larguras('amp'); const s = larguras('ampSem');
    expect(a).toEqual([28, 40, 40, 40, 36, 140, 116, 116, 30, 50, 92, 92, 88, 14, 78, 60, 28]);
    expect(s).toEqual([28, 40, 40, 40, 36, 202, 177, 177, 30, 50, 88, 14, 78, 60, 28]);
    expect(soma(a)).toBe(1088); expect(soma(s)).toBe(1088);
    expect((s[5] - a[5]) + (s[6] - a[6]) + (s[7] - a[7])).toBe(92 + 92);
    expect(tela).toContain('<td colSpan={modoIntensivo && contasAmpliado ? 17 : 15}');
  });
  it('as contas do Ampliado obedecem ao chip, no colgroup, no cabeçalho e na linha', () => {
    expect(colgroup.match(/\{modoIntensivo && contasAmpliado && <col style=\{\{ width: 92 \}\} \/>\}/g)?.length).toBe(2);
    expect(tela.match(/\{modoIntensivo && contasAmpliado && \(/g)?.length).toBe(4);
    expect(tela).not.toMatch(/\{modoIntensivo && \(\s*<t[hd]/);
  });
});

describe('as fontes — exceção ao piso só nesta lista, por classe da tabela (o dono do status não muda)', () => {
  it('Status a 8px e a Classificação a 8,5px no index.css; as células levam a classe', () => {
    expect(css).toMatch(/\.table-financeiro td\.celula-status,\s*\.table-financeiro td\.celula-status \* \{\s*font-size: 8px !important;/);
    expect(css).toMatch(/\.table-financeiro td\.celula-classe,\s*\.table-financeiro td\.celula-classe \* \{\s*font-size: 8\.5px !important;/);
    expect(tela.match(/<td className="celula-classe truncate /g)?.length).toBe(1);   // FIN-V2-COLUNAS-02: uma coluna, a Classificação
    expect(tela).toContain('<td className="celula-status px-0.5 py-1 text-center align-middle leading-tight"');
    /* forma e cor continuam do dono */
    expect(tela).toContain('<span className={cn(STATUS_PILULA_BASE, stPilula)} data-status={stKey}>{stLabel}</span>');
  });
  it('o status legado que não cabe corta numa linha, com o rótulo no `title`', () => {
    expect(tela).toContain("<span className={cn('block truncate pr-0.5', stColor, stEstagio && 'font-semibold')} data-status={stKey}>{stLabel}</span>");
    /* PARC-LIVRES-01 passo 3 — o `title` do Status passou a levar também a ORIGEM (que saiu da coluna): o rótulo do legado continua nele */
    expect(tela).toContain("title={[stTitle ?? (stPilula || stEstagio ? null : stLabel), icone ? `origem: ${icone.significado}` : null].filter(Boolean).join(' · ') || undefined}");
  });
});

/* ── PARC-LIVRES-01 passo 3 — o clipe no lugar do marcador de origem, e a coluna Doc. pela função única ───────────────────── */
describe('passo 3 — clipe, Doc. e origem (lidos da fonte da lista)', () => {
  it('a coluna de 14px é a do CLIPE, ENTRE VALOR E DOC. (item 6), no cabeçalho, na linha e no colgroup — também no Ampliado', () => {
    const linha = tela.slice(tela.indexOf('<tr key={l.id}'), tela.indexOf('<DropdownMenuTrigger asChild>', tela.indexOf('<tr key={l.id}')));
    const ordem = (trecho: string, ...marcas: string[]) => marcas.map(m => trecho.indexOf(m));
    const [valor, clipe, docu] = ordem(linha, 'celula-valor', 'data-testid="celula-clipe"', 'data-testid="celula-doc"');
    expect(valor).toBeGreaterThan(-1);
    expect(clipe).toBeGreaterThan(valor);
    expect(docu).toBeGreaterThan(clipe);
    expect(linha.slice(clipe, docu).match(/<td/g)?.length).toBe(1);   // só o `<td` do próprio Doc.: nada entre os dois
    expect(linha.slice(valor, clipe).match(/<td/g)?.length).toBe(1);  // e só o do clipe depois do Valor
    expect(/<td className="[^"]*sticky[^"]*" data-testid="celula-clipe"/.test(linha)).toBe(false);
    const [thValor, thClipe, thDoc] = ordem(tela, "toggleSort('valor')}", 'aria-label="Documentos" title="Documentos"', "toggleSort('doc')}");
    expect(thClipe).toBeGreaterThan(thValor);
    expect(thDoc).toBeGreaterThan(thClipe);
    for (const modo of ['normal', 'amp', 'ampSem'] as const) {
      const n = larguras(modo);
      expect(n.slice(-5)).toEqual([88, 14, 78, 60, 28]);               // FIN-V2-COLUNAS-02: Valor 88, clipe 14, Doc 78, Status 60
      expect(n[1]).toBe(40);
    }
  });
  it('o clipe acende por `doc.clipe`, com o que tem no `title`', () => {
    expect(tela).toContain('aria-label="Documentos" title="Documentos"');
    expect(tela).not.toContain('aria-label="Origem"');
    expect(tela).toContain('{doc.clipe && (');
    expect(tela).toContain('<span title={doc.resumo} aria-label={`Documentos: ${doc.resumo}`} data-testid="clipe-da-linha"');
  });
  it('a coluna Doc. escreve o texto do DONO (`docDaLinha`), nunca o número cru; a legenda dos ícones saiu', () => {
    expect(tela).toContain('const doc = docDaLinha(lancamentoParaDoc(l), documentosPorLancamento?.get(l.id));');
    expect(tela).toContain("{doc.rotulo || '-'}</td>");
    expect(tela).not.toContain('{formatNF(l)}</td>');
    expect(tela).not.toContain('LEGENDA_ICONES');
  });
  it('PARC-CONTRATO-01 item 4 — o `title` da célula Doc. é o do DONO (`doc.titulo`: no genérico, "Documento N"), nunca montado na tela', () => {
    expect(tela).toContain('title={doc.titulo || undefined}>{doc.rotulo ||');
    expect(tela).not.toContain('· nota da compra`');
  });
  it('item 4 — a CPR (e por ela o PDF e o Excel) escreve o Doc pelo MESMO dono, não pelo `documento_formatado` da view', () => {
    const cpr = readFileSync(resolve(__dirname, 'ContasPagarReceberTab.tsx'), 'utf8');
    expect(cpr).toContain('doc: (l) => docDaLinha({ tipo_documento: l.tipo_documento, numero_documento: l.numero_documento }, null).rotulo,');
    expect(cpr).toContain('const doc = docDaLinha({ tipo_documento: l.tipo_documento, numero_documento: l.numero_documento }, null).rotulo;');
    expect(cpr).not.toContain('l.documento_formatado');
  });
  it('a origem não sumiu: está no `title` do Status, e o clique no Status abre o minimodal do vínculo', () => {
    expect(tela).toContain('icone ? `origem: ${icone.significado}` : null');
    expect(tela).toContain('<button type="button" className="block w-full cursor-pointer" aria-label={`${stLabel} · origem: ${icone.significado}`}>{rotulo}</button>');
    expect(tela).toContain('if (!icone) return rotulo;');
  });
  it('passo 5 — parcela de parcelamento: o nome corta e o "i/N" do CONTRATO fica numa parte que não corta; a tela não monta o texto', () => {
    expect(tela).toContain('const np = nomeEParcela(descExibida, parcelasDosLancamentos?.get(l.id));');
    expect(tela).toContain('<span className="shrink-0 whitespace-nowrap tabular-nums" data-testid="parcela-i-n">{np.parcela}</span>');
    expect(tela).toContain('<span className="min-w-0 truncate pr-0.5">');
    /* nenhuma descrição de parcela montada na tela: nem "Parcela ${", nem "/${" colado a um total */
    expect(tela).not.toMatch(/Parcela \$\{/);
    /* a busca sabe achar: o padrão proibido existe no painel legado de compra */
    expect(readFileSync(resolve(__dirname, '../CompraFinanceiroPanel.tsx'), 'utf8')).toMatch(/Parcela \$\{/);
  });
});
