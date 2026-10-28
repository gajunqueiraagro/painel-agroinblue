/**
 * P134 — a busca sem acento POR TIPO DE CAMPO: as duas primitivas que quase toda tela usa (SearchableSelect e o seletor de
 * subcentro), um filtro avulso de lista (contas bancárias), o filtro de documento em memória e o plano da lista que vai ao banco.
 * O caso do Gabriel: "maq" no subcentro não achava "Manutenção Máquinas Pecuária".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { filtrarContas, type ContaBancariaCadastro } from '@/lib/financeiro/contasBancarias';
import { casaDocumentoNoCliente } from '@/lib/financeiro/listaPaginadaV2';
import { montarPlanoBaseV2 } from '@/lib/financeiro/filtrosBaseV2';

beforeEach(() => { sessionStorage.clear(); Element.prototype.scrollIntoView = () => {}; });

describe('P134 — SearchableSelect (fazenda, conta, centro, grupo…: ~80 arquivos)', () => {
  const OPCOES = [
    { value: 'a', label: 'Manutenção Máquinas Pecuária' },
    { value: 'b', label: 'Açúcar Cristal', sub: 'João da Silva' },
    { value: 'c', label: 'Outro Item' },
  ];
  const abrirEDigitar = (termo: string) => {
    render(<SearchableSelect value="__all__" onValueChange={() => {}} options={OPCOES} />);
    fireEvent.click(screen.getByRole('button', { name: /Todos/i }));
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: termo } });
  };
  it('"maq" acha "Manutenção Máquinas Pecuária" e esconde o resto', () => {
    abrirEDigitar('maq');
    expect(screen.getByText('Manutenção Máquinas Pecuária')).toBeInTheDocument();
    expect(screen.queryByText('Outro Item')).not.toBeInTheDocument();
  });
  it('"acucar" acha "Açúcar"; "JOAO" acha pelo texto de baixo (sub)', () => {
    abrirEDigitar('acucar');
    expect(screen.getByText('Açúcar Cristal')).toBeInTheDocument();
  });
  it('"JOAO" acha pelo texto de baixo (sub)', () => {
    abrirEDigitar('JOAO');
    expect(screen.getByText('Açúcar Cristal')).toBeInTheDocument();
    expect(screen.queryByText('Outro Item')).not.toBeInTheDocument();
  });
});

describe('P134 — PlanoSubcentroSelect (o subcentro do lançamento: o caso do Gabriel)', () => {
  const plano = (subcentro: string): ClassificacaoItem => ({
    id: subcentro, subcentro, centro_custo: 'C', grupo_custo: 'G', macro_custo: 'M', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria',
  });
  it('"maq" acha "Manutenção Máquinas Pecuária" e "Máquinas"', () => {
    render(<PlanoSubcentroSelect value="" onChange={vi.fn()} classificacoes={[plano('Manutenção Máquinas Pecuária'), plano('Máquinas'), plano('Salários')]}
      tipoOperacao="2-Saídas" search="maq" onSearchChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Manutenção Máquinas Pecuária')).toBeInTheDocument();
    expect(screen.getByText('Máquinas')).toBeInTheDocument();
    expect(screen.queryByText('Salários')).not.toBeInTheDocument();
  });
});

describe('P134 — filtro avulso de lista: contas bancárias', () => {
  const conta = (id: string, nome_conta: string): ContaBancariaCadastro => ({
    id, nome_conta, nome_exibicao: null, codigo_conta: null, tipo_conta: 'cc', fazenda_id: null, ativa: true,
    banco: null, agencia: null, numero_conta: null, conta_digito: null, mes_inicio: null, saldo_inicial_oficial: null,
  });
  it('"credito" acha "Crédito Rural"; a busca com acento acha a sem', () => {
    const contas = [conta('1', 'Crédito Rural'), conta('2', 'Conta Movimento')];
    const f = { segmento: 'todas' as const, fazendaId: null, mostrarInativas: true };
    expect(filtrarContas(contas, { ...f, busca: 'credito' }).map((c) => c.id)).toEqual(['1']);
    expect(filtrarContas([conta('3', 'Credito Rural')], { ...f, busca: 'CRÉDITO' }).map((c) => c.id)).toEqual(['3']);
  });
});

describe('P134 — o filtro de documento em memória', () => {
  it('"recibo joao" acha "Recibo João"', () => {
    expect(casaDocumentoNoCliente({ id: 'x', numero_documento: 'Recibo João' }, 'recibo joao')).toBe(true);
    expect(casaDocumentoNoCliente({ id: 'x', numero_documento: 'Recibo Pedro' }, 'recibo joao')).toBe(false);
  });
});

describe('P134 — o plano da lista que vai ao banco (caminho da view: "sem caixa", exportação, cancelamento em lote)', () => {
  it('Produto vai pelo campo calculado `busca_descricao` com o termo SEM acento', () => {
    const plano = montarPlanoBaseV2('cli', { lista_produto: 'Manutenção Máq' }, { relacao: 'view' });
    expect(plano.orDescricao).toBe('busca_descricao.imatch."manutencao maq"');
  });
  it('Documento vai pelos campos calculados com o termo SEM acento', () => {
    const plano = montarPlanoBaseV2('cli', { lista_documento: 'Recibo JOÃO' }, { relacao: 'view' });
    expect(plano.orDocumento).toBe('busca_numero_documento.imatch."recibo joao",busca_documento_formatado.imatch."recibo joao"');
  });
});
