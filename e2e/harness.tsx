/**
 * Bancada 2C-4 — composição REAL completa da barra da lista.
 *
 * Reproduz a fileira de filtros do desktop (com Atividade no fim), o botão
 * Aplicar imediatamente após Atividade, o bloco 2x2, o aviso, o contador de
 * sem-vencimento e a paginação — nos mesmos componentes de produção.
 * Não instancia cliente Supabase; não fala com ambiente algum.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import {
  FinanceiroV2ControlesLista, BotaoAplicarFiltros,
} from '../src/components/financeiro-v2/FinanceiroV2ControlesLista';
import { calcularPaginacao } from '../src/lib/financeiro/estadoFiltrosLista';

const nada = () => {};
const lbl = 'block text-[9px] font-medium text-[#4A6785] mb-0.5 leading-none';
const campo = 'h-6 text-[10px] w-full rounded border border-[#C9D4E2] bg-white px-1.5';

function Campo({ nome, largura, tipo = 'select', valor }:
  { nome: string; largura: number; tipo?: 'select' | 'texto'; valor?: string }) {
  return (
    <div style={{ minWidth: largura, flex: `1 1 ${largura}px` }} data-campo={nome}>
      <label className={lbl}>{nome}</label>
      {tipo === 'texto'
        ? <input className={campo} defaultValue={valor} placeholder={nome} />
        : <select className={campo} data-testid={nome === 'Atividade' ? 'campo-atividade' : undefined}>
            <option>{valor ?? 'Todos'}</option>
          </select>}
    </div>
  );
}

const Exportar = () => (
  <button data-testid="btn-exportar"
    className="h-6 text-[10px] gap-0.5 px-2 border rounded inline-flex items-center bg-white">Exportar</button>
);

/** Fileira 1: filtros de recorte. Fileira 2: classificação + Atividade + Aplicar. */
function Filtros({ pendente }: { pendente: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-1.5 flex-wrap">
        <Campo nome="Ano" largura={80} valor="2026" />
        <Campo nome="Mês" largura={90} valor="Março" />
        <Campo nome="Data por" largura={110} valor="Financeira" />
        <Campo nome="Tipo" largura={110} />
        <Campo nome="Status" largura={110} />
        <Campo nome="Fazenda" largura={130} />
      </div>
      <div className="flex items-end gap-1.5 flex-wrap">
        <Campo nome="Conta Origem" largura={150} />
        <Campo nome="Conta Destino" largura={150} />
        <Campo nome="Produto" largura={115} tipo="texto" valor="racao" />
        <Campo nome="Documento" largura={115} tipo="texto" />
        <Campo nome="Fornecedor" largura={130} />
        <Campo nome="Grupo" largura={115} />
        <Campo nome="Atividade" largura={115} />
        {/* Aplicar filtros: IMEDIATAMENTE apos Atividade, no fim da fileira. */}
        <div className="flex items-end shrink-0">
          <BotaoAplicarFiltros pendente={pendente} onAplicar={nada} />
        </div>
      </div>
    </div>
  );
}

interface Cen { pendente: boolean; excluidos: number; incluindo: boolean; total: number; pagina: number; intensivo?: boolean; voltar?: boolean }
const CENARIOS: Record<string, Cen> = {
  base:      { pendente: false, excluidos: 0, incluindo: false, total: 87, pagina: 0 },
  pendente:  { pendente: true,  excluidos: 7, incluindo: false, total: 87, pagina: 1 },
  incluindo: { pendente: false, excluidos: 7, incluindo: true,  total: 29407, pagina: 980, intensivo: true, voltar: true },
  vazio:     { pendente: false, excluidos: 0, incluindo: false, total: 0, pagina: 0 },
};

const nome = new URLSearchParams(location.search).get('cenario') ?? 'base';
const c = CENARIOS[nome] ?? CENARIOS.base;

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 8, background: '#F4F6F9' }}>
    <div style={{ border: '1px solid #D6DEE8', borderRadius: 8, padding: 8, background: '#fff' }}>
      <div className="flex flex-col gap-1">
        <Filtros pendente={c.pendente} />
        <FinanceiroV2ControlesLista
          pendente={c.pendente}
          onLimpar={nada} onNovo={nada} exportar={<Exportar />}
          modoIntensivo={c.intensivo ?? false} onToggleIntensivo={nada}
          onVoltar={c.voltar ? nada : undefined}
          excluidosSemVencimento={c.excluidos}
          incluirSemVencimento={c.incluindo}
          onToggleSemVencimento={nada}
          paginacao={calcularPaginacao(c.total, c.pagina, 30)}
          total={c.total} onPagina={nada}
        />
      </div>
    </div>
  </div>,
);
