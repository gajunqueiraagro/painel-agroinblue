/**
 * FORN-CADASTRO-02 (Gabriel 18/10/2026, mock "Cadastro de Fornecedor") — o cadastro de fornecedor completo (criar e editar).
 *
 *  · modal de TAMANHO FIXO (900 × 400, limitado pela janela; o mock pedia 390 — medido): cabeçalho navy "Editar fornecedor · <RAZÃO SOCIAL>" / "Novo fornecedor";
 *    abas no Segmentado da casa (ponto laranja na aba com pendência): Dados gerais · Endereço e contato · Pagamento · Padrões · Uso;
 *    resumo lateral fixo de 272px ("Resumo do fornecedor" + "O que falta"), que some abaixo de 760px; rodapé fixo com
 *    "Cadastrado em … · N lançamentos · N compras parceladas" e Cancelar · Salvar fornecedor.
 *  · `nome` é a RAZÃO SOCIAL. Reusadas: forma preferida = `tipo_recebimento`, titular = `nome_favorecido`, documento do titular =
 *    `cpf_cnpj_pagamento`. As regras moram em `src/lib/fornecedores/cadastroDoFornecedor.ts` (puro).
 *  · DOCUMENTO DUPLICADO NO MESMO CLIENTE NÃO BLOQUEIA (há legado): o aviso "Este CNPJ também está cadastrado como X" fica escrito na
 *    aba Dados gerais, com "Mesclar" (a ferramenta do FORN-MESCLAR-01, aberta já com o par). Nome repetido na edição segue avisando
 *    no Salvar ("Salvar mesmo assim"); na criação, o nome de um ativo recusa e o de um inativo oferece reativar, como antes.
 *  · Consultar CNPJ / CEP: SEM ROTA EXTERNA PERMITIDA (FASE 0, 18/10: nenhuma edge function de consulta) — os botões NÃO aparecem.
 *  · Edição: a linha INTEIRA é relida do banco ao abrir (o lápis do seletor entrega só as colunas do leitor); o Salvar espera essa
 *    leitura para nunca gravar vazio por cima de um campo que a tela não leu.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BlocoFormulario, CORPO_FORMULARIO, Rotulo } from '@/components/ui/bloco-formulario';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';
import { notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import { mascararAoDigitar, situacaoDoGravado, validarDocumento } from '@/lib/fornecedores/documentoFiscal';
import {
  acharRepetidos, fraseDosRepetidos, lerCadastroParaConferir, temRepetido, FRASE_FALHA_AO_CONFERIR_REPETIDO,
  type FornecedorParaConferir,
} from '@/lib/fornecedores/repetidosDoCadastro';
import {
  BANCOS, FORMAS_PREFERIDAS, VAZIO, abasComPendencia, dadosDaLinha, oQueFalta, payloadDoFornecedor, rotuloDaForma,
  type AbaDoFornecedor, type DadosDoFornecedor,
} from '@/lib/fornecedores/cadastroDoFornecedor';
import { loadContasDoPlanoDoCliente } from '@/lib/financeiro/planoContasBuilder';
import { formatarDocumento } from '@/lib/fornecedores/fornecedorTexto';

export const MOTIVO_MESCLAR_TRAVADO = 'Mesclar agora mora em Cadastros › Fornecedores › "Mesclar fornecedores": move todas as referências e pode ser desfeita.';
const SEM = '__nenhum__';
/* a régua deste modal: campos de 26px (o mock pede 26–28; com 28 a aba Endereço e contato passava 14px da altura fixa — medido) */
const CAMPO = 'h-[26px] text-[11px]';

