/**
 * FOLHA-01 · PR B (telas) — a FICHA do funcionário, ao lado da lista (D1 a): 340px SEMPRE, aberta ou não. Contrato §3.1.
 * ⚠ DUAS ABAS (Cadastro · Documentos) num Segmentado de largura fixa; o topo da ficha (nome + Editar + ✕) tem altura fixa.
 * ⚠ PIX, BANCO E CONTATO SÃO DO FAVORECIDO (fonte única): aqui só leitura — editam-se no Editar, aba Cadastro (FOLHA-FUNC-CADASTRO-01),
 *   que grava no favorecido.
 * ⚠ "A ATUALIZAR" EM ÂMBAR: o campo que o contador ainda não mandou aparece "a confirmar", nunca vazio nem zero.
 */
import { useState, type ReactNode } from 'react';
import { ExternalLink, Pencil, X } from 'lucide-react';
import { Segmentado } from '@/components/ui/segmentado';
import { useFicha } from '@/hooks/useFolha';
import { cn } from '@/lib/utils';
import {
  avisoDoVencimento, competenciaBR, cpfBR, dataBR, n2, rotuloAAtualizar, rotuloSituacao, rotuloStatus, rotuloVinculo,
  type Ficha, type FuncionarioDaLista,
} from '@/lib/folha/folhaTela';
import { aAtualizarDe } from '@/lib/folha/admissao';
import { DocumentosDaFicha } from './DocumentosDaFicha';

type AbaDaFicha = 'cadastro' | 'documentos';

export function FichaFuncionario({ clienteId, funcionarioId, linha, onFechar, onEditar, onHistorico }: {
  clienteId: string; funcionarioId: string | null; linha: FuncionarioDaLista | null;
  onFechar: () => void; onEditar: (id: string) => void; onHistorico: (id: string) => void;
}) {
  const { data: ficha, isLoading, error } = useFicha(funcionarioId);
  const [aba, setAba] = useState<AbaDaFicha>('cadastro');
  const vencendo = ficha ? ficha.documentos.filter(d => avisoDoVencimento(d.dias)).length : linha?.documentos_vencendo ?? 0;
  const nDocs = ficha ? ficha.documentos.length : linha?.documentos ?? 0;

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card" data-testid="folha-ficha">
      {!funcionarioId ? (
        <div className="flex flex-1 items-center justify-center px-3 text-[11px] text-muted-foreground" data-testid="folha-ficha-vazia">
          Escolha um funcionário na lista.
        </div>
      ) : (
        <>
          <div className="flex h-[30px] shrink-0 items-center gap-1.5 border-b bg-primary px-2 text-primary-foreground">
            <span className="uma-linha-que-rola min-w-0 flex-1 text-[11px] font-semibold" title={ficha?.funcionario.nome ?? linha?.nome}>{ficha?.funcionario.nome ?? linha?.nome ?? '…'}</span>
            <button type="button" className="inline-flex h-[20px] shrink-0 items-center gap-1 rounded border border-white/25 px-1.5 text-[10px] hover:bg-white/10"
              onClick={() => onEditar(funcionarioId)} data-testid="folha-ficha-editar"><Pencil className="h-3 w-3" /> Editar</button>
            <button type="button" className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded hover:bg-white/10" aria-label="Fechar a ficha"
              onClick={onFechar}><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex h-[30px] shrink-0 items-center px-2">
            <Segmentado altura={22} fonte={10} valor={aba} onEscolher={setAba} opcoes={[
              { valor: 'cadastro', rotulo: <span className="inline-block w-[140px] text-center">Cadastro</span> },
              { valor: 'documentos', rotulo: (
                <span className="inline-flex w-[140px] items-center justify-center gap-1">Documentos
                  <span className="inline-block w-[22px] text-left tabular-nums">{nDocs ? `· ${nDocs}` : ''}</span>
                  <span className={cn('inline-block h-[6px] w-[6px] rounded-full', vencendo ? 'bg-amber-500' : 'bg-transparent')} title={vencendo ? `${vencendo} vencendo` : undefined} />
                </span>
              ) },
            ]} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2" data-testid="folha-ficha-corpo">
            {isLoading ? <p className="py-3 text-[10px] text-muted-foreground">Carregando…</p>
              : error || !ficha ? <p className="py-3 text-[10px] text-destructive">Não consegui ler a ficha. Tente de novo.</p>
              : aba === 'cadastro' ? <Cadastro ficha={ficha} linha={linha} onHistorico={() => onHistorico(funcionarioId)} />
              : <DocumentosDaFicha clienteId={clienteId} funcionarioId={funcionarioId} documentos={ficha.documentos} />}
          </div>
        </>
      )}
    </aside>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <h4 className="mt-1.5 h-[16px] border-b border-border pt-[3px] text-[9.5px] font-bold leading-[12px] text-primary">{children}</h4>;
}
/** uma linha rótulo · valor (rótulo 96px); o valor (dado) ROLA no lugar — fora de tabela nada de "…" — e o inteiro no `title`; `aConfirmar` = âmbar */
function Campo({ rotulo, valor, aConfirmar, testid }: { rotulo: string; valor: string | null; aConfirmar?: boolean; testid?: string }) {
  const texto = valor ?? (aConfirmar ? 'a confirmar' : '—');
  return (
    <div className="flex h-[17px] items-center text-[10.5px] leading-[14px]">
      <span className="w-[96px] shrink-0 truncate text-[9.5px] text-muted-foreground">{rotulo}</span>
      <span className={cn('uma-linha-que-rola min-w-0 flex-1', valor == null && !aConfirmar && 'text-muted-foreground', aConfirmar && 'text-amber-700', valor == null && aConfirmar && 'italic')}
        title={texto} data-testid={testid}>{texto}</span>
    </div>
  );
}

