/**
 * NOTA-PAGTO-PARCELADO-01 — a ligação na prévia da nota (lida da fonte; as regras têm os testes delas): P2 a opção "Parcelado" usa a MESMA
 * grade do cartão com a forma escolhida; P3 o "não é compra" em destaque (selo vermelho no bloco Nota e a frase no rodapé); P1 os escolhidos
 * entram nos achados antes do casamento com as parcelas da nota.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fonte = readFileSync(resolve(__dirname, './NotaFiscalDialog.tsx'), 'utf8');

describe('NOTA-PAGTO-PARCELADO-01 — a prévia da nota', () => {
  it('P2: "Parcelado (boleto, PIX, transf., débito)" no "Como foi pago?"; a grade é a do cartão; a forma é obrigatória e vai para a proposta', () => {
    expect(fonte).toContain('<SelectItem value="parcelado" data-testid="nota-como-parcelado">Parcelado (boleto, PIX, transf., débito)</SelectItem>');
    expect(fonte).toContain('const emGrade = pagaEmGrade(como);');
    expect(fonte).toContain('comPagamento(doXmlLido, como, emGrade ? parcelasEscolhidas : [], formaDoParcelado)');
    expect(fonte).toContain("if (como === 'parcelado' && !formaDoParcelado) faltas.push('forma de pagamento');");
    expect(fonte).toContain('{FORMAS_DO_PARCELADO.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}');
  });
  it('P3: o aviso da natureza vem de UM lugar (avisoDaNatureza); "não é compra" = selo vermelho + a frase no rodapé', () => {
    expect(fonte).toContain('const avisoNatureza = avisoDaNatureza(n);');
    expect(fonte).toContain("{semCompra ? 'não é compra' : 'remessa'}");
    expect(fonte).toContain('data-testid="nota-sem-compra-rodape">⚠ {remessa}</span>');
    expect(fonte).not.toContain('fraseDaRemessa(n)');
  });
  it('P1: os escolhidos entram nos achados (comEscolhidos) antes de casarJaLancados; o botão mora na aba Parcelas × sistema', () => {
    expect(fonte).toContain('casarJaLancados(parcelasDaBusca, comEscolhidos(achados, escolhidos), n.totais.notaCent)');
    expect(fonte).toContain('data-testid="nota-outros-abrir"');
    expect(fonte).toContain("if (nF === null && escolhidos.length > 0) return { texto: 'não é criada: os lançamentos escolhidos pagam a nota'");
  });
});