interface Fornecedor {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string | null;
  ativo: boolean;
}
interface Fazenda { id: string; nome: string }
export interface UsoDoFornecedor { cadastradoEm: string | null; lancamentos: number; comprasParceladas: number; documentos: number; ultimoLancamento: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Fornecedor | null;
  allFornecedores: Fornecedor[];
  fazendas: Fazenda[];
  clienteId: string;
  onSaved: () => void;
  onSelectExisting?: (fornecedor: Fornecedor) => void;
  /** o "Mesclar" do duplicado: quem hospeda abre a ferramenta do FORN-MESCLAR-01 já com o par (sem a prop, o botão não aparece).
   *  O cadastro não importa a ferramenta: ela usa o seletor de fornecedor, que abre este cadastro (fecharia um ciclo de import). */
  onMesclar?: (manter: string, absorver: string) => void;
  /** só para teste: quem lê o cadastro para a conferência de repetido (padrão: o banco) */
  lerCadastro?: (clienteId: string, nome: string) => Promise<FornecedorParaConferir[]>;
  /** só para teste: a linha inteira na edição e o uso (padrão: o banco) */
  lerLinha?: (id: string) => Promise<Record<string, unknown> | null>;
  lerUso?: (id: string) => Promise<UsoDoFornecedor | null>;
}

async function lerLinhaDoBanco(id: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from('financeiro_fornecedores').select('*').eq('id', id).maybeSingle();
  return data && typeof data === 'object' && !Array.isArray(data) ? Object.fromEntries(Object.entries(data)) : null;
}
async function lerUsoDoBanco(id: string): Promise<UsoDoFornecedor | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_uso', { p_fornecedor: id });
  if (error || !data || typeof data !== 'object') return null;
  const o: Record<string, unknown> = Object.fromEntries(Object.entries(data));
  const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  const t = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return { cadastradoEm: t(o.cadastrado_em), lancamentos: n(o.lancamentos), comprasParceladas: n(o.compras_parceladas), documentos: n(o.documentos), ultimoLancamento: t(o.ultimo_lancamento) };
}
const dataBr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const ABAS: { valor: AbaDoFornecedor; rotulo: string }[] = [
  { valor: 'dados', rotulo: 'Dados gerais' }, { valor: 'endereco', rotulo: 'Endereço e contato' }, { valor: 'pagamento', rotulo: 'Pagamento' },
  { valor: 'padroes', rotulo: 'Padrões' }, { valor: 'uso', rotulo: 'Uso' },
];
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

/** um campo de texto com o rótulo da régua (10px, sentence case) */
function Campo({ rotulo, obrig, valor, onChange, placeholder, testId, className, invalido, maxLength }: {
  rotulo: string; obrig?: boolean; valor: string; onChange: (v: string) => void; placeholder?: string; testId?: string; className?: string; invalido?: boolean; maxLength?: number;
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <Rotulo texto={rotulo} obrig={obrig} />
      <Input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} maxLength={maxLength} title={valor || undefined}
        aria-invalid={invalido || undefined} className={`${CAMPO} ${invalido ? 'border-destructive' : ''}`} />
    </div>
  );
}

