import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Save, FileText, Share2, Pencil, Trash2, MapPin, Users, Building2, ShieldCheck, Landmark, Phone, Truck, Settings, DollarSign, LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import logoUrl from '@/assets/logo.png';
import { PastosTab } from './PastosTab';
import { FazendasList } from '@/components/FazendasList';
import { AcessosTab } from './AcessosTab';
import { ClientesTab } from './ClientesTab';
import { DividendosTab } from './DividendosTab';
import { useCliente } from '@/contexts/ClienteContext';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface CadastroData {
  id?: string;
  municipio: string;
  ie: string;
  proprietario_nome: string;
  cpf_cnpj: string;
  endereco: string;
  email: string;
  telefone: string;
  banco: string;
  pix: string;
  area_total: string;
  area_produtiva: string;
  inscricao_rural: string;
  roteiro: string;
}

const EMPTY: CadastroData = {
  municipio: '', ie: '', proprietario_nome: '', cpf_cnpj: '', endereco: '',
  email: '', telefone: '', banco: '', pix: '',
  area_total: '', area_produtiva: '', inscricao_rural: '', roteiro: '',
};

type ModuleKey = 'clientes' | 'fazendas' | 'dados' | 'contato' | 'bancario' | 'roteiro' | 'pastos' | 'acessos' | 'dividendos' | 'auditoria' | 'ajustes';

interface ModuleCard {
  key: ModuleKey;
  icon: LucideIcon;
  label: string;
  desc: string;
  adminOnly?: boolean;
  wide?: boolean;
}

const MODULES: ModuleCard[] = [
  { key: 'clientes', icon: Building2, label: 'Clientes', desc: 'Gerenciar clientes', adminOnly: true },
  { key: 'fazendas', icon: Building2, label: 'Fazendas', desc: 'Lista de fazendas' },
  { key: 'dados', icon: FileText, label: 'Dados da Fazenda', desc: 'Município, IE, área' },
  { key: 'contato', icon: Phone, label: 'Contato', desc: 'Endereço, email, telefone' },
  { key: 'bancario', icon: Landmark, label: 'Bancário', desc: 'Banco e PIX' },
  { key: 'roteiro', icon: Truck, label: 'Roteiro', desc: 'Roteiro de embarque' },
  { key: 'pastos', icon: MapPin, label: 'Pastos', desc: 'Cadastro de pastos', wide: true },
  { key: 'dividendos', icon: DollarSign, label: 'Dividendos', desc: 'Cadastro por cliente' },
  { key: 'acessos', icon: Users, label: 'Acessos', desc: 'Membros e permissões', wide: true },
  { key: 'auditoria', icon: ShieldCheck, label: 'Auditoria', desc: 'Log de ações' },
  { key: 'ajustes', icon: Settings, label: 'Ajustes Finais', desc: 'Telas legadas' },
];

// ---------------------------------------------------------------------------
// PDF helpers (kept from original)
// ---------------------------------------------------------------------------

function loadLogoBase64(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = logoUrl;
  });
}

const normalizePdfText = (value?: string) => {
  if (!value) return '—';
  const s = value.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim();
  return s || '—';
};

