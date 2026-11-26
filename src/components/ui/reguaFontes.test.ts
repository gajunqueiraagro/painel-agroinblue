/**
 * UI-FONTES-REGUA-01 (Gabriel 25/11/2026 07:41) — a régua de fontes e alturas das telas novas/alteradas, e o modal Funcionário que a veste
 * (reprovado: fontes grandes, "01/11/202…", "Administrat…").
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALEM_DO_NOME_SELETOR, CAMPO_DATA, CONTROLE, LARGURA_CAMPO_DATA, LARGURA_DATA_PX, TD_FONTES, TH_FONTES, TITULO_MODAL, larguraDoSeletor, medirTexto,
} from '@/components/ui/regua-fontes';

describe('a régua', () => {
  it('os números da regra', () => {
    expect(TITULO_MODAL).toContain('text-[13px]');
    expect(CONTROLE).toContain('h-[26px]');
    expect(CONTROLE).toContain('text-[11px]');
    expect(TH_FONTES).toContain('text-[10px]');
    expect(TH_FONTES).not.toContain('text-[9.5px]');
    expect(TD_FONTES).toContain('h-[24px]');
    expect(TD_FONTES).toContain('text-[11px]');
    expect(LARGURA_CAMPO_DATA).toBe(`w-[${LARGURA_DATA_PX}px]`);
    expect(CAMPO_DATA).toContain('text-[11px]');
  });
  it('o campo de data cabe "00/00/0000" a 11px + o ícone', () => {
    expect(LARGURA_DATA_PX).toBeGreaterThanOrEqual(Math.ceil(medirTexto('00/00/0000', 11) + 8 + 32 + 2));
  });
  it('o seletor tem a largura do MAIOR nome + o que o gatilho tem além do nome', () => {
    const nomes = ['Pecuária', 'Administrativo', 'Agricultura'];
    const w = larguraDoSeletor(nomes);
    expect(w).toBe(Math.ceil(medirTexto('Administrativo') + ALEM_DO_NOME_SELETOR));
    expect(w).toBeGreaterThan(larguraDoSeletor(['Pecuária']));
    expect(larguraDoSeletor([])).toBe(ALEM_DO_NOME_SELETOR);
  });
});

describe('o modal Funcionário veste a régua (lido da fonte)', () => {
  /* FOLHA-FUNC-CADASTRO-01: a aba Cadastro mora em `AbaCadastroFuncionario` — o modal é os dois arquivos */
  const src = readFileSync(resolve(process.cwd(), 'src/components/folha/FuncionarioDialog.tsx'), 'utf8')
    + readFileSync(resolve(process.cwd(), 'src/components/folha/AbaCadastroFuncionario.tsx'), 'utf8');
  it('nenhum tamanho de fonte solto e nenhum token antigo', () => {
    expect(src.match(/text-\[\d/g) ?? []).toEqual([]);
    expect(src).not.toMatch(/REGUA_CAMPO|TH_REGUA|TD_REGUA/);
  });
  it('título 13px, abas 26/11, toda data com a largura fixa', () => {
    expect(src).toContain("className={cn('min-w-0 truncate', TITULO_MODAL)}");
    expect(src).toContain('<Segmentado altura={ALTURA_CONTROLE} fonte={FONTE_CONTROLE}');
    const datas = src.match(/<DatePicker [\s\S]*?\/>/g) ?? [];
    expect(datas.length).toBe(7);
    for (const d of datas) expect(d).toMatch(/className=\{(CAMPO_DATA\}|cn\(CAMPO_DATA, )/);
    expect((src.match(/className=\{LARGURA_CAMPO_DATA\}><Rotulo/g) ?? []).length).toBe(7);
  });
  it('os seletores com a largura do maior nome', () => {
    expect(src).toContain("vinculo: L(['vínculo', ...VINCULOS.map(s => s.rotulo)])");
    expect(src).toContain("larguraDoSeletor(['atividade', ...opAtividade.map(o => o.label)]) + 8");
    expect(src).toContain('<col style={{ width: larguraAtividade }} />');
  });
});