function Cadastro({ ficha, linha, onHistorico }: { ficha: Ficha; linha: FuncionarioDaLista | null; onHistorico: () => void }) {
  const f = ficha.funcionario;
  const marcas = aAtualizarDe(f, ficha.salarios.length > 0);
  const falta = new Set(marcas);
  const salario = ficha.salarios[0] ?? null;
  const pg = ficha.pagamento;
  const pix = pg?.pix_chave ? `${pg.pix_tipo_chave ? `${pg.pix_tipo_chave} ` : ''}${pg.pix_chave}` : null;
  const banco = pg && (pg.banco || pg.conta) ? [pg.banco, pg.agencia && `ag ${pg.agencia}`, pg.conta && `cc ${pg.conta}`].filter(Boolean).join(' · ') : null;
  const contato = pg ? [pg.celular ?? pg.telefone, pg.email].filter(Boolean).join(' · ') || null : null;
  const atuacoes = ficha.atuacoes.length ? ficha.atuacoes : (linha?.atuacao ?? []).map(a => ({ ...a, desde: null }));
  return (
    <div data-testid="folha-ficha-cadastro">
      {marcas.length > 0 && (
        <p className="mt-1 truncate rounded bg-amber-50 px-1.5 py-[2px] text-[10px] text-amber-800" title={`a atualizar: ${marcas.map(rotuloAAtualizar).join(', ')}`}>
          a atualizar: {marcas.map(rotuloAAtualizar).join(', ')}
        </p>
      )}
      <Titulo>Cadastro</Titulo>
      <Campo rotulo="Situação" valor={rotuloSituacao(f)} />
      <Campo rotulo="CPF" valor={f.cpf ? cpfBR(f.cpf) : null} aConfirmar={falta.has('cpf')} />
      <Campo rotulo="Nascimento" valor={f.nascimento ? dataBR(f.nascimento) : null} />
      <Campo rotulo="PIS" valor={f.pis} />
      <Campo rotulo="CTPS" valor={f.ctps} />
      <Campo rotulo="Vínculo" valor={rotuloVinculo(f.vinculo)} />
      <Campo rotulo="Registro" valor={f.empregador_registro} />
      <Campo rotulo="Código contador" valor={f.codigo_contador} />
      <Campo rotulo="Cargo" valor={f.cargo} aConfirmar={falta.has('cargo')} />
      <Campo rotulo="Admissão" valor={f.admissao ? dataBR(f.admissao) : null} aConfirmar={falta.has('admissao')} />
      <Campo rotulo="Salário" valor={salario?.salario != null ? `${n2(salario.salario)}${salario.desde ? ` desde ${dataBR(salario.desde)}` : ''}` : null}
        aConfirmar={falta.has('salario') || salario == null} testid="folha-ficha-salario" />

      <Titulo>Pagamento (do fornecedor)</Titulo>
      <Campo rotulo="Favorecido" valor={pg?.favorecido ?? null} />
      <Campo rotulo="Pix" valor={pix} />
      <Campo rotulo="Banco" valor={banco} />
      <Campo rotulo="Contato" valor={contato} />
      <p className="h-[14px] text-[9.5px] leading-[14px] text-muted-foreground">Pix, banco e contato se editam no Editar (aba Cadastro).</p>

      <Titulo>Atuação (rateio do custo)</Titulo>
      {atuacoes.length === 0 ? <p className="h-[17px] text-[10.5px] italic text-amber-700">a confirmar</p> : atuacoes.map((a, i) => (
        <Campo key={i} rotulo={a.desde ? `desde ${competenciaBR(a.desde)}` : 'hoje'} valor={`${[a.fazenda, a.atividade].filter(Boolean).join(' · ')} · ${a.pct.toLocaleString('pt-BR')}%`} />
      ))}

      <Titulo>Últimos pagamentos ligados</Titulo>
      {ficha.ultimos_pagamentos.length === 0 ? <p className="h-[17px] text-[10.5px] text-muted-foreground">nenhum</p> : ficha.ultimos_pagamentos.map(u => (
        <div key={u.lancamento_id} className="flex h-[17px] items-center gap-1 text-[10.5px] leading-[14px]">
          <span className="w-[44px] shrink-0 tabular-nums text-muted-foreground">{competenciaBR(u.competencia)}</span>
          <span className="uma-linha-que-rola min-w-0 flex-1" title={u.descricao ?? undefined}>{u.descricao ?? '—'}</span>
          <span className="w-[64px] shrink-0 text-right tabular-nums">{n2(u.valor)}</span>
          <span className="w-[58px] shrink-0 truncate text-right text-[9.5px] text-muted-foreground">{rotuloStatus(u.status, false)}</span>
        </div>
      ))}
      <button type="button" className="mt-1 inline-flex h-[18px] items-center gap-1 text-[10px] font-medium text-primary hover:underline"
        onClick={onHistorico} data-testid="folha-ficha-historico">Ver todo o histórico <ExternalLink className="h-3 w-3" /></button>
    </div>
  );
}
