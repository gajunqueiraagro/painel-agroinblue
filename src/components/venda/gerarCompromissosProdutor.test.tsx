/**
 * BOITEL-ABATE-PRODUTOR-01c — o "Gerar compromissos" respeita a modalidade B.
 *
 * ⚠ NASCE DA HOMOLOGACAO DE 26/09 (cd4c54b0, RRCC, 169 cab): a OC salva como B abriu o dialogo com UMA linha —
 *   "Venda 169 G · Venda em Boitel · R$ 516.459,04", Pagador "JBS (boitel)" —, o formato da A. O dialogo montava as
 *   linhas pelo LOTE (`classificarLotesPorLado`) e nunca passava por `previsaoBoitel.ts`.
 * ⚠ OS NUMEROS SAO OS DA 77d963be (os mesmos de `previsaoBoitel.test.ts`): abate 965.835,14; diarias + notas no
 *   boitel 308.877,97; liquido 656.957,17.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { propostasBoitelProdutor, linhasPrevisaoBoitel, SUBCENTRO_ACERTO_BOITEL, type EntradaPrevisaoBoitel } from '@/components/venda/previsaoBoitel';
import { boitelVazio } from '@/components/venda/BoitelBlocosModais';
import { valorDaVendaBoitel, type BoitelEdicao } from '@/components/venda/BoitelNegociacaoDerivado';
import { DialogoGerarCompromissos, type PropostaCompromisso } from '@/components/compra/DialogoGerarCompromissos';

const BOITEL = 'boitel-ricardo';
const JBS = 'frigorifico-jbs';
const LOTE = 'b0781eb6-e92c-44ca-aa45-d40fe043e8f1';
const LIQUIDO = 656957.17;

const PROJETADO: BoitelEdicao = {
  ...boitelVazio(),
  qtdCabecas: 193, pesoInicial: 393.97, dias: 110, gmd: 1.5, rendimentoEntrada: 50, rendimento: 55,
  custoDiaria: 15.11, precoVendaArroba: 240,
};
const REALIZADO: BoitelEdicao = {
  ...PROJETADO, dias: 105, qtdAbatida: 193, pesoVivoTotalAbate: 106150, arrobasTotaisAbate: 3892.81,
  valorTotalAbate: 965835.14, valorTotalDiarias: 306102.83, custoNotasEnvio: 2775.14, notasEnvioNoBoitel: true,
  dataAbate: '2023-10-18',
};

function entrada(quem: 'boitel' | 'produtor', slot: number): EntradaPrevisaoBoitel {
  const projetado = { ...PROJETADO, quemAbate: quem, frigorificoId: JBS };
  const realizado = { ...REALIZADO, quemAbate: quem, frigorificoId: JBS };
  return {
    boitelData: projetado, boitelRealSalvo: realizado, compradorId: BOITEL, data: '2023-07-05',
    lotes: [{ id: LOTE, categoria: 'garrotes', quantidade: '193' }],
    vendaBoitel: valorDaVendaBoitel({ slot, realizado, projetado }),
  };
}

const NOMES: Record<string, string> = { [BOITEL]: 'Ricardo Goulart', [JBS]: 'JBS - Unid 02' };
/* O que a aba faz antes de abrir o dialogo: o nome do favorecido pela MESMA lista do resto da aba. */
const comNomes = (ps: PropostaCompromisso[]) => ps.map(p => ({ ...p, favorecidoNome: NOMES[p.favorecidoId ?? ''] ?? null }));

function abrir(propostas: PropostaCompromisso[], valorAcordado: number, extra: { bloqueio?: string | null; onGerar?: (linhas: PropostaCompromisso[]) => Promise<void> } = {}) {
  return render(
    <DialogoGerarCompromissos tipoOperacao="venda" propostas={propostas} valorAcordado={valorAcordado}
      contraparteNome="JBS (boitel)" dataOperacao="2023-07-05" saving={false} contas={[]}
      onGerar={extra.onGerar ?? (async () => {})} onFechar={() => {}} bloqueio={extra.bloqueio ?? null} />,
  );
}

describe('propostasBoitelProdutor — a MESMA fonte do "Gerar previsao"', () => {
  it('B: acerto (saida, 1155, boitel) ANTES do recebimento (entrada, 1150, frigorifico), com os numeros do motor', () => {
    const ps = propostasBoitelProdutor(entrada('produtor', LIQUIDO)) ?? [];
    expect(ps.map(p => [p.componente, p.sentido, p.subcentro, p.favorecidoId, p.valor])).toEqual([
      ['acerto_boitel', 'saida', SUBCENTRO_ACERTO_BOITEL, BOITEL, 308877.97],
      ['principal', 'entrada', 'Venda em Boitel', JBS, 965835.14],
    ]);
    expect(ps[1].loteId).toBe(LOTE);
    /* nenhuma segunda montagem: cada proposta E' uma linha da previsao, com os mesmos valor, subcentro e favorecido */
    const linhas = linhasPrevisaoBoitel(entrada('produtor', LIQUIDO)) ?? [];
    for (const p of ps) {
      const l = linhas.find(x => x.componente === p.componente);
      expect([l?.valor, l?.subcentro, l?.favorecidoId, l?.descricao]).toEqual([p.valor, p.subcentro, p.favorecidoId, p.descricao]);
    }
  });

  it('A: undefined — o dialogo segue na proposta por lote de sempre', () => {
    expect(propostasBoitelProdutor(entrada('boitel', LIQUIDO))).toBeUndefined();
    expect(propostasBoitelProdutor({ ...entrada('produtor', LIQUIDO), boitelData: null })).toBeUndefined();
  });
});