const preventOverflow = (value: string) => value.replace(/(\S{24})(?=\S)/g, '$1 ');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CadastrosTab({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { fazendaAtual } = useFazenda();
  const { isAdmin } = useCliente();
  const [data, setData] = useState<CadastroData>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<ModuleKey | null>(null);
  const [ativaNoMes, setAtivaNoMes] = useState(true);
  const [ativaLoading, setAtivaLoading] = useState(false);

  const anoMesAtual = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  useEffect(() => { loadLogoBase64().then(setLogoBase64).catch(() => setLogoBase64(null)); }, []);

  const load = useCallback(async () => {
    if (!fazendaAtual) return;
    setLoading(true);
    const { data: row } = await supabase
      .from('fazenda_cadastros')
      .select('*')
      .eq('fazenda_id', fazendaAtual.id)
      .maybeSingle();
    if (row) {
      setData({
        id: row.id,
        municipio: (row as any).municipio || '',
        ie: row.ie || '',
        proprietario_nome: row.proprietario_nome || '',
        cpf_cnpj: row.cpf_cnpj || '',
        endereco: row.endereco || '',
        email: row.email || '',
        telefone: row.telefone || '',
        banco: row.banco || '',
        pix: row.pix || '',
        area_total: row.area_total ? String(row.area_total) : '',
        area_produtiva: row.area_produtiva ? String(row.area_produtiva) : '',
        inscricao_rural: row.inscricao_rural || '',
        roteiro: row.roteiro || '',
      });
      setEditing(false);
    } else {
      setData(EMPTY);
      setEditing(true);
    }
    setLoading(false);
  }, [fazendaAtual]);

  useEffect(() => { load(); }, [load]);

  // ---- Ativa no mês ----
  const loadAtivaMes = useCallback(async () => {
    if (!fazendaAtual) return;
    const { data: row } = await supabase
      .from('fazenda_status_mensal')
      .select('ativa_no_mes')
      .eq('fazenda_id', fazendaAtual.id)
      .eq('ano_mes', anoMesAtual)
      .maybeSingle();
    setAtivaNoMes(row ? row.ativa_no_mes : true);
  }, [fazendaAtual, anoMesAtual]);

  useEffect(() => { loadAtivaMes(); }, [loadAtivaMes]);

  const toggleAtivaMes = async (checked: boolean) => {
    if (!fazendaAtual) return;
    setAtivaLoading(true);
    const { data: existing } = await supabase
      .from('fazenda_status_mensal')
      .select('id')
      .eq('fazenda_id', fazendaAtual.id)
      .eq('ano_mes', anoMesAtual)
      .maybeSingle();
    let error;
    if (existing) {
      ({ error } = await supabase.from('fazenda_status_mensal').update({ ativa_no_mes: checked }).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('fazenda_status_mensal').insert({
        fazenda_id: fazendaAtual.id,
        cliente_id: fazendaAtual.cliente_id,
        ano_mes: anoMesAtual,
        ativa_no_mes: checked,
      }));
    }
    if (error) { toast.error('Erro ao salvar status: ' + error.message); }
    else { setAtivaNoMes(checked); toast.success(checked ? 'Fazenda ativa no mês' : 'Fazenda inativa no mês'); }
    setAtivaLoading(false);
  };

  // ---- CRUD ----
  const handleSave = async () => {
    if (!fazendaAtual) return;
    setSaving(true);
    const payload = {
      fazenda_id: fazendaAtual.id,
      cliente_id: fazendaAtual.cliente_id,
      municipio: data.municipio || null,
      ie: data.ie || null,
      proprietario_nome: data.proprietario_nome || null,
      cpf_cnpj: data.cpf_cnpj || null,
      endereco: data.endereco || null,
      email: data.email || null,
      telefone: data.telefone || null,
      banco: data.banco || null,
      pix: data.pix || null,
      area_total: data.area_total ? Number(data.area_total) : null,
      area_produtiva: data.area_produtiva ? Number(data.area_produtiva) : null,
      inscricao_rural: data.inscricao_rural || null,
      roteiro: data.roteiro || null,
    };
    let error;
    if (data.id) {
      ({ error } = await supabase.from('fazenda_cadastros').update(payload).eq('id', data.id));
    } else {
      const res = await supabase.from('fazenda_cadastros').insert(payload).select().single();
      error = res.error;
      if (res.data) setData(prev => ({ ...prev, id: res.data.id }));
    }
    if (error) { toast.error('Erro ao salvar: ' + error.message); }
    else { toast.success('Cadastro salvo!'); setEditing(false); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!data.id) return;
    if (!confirm('Tem certeza que deseja apagar todos os dados de cadastro?')) return;
    const { error } = await supabase.from('fazenda_cadastros').delete().eq('id', data.id);
    if (error) { toast.error('Erro ao apagar: ' + error.message); }
    else { setData(EMPTY); setEditing(true); toast.success('Cadastro apagado!'); }
  };

  // ---- Field renderer ----
  const field = (label: string, key: keyof CadastroData, type = 'text', placeholder = '') => (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-semibold text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={data[key] || ''}
          onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder || label}
          className="h-7 text-xs"
        />
      ) : (
        <p className="text-xs font-medium text-foreground min-h-[28px] flex items-center px-2 py-1 rounded bg-muted/50">
          {data[key] || <span className="text-muted-foreground italic">—</span>}
        </p>
      )}
    </div>
  );

  // ---- PDF Export ----
  const downloadPdf = (doc: jsPDF, fileName: string) => {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    try {
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch { toast.error('Erro no download.'); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
  };

  const drawPdfHeader = (doc: jsPDF, title: string) => {
    const pageW = doc.internal.pageSize.getWidth();
    let y = 10;
    if (logoBase64) { doc.addImage(logoBase64, 'PNG', pageW / 2 - 14, y, 28, 14); y += 20; }
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(title, pageW / 2, y, { align: 'center' });
    return y + 12;
  };

  const drawRows = (doc: jsPDF, rows: [string, string | undefined][], startY: number, opts?: { preserveLineBreaks?: boolean }) => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = startY;
    rows.forEach(([label, raw]) => {
      const text = opts?.preserveLineBreaks
        ? (raw || '').split('\n').map(p => normalizePdfText(p)).filter(Boolean).join('\n') || '—'
        : normalizePdfText(raw);
      const wrapped = doc.splitTextToSize(preventOverflow(text), pageW - 78);
      const h = Math.max(6, wrapped.length * 6) + 2;
      if (y + h > pageH - 18) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, 18, y);
      doc.setFont('helvetica', 'normal'); doc.text(wrapped, 60, y);
      y += h;
    });
    return y;
  };

  const generateRoteiroPDF = () => {
    const doc = new jsPDF();
    let y = drawPdfHeader(doc, 'Roteiro para Embarque');
    doc.setFontSize(11);
    drawRows(doc, [
      ['Fazenda', fazendaAtual?.nome], ['Município', data.municipio],
      ['IE', data.ie], ['Proprietário', data.proprietario_nome], ['Roteiro', data.roteiro],
    ], y, { preserveLineBreaks: true });
    downloadPdf(doc, `roteiro_${fazendaAtual?.nome || 'fazenda'}.pdf`);
    toast.success('PDF exportado!');
  };

  const generateCadastroPDF = () => {
    const doc = new jsPDF();
    const y = drawPdfHeader(doc, 'Dados para Cadastro');
    doc.setFontSize(11);
    drawRows(doc, [
      ['Fazenda', fazendaAtual?.nome], ['Município', data.municipio],
      ['IE', data.ie], ['Proprietário', data.proprietario_nome],
      ['CPF/CNPJ', data.cpf_cnpj], ['Endereço', data.endereco],
      ['Email', data.email], ['Telefone', data.telefone],
    ], y);
    downloadPdf(doc, `cadastro_${fazendaAtual?.nome || 'fazenda'}.pdf`);
    toast.success('PDF exportado!');
  };

  const shareWhatsApp = (type: 'roteiro' | 'cadastro') => {
    const nome = fazendaAtual?.nome || '';
    const text = type === 'roteiro'
      ? `*Roteiro para Embarque*\n\n*Fazenda:* ${nome}\n*Município:* ${data.municipio || '—'}\n*IE:* ${data.ie || '—'}\n*Proprietário:* ${data.proprietario_nome || '—'}\n*Roteiro:* ${data.roteiro || '—'}`
      : `*Dados para Cadastro*\n\n*Fazenda:* ${nome}\n*Município:* ${data.municipio || '—'}\n*IE:* ${data.ie || '—'}\n*Proprietário:* ${data.proprietario_nome || '—'}\n*CPF/CNPJ:* ${data.cpf_cnpj || '—'}\n*Endereço:* ${data.endereco || '—'}\n*Email:* ${data.email || '—'}\n*Telefone:* ${data.telefone || '—'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // ---- Modal content renderers ----
  const renderModalContent = (key: ModuleKey) => {
    switch (key) {
      case 'clientes': return <ClientesTab />;
      case 'fazendas': return <FazendasList />;
      case 'dados': return (
        <div className="space-y-2">
          <div className="flex gap-1.5 justify-end">
            {!editing && data.id && (
              <>
                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(true)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>
                <Button variant="destructive" size="sm" className="h-6 text-[10px]" onClick={handleDelete}><Trash2 className="h-3 w-3 mr-1" /> Apagar</Button>
              </>
            )}
            {editing && (
              <Button size="sm" className="h-6 text-[10px]" onClick={handleSave} disabled={saving}>
                <Save className="h-3 w-3 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            )}
          </div>
          {field('Município', 'municipio')}
          {field('Inscrição Estadual (IE)', 'ie')}
          {field('Nome do Proprietário', 'proprietario_nome')}
          {field('CPF ou CNPJ', 'cpf_cnpj')}
          {field('Área Total (ha)', 'area_total', 'number', 'Hectares')}
          {field('Área Produtiva (ha)', 'area_produtiva', 'number', 'Hectares')}
          {field('Inscrição Rural (IR)', 'inscricao_rural')}
          <div className="border-t pt-2 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[10px] font-semibold text-muted-foreground">Ativa no mês ({anoMesAtual})</Label>
                <p className="text-[9px] text-muted-foreground">Fazendas inativas não entram no rateio ADM</p>
              </div>
              <Switch
                checked={ativaNoMes}
                onCheckedChange={toggleAtivaMes}
                disabled={ativaLoading}
              />
            </div>
          </div>
        </div>
      );
      case 'contato': return (
        <div className="space-y-2">
          <div className="flex gap-1.5 justify-end">
            {!editing && data.id && <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(true)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>}
            {editing && <Button size="sm" className="h-6 text-[10px]" onClick={handleSave} disabled={saving}><Save className="h-3 w-3 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}</Button>}
          </div>
          {field('Endereço', 'endereco')}
          {field('Email', 'email', 'email')}
          {field('Telefone', 'telefone', 'tel')}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={generateCadastroPDF}>
              <FileText className="h-3 w-3 mr-1 text-destructive" /> PDF Cadastro
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={() => shareWhatsApp('cadastro')}>
              <Share2 className="h-3 w-3 mr-1 text-green-600" /> WhatsApp
            </Button>
          </div>
        </div>
      );
      case 'bancario': return (
        <div className="space-y-2">
          <div className="flex gap-1.5 justify-end">
            {!editing && data.id && <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(true)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>}
            {editing && <Button size="sm" className="h-6 text-[10px]" onClick={handleSave} disabled={saving}><Save className="h-3 w-3 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}</Button>}
          </div>
          {field('Banco', 'banco')}
          {field('PIX', 'pix')}
        </div>
      );
      case 'roteiro': return (
        <div className="space-y-2">
          <div className="flex gap-1.5 justify-end">
            {!editing && data.id && <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(true)}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>}
            {editing && <Button size="sm" className="h-6 text-[10px]" onClick={handleSave} disabled={saving}><Save className="h-3 w-3 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}</Button>}
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] font-semibold text-muted-foreground">Roteiro para Embarque</Label>
            {editing ? (
              <Textarea
                value={data.roteiro}
                onChange={e => setData(prev => ({ ...prev, roteiro: e.target.value }))}
                placeholder="Descreva o roteiro de acesso à fazenda..."
                className="text-xs min-h-[80px]"
              />
            ) : (
              <p className="text-xs font-medium text-foreground min-h-[28px] px-2 py-1 rounded bg-muted/50 whitespace-pre-wrap">
                {data.roteiro || <span className="text-muted-foreground italic">—</span>}
              </p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={generateRoteiroPDF}>
              <FileText className="h-3 w-3 mr-1 text-destructive" /> PDF
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={() => shareWhatsApp('roteiro')}>
              <Share2 className="h-3 w-3 mr-1 text-green-600" /> WhatsApp
            </Button>
          </div>
        </div>
      );
      case 'pastos': return <PastosTab />;
      case 'dividendos': return <DividendosTab />;
      case 'acessos': return <AcessosTab />;
      case 'auditoria': return (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">Monitore todas as ações realizadas no sistema.</p>
          <Button variant="outline" size="sm" className="w-full h-7 text-[10px]" onClick={() => { setOpenModal(null); onTabChange?.('auditoria'); }}>
            <ShieldCheck className="h-3 w-3 mr-1" /> Abrir Central de Auditoria
          </Button>
        </div>
      );
      case 'ajustes': return (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground mb-1">Telas legadas para revisão.</p>
          {['Evolução Categorias por Mês', 'Evolução por Categoria', 'Análise Gráfica', 'Análise de Entradas', 'Análise de Saídas', 'Desfrute', 'Conciliação (Legado)', 'Movimentação'].map(l => (
            <div key={l} className="px-2 py-1 rounded bg-muted/40 text-[10px] text-muted-foreground">{l}</div>
          ))}
        </div>
      );
      default: return null;
    }
  };

  const isWide = (key: ModuleKey) => MODULES.find(m => m.key === key)?.wide;

  if (loading) return <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>;

  const visibleModules = MODULES.filter(m => !m.adminOnly || isAdmin);

  return (
    <div className="w-full px-3 py-2 animate-fade-in">
      <h2 className="text-sm font-bold text-foreground mb-2">Cadastros & Configurações</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visibleModules.map(mod => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.key}
              onClick={() => setOpenModal(mod.key)}
              className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left group"
            >
              <div className="rounded-md bg-primary/10 p-1.5 shrink-0 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-card-foreground leading-tight truncate">{mod.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{mod.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal */}
      <Dialog open={!!openModal} onOpenChange={open => { if (!open) setOpenModal(null); }}>
        <DialogContent className={`${isWide(openModal!) ? 'max-w-3xl' : 'max-w-lg'} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {MODULES.find(m => m.key === openModal)?.label || ''}
            </DialogTitle>
          </DialogHeader>
          {openModal && renderModalContent(openModal)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
