/**
 * LOCAL DE ESTOQUE — o cadastro de onde o grão fica (EL-01).
 *
 * ⚠ DUAS ABAS, E SÓ NO EDITAR DE TERCEIRO. O contrato de armazenagem precisa de um `local_id` que
 * ainda não existe enquanto se cria, e `agri_contrato_armazenagem_salvar` recusa local próprio com
 * `CONTRATO_SO_PARA_LOCAL_TERCEIRO`. Mostrar a aba antes de haver o que salvar seria oferecer um
 * formulário que o banco não aceita.
 *
 * ⚠ A CÉLULA DO VÍNCULO EXISTE SEMPRE, só troca o controle (A23): próprio mostra Fazenda, terceiro
 * mostra Cooperativa. Se a célula nascesse e morresse, trocar o tipo empurraria o resto do
 * formulário — e trocar o tipo é o gesto mais comum deste modal.
 * ⚠ TROCAR O TIPO LIMPA O OUTRO VÍNCULO no estado, não só na tela: o `CHECK` do banco é exclusivo
 * (próprio proíbe fornecedor), e mandar os dois faria a gravação falhar por uma escolha que o
 * operador já tinha desfeito.
 *
 * ⚠ UMA ANATOMIA POR CÉLULA — rótulo `text-[10px]` em cima, controle `h-8` embaixo com `mt-0.5`,
 * DatePicker sem `compact`, `FornecedorSelect` com `label=""`. É a lição do a5b1fc58, que custou
 * um PR inteiro de correção.
 */
import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { CampoNumero } from '@/components/ui/campo-moeda';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TIPOS_LOCAL, QUEBRA_TIPOS, QUEBRA_BASES, TAXA_UNIDADES,
} from '@/lib/agri/locaisEstoque';
import type { LocalEstoque } from '@/hooks/useEstoqueGraos';
import type { Fazenda } from '@/contexts/FazendaContext';