export function FornecedorFormDialog({
  open, onClose, editing, allFornecedores, fazendas, clienteId, onSaved, onSelectExisting, onMesclar,
  lerCadastro = lerCadastroParaConferir, lerLinha = lerLinhaDoBanco, lerUso = lerUsoDoBanco,
}: Props) {
  const [d, setD] = useState<DadosDoFornecedor>(VAZIO);
  const [aba, setAba] = useState<AbaDoFornecedor>('dados');
  const [linhaLida, setLinhaLida] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docTocado, setDocTocado] = useState(false);
  const [recado, setRecado] = useState<{ texto: string; tom: 'aviso' | 'erro' } | null>(null);
  const [reativarTarget, setReativarTarget] = useState<Fornecedor | null>(null);
  const [reativando, setReativando] = useState(false);
  const [uso, setUso] = useState<UsoDoFornecedor | null>(null);
  const [cadastro, setCadastro] = useState<FornecedorParaConferir[] | null>(null);
  const [planos, setPlanos] = useState<{ value: string; label: string }[]>([]);
  const [excluindo, setExcluindo] = useState(false);
  const set = <K extends keyof DadosDoFornecedor>(k: K, v: DadosDoFornecedor[K]) => { setD((x) => ({ ...x, [k]: v })); setRecado(null); };

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setAba('dados'); setRecado(null); setDocTocado(false); setUso(null); setCadastro(null);
    if (editing) {
      setD(dadosDaLinha(Object.fromEntries(Object.entries(editing)))); setLinhaLida(false);
      void lerLinha(editing.id).then((l) => { if (!vivo) return; if (l) setD(dadosDaLinha(l)); setLinhaLida(true); });
      void lerUso(editing.id).then((u) => { if (vivo) setUso(u); });
    } else { setD(VAZIO); setLinhaLida(true); }
    void lerCadastro(clienteId, editing?.nome ?? '').then((c) => { if (vivo) setCadastro(c); }).catch(() => { if (vivo) setCadastro([]); });
    void loadContasDoPlanoDoCliente(clienteId).then((cs) => {
      if (vivo) setPlanos(cs.filter((c) => c.subcentro).map((c) => ({ value: c.id, label: `${c.subcentro} · ${c.centro_custo}` })));
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, [open, editing, clienteId, lerLinha, lerUso, lerCadastro]);

  /* FORN-EDITAR-01 — o documento pelo validador único; o gravado fora do padrão abre como está */
  const validado = validarDocumento(d.cpf_cnpj);
  const gravado = editing ? situacaoDoGravado(typeof editing.cpf_cnpj === 'string' ? editing.cpf_cnpj : null) : null;
  const legadoIntocado = !docTocado && gravado?.situacao === 'fora_do_padrao';
  const documentoBloqueia = !validado.valido && !legadoIntocado;
  const documentoParaGravar: string | null = validado.valido ? (validado.formatado || null) : (d.cpf_cnpj.trim() || null);
  const recadoDoDocumento: { texto: string; tom: 'erro' | 'aviso' } | null = documentoBloqueia
    ? { texto: validado.motivo ?? '', tom: 'erro' }
    : legadoIntocado ? { texto: `Fora do padrão · ${gravado?.motivo ?? ''}${validado.valido && validado.formatado ? ` Ao salvar, grava ${validado.formatado}.` : ''}`, tom: 'aviso' }
    : null;
  /* documento duplicado no mesmo cliente: AVISO, não bloqueia */
  const duplicados = useMemo(() => (cadastro && documentoParaGravar
    ? acharRepetidos({ proprioId: editing?.id ?? null, nome: d.nome, cpfCnpj: documentoParaGravar, conferirNome: false }, cadastro).porDocumento : []),
  [cadastro, documentoParaGravar, editing?.id, d.nome]);
  const dup = duplicados[0] ?? null;
  const faltas = oQueFalta(d, { documentoInvalido: documentoBloqueia, duplicadoCom: dup ? dup.nome : null });
  const pendentes = abasComPendencia(faltas);

  const save = useCallback(async (forcar = false) => {
    if (saving || documentoBloqueia || !linhaLida) return;
    if (!clienteId || !d.nome.trim()) { setRecado({ texto: 'Informe a razão social.', tom: 'erro' }); setAba('dados'); return; }
    if (!editing) {
      /* sem índice único de nome no banco (FORN-NOME-UNICO-BANCO-01): esta é a barreira; inativo oferece reativar */
      const normalizado = normalizeFornecedorNome(d.nome);
      const colidindo = allFornecedores.find((f) => normalizeFornecedorNome(f.nome) === normalizado);
      if (colidindo) {
        if (colidindo.ativo) { setRecado({ texto: `Já existe fornecedor ativo "${colidindo.nome}". Selecione-o em vez de criar um novo.`, tom: 'erro' }); return; }
        setReativarTarget(colidindo); return;
      }
    }
    setSaving(true);
    /* nome repetido na edição: avisa no Salvar (o documento duplicado já está escrito na aba, e não bloqueia) */
    if (!forcar && editing) {
      let doCliente: FornecedorParaConferir[];
      try { doCliente = await lerCadastro(clienteId, d.nome); } catch { setRecado({ texto: FRASE_FALHA_AO_CONFERIR_REPETIDO, tom: 'erro' }); setSaving(false); return; }
      const repetidos = acharRepetidos({ proprioId: editing.id, nome: d.nome, cpfCnpj: null, conferirNome: true }, doCliente);
      if (temRepetido(repetidos)) { setRecado({ texto: fraseDosRepetidos(repetidos), tom: 'aviso' }); setSaving(false); return; }
    }
    const payload = { cliente_id: clienteId, ...payloadDoFornecedor(d, documentoParaGravar) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o payload é montado pelo dono puro (`payloadDoFornecedor`)
    const tabela = supabase.from('financeiro_fornecedores') as any;
    const { error } = editing ? await tabela.update(payload).eq('id', editing.id) : await tabela.insert(payload);
    setSaving(false);
    if (error) { setRecado({ texto: `Não foi possível gravar: ${error.message}`, tom: 'erro' }); return; }
    toast.success(editing ? 'Fornecedor atualizado' : 'Fornecedor criado');
    notificarFornecedoresMudaram(clienteId);
    onClose(); onSaved();
  }, [saving, documentoBloqueia, linhaLida, clienteId, d, editing, allFornecedores, lerCadastro, documentoParaGravar, onClose, onSaved]);

  const reativarExistente = useCallback(async () => {
    if (!reativarTarget) return;
    setReativando(true);
    const { error } = await supabase.from('financeiro_fornecedores').update({ ativo: true }).eq('id', reativarTarget.id);
    setReativando(false);
    if (error) { setRecado({ texto: `Não foi possível reativar: ${error.message}`, tom: 'erro' }); return; }
    toast.success(`Fornecedor "${reativarTarget.nome}" reativado`);
    setReativarTarget(null);
    notificarFornecedoresMudaram(clienteId);
    onClose(); onSaved();
  }, [reativarTarget, onClose, onSaved, clienteId]);

  const excluir = async () => {
    if (!editing) return;
    setExcluindo(true);
    const { error } = await supabase.from('financeiro_fornecedores').delete().eq('id', editing.id);
    setExcluindo(false);
    if (error) { setRecado({ texto: 'Não foi possível excluir.', tom: 'erro' }); return; }
    toast.success('Fornecedor excluído');
    notificarFornecedoresMudaram(clienteId);
    onClose(); onSaved();
  };

  const titulo = editing ? `Editar fornecedor · ${d.nome || editing.nome}` : 'Novo fornecedor';
  const fazendaNome = fazendas.find((f) => f.id === d.fazenda_id)?.nome ?? null;
  const planoNome = planos.find((p) => p.value === d.plano_padrao_id)?.label ?? null;
  const bancosOpcoes = useMemo(() => {
    const lista = BANCOS.map((b) => ({ value: b, label: b }));
    return d.banco && !BANCOS.includes(d.banco) ? [{ value: d.banco, label: d.banco }, ...lista] : lista;
  }, [d.banco]);
  const formas = FORMAS_PREFERIDAS.some((f) => f.valor === d.tipo_recebimento) || !d.tipo_recebimento
    ? FORMAS_PREFERIDAS : [...FORMAS_PREFERIDAS, { valor: d.tipo_recebimento, rotulo: d.tipo_recebimento }];
  const cidade = [d.municipio, d.uf].filter(Boolean).join(' / ');
  const pagamento = d.tipo_recebimento === 'PIX' ? `Pix${d.pix_chave ? ` · ${d.pix_chave}` : ''}`
    : d.tipo_recebimento ? [rotuloDaForma(d.tipo_recebimento), d.banco, d.agencia && `ag ${d.agencia}`, d.conta && `cc ${d.conta}`].filter(Boolean).join(' · ') : '';
  const RESUMO: [string, string][] = [
    ['Razão social', d.nome], ['Fantasia', d.nome_fantasia], [d.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ', d.cpf_cnpj], ['IE', d.inscricao_estadual],
    ['Cidade', cidade], ['Telefone', d.telefone || d.celular], ['Pagamento', pagamento], ['Subcentro', planoNome ?? ''],
  ];
  const rodapeUso = editing
    ? (uso ? `Cadastrado em ${dataBr(uso.cadastradoEm)} · ${uso.lancamentos} ${uso.lancamentos === 1 ? 'lançamento' : 'lançamentos'} · ${uso.comprasParceladas} ${uso.comprasParceladas === 1 ? 'compra parcelada' : 'compras parceladas'}` : '…')
    : 'Novo cadastro';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex h-[min(400px,calc(100dvh-16px))] w-[min(900px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0"
        data-testid="cadastro-do-fornecedor">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[12px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Cadastro de fornecedor: dados gerais, endereço e contato, pagamento, padrões e uso.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[32px] shrink-0 items-center px-2" data-testid="abas-do-fornecedor">
              <Segmentado<AbaDoFornecedor> altura={22} valor={aba} onEscolher={setAba} opcoes={ABAS.map((a) => ({
                valor: a.valor, rotulo: (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap" data-testid={`aba-${a.valor}`}>{a.rotulo}
                    {pendentes.has(a.valor) && <span className="size-1.5 rounded-full bg-[#b45309]" data-testid={`pendencia-${a.valor}`} title="há o que preencher nesta aba" />}
                  </span>),
              }))} />
            </div>
            <div className={`min-h-0 flex-1 overflow-hidden ${CORPO_FORMULARIO}`} data-testid="corpo-do-fornecedor">
              {aba === 'dados' && (
                <BlocoFormulario titulo="Identificação" testId="bloco-identificacao" className="gap-1">
                  <div className="grid grid-cols-[96px_200px_minmax(0,1fr)] items-start gap-2">
                    <div>
                      <Rotulo texto="Tipo" />
                      <Segmentado<'PJ' | 'PF'> altura={26} valor={d.tipo_pessoa || (validado.tipo === 'cpf' ? 'PF' : 'PJ')} onEscolher={(v) => set('tipo_pessoa', v)}
                        opcoes={[{ valor: 'PJ', rotulo: 'PJ' }, { valor: 'PF', rotulo: 'PF' }]} />
                    </div>
                    <div className="min-w-0">
                      <Rotulo texto={d.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ/CPF'} obrig />
                      <Input value={d.cpf_cnpj} onChange={(e) => { set('cpf_cnpj', mascararAoDigitar(e.target.value)); setDocTocado(true); }}
                        className={`${CAMPO} tabular-nums ${documentoBloqueia ? 'border-destructive' : ''}`} placeholder="000.000.000-00 ou 00.000.000/0000-00"
                        aria-invalid={documentoBloqueia || undefined} />
                      <div data-testid="cpf-cnpj-recado" title={recadoDoDocumento?.texto || undefined}
                        className={`h-[14px] truncate text-[10px] leading-[14px] ${recadoDoDocumento?.tom === 'erro' ? 'text-destructive' : 'text-[#b45309]'}`}>
                        {recadoDoDocumento?.texto ?? ''}
                      </div>
                    </div>
                    {/* lugar do aviso de duplicado: existe sempre (18px); com duplicado, a frase e o gesto */}
                    <div className="flex h-[41px] min-w-0 items-end pb-[15px]" data-testid="lugar-do-duplicado">
                      {dup && (
                        <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-[#b45309]" data-testid="duplicado-do-documento">
                          <span className="min-w-0 truncate" title={`Este ${validado.tipo === 'cpf' ? 'CPF' : 'CNPJ'} também está cadastrado como ${dup.nome}${dup.ativo ? '' : ' (inativo)'}`}>
                            Este {validado.tipo === 'cpf' ? 'CPF' : 'CNPJ'} também está cadastrado como {dup.nome}{dup.ativo ? '' : ' (inativo)'}
                          </span>
                          {editing && onMesclar && <Button variant="outline" size="sm" className="h-[22px] shrink-0 px-2 text-[10.5px]" onClick={() => { onMesclar(editing.id, dup.id); onClose(); }} data-testid="mesclar-duplicado">Mesclar</Button>}
                          {!editing && onSelectExisting && (
                            <Button variant="outline" size="sm" className="h-[22px] shrink-0 px-2 text-[10.5px]" data-testid="usar-duplicado"
                              onClick={() => { const f = allFornecedores.find((x) => x.id === dup.id); onSelectExisting(f ?? { id: dup.id, nome: dup.nome, cpf_cnpj: dup.cpf_cnpj, fazenda_id: null, ativo: dup.ativo }); onClose(); }}>Usar este</Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
                    <Campo rotulo="Razão social" obrig valor={d.nome} onChange={(v) => set('nome', v)} placeholder="Razão social" testId="campo-razao-social" />
                    <div>
                      <Rotulo texto="Situação" />
                      <Segmentado<'ativo' | 'inativo'> altura={26} valor={d.ativo ? 'ativo' : 'inativo'} onEscolher={(v) => set('ativo', v === 'ativo')}
                        opcoes={[{ valor: 'ativo', rotulo: 'Ativo' }, { valor: 'inativo', rotulo: 'Inativo' }]} />
                    </div>
                  </div>
                  <Campo rotulo="Nome fantasia" valor={d.nome_fantasia} onChange={(v) => set('nome_fantasia', v)} placeholder="Como aparece na nota" testId="campo-fantasia" />
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="Inscrição estadual" valor={d.inscricao_estadual} onChange={(v) => set('inscricao_estadual', v)} />
                    <Campo rotulo="Inscrição municipal" valor={d.inscricao_municipal} onChange={(v) => set('inscricao_municipal', v)} />
                  </div>
                </BlocoFormulario>
              )}
              {aba === 'endereco' && (<>
                <BlocoFormulario titulo="Endereço" testId="bloco-endereco" className="gap-1">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)_80px] gap-2">
                    <Campo rotulo="CEP" valor={d.cep} onChange={(v) => set('cep', v)} placeholder="00000-000" maxLength={9} />
                    <Campo rotulo="Logradouro" valor={d.logradouro} onChange={(v) => set('logradouro', v)} />
                    <Campo rotulo="Número" valor={d.numero} onChange={(v) => set('numero', v)} />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_64px] gap-2">
                    <Campo rotulo="Complemento" valor={d.complemento} onChange={(v) => set('complemento', v)} />
                    <Campo rotulo="Bairro" valor={d.bairro} onChange={(v) => set('bairro', v)} />
                    <Campo rotulo="Município" valor={d.municipio} onChange={(v) => set('municipio', v)} />
                    <div className="min-w-0">
                      <Rotulo texto="UF" />
                      <Select value={d.uf || SEM} onValueChange={(v) => set('uf', v === SEM ? '' : v)}>
                        <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM}>—</SelectItem>
                          {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </BlocoFormulario>
                <BlocoFormulario titulo="Contato" testId="bloco-contato" className="gap-1">
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="E-mail" valor={d.email} onChange={(v) => set('email', v)} />
                    <Campo rotulo="Telefone" valor={d.telefone} onChange={(v) => set('telefone', v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="Pessoa de contato" valor={d.contato_nome} onChange={(v) => set('contato_nome', v)} testId="campo-contato" />
                    <Campo rotulo="Celular / WhatsApp" valor={d.celular} onChange={(v) => set('celular', v)} />
                  </div>
                </BlocoFormulario>
              </>)}
              {aba === 'pagamento' && (
                <BlocoFormulario titulo="Pagamento" testId="bloco-pagamento" className="gap-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_120px_minmax(0,1.6fr)] gap-2">
                    <div className="min-w-0">
                      <Rotulo texto="Forma preferida" />
                      <Segmentado<string> altura={26} valor={d.tipo_recebimento || SEM} onEscolher={(v) => set('tipo_recebimento', v === d.tipo_recebimento ? '' : v)}
                        opcoes={formas.map((f) => ({ valor: f.valor, rotulo: f.rotulo }))} />
                    </div>
                    <div className="min-w-0">
                      <Rotulo texto="Tipo de chave" />
                      <Select value={d.pix_tipo_chave || SEM} onValueChange={(v) => set('pix_tipo_chave', v === SEM ? '' : v)}>
                        <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM}>—</SelectItem>
                          {['CPF', 'CNPJ', 'Telefone', 'E-mail', 'Aleatória'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Campo rotulo="Chave Pix" valor={d.pix_chave} onChange={(v) => set('pix_chave', v)} />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1.6fr)_80px_110px_minmax(0,1fr)] gap-2">
                    <div className="min-w-0">
                      <Rotulo texto="Banco" />
                      <SearchableSelect value={d.banco} onValueChange={(v) => set('banco', v)} options={bancosOpcoes} semTodos placeholder="Buscar banco…" dense triggerClassName={CAMPO} />
                    </div>
                    <Campo rotulo="Agência" valor={d.agencia} onChange={(v) => set('agencia', v)} />
                    <Campo rotulo="Conta" valor={d.conta} onChange={(v) => set('conta', v)} />
                    <div className="min-w-0">
                      <Rotulo texto="Tipo de conta" />
                      <Select value={d.tipo_conta || SEM} onValueChange={(v) => set('tipo_conta', v === SEM ? '' : v)}>
                        <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM}>—</SelectItem>
                          {['Corrente', 'Poupança', 'Pagamento', 'Outro'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)] gap-2">
                    <Campo rotulo="Titular da conta" valor={d.nome_favorecido} onChange={(v) => set('nome_favorecido', v)} />
                    <Campo rotulo="CNPJ/CPF do titular" valor={d.cpf_cnpj_pagamento} onChange={(v) => set('cpf_cnpj_pagamento', mascararAoDigitar(v))} />
                    <Campo rotulo="Observação para pagamento" valor={d.observacao_pagamento} onChange={(v) => set('observacao_pagamento', v)} />
                  </div>
                </BlocoFormulario>
              )}
              {aba === 'padroes' && (
                <BlocoFormulario titulo="Padrões" dica="o que o lançamento novo deste fornecedor sugere" testId="bloco-padroes" className="gap-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <Rotulo texto="Fazenda" />
                      <SearchableSelect value={d.fazenda_id || SEM} onValueChange={(v) => set('fazenda_id', v === SEM ? '' : v)}
                        options={[{ value: SEM, label: '— Sem fazenda —' }, ...fazendas.map((f) => ({ value: f.id, label: f.nome }))]}
                        semTodos allValue={SEM} allLabel="— Sem fazenda —" placeholder="Buscar fazenda…" dense triggerClassName={CAMPO} />
                    </div>
                    <div className="min-w-0">
                      <Rotulo texto="Subcentro padrão" />
                      <SearchableSelect value={d.plano_padrao_id || SEM} onValueChange={(v) => set('plano_padrao_id', v === SEM ? '' : v)}
                        options={[{ value: SEM, label: '— nenhum —' }, ...planos]} semTodos allValue={SEM} allLabel="— nenhum —" placeholder="Buscar subcentro…" dense triggerClassName={CAMPO} />
                    </div>
                  </div>
                  <Campo rotulo="Observação" valor={d.observacao} onChange={(v) => set('observacao', v)} />
                </BlocoFormulario>
              )}
              {aba === 'uso' && (
                <BlocoFormulario titulo="Uso" dica="contagens do banco · só leitura" testId="bloco-uso" className="gap-1">
                  {!editing ? <p className="text-[11px] text-[#556070]">O fornecedor ainda não foi gravado.</p> : (
                    <div className="grid w-max grid-cols-[max-content_max-content] gap-x-[10px] text-[11px] leading-[20px]" data-testid="uso-do-fornecedor">
                      <span className="text-[#556070]">Lançamentos</span><span className="font-medium tabular-nums">{uso ? uso.lancamentos : '…'}</span>
                      <span className="text-[#556070]">Último lançamento</span><span className="font-medium tabular-nums">{uso ? dataBr(uso.ultimoLancamento) : '…'}</span>
                      <span className="text-[#556070]">Compras parceladas</span><span className="font-medium tabular-nums">{uso ? uso.comprasParceladas : '…'}</span>
                      <span className="text-[#556070]">Documentos</span><span className="font-medium tabular-nums">{uso ? uso.documentos : '…'}</span>
                      <span className="text-[#556070]">Cadastrado em</span><span className="font-medium tabular-nums">{uso ? dataBr(uso.cadastradoEm) : '…'}</span>
                    </div>
                  )}
                  {editing && uso && uso.lancamentos === 0 && uso.comprasParceladas === 0 && uso.documentos === 0 && (
                    <div className="pt-1">
                      <Button variant="outline" size="sm" className="h-[24px] px-2 text-[10.5px] text-destructive" disabled={excluindo} onClick={() => void excluir()} data-testid="excluir-fornecedor"
                        title="Sem lançamento, compra ou documento: pode ser excluído (não se desfaz). Com uso, inative pela Situação em Dados gerais.">Excluir fornecedor</Button>
                    </div>
                  )}
                </BlocoFormulario>
              )}
            </div>
          </div>
          {/* RESUMO LATERAL (272px): rótulo da largura do maior e o valor colado; some abaixo de 760px */}
          <aside className="hidden w-[272px] shrink-0 flex-col border-l border-[#d3dae3] bg-[#f4f6f9] px-3 py-2 min-[760px]:flex" data-testid="resumo-do-fornecedor">
            <h3 className="mb-1.5 text-[11px] font-semibold text-[#111827]">Resumo do fornecedor</h3>
            <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-[10px] text-[10.5px] leading-[17px]" data-testid="pares-do-resumo">
              {RESUMO.map(([r, v]) => (
                <div key={r} className="contents">
                  <span className="whitespace-nowrap text-[#556070]">{r}</span>
                  <span className={`min-w-0 truncate font-medium ${v ? 'text-[#111827]' : 'text-[#94a3b8]'}`} title={v || undefined}>{v ? (r === 'CNPJ' || r === 'CPF' ? formatarDocumento(v) || v : v) : '—'}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-[#e3e8ee] pt-1.5" data-testid="o-que-falta">
              <div className="text-[10.5px] font-semibold text-[#b45309]">{faltas.length ? 'O que falta' : 'Nada pendente'}</div>
              {faltas.slice(0, 5).map((f) => (
                <button key={f.texto} type="button" className="block w-full truncate text-left text-[10.5px] leading-[16px] text-[#b45309] hover:underline" title={f.texto}
                  onClick={() => setAba(f.aba)} data-testid="falta">· {f.texto}</button>
              ))}
            </div>
          </aside>
        </div>
        <div className="flex h-[44px] shrink-0 items-center gap-2 border-t border-[#d3dae3] px-3">
          <span className="shrink-0 whitespace-nowrap text-[10.5px] text-[#556070] tabular-nums" data-testid="rodape-uso">{rodapeUso}</span>
          {/* lugar RESERVADO (duas linhas) para o aviso de repetido e as recusas: nunca toast */}
          <div data-testid="fornecedor-recado" title={recado?.texto || undefined}
            className={`h-[30px] min-w-0 flex-1 overflow-hidden text-[10.5px] leading-[15px] ${recado?.tom === 'erro' ? 'text-destructive' : 'text-[#b45309]'}`}>
            {recado?.texto ?? ''}
          </div>
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="h-[26px] text-[11px]" onClick={() => void save(recado?.tom === 'aviso')} disabled={saving || documentoBloqueia || !linhaLida}
            title={documentoBloqueia ? (validado.motivo ?? undefined) : !linhaLida ? 'Lendo o cadastro…' : undefined} data-testid="salvar-fornecedor">
            {saving ? 'Salvando…' : recado?.tom === 'aviso' ? 'Salvar mesmo assim' : 'Salvar fornecedor'}
          </Button>
        </div>
      </DialogContent>
      <AlertDialog open={!!reativarTarget} onOpenChange={(v) => { if (!v) setReativarTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fornecedor inativo já cadastrado</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um fornecedor inativo com o nome <strong>"{reativarTarget?.nome}"</strong>.
              Em vez de criar uma duplicata, deseja reativá-lo? Os dados existentes serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reativando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reativarExistente} disabled={reativando}>{reativando ? 'Reativando...' : 'Reativar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
