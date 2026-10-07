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
/** As larguras do colgroup num modo: `modoIntensivo ? A : B` resolve pelo modo; `{modoIntensivo && <col …/>}` só existe no Ampliado. */
function larguras(ampliado: boolean): number[] {
  const out: number[] = [];
  for (const m of colgroup.matchAll(/(\{modoIntensivo && )?<col style=\{\{ width: (?:modoIntensivo \? (\d+) : (\d+)|(\d+)) \}\} \/>/g)) {
    if (m[1] && !ampliado) continue;
    out.push(Number(m[4] ?? (ampliado ? m[2] : m[3])));
  }
  return out;
}
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe('a coluna OC', () => {
  const linha = tela.slice(tela.indexOf('<tr key={l.id}'), tela.indexOf('<DropdownMenuTrigger asChild>', tela.indexOf('<tr key={l.id}')));
  const celulaProduto = linha.slice(linha.indexOf('title={isParcelaFinanciamento ? `Parcela de financiamento'), linha.indexOf('title={fornNome || \'\'}'));
  const celulaOC = linha.slice(linha.indexOf('data-testid="celula-oc"'), linha.indexOf('title={isParcelaFinanciamento ? `Parcela de financiamento'));
  it('a busca sabe achar: a célula do Produto e a da OC foram recortadas da linha', () => {
    expect(celulaProduto).toContain('{descExibida || \'-\'}');
    expect(celulaProduto).toContain('Gerado a partir de lançamento zootécnico');   // o ícone do zootécnico e o 🏦 ficam no Produto
    expect(celulaProduto).toContain('🏦');
    expect(celulaOC.length).toBeGreaterThan(200);
  });
  it('o ícone da OC NÃO está dentro da célula do Produto: mora na coluna própria, uma vez só', () => {
    expect(celulaProduto).not.toContain('icone-oc');
    expect(celulaProduto).not.toContain('marca-oc');
    expect(celulaProduto).not.toContain('lancamentosComOC');
    expect(celulaOC).toContain('data-testid="icone-oc"');
    expect(celulaOC).toContain('data-testid="marca-oc"');
    expect(celulaOC).toContain('onClick={e => { e.stopPropagation(); abrirOCFinanceiro(oc.operacaoId, oc.tipo); }}');
    expect(celulaOC).toContain('if (!podeAbrirOC) return (');
    expect(tela.match(/data-testid="icone-oc"/g)?.length).toBe(1);
    expect(tela.match(/data-testid="marca-oc"/g)?.length).toBe(1);
  });
  it('vem depois das cinco congeladas e NÃO é sticky; a cadeia 0/28/42/82/122 não mudou', () => {
    expect(linha.indexOf('data-testid="celula-oc"')).toBeGreaterThan(linha.indexOf('sticky left-[122px]'));
    expect(/<td className="[^"]*sticky[^"]*" data-testid="celula-oc"/.test(linha)).toBe(false);
    for (const left of ['left-0', 'left-[28px]', 'left-[42px]', 'left-[82px]', 'left-[122px]']) expect(linha, left).toContain(`sticky ${left}`);
    expect(larguras(false).slice(0, 5)).toEqual([28, 14, 40, 40, 40]);      // 0 → 28 → 42 → 82 → 122
    expect(tela).toContain('title="Operação comercial">OC</th>');
  });
});

describe('as larguras', () => {
  it('a soma do colgroup normal NÃO passa de 874, com a coluna OC de 16 e o Produto com pelo menos 130', () => {
    const n = larguras(false);
    /* PARC-LIVRES-01 passo 3: Produto 136→130 e Macro/Centro 56→49 devolvem 20px à coluna Doc. (70→90), que passou a escrever o tipo */
    expect(n).toEqual([28, 14, 40, 40, 40, 16, 130, 100, 49, 49, 30, 66, 90, 90, 64, 28]);
    expect(soma(n)).toBe(874);
    expect(soma(n)).toBeLessThanOrEqual(874);
    expect(n[6]).toBeGreaterThanOrEqual(130);
  });
  it('o Ampliado tem as duas contas a mais e o Produto com o mesmo ganho; a linha vazia ocupa todas as colunas nos dois modos', () => {
    const a = larguras(true);
    expect(a.length).toBe(18);
    expect(larguras(false).length).toBe(16);
    expect(a[6] - 125).toBe(larguras(false)[6] - 111);
    expect(tela).toContain('<td colSpan={modoIntensivo ? 18 : 16}');
  });
  it('não cedem: datas 40, Fornecedor 100, Safra 66, Valor 90, Doc. 90, ações 28, check 28, clipe 14', () => {
    const n = larguras(false);
    expect([n[0], n[1], n[2], n[3], n[4], n[7], n[11], n[12], n[13], n[15]]).toEqual([28, 14, 40, 40, 40, 100, 66, 90, 90, 28]);
  });
});

describe('as fontes — exceção ao piso só nesta lista, por classe da tabela (o dono do status não muda)', () => {
  it('Status a 8px e Macro/Centro a 8,5px no index.css; as células levam a classe', () => {
    expect(css).toMatch(/\.table-financeiro td\.celula-status,\s*\.table-financeiro td\.celula-status \* \{\s*font-size: 8px !important;/);
    expect(css).toMatch(/\.table-financeiro td\.celula-classe,\s*\.table-financeiro td\.celula-classe \* \{\s*font-size: 8\.5px !important;/);
    expect(tela.match(/<td className="celula-classe truncate /g)?.length).toBe(2);
    expect(tela).toContain('<td className="celula-status px-0.5 py-1 text-center align-middle leading-tight"');
    /* forma e cor continuam do dono */
    expect(tela).toContain('<span className={cn(STATUS_PILULA_BASE, stPilula)} data-status={stKey}>{stLabel}</span>');
  });
  it('o status legado que não cabe corta numa linha, com o rótulo no `title`', () => {
    expect(tela).toContain("<span className={cn('block truncate', stColor, stEstagio && 'font-semibold')} data-status={stKey}>{stLabel}</span>");
    /* PARC-LIVRES-01 passo 3 — o `title` do Status passou a levar também a ORIGEM (que saiu da coluna): o rótulo do legado continua nele */
    expect(tela).toContain("title={[stTitle ?? (stPilula || stEstagio ? null : stLabel), icone ? `origem: ${icone.significado}` : null].filter(Boolean).join(' · ') || undefined}");
  });
});

/* ── PARC-LIVRES-01 passo 3 — o clipe no lugar do marcador de origem, e a coluna Doc. pela função única ───────────────────── */
describe('passo 3 — clipe, Doc. e origem (lidos da fonte da lista)', () => {
  it('a coluna de 14px é a do CLIPE: aceso por `doc.clipe`, com o que tem no `title`; a cadeia sticky não mudou', () => {
    expect(tela).toContain('aria-label="Documentos" title="Documentos"');
    expect(tela).not.toContain('aria-label="Origem"');
    expect(tela).toContain('{doc.clipe && (');
    expect(tela).toContain('<span title={doc.resumo} aria-label={`Documentos: ${doc.resumo}`} data-testid="clipe-da-linha"');
    expect(larguras(false).slice(0, 5)).toEqual([28, 14, 40, 40, 40]);
  });
  it('a coluna Doc. escreve o texto do DONO (`docDaLinha`), nunca o número cru; a legenda dos ícones saiu', () => {
    expect(tela).toContain('const doc = docDaLinha(lancamentoParaDoc(l), documentosPorLancamento?.get(l.id));');
    expect(tela).toContain("{doc.rotulo || '-'}</td>");
    expect(tela).not.toContain('{formatNF(l)}</td>');
    expect(tela).not.toContain('LEGENDA_ICONES');
  });
  it('a origem não sumiu: está no `title` do Status, e o clique no Status abre o minimodal do vínculo', () => {
    expect(tela).toContain('icone ? `origem: ${icone.significado}` : null');
    expect(tela).toContain('<button type="button" className="block w-full cursor-pointer" aria-label={`${stLabel} · origem: ${icone.significado}`}>{rotulo}</button>');
    expect(tela).toContain('if (!icone) return rotulo;');
  });
});
