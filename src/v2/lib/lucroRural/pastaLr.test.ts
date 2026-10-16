/** FIN-LR-SYNC-01 passo c — a escolha dos dois relatórios na pasta Downloads (puro, lista sintética). */
import { describe, it, expect } from 'vitest';
import { escolherRelatorios, fraseDaFalta, fraseDosVelhos, textoDoTamanho, tipoDoRelatorio } from './pastaLr';

const ms = (iso: string) => new Date(`${iso}T10:00:00`).getTime();
const a = (nome: string, dia: string, tamanho = 1000) => ({ nome, lastModified: ms(dia), tamanho });
const HOJE = '2026-10-16';

describe('tipoDoRelatorio', () => {
  it('prefixo e extensão .xlsx; o resto não é relatório', () => {
    expect(tipoDoRelatorio('relatorio-contas-pagar-unificado (3).xlsx')).toBe('pagar');
    expect(tipoDoRelatorio('Relatorio-Contas-Receber-Unificado_15-10.XLSX')).toBe('receber');
    expect(tipoDoRelatorio('relatorio-contas-pagar-unificado.xls')).toBeNull();
    expect(tipoDoRelatorio('relatorio-contas-pagar.xlsx')).toBeNull();
    expect(tipoDoRelatorio('extrato-relatorio-contas-pagar-unificado.xlsx')).toBeNull();
  });
});

describe('escolherRelatorios', () => {
  it('o mais novo de cada tipo, ignorando o que não é relatório', () => {
    const e = escolherRelatorios([
      a('relatorio-contas-pagar-unificado.xlsx', '2026-10-14'),
      a('relatorio-contas-pagar-unificado (1).xlsx', '2026-10-16'),
      a('relatorio-contas-receber-unificado.xlsx', '2026-10-15'),
      a('foto.png', '2026-10-16'),
      a('relatorio-contas-receber-unificado (1).xlsx', '2026-10-10'),
    ], HOJE);
    expect(e.pagar?.nome).toBe('relatorio-contas-pagar-unificado (1).xlsx');
    expect(e.receber?.nome).toBe('relatorio-contas-receber-unificado.xlsx');
    expect(e.faltam).toEqual([]);
    expect(e.velhos).toEqual([]);
  });

  it('falta um: diz qual; faltam os dois: diz os dois', () => {
    const e = escolherRelatorios([a('relatorio-contas-pagar-unificado.xlsx', '2026-10-16')], HOJE);
    expect(e.receber).toBeNull();
    expect(e.faltam).toEqual(['receber']);
    expect(fraseDaFalta(e.faltam)).toBe('Falta o relatório de contas a receber na pasta: arraste só esse.');
    expect(fraseDaFalta(escolherRelatorios([], HOJE).faltam)).toContain('Nenhum relatório do LR');
    expect(fraseDaFalta([])).toBeNull();
  });

  it('mais de 3 dias avisa a data (3 dias ainda não)', () => {
    const e = escolherRelatorios([a('relatorio-contas-pagar-unificado.xlsx', '2026-10-12'), a('relatorio-contas-receber-unificado.xlsx', '2026-10-13')], HOJE);
    expect(e.velhos).toEqual([{ tipo: 'pagar', data: '12/10' }]);
    expect(fraseDosVelhos(e.velhos)).toBe('relatório de 12/10 — baixe o de hoje no LR?');
    expect(fraseDosVelhos([])).toBeNull();
  });

  it('tamanho legível', () => {
    expect(textoDoTamanho(900)).toBe('900 B');
    expect(textoDoTamanho(35_000)).toBe('34 KB');
    expect(textoDoTamanho(2_621_440)).toBe('2,5 MB');
  });
});
