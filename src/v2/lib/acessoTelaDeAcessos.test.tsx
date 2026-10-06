/**
 * ACESSOS-TELA-01 — a tela de Acessos (`config-acessos`) e' SO' DO ADMIN: sem a marca `liberadaClientes`, o dono
 * (`nivelDaTela`) responde 'nao' a todo perfil de cliente, e a guarda unica da rota barra o endereco.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nivelDaTela } from '@/v2/lib/acessoTelas';
import { NAV_GRUPOS } from '@/v2/lib/navGrupos';

const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const PERFIS = ['gestor_cliente', 'financeiro', 'campo', 'leitura'];

describe('config-acessos — só admin', () => {
  it('gestor, financeiro, campo e leitura não a abrem; perfil nulo ou desconhecido também não; o admin edita', () => {
    for (const p of [...PERFIS, null, undefined, '', 'dono', 'admin_agroinblue']) expect(nivelDaTela(p, false, 'config-acessos')).toBe('nao');
    expect(nivelDaTela(null, true, 'config-acessos')).toBe('editar');
    /* a busca sabe achar: uma tela liberada responde outra coisa ao financeiro */
    expect(nivelDaTela('financeiro', false, 'financeiro-lanc')).toBe('editar');
  });
  it('o caminho até ela (Configurações) também é só do admin', () => {
    for (const p of PERFIS) expect(nivelDaTela(p, false, 'configuracoes')).toBe('nao');
  });
  it('não é item de menu de grupo nenhum — logo não tem como levar a marca `liberadaClientes`', () => {
    const itens = NAV_GRUPOS.flatMap(g => g.drawer.flatMap(s => s.itens));
    expect(itens.length).toBeGreaterThan(30);
    expect(itens.some(i => i.id === 'config-acessos')).toBe(false);
  });
  it('a rota monta a `AcessosTab` na seção, dentro do `renderContent` que a guarda única protege', () => {
    const v2 = ler('src/v2/V2Index.tsx');
    expect(v2).toContain("if (section === 'config-acessos') return <AcessosTab />;");
    expect(v2).toContain("import { AcessosTab } from '@/pages/AcessosTab';");
    /* a guarda da rota e' uma so', em cima de `nivelDaTela` */
    expect(v2).toMatch(/nivelDaTela\([^)]*section[^)]*\)/);
    /* a tela mede contra o pai: sem isto o cabecalho da lista nao prende */
    expect(v2).toMatch(/SECOES_APP_SHELL = new Set\(\[[^\]]*'config-acessos'[^\]]*\]\)/);
  });
  it('o cartão "Acessos" está em Configurações, com a frase do que a tela é', () => {
    const c = ler('src/v2/pages/V2Configuracoes.tsx');
    expect(c).toContain("section: 'config-acessos'");
    expect(c).toContain("label: 'Acessos'");
    expect(c).toContain('Quem entra em cada cliente e com qual perfil');
  });
});
