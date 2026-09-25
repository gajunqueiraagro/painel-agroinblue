/**
 * OC-BOITEL-VALOR-01 A3 — o valor da venda boitel tem UMA fonte: o slot do lote.
 *
 * ⚠ NASCE DE UMA HOMOLOGACAO QUE "FALHOU" E NAO TINHA FALHADO (8b211cae, 25/09/2026): o resumo e o
 * LoteDialog diziam 882.608,62 — calculados da linha realizada — enquanto lote, `valor_acordado`,
 * rebanho, Documentos e Gerar compromissos diziam 848.713,32, que era o que estava GRAVADO. As
 * telas certas pareciam o erro, e a errada escondia que o Realizado nunca tinha sido reaplicado.
 * ⚠ OS NUMEROS SAO OS DO CASO: slot 848.713,32; a linha realizada da' 1.379.192,62 de abate menos
 * 18 x 132 x 209 de diarias = 882.608,62, o `acerto_papel` gravado.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  valorDaVendaBoitel, principalDaPrevisaoBoitel, valorDoLoteBoitel, avisoAcertoDivergente,
  type BoitelEdicao,
} from '@/components/venda/BoitelNegociacaoDerivado';
import { boitelVazio } from '@/components/venda/BoitelBlocosModais';
import { LoteDialog } from '@/components/compra/AbaNegociacaoLotes';
import { AbaDocumentosOC } from '@/components/compra/AbaDocumentosOC';
import { DialogoGerarCompromissos } from '@/components/compra/DialogoGerarCompromissos';
import { classificarLotesPorLado, type LoteOC } from '@/hooks/useOperacaoLiquidacao';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';

const SLOT = 848713.32;
const ACERTO = 882608.62;
const LOTE_ID = 'edfb7a87-cbe3-489b-86cb-ec19ca647e95';

/* A linha realizada da 8b211cae, com os campos que as exigencias do motor pedem. */
const REALIZADO: BoitelEdicao = {
  ...boitelVazio(),
  qtdCabecas: 210, pesoInicial: 332.52, dias: 132, gmd: 1.1,
  rendimentoEntrada: 50, rendimento: 55, precoVendaArroba: 339.24, custoDiaria: 18,
  morteQuantidade: 1, qtdAbatida: 209, valorTotalAbate: 1379192.62,
};
/* O projetado: mesma base, sem os dois fatos do papel. */
const PROJETADO: BoitelEdicao = { ...REALIZADO, qtdAbatida: undefined, valorTotalAbate: undefined, precoVendaArroba: 330 };

describe('valorDaVendaBoitel — o valor e o slot, o acerto e conferencia', () => {
  it('8b211cae: mostra o SLOT e acusa a divergencia com o acerto', () => {
    const v = valorDaVendaBoitel({ slot: SLOT, realizado: REALIZADO, projetado: PROJETADO });
    expect(v.valor).toBe(SLOT);
    expect(v.acerto).toBe(ACERTO);
    expect(v.realizadoAplicado).toBe(true);
    expect(v.divergente).toBe(true);
  });

  it('slot = acerto: sem divergencia, e um centavo de arredondamento tambem nao e divergencia', () => {
    expect(valorDaVendaBoitel({ slot: ACERTO, realizado: REALIZADO, projetado: PROJETADO }).divergente).toBe(false);
    expect(valorDaVendaBoitel({ slot: ACERTO + 0.01, realizado: REALIZADO, projetado: PROJETADO }).divergente).toBe(false);
    /* ⚠ E DOIS CENTAVOS JA E': sem este lado, uma tolerancia que engolisse tudo passaria verde. */
    expect(valorDaVendaBoitel({ slot: ACERTO + 0.02, realizado: REALIZADO, projetado: PROJETADO }).divergente).toBe(true);
  });

  it('sem realizado aplicado nao ha acerto a conferir — o slot e a projecao gravada', () => {
    const v = valorDaVendaBoitel({ slot: SLOT, realizado: { ...PROJETADO }, projetado: PROJETADO });
    expect(v.realizadoAplicado).toBe(false);
    expect(v.acerto).toBeNull();
    expect(v.divergente).toBe(false);
    expect(v.valor).toBe(SLOT);
  });

  it('realizado aplicado e slot vazio e divergencia: nao ha o que o acerto confira', () => {
    expect(valorDaVendaBoitel({ slot: null, realizado: REALIZADO, projetado: PROJETADO }).divergente).toBe(true);
  });
});

