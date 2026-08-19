import { TIPOS_USO_OPTIONS_AGRUPADAS, isTipoUsoValido } from '@/lib/pastos/tiposUso';
import type { Pasto } from '@/hooks/usePastos';

/**
 * Repartição SOBERANA dos pastos por família e destino.
 *
 * A soma dos pastos é a base do sistema: `fazenda_cadastros` é que deve puxar
 * dela, não o contrário (decisão de produto, 19/08/2026). Consumida hoje pela
 * lista do cadastro de pastos e, a partir do PR-AREA-DERIVADA-01, pela aba Área
 * do V2Fazendas — que já carrega os pastos por `usePastos`, sem query nova.
 *
 * Todo pasto cai em EXATAMENTE um dos três: taxonomia, divergência ou legado.
 * Família nova em tiposUso.ts aparece aqui sozinha, porque a lista de famílias
 * vem de TIPOS_USO_OPTIONS_AGRUPADAS e não de um switch local.
 *
 * NÃO filtra `ativo`: quem chama decide. A lista de pastos tem o modo "Inativos"
 * e precisa dos dois conjuntos; a aba Área quer só os ativos. Passar já filtrado.
 */
export function agruparPastosPorFamilia(pastos: Pasto[]) {
  const porTipo = new Map<string, Pasto[]>();
  const divergencia: Pasto[] = [];
  const legado: Pasto[] = [];
  for (const p of pastos) {
    if (isTipoUsoValido(p.tipo_uso)) {
      const arr = porTipo.get(p.tipo_uso) ?? [];
      arr.push(p);
      porTipo.set(p.tipo_uso, arr);
    } else if (p.tipo_uso === 'divergencia') {
      divergencia.push(p);
    } else {
      legado.push(p);
    }
  }
  const familias = TIPOS_USO_OPTIONS_AGRUPADAS.map(g => {
    const tipos = g.options.map(o => ({ tipo: o.value, label: o.label, pastos: porTipo.get(o.value) ?? [] }));
    const todos = tipos.flatMap(t => t.pastos);
    return {
      grupo: g.grupo,
      label: g.label,
      tipos,
      qtd: todos.length,
      somaHa: todos.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0),
    };
  });
  return { familias, divergencia, legado };
}
