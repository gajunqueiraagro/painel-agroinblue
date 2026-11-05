/**
 * FIN-FILTRO-FILIAIS-01 — o conjunto do "+ filiais (N)" chega aos TRÊS caminhos da lista: a RPC da grade (`fornecedor_ids`), o plano da
 * seção sem caixa e da exportação (`favorecidoIds` → `.in`) e a conferência em memória. Um cadastro só (ou desmarcada) = o filtro de
 * sempre (`fornecedor_id`). Dados sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { filtrosDaPaginaV2, type FiltrosDaTelaV2 } from './listaPaginaV2';
import { filtrosAplicadosDaLista } from './listaPaginadaV2';
import { montarPlanoBaseV2 } from './filtrosBaseV2';
import { filtrarListaV2NoCliente } from './filtrosListaV2';

const tela = (fornecedores: readonly string[] | null): FiltrosDaTelaV2 => ({
  fazendaId: '__all__', anos: ['2026'], meses: [], dimensao: 'financeira', tipoOperacao: '__all__', status: [], contaOrigem: '__all__',
  contaDestino: '__all__', macro: '__all__', grupo: '__all__', centro: '__all__', subcentro: '__all__', safra: '__all__', cultura: '__all__',
  atividade: '__all__', produto: '', documento: '', fornecedor: 'matriz', modoSemCaixa: 'mostrar', fornecedores,
});

describe('FIN-FILTRO-FILIAIS-01', () => {
  it('a RPC da grade recebe o conjunto só quando há filial; sem filial (ou desmarcada) só o fornecedor_id', () => {
    expect(filtrosDaPaginaV2(tela(['matriz', 'filial']))).toMatchObject({ fornecedor_id: 'matriz', fornecedor_ids: ['matriz', 'filial'] });
    expect(filtrosDaPaginaV2(tela(['matriz']))).not.toHaveProperty('fornecedor_ids');
    expect(filtrosDaPaginaV2(tela(null))).not.toHaveProperty('fornecedor_ids');
  });

  it('a seção sem caixa e a exportação: o plano filtra pelo conjunto (manda sobre o id)', () => {
    const com = filtrosAplicadosDaLista({ ano: '2026' }, { fornecedor: 'matriz', fornecedores: ['matriz', 'filial'] });
    expect(com.lista_fornecedor_ids).toEqual(['matriz', 'filial']);
    const plano = montarPlanoBaseV2('cli', com, { relacao: 'view' });
    expect(plano.favorecidoIds).toEqual(['matriz', 'filial']);
    expect(plano.favorecidoId).toBeUndefined();
    const so = montarPlanoBaseV2('cli', filtrosAplicadosDaLista({ ano: '2026' }, { fornecedor: 'matriz', fornecedores: ['matriz'] }), { relacao: 'view' });
    expect(so.favorecidoIds).toBeUndefined();
    expect(so.favorecidoId).toBe('matriz');
  });

  it('a conferência em memória deixa passar as filiais e mais ninguém', () => {
    const linhas = [{ id: '1', favorecido_id: 'matriz' }, { id: '2', favorecido_id: 'filial' }, { id: '3', favorecido_id: 'outro' }, { id: '4', favorecido_id: null }];
    expect(filtrarListaV2NoCliente(linhas, { lista_fornecedor_id: 'matriz', lista_fornecedor_ids: ['matriz', 'filial'] }).map((l) => l.id)).toEqual(['1', '2']);
    expect(filtrarListaV2NoCliente(linhas, { lista_fornecedor_id: 'matriz' }).map((l) => l.id)).toEqual(['1']);
  });
});