export interface LocalPayload {
  id: string | null;
  nome: string;
  tipo: string;
  fazenda_id: string | null;
  fornecedor_id: string | null;
  codigo_externo: string | null;
  aliases: string[] | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface ContratoPayload {
  id: string | null;
  local_id: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  quebra_tecnica_tipo: string;
  quebra_tecnica_pct: number | null;
  quebra_tecnica_base: string | null;
  taxa_valor: number | null;
  taxa_unidade: string | null;
  documento_ref: string | null;
  observacoes: string | null;
}

export function LocalEstoqueModal({
  aberto, onFechar, local, clienteId, fazendas, onSalvarLocal, onSalvarContrato, salvando,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** `null` = novo. Com local, o modal edita — e ganha a aba de contrato se for terceiro. */
  local: LocalEstoque | null;
  clienteId: string;
  /**
   * ⚠ O TIPO É O DO `FazendaContext`, não um `{id, nome}` meu: `FazendaSelect` pede `Fazenda[]`, e
   * inventar um shape reduzido aqui obrigaria um cast no chamador — que é como um tipo "quase
   * certo" vira um `as any` na próxima tela.
   */
  fazendas: Fazenda[];
  onSalvarLocal: (p: LocalPayload) => void;
  onSalvarContrato: (p: ContratoPayload) => void;
  salvando: boolean;
}) {
  const [aba, setAba] = useState<'local' | 'contrato'>('local');
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('terceiro');
  const [fazendaId, setFazendaId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [aliases, setAliases] = useState('');
  const [obs, setObs] = useState('');
  const [ativo, setAtivo] = useState(true);

  const [cIni, setCIni] = useState('');
  const [cFim, setCFim] = useState('');
  const [cQuebra, setCQuebra] = useState('nenhuma');
  const [cPct, setCPct] = useState('');
  const [cBase, setCBase] = useState('');
  const [cTaxa, setCTaxa] = useState('');
  const [cUnidade, setCUnidade] = useState('');
  const [cDoc, setCDoc] = useState('');
  const [cObs, setCObs] = useState('');

  /* ⚠ RECARREGA A CADA ABERTURA, como os outros modais desta tela: sem isto, reabrir em "novo"
     depois de editar traria os campos do anterior e bastaria um Salvar distraído. */
  useEffect(() => {
    if (!aberto) return;
    setAba('local');
    setNome(local?.nome ?? '');
    setTipo(local?.tipo ?? 'terceiro');
    setFazendaId(local?.fazenda_id ?? '');
    setFornecedorId(local?.fornecedor_id ?? '');
    setCodigo(local?.codigo_externo ?? '');
    /* ⚠ APELIDOS EM TEXTO SEPARADO POR VÍRGULA, e não um input de tags: a casa NÃO TEM um — o
       `FornecedorFormDialog`, que também guarda `aliases`, nem os edita (só acrescenta o nome do
       duplicado ao fundir). Inventar um componente de tags aqui seria criar o primeiro, sem
       segundo consumidor para provar a forma. Quando houver, ele nasce em `ui/`. */
    setAliases((local?.aliases ?? []).join(', '));
    setObs(local?.observacoes ?? '');
    setAtivo(local?.ativo ?? true);

    const c = local?.contrato ?? null;
    setCIni(c?.vigencia_inicio?.slice(0, 10) ?? '');
    setCFim(c?.vigencia_fim?.slice(0, 10) ?? '');
    setCQuebra(c?.quebra_tecnica_tipo ?? 'nenhuma');
    setCPct(c?.quebra_tecnica_pct == null ? '' : String(c.quebra_tecnica_pct).replace('.', ','));
    setCBase(c?.quebra_tecnica_base ?? '');
    setCTaxa(c?.taxa_armazenagem_valor == null ? '' : String(c.taxa_armazenagem_valor).replace('.', ','));
    setCUnidade(c?.taxa_armazenagem_unidade ?? '');
    setCDoc(c?.documento_ref ?? '');
    setCObs(c?.observacoes ?? '');
  }, [aberto, local]);

  const editando = !!local;
  const temAbas = editando && tipo === 'terceiro';

  const trocarTipo = (t: string) => {
    setTipo(t);
    /* ⚠ LIMPA O VÍNCULO DO OUTRO LADO — ver o ⚠ do cabeçalho: o CHECK do banco é exclusivo. */
    if (t === 'proprio') setFornecedorId('');
    else setFazendaId('');
  };

  const impedimento = !nome.trim() ? 'Informe o nome do local.'
    : tipo === 'proprio' && !fazendaId ? 'Escolha a fazenda do galpão.'
      : tipo === 'terceiro' && !fornecedorId ? 'Escolha a cooperativa ou armazém.'
        : null;

  const salvarLocal = () => {
    if (impedimento) return;
    onSalvarLocal({
      id: local?.id ?? null,
      nome: nome.trim(),
      tipo,
      fazenda_id: tipo === 'proprio' ? (fazendaId || null) : null,
      fornecedor_id: tipo === 'terceiro' ? (fornecedorId || null) : null,
      codigo_externo: codigo.trim() || null,
      /* ⚠ VAZIO VIRA `null`, NÃO `[]`: a coluna é nulável, e um array vazio diria "não tem
         apelido nenhum" quando o que houve foi não mexer no campo. */
      aliases: aliases.trim()
        ? aliases.split(',').map(a => a.trim()).filter(Boolean)
        : null,
      observacoes: obs.trim() || null,
      ativo,
    });
  };

  const impedimentoContrato = !cIni ? 'Informe o início da vigência.'
    : cQuebra === 'percentual_mes' && !cPct ? 'Informe o percentual ao mês.'
      : cQuebra === 'percentual_mes' && !cBase ? 'Escolha a base do percentual.'
        : null;

  const salvarContrato = () => {
    if (impedimentoContrato || !local) return;
    onSalvarContrato({
      id: local.contrato?.id ?? null,
      local_id: local.id,
      vigencia_inicio: cIni,
      vigencia_fim: cFim || null,
      quebra_tecnica_tipo: cQuebra,
      /* ⚠ `parseMoeda`, NUNCA `Number`: o campo guarda texto pt-BR — "0,25" com `Number` é NaN. */
      quebra_tecnica_pct: cQuebra === 'percentual_mes' ? (parseMoeda(cPct) ?? null) : null,
      quebra_tecnica_base: cQuebra === 'percentual_mes' ? (cBase || null) : null,
      taxa_valor: cTaxa ? (parseMoeda(cTaxa) ?? null) : null,
      taxa_unidade: cTaxa ? (cUnidade || null) : null,
      documento_ref: cDoc.trim() || null,
      observacoes: cObs.trim() || null,
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              {editando ? `Editar local · ${local?.nome}` : 'Novo local de estoque'}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              Próprio é um galpão ou silo numa fazenda sua. Terceiro é uma cooperativa ou armazém
              geral que guarda o grão por você.
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ⚠ ABAS-PASTA: a ativa é clara e SEM borda inferior, para ela se ler como a pasta da
            frente. Só aparecem no editar de terceiro — ver o ⚠ do cabeçalho. */}
        {temAbas && (
          <div className="flex gap-1 border-b bg-muted/30 px-3 pt-1.5">
            {([['local', 'Local'], ['contrato', 'Contrato de armazenagem']] as const).map(([id, rot]) => (
              <button key={id} type="button" onClick={() => setAba(id)}
                className={cn('rounded-t px-3 py-1 text-[11px] font-medium',
                  aba === id ? 'border border-b-0 bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-background/60')}>
                {rot}
              </button>
            ))}
          </div>
        )}

        {/* ⚠ `min-w-0` — `DialogContent` é um grid, e item de grid não encolhe abaixo do conteúdo.
            Foi isso que clipou os ícones do histórico de movimentações (df1b32a0). */}
        <div className="min-w-0 space-y-2 px-3 py-2">
          {aba === 'local' ? (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Nome <span className="text-destructive">*</span></Label>
                  <Input value={nome} onChange={e => setNome(e.target.value)}
                    placeholder="Galpão Sede, Coop Parapuã - 0136…"
                    className="mt-0.5 h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Tipo <span className="text-destructive">*</span></Label>
                  {/* ⚠ TOGGLE, NÃO `select` — o mesmo do À vista/A prazo da venda: são duas opções
                      e a escolha muda o campo de baixo. `flex w-fit`, nunca `inline-flex`, senão o
                      rótulo divide a linha com ele (a5b1fc58). */}
                  <div className="mt-0.5 flex h-8 w-fit overflow-hidden rounded-md border">
                    {TIPOS_LOCAL.map(t => (
                      <button key={t.valor} type="button" onClick={() => trocarTipo(t.valor)}
                        className={cn('px-3 text-[11px] font-medium transition-colors',
                          tipo === t.valor ? 'bg-primary text-primary-foreground'
                            : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                        {t.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {/* A CÉLULA DO VÍNCULO — existe nos dois tipos, só troca o controle. */}
                <div>
                  <Label className="text-[10px]">
                    {tipo === 'proprio' ? 'Fazenda' : 'Cooperativa / armazém'}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="mt-0.5">
                    {tipo === 'proprio' ? (
                      /* ⚠ `forcaAdministrativo={false}` É OBRIGATÓRIO na assinatura, não opcional:
                         ele existe para lançamentos administrativos, que se prendem à fazenda
                         Administrativo. Um galpão de grão é operacional — forçá-lo ali poria o
                         estoque numa fazenda que não planta.
                         ⚠ `hideAviso` PELO MESMO MOTIVO: o aviso que o componente mostra fala do
                         escopo administrativo, e aqui ele confundiria. */
                      <FazendaSelect value={fazendaId} onChange={setFazendaId}
                        fazendas={fazendas} forcaAdministrativo={false}
                        triggerClassName="h-8 text-[12px]" hideAviso />
                    ) : (
                      /* ⚠ `label=""` — `FornecedorSelect` tem `label = 'Fornecedor'` por DEFAULT, e
                         o rótulo desta célula é o de cima. Dois rótulos empilhados foi o defeito
                         que o a5b1fc58 corrigiu no modal de venda. */
                      <FornecedorSelect fornecedorId={fornecedorId || null}
                        onFornecedorChange={id => setFornecedorId(id ?? '')}
                        clienteId={clienteId} label="" placeholder="Escolha" />
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Filial / código externo</Label>
                  <Input value={codigo} onChange={e => setCodigo(e.target.value)}
                    disabled={tipo === 'proprio'}
                    placeholder={tipo === 'proprio' ? 'Só para terceiro' : '0136'}
                    className="mt-0.5 h-8 text-[12px]" />
                </div>
              </div>

              <div>
                <Label className="text-[10px]">Apelidos</Label>
                <Input value={aliases} onChange={e => setAliases(e.target.value)}
                  placeholder="0136, 0136 - Bataguassu — separados por vírgula"
                  className="mt-0.5 h-8 text-[12px]" />
                {/* ⚠ O QUE OS APELIDOS FAZEM fica escrito, porque o campo não se explica sozinho:
                    é por eles que o romaneio da coop vai casar com este cadastro no EL-02. */}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Como o armazém escreve esta filial no romaneio e no extrato.
                </p>
              </div>

              <div>
                <Label className="text-[10px]">Observações</Label>
                <Input value={obs} onChange={e => setObs(e.target.value)}
                  placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" />
              </div>

              {editando && (
                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={ativo} onCheckedChange={setAtivo} id="local-ativo" />
                  <Label htmlFor="local-ativo" className="text-[11px]">
                    Ativo
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      — desativado some dos seletores e libera o nome para outro local.
                    </span>
                  </Label>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Vigência início <span className="text-destructive">*</span></Label>
                  <DatePicker value={cIni} onChange={setCIni} className="mt-0.5" />
                </div>
                <div>
                  <Label className="text-[10px]">Vigência fim</Label>
                  <DatePicker value={cFim} onChange={setCFim} className="mt-0.5" />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Vazio = contrato vigente.</p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Quebra técnica <span className="text-destructive">*</span></Label>
                  <Select value={cQuebra} onValueChange={setCQuebra}>
                    <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUEBRA_TIPOS.map(q => (
                        <SelectItem key={q.valor} value={q.valor} className="text-[12px]">{q.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* ⚠ A CÉLULA AO LADO MUDA DE CONTEÚDO, NÃO DE EXISTÊNCIA (A23): percentual mostra
                    dois campos, tabela mostra o aviso, "nenhuma" fica vazia. */}
                <div>
                  {cQuebra === 'percentual_mes' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">% ao mês <span className="text-destructive">*</span></Label>
                        <CampoNumero valor={cPct} onChange={setCPct} className="mt-0.5 h-8 text-[12px]" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Base <span className="text-destructive">*</span></Label>
                        <Select value={cBase} onValueChange={setCBase}>
                          <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                            <SelectValue placeholder="Escolha" />
                          </SelectTrigger>
                          <SelectContent>
                            {QUEBRA_BASES.map(b => (
                              <SelectItem key={b.valor} value={b.valor} className="text-[12px]">{b.rotulo}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : cQuebra === 'tabela' ? (
                    <>
                      <Label className="text-[10px]">&nbsp;</Label>
                      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                        A tabela do armazém entra na frente do extrato de depósito (EL-06).
                      </p>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Taxa de armazenagem</Label>
                  <CampoNumero valor={cTaxa} onChange={setCTaxa} className="mt-0.5 h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Unidade</Label>
                  <Select value={cUnidade} onValueChange={setCUnidade} disabled={!cTaxa}>
                    <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                      <SelectValue placeholder={cTaxa ? 'Escolha' : 'Informe a taxa primeiro'} />
                    </SelectTrigger>
                    <SelectContent>
                      {TAXA_UNIDADES.map(u => (
                        <SelectItem key={u.valor} value={u.valor} className="text-[12px]">{u.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Documento / referência</Label>
                  <Input value={cDoc} onChange={e => setCDoc(e.target.value)}
                    placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Observações</Label>
                  <Input value={cObs} onChange={e => setCObs(e.target.value)}
                    placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
          <span className="text-[11px]">
            {aba === 'local'
              ? (editando ? 'Editando um local já cadastrado.' : 'Um local novo nasce ativo.')
              : 'O contrato vale para este local a partir do início da vigência.'}
          </span>
          <div className="flex-1" />
          {(aba === 'local' ? impedimento : impedimentoContrato) && (
            <span className="w-full text-[10px] text-primary-foreground/80 md:w-auto">
              {aba === 'local' ? impedimento : impedimentoContrato}
            </span>
          )}
          <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
            disabled={!!(aba === 'local' ? impedimento : impedimentoContrato) || salvando}
            title={(aba === 'local' ? impedimento : impedimentoContrato) ?? 'Gravar'}
            onClick={aba === 'local' ? salvarLocal : salvarContrato}>
            <Save className="h-3.5 w-3.5" /> {aba === 'local' ? 'Salvar' : 'Salvar contrato'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