describe('dialogo na B — sentido e favorecido por linha, confronto pelo liquido', () => {
  it('duas linhas com favorecidos proprios, sem o "Pagador" unico, "confere" e "Gerar 2 compromissos"', () => {
    const { container } = abrir(comNomes(propostasBoitelProdutor(entrada('produtor', LIQUIDO)) ?? []), LIQUIDO);
    const linhas = [...container.ownerDocument.querySelectorAll('label.cursor-pointer')].map(l => l.textContent ?? '');
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toContain('Pago ao boitel (acerto)');
    expect(linhas[0]).toContain('Saída');
    expect(linhas[0]).toContain('Ricardo Goulart');
    expect(linhas[0]).toMatch(/−\sR\$\s308\.877,97/);
    expect(linhas[1]).toContain('Recebimento do frigorífico');
    expect(linhas[1]).toContain('Entrada');
    expect(linhas[1]).toContain('JBS - Unid 02');
    expect(linhas[1]).toMatch(/\+\sR\$\s965\.835,14/);
    expect(screen.queryByText('Pagador')).toBeNull();
    expect(screen.getByText('confere')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gerar 2 compromissos' })).toBeTruthy();
  });

  it('um centavo de diferenca APARECE (sem a tolerancia da A) — e o liquido segue o que esta marcado', () => {
    abrir(comNomes(propostasBoitelProdutor(entrada('produtor', LIQUIDO)) ?? []), LIQUIDO - 0.01);
    expect(screen.queryByText('confere')).toBeNull();
    expect(screen.getByText(/R\$\s0,01 a mais/)).toBeTruthy();
    /* desmarcar o acerto: o total vira so' o recebido, e o botao conta 1 */
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByRole('button', { name: 'Gerar 1 compromisso' })).toBeTruthy();
  });

  it('com bloqueio (slot != recebido - pago) o botao trava e diz por que; grava na ordem acerto -> principal', async () => {
    const onGerar = vi.fn(async (_linhas: PropostaCompromisso[]) => {});
    const ps = comNomes(propostasBoitelProdutor(entrada('produtor', LIQUIDO)) ?? []);
    const { unmount } = abrir(ps, LIQUIDO, { bloqueio: 'Recebido do frigorífico ... · reaplique o Realizado', onGerar });
    const botao = screen.getByRole('button', { name: 'Gerar 2 compromissos' });
    expect(botao.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/reaplique o Realizado/)).toBeTruthy();
    unmount();

    abrir(ps, LIQUIDO, { onGerar });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar 2 compromissos' }));
    await vi.waitFor(() => expect(onGerar).toHaveBeenCalledTimes(1));
    const linhas = onGerar.mock.calls[0][0];
    expect(linhas.map(l => [l.componente, l.favorecidoId])).toEqual([['acerto_boitel', BOITEL], ['principal', JBS]]);
  });
});

describe('dialogo na A (e compra, abate, venda comum) — como sempre', () => {
  const PROPOSTA_A: PropostaCompromisso = {
    chave: `principal:${LOTE}`, natureza: 'principal', descricao: 'Venda 193 G', caminho: 'Venda em Boitel',
    subcentro: 'Venda em Boitel', valor: LIQUIDO, loteId: LOTE, componente: 'principal',
  };
  it('uma linha por lote, "Pagador" = contraparte, sem "+" nem sentido, "confere" com o acordado', () => {
    const { container } = abrir([PROPOSTA_A], LIQUIDO);
    expect(screen.getByText('Pagador')).toBeTruthy();
    expect(screen.getByText('JBS (boitel)')).toBeTruthy();
    const linha = container.ownerDocument.querySelector('label.cursor-pointer')?.textContent ?? '';
    expect(linha).toMatch(/^Venda 193 GVenda em BoitelR\$\s656\.957,17$/);
    expect(screen.getByText('Total proposto').nextElementSibling?.textContent).toContain('656.957,17');
    expect(screen.getByText('confere')).toBeTruthy();
    /* o bloqueio so' vale no modo por linha: na A o dialogo nunca o recebe, e mesmo se recebesse nao trava */
    expect(screen.getByRole('button', { name: 'Gerar 1 compromisso' }).hasAttribute('disabled')).toBe(false);
  });
});