describe('a previsao principal nasce do slot, ligada ao lote', () => {
  const ok = valorDaVendaBoitel({ slot: ACERTO, realizado: REALIZADO, projetado: PROJETADO });

  it('le o SLOT (nunca a projecao) e leva o lote_id', () => {
    const p = principalDaPrevisaoBoitel(ok, [LOTE_ID]);
    expect(p).toEqual({ valor: ACERTO, loteId: LOTE_ID });
    /* ⚠ A PROJECAO ESTA' LOGO ALI E NAO ENTRA: prova que a linha nao a le. */
    expect(p?.valor).not.toBe(ok.projecao);
  });

  it('divergente: RECUSA — nao ha linha a gerar, e a razao e a frase do acerto', () => {
    const v = valorDaVendaBoitel({ slot: SLOT, realizado: REALIZADO, projetado: PROJETADO });
    expect(principalDaPrevisaoBoitel(v, [LOTE_ID])).toBeNull();
    /* `toLocaleString` poe espaco NAO QUEBRAVEL depois do "R$" — o `\s` da regex o aceita. */
    expect(avisoAcertoDivergente(v.acerto ?? 0)).toMatch(/^Acerto do boitel R\$\s882\.608,62 · reaplique o Realizado$/);
  });

  it('sem realizado, a linha sai com a projecao GRAVADA (o slot), ligada ao lote', () => {
    const v = valorDaVendaBoitel({ slot: SLOT, realizado: null, projetado: PROJETADO });
    expect(principalDaPrevisaoBoitel(v, [LOTE_ID])).toEqual({ valor: SLOT, loteId: LOTE_ID });
  });

  it('dois lotes: a linha nasce solta; slot vazio: nao nasce', () => {
    expect(principalDaPrevisaoBoitel(ok, [LOTE_ID, 'outro'])?.loteId).toBeNull();
    expect(principalDaPrevisaoBoitel(valorDaVendaBoitel({ slot: null, realizado: null, projetado: PROJETADO }), [LOTE_ID])).toBeNull();
  });
});

describe('as telas mostram o slot', () => {
  const lote = {
    idLocal: 'l1', id: LOTE_ID, ordem: 1, categoria: 'garrotes', quantidade: '210', pesoMedioKg: '332,52',
    criterioValor: 'total' as const, valorInformado: '848.713,32', observacao: '',
  };
  const montarLoteDialog = (slot: number) => render(
    <LoteDialog lote={lote} categoriasDisponiveis={[{ value: 'garrotes', label: 'Garrotes' }]}
      fisicoRO somenteLeitura={false} rotuloCategoria={s => s}
      onAplicar={() => {}} onAplicarEAdicionar={() => {}} onFechar={() => {}}
      valorProjetado={valorDoLoteBoitel(valorDaVendaBoitel({ slot, realizado: REALIZADO, projetado: PROJETADO }))} />,
  );

  it('LoteDialog: o valor e o SLOT, e a divergencia vira aviso com os dois numeros', () => {
    montarLoteDialog(SLOT);
    /* O campo Valor e' o bloco travado com a explicacao no `title`; o "Total do lote" repete o
       numero mais abaixo, e por isso a busca e' pelo campo, nao pelo texto. */
    const campo = screen.getByTitle(/Derivado do acerto com o boitel/);
    expect(campo.textContent).toMatch(/848\.713,32/);
    expect(screen.getByText(/^Acerto do boitel R\$\s882\.608,62 · reaplique o Realizado$/)).toBeDefined();
    /* ⚠ O ACERTO NAO APARECE COMO VALOR: so' dentro do aviso. */
    expect(campo.textContent).not.toMatch(/882\.608,62/);
  });

  it('LoteDialog: slot = acerto, sem aviso', () => {
    montarLoteDialog(ACERTO);
    expect(screen.getByTitle(/Derivado do acerto com o boitel/).textContent).toMatch(/882\.608,62/);
    expect(screen.queryByText(/reaplique o Realizado/)).toBeNull();
  });

  it('Documentos: "Negociado" e o valor_acordado que chega por prop (o slot somado)', () => {
    const api: DocumentosApi = {
      documentos: [], lotes: [], loading: false, saving: false,
      registrar: vi.fn(), anexarArquivo: vi.fn(), urlAssinada: vi.fn(), editar: vi.fn(),
      cancelar: vi.fn(), carregarDetalhe: vi.fn(),
    };
    render(<AbaDocumentosOC api={api} operacaoPronta somenteLeitura valorNegociado={SLOT} />);
    expect(screen.getByText('Negociado').nextElementSibling?.textContent).toContain('848.713,32');
  });

  it('Gerar compromissos: a proposta sai do lote gravado e o "Acordado (NF)" do valor_acordado', () => {
    const lotesOC: LoteOC[] = [{
      id: LOTE_ID, categoria: 'garrotes', qtd: 210, pesoMedioKg: 332.52, criterio: 'total',
      valorInformado: SLOT, valorLiquidoAbate: null,
    }];
    const c = classificarLotesPorLado(lotesOC, 'venda', true);
    expect(c.status).toBe('ok');
    const itens = c.status === 'ok' ? c.itens : [];
    render(
      <DialogoGerarCompromissos tipoOperacao="venda" valorAcordado={SLOT} contraparteNome={null} dataOperacao={null}
        saving={false} contas={[]} onGerar={async () => {}} onFechar={() => {}}
        propostas={itens.map(i => ({
          chave: `principal:${i.lote.id}`, natureza: 'principal' as const, descricao: 'Venda 210 G',
          caminho: i.subcentro, subcentro: i.subcentro, valor: i.valorBruto, loteId: i.lote.id, componente: 'principal',
        }))} />,
    );
    expect(screen.getByText('Total proposto').nextElementSibling?.textContent).toContain('848.713,32');
    expect(screen.getByText('Acordado (NF)').nextElementSibling?.textContent).toContain('848.713,32');
  });
});
