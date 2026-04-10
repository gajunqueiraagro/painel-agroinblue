export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      analise_consultor: {
        Row: {
          ano: number
          cliente_id: string
          created_at: string
          data_fechamento: string | null
          data_geracao: string
          fazenda_id: string | null
          id: string
          json_blocos: Json
          mes: number
          observacoes_manuais: string | null
          periodo_texto: string
          status_fechamento: string
          updated_at: string
          usuario_gerador: string | null
          versao: number
        }
        Insert: {
          ano: number
          cliente_id: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_blocos?: Json
          mes: number
          observacoes_manuais?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Update: {
          ano?: number
          cliente_id?: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_blocos?: Json
          mes?: number
          observacoes_manuais?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "analise_consultor_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analise_consultor_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          cliente_id: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          fazenda_id: string | null
          id: string
          modulo: string
          registro_id: string | null
          resumo: string | null
          tabela_origem: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          cliente_id: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          fazenda_id?: string | null
          id?: string
          modulo: string
          registro_id?: string | null
          resumo?: string | null
          tabela_origem: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          cliente_id?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          fazenda_id?: string | null
          id?: string
          modulo?: string
          registro_id?: string | null
          resumo?: string | null
          tabela_origem?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      audit_log_movimentacoes: {
        Row: {
          acao: string
          cliente_id: string
          created_at: string
          detalhes: Json | null
          financeiro_ids: string[] | null
          id: string
          movimentacao_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          cliente_id: string
          created_at?: string
          detalhes?: Json | null
          financeiro_ids?: string[] | null
          id?: string
          movimentacao_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          cliente_id?: string
          created_at?: string
          detalhes?: Json | null
          financeiro_ids?: string[] | null
          id?: string
          movimentacao_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      bancos_referencia: {
        Row: {
          ativo: boolean
          codigo_banco: string
          created_at: string
          id: string
          nome_banco: string
          nome_curto: string
          ordem_exibicao: number
        }
        Insert: {
          ativo?: boolean
          codigo_banco: string
          created_at?: string
          id?: string
          nome_banco: string
          nome_curto: string
          ordem_exibicao?: number
        }
        Update: {
          ativo?: boolean
          codigo_banco?: string
          created_at?: string
          id?: string
          nome_banco?: string
          nome_curto?: string
          ordem_exibicao?: number
        }
        Relationships: []
      }
      boitel_adiantamentos: {
        Row: {
          boitel_lote_id: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          id: string
          status: string
          tipo: string
          valor: number
        }
        Insert: {
          boitel_lote_id: string
          created_at?: string
          created_by?: string | null
          data: string
          descricao?: string | null
          id?: string
          status?: string
          tipo: string
          valor?: number
        }
        Update: {
          boitel_lote_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          id?: string
          status?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "boitel_adiantamentos_boitel_lote_id_fkey"
            columns: ["boitel_lote_id"]
            isOneToOne: false
            referencedRelation: "boitel_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      boitel_lotes: {
        Row: {
          boitel_destino: string
          cliente_id: string
          contrato_baia: string | null
          created_at: string
          data_envio: string | null
          fazenda_id: string
          id: string
          lote_codigo: string
          peso_saida_fazenda_kg: number
          quantidade_cab: number
          status_lote: string
          updated_at: string
        }
        Insert: {
          boitel_destino?: string
          cliente_id: string
          contrato_baia?: string | null
          created_at?: string
          data_envio?: string | null
          fazenda_id: string
          id?: string
          lote_codigo?: string
          peso_saida_fazenda_kg?: number
          quantidade_cab?: number
          status_lote?: string
          updated_at?: string
        }
        Update: {
          boitel_destino?: string
          cliente_id?: string
          contrato_baia?: string | null
          created_at?: string
          data_envio?: string | null
          fazenda_id?: string
          id?: string
          lote_codigo?: string
          peso_saida_fazenda_kg?: number
          quantidade_cab?: number
          status_lote?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boitel_lotes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boitel_lotes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      boitel_operacoes: {
        Row: {
          adiantamento_observacao: string | null
          cliente_id: string
          created_at: string
          custo_arroba: number
          custo_diaria: number
          custo_frete: number
          custo_nutricao: number
          custo_sanidade: number
          custo_total: number
          custos_extras_parceria: number
          data_adiantamento: string | null
          data_envio: string | null
          despesas_abate: number
          dias: number
          faturamento_bruto: number
          faturamento_liquido: number
          fazenda_destino_nome: string
          fazenda_origem_id: string
          gmd: number
          id: string
          lote: string | null
          lucro_total: number
          modalidade: string
          numero_contrato: string | null
          outros_custos: number
          pct_adiantamento_diarias: number
          percentual_parceria: number
          peso_inicial_kg: number
          possui_adiantamento: boolean
          preco_venda_arroba: number
          quantidade: number
          receita_produtor: number
          rendimento_entrada: number
          rendimento_saida: number
          updated_at: string
          valor_adiantamento_diarias: number
          valor_adiantamento_outros: number
          valor_adiantamento_sanitario: number
          valor_total_antecipado: number
        }
        Insert: {
          adiantamento_observacao?: string | null
          cliente_id: string
          created_at?: string
          custo_arroba?: number
          custo_diaria?: number
          custo_frete?: number
          custo_nutricao?: number
          custo_sanidade?: number
          custo_total?: number
          custos_extras_parceria?: number
          data_adiantamento?: string | null
          data_envio?: string | null
          despesas_abate?: number
          dias?: number
          faturamento_bruto?: number
          faturamento_liquido?: number
          fazenda_destino_nome?: string
          fazenda_origem_id: string
          gmd?: number
          id?: string
          lote?: string | null
          lucro_total?: number
          modalidade?: string
          numero_contrato?: string | null
          outros_custos?: number
          pct_adiantamento_diarias?: number
          percentual_parceria?: number
          peso_inicial_kg?: number
          possui_adiantamento?: boolean
          preco_venda_arroba?: number
          quantidade?: number
          receita_produtor?: number
          rendimento_entrada?: number
          rendimento_saida?: number
          updated_at?: string
          valor_adiantamento_diarias?: number
          valor_adiantamento_outros?: number
          valor_adiantamento_sanitario?: number
          valor_total_antecipado?: number
        }
        Update: {
          adiantamento_observacao?: string | null
          cliente_id?: string
          created_at?: string
          custo_arroba?: number
          custo_diaria?: number
          custo_frete?: number
          custo_nutricao?: number
          custo_sanidade?: number
          custo_total?: number
          custos_extras_parceria?: number
          data_adiantamento?: string | null
          data_envio?: string | null
          despesas_abate?: number
          dias?: number
          faturamento_bruto?: number
          faturamento_liquido?: number
          fazenda_destino_nome?: string
          fazenda_origem_id?: string
          gmd?: number
          id?: string
          lote?: string | null
          lucro_total?: number
          modalidade?: string
          numero_contrato?: string | null
          outros_custos?: number
          pct_adiantamento_diarias?: number
          percentual_parceria?: number
          peso_inicial_kg?: number
          possui_adiantamento?: boolean
          preco_venda_arroba?: number
          quantidade?: number
          receita_produtor?: number
          rendimento_entrada?: number
          rendimento_saida?: number
          updated_at?: string
          valor_adiantamento_diarias?: number
          valor_adiantamento_outros?: number
          valor_adiantamento_sanitario?: number
          valor_total_antecipado?: number
        }
        Relationships: [
          {
            foreignKeyName: "boitel_operacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boitel_operacoes_fazenda_origem_id_fkey"
            columns: ["fazenda_origem_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      boitel_planejamento: {
        Row: {
          adiantamento_observacao: string | null
          boitel_lote_id: string
          created_at: string
          custo_arroba: number
          custo_diaria: number
          custo_frete: number
          custo_nutricao: number
          custo_sanidade: number
          custo_total: number
          custos_extras_parceria: number
          data_adiantamento: string | null
          despesas_abate: number
          dias: number
          faturamento_bruto: number
          faturamento_liquido: number
          gmd: number
          id: string
          lucro_total: number
          modalidade: string
          outros_custos: number
          pct_adiantamento_diarias: number
          percentual_parceria: number
          possui_adiantamento: boolean
          preco_venda_arroba: number
          receita_produtor: number
          rendimento_entrada: number
          rendimento_saida: number
          updated_at: string
          valor_adiantamento_diarias: number
          valor_adiantamento_outros: number
          valor_adiantamento_sanitario: number
          valor_total_antecipado: number
          versao: number
        }
        Insert: {
          adiantamento_observacao?: string | null
          boitel_lote_id: string
          created_at?: string
          custo_arroba?: number
          custo_diaria?: number
          custo_frete?: number
          custo_nutricao?: number
          custo_sanidade?: number
          custo_total?: number
          custos_extras_parceria?: number
          data_adiantamento?: string | null
          despesas_abate?: number
          dias?: number
          faturamento_bruto?: number
          faturamento_liquido?: number
          gmd?: number
          id?: string
          lucro_total?: number
          modalidade?: string
          outros_custos?: number
          pct_adiantamento_diarias?: number
          percentual_parceria?: number
          possui_adiantamento?: boolean
          preco_venda_arroba?: number
          receita_produtor?: number
          rendimento_entrada?: number
          rendimento_saida?: number
          updated_at?: string
          valor_adiantamento_diarias?: number
          valor_adiantamento_outros?: number
          valor_adiantamento_sanitario?: number
          valor_total_antecipado?: number
          versao?: number
        }
        Update: {
          adiantamento_observacao?: string | null
          boitel_lote_id?: string
          created_at?: string
          custo_arroba?: number
          custo_diaria?: number
          custo_frete?: number
          custo_nutricao?: number
          custo_sanidade?: number
          custo_total?: number
          custos_extras_parceria?: number
          data_adiantamento?: string | null
          despesas_abate?: number
          dias?: number
          faturamento_bruto?: number
          faturamento_liquido?: number
          gmd?: number
          id?: string
          lucro_total?: number
          modalidade?: string
          outros_custos?: number
          pct_adiantamento_diarias?: number
          percentual_parceria?: number
          possui_adiantamento?: boolean
          preco_venda_arroba?: number
          receita_produtor?: number
          rendimento_entrada?: number
          rendimento_saida?: number
          updated_at?: string
          valor_adiantamento_diarias?: number
          valor_adiantamento_outros?: number
          valor_adiantamento_sanitario?: number
          valor_total_antecipado?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "boitel_planejamento_boitel_lote_id_fkey"
            columns: ["boitel_lote_id"]
            isOneToOne: true
            referencedRelation: "boitel_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      boitel_planejamento_historico: {
        Row: {
          boitel_lote_id: string
          created_at: string
          dados: Json
          id: string
          versao: number
        }
        Insert: {
          boitel_lote_id: string
          created_at?: string
          dados: Json
          id?: string
          versao: number
        }
        Update: {
          boitel_lote_id?: string
          created_at?: string
          dados?: Json
          id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "boitel_planejamento_historico_boitel_lote_id_fkey"
            columns: ["boitel_lote_id"]
            isOneToOne: false
            referencedRelation: "boitel_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_rebanho: {
        Row: {
          codigo: string
          id: string
          nome: string
          ordem_exibicao: number
        }
        Insert: {
          codigo: string
          id?: string
          nome: string
          ordem_exibicao?: number
        }
        Update: {
          codigo?: string
          id?: string
          nome?: string
          ordem_exibicao?: number
        }
        Relationships: []
      }
      cfg_categoria_parametros: {
        Row: {
          ativo: boolean
          categoria_codigo: string
          categoria_proxima: string | null
          cliente_id: string | null
          created_at: string
          grupo: string
          id: string
          is_default: boolean
          ordem_hierarquia: number
          peso_evolucao_kg: number | null
          peso_max_kg: number
          peso_min_kg: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_codigo: string
          categoria_proxima?: string | null
          cliente_id?: string | null
          created_at?: string
          grupo: string
          id?: string
          is_default?: boolean
          ordem_hierarquia: number
          peso_evolucao_kg?: number | null
          peso_max_kg: number
          peso_min_kg: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_codigo?: string
          categoria_proxima?: string | null
          cliente_id?: string | null
          created_at?: string
          grupo?: string
          id?: string
          is_default?: boolean
          ordem_hierarquia?: number
          peso_evolucao_kg?: number | null
          peso_max_kg?: number
          peso_min_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cfg_categoria_parametros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      chuvas: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          data: string
          fazenda_id: string
          id: string
          milimetros: number
          observacao: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data: string
          fazenda_id: string
          id?: string
          milimetros?: number
          observacao?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          fazenda_id?: string
          id?: string
          milimetros?: number
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chuvas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chuvas_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_membros: {
        Row: {
          ativo: boolean
          cliente_id: string
          created_at: string
          id: string
          perfil: Database["public"]["Enums"]["perfil_acesso"]
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          created_at?: string
          id?: string
          perfil?: Database["public"]["Enums"]["perfil_acesso"]
          user_id: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          created_at?: string
          id?: string
          perfil?: Database["public"]["Enums"]["perfil_acesso"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_membros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean
          config: Json | null
          created_at: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          config?: Json | null
          created_at?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          config?: Json | null
          created_at?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      competencia_fechamento: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          reaberto_em: string | null
          reaberto_por: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competencia_fechamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competencia_fechamento_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fazenda_cadastros: {
        Row: {
          area_produtiva: number | null
          area_total: number | null
          banco: string | null
          cliente_id: string
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          fazenda_id: string
          id: string
          ie: string | null
          inscricao_rural: string | null
          municipio: string | null
          pix: string | null
          proprietario_nome: string | null
          roteiro: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          area_produtiva?: number | null
          area_total?: number | null
          banco?: string | null
          cliente_id: string
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          fazenda_id: string
          id?: string
          ie?: string | null
          inscricao_rural?: string | null
          municipio?: string | null
          pix?: string | null
          proprietario_nome?: string | null
          roteiro?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          area_produtiva?: number | null
          area_total?: number | null
          banco?: string | null
          cliente_id?: string
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          fazenda_id?: string
          id?: string
          ie?: string | null
          inscricao_rural?: string | null
          municipio?: string | null
          pix?: string | null
          proprietario_nome?: string | null
          roteiro?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fazenda_cadastros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fazenda_cadastros_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: true
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fazenda_membros: {
        Row: {
          created_at: string
          fazenda_id: string
          id: string
          papel: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fazenda_id: string
          id?: string
          papel?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fazenda_id?: string
          id?: string
          papel?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fazenda_membros_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fazendas: {
        Row: {
          cliente_id: string
          codigo_importacao: string | null
          created_at: string
          id: string
          nome: string
          owner_id: string
          tem_pecuaria: boolean
        }
        Insert: {
          cliente_id: string
          codigo_importacao?: string | null
          created_at?: string
          id?: string
          nome: string
          owner_id: string
          tem_pecuaria?: boolean
        }
        Update: {
          cliente_id?: string
          codigo_importacao?: string | null
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
          tem_pecuaria?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fazendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_execucoes: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json | null
          fechamento_id: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json | null
          fechamento_id: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json | null
          fechamento_id?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_execucoes_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_executivo: {
        Row: {
          ano: number
          cliente_id: string
          created_at: string
          data_fechamento: string | null
          data_geracao: string
          fazenda_id: string | null
          id: string
          json_snapshot_indicadores: Json
          json_snapshot_textos: Json
          mes: number
          observacoes_manuais: string | null
          pdf_url: string | null
          periodo_texto: string
          status_fechamento: string
          updated_at: string
          usuario_gerador: string | null
          versao: number
        }
        Insert: {
          ano: number
          cliente_id: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_snapshot_indicadores?: Json
          json_snapshot_textos?: Json
          mes: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Update: {
          ano?: number
          cliente_id?: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_snapshot_indicadores?: Json
          json_snapshot_textos?: Json
          mes?: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_executivo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_executivo_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_graficos: {
        Row: {
          created_at: string
          fechamento_id: string
          id: string
          json_config: Json | null
          json_dados: Json
          ordem: number
          secao: string
          subtitulo: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          fechamento_id: string
          id?: string
          json_config?: Json | null
          json_dados?: Json
          ordem?: number
          secao: string
          subtitulo?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          fechamento_id?: string
          id?: string
          json_config?: Json | null
          json_dados?: Json
          ordem?: number
          secao?: string
          subtitulo?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_graficos_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_indicadores: {
        Row: {
          chave: string
          created_at: string
          fechamento_id: string
          formato: string | null
          grupo: string
          id: string
          json_origem: Json | null
          label: string
          ordem: number
          subgrupo: string | null
          unidade: string | null
          valor_ano_anterior: number | null
          valor_meta: number | null
          valor_real: number | null
        }
        Insert: {
          chave: string
          created_at?: string
          fechamento_id: string
          formato?: string | null
          grupo: string
          id?: string
          json_origem?: Json | null
          label: string
          ordem?: number
          subgrupo?: string | null
          unidade?: string | null
          valor_ano_anterior?: number | null
          valor_meta?: number | null
          valor_real?: number | null
        }
        Update: {
          chave?: string
          created_at?: string
          fechamento_id?: string
          formato?: string | null
          grupo?: string
          id?: string
          json_origem?: Json | null
          label?: string
          ordem?: number
          subgrupo?: string | null
          unidade?: string | null
          valor_ano_anterior?: number | null
          valor_meta?: number | null
          valor_real?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_indicadores_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_pasto_itens: {
        Row: {
          categoria_id: string
          created_at: string
          fechamento_id: string
          id: string
          lote: string | null
          observacoes: string | null
          origem_dado: string
          peso_medio_kg: number | null
          quantidade: number
        }
        Insert: {
          categoria_id: string
          created_at?: string
          fechamento_id: string
          id?: string
          lote?: string | null
          observacoes?: string | null
          origem_dado?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Update: {
          categoria_id?: string
          created_at?: string
          fechamento_id?: string
          id?: string
          lote?: string | null
          observacoes?: string | null
          origem_dado?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_pasto_itens_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_rebanho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pasto_itens_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamento_pastos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_pastos: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          lote_mes: string | null
          observacao_mes: string | null
          pasto_id: string
          qualidade_mes: number | null
          responsavel_nome: string | null
          status: string
          tipo_uso_mes: string | null
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          lote_mes?: string | null
          observacao_mes?: string | null
          pasto_id: string
          qualidade_mes?: number | null
          responsavel_nome?: string | null
          status?: string
          tipo_uso_mes?: string | null
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          lote_mes?: string | null
          observacao_mes?: string | null
          pasto_id?: string
          qualidade_mes?: number | null
          responsavel_nome?: string | null
          status?: string
          tipo_uso_mes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_pastos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pastos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pastos_pasto_id_fkey"
            columns: ["pasto_id"]
            isOneToOne: false
            referencedRelation: "pastos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_reaberturas_log: {
        Row: {
          acao: string
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          motivo: string | null
          pilar: string
          pilares_invalidados: string[] | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          motivo?: string | null
          pilar: string
          pilares_invalidados?: string[] | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          motivo?: string | null
          pilar?: string
          pilares_invalidados?: string[] | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      fechamento_textos: {
        Row: {
          created_at: string
          editado_em: string | null
          fechamento_id: string
          gerado_em: string | null
          id: string
          modelo_ia: string | null
          prompt_usado: string | null
          secao: string
          texto_editado: string | null
          texto_final: string | null
          texto_ia: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          editado_em?: string | null
          fechamento_id: string
          gerado_em?: string | null
          id?: string
          modelo_ia?: string | null
          prompt_usado?: string | null
          secao: string
          texto_editado?: string | null
          texto_final?: string | null
          texto_ia?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          editado_em?: string | null
          fechamento_id?: string
          gerado_em?: string | null
          id?: string
          modelo_ia?: string | null
          prompt_usado?: string | null
          secao?: string
          texto_editado?: string | null
          texto_final?: string | null
          texto_ia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_textos_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos_executivos: {
        Row: {
          ano: number
          cliente_id: string
          created_at: string
          data_fechamento: string | null
          data_geracao: string
          fazenda_id: string | null
          id: string
          mes: number
          observacoes_manuais: string | null
          pdf_url: string | null
          periodo_texto: string
          status_fechamento: string
          updated_at: string
          usuario_gerador: string | null
          versao: number
        }
        Insert: {
          ano: number
          cliente_id: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          mes: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Update: {
          ano?: number
          cliente_id?: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          mes?: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_executivos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamentos_executivos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_centros_custo: {
        Row: {
          ativo: boolean
          centro_custo: string
          cliente_id: string
          codigo: string | null
          created_at: string
          fazenda_id: string
          grupo_custo: string
          id: string
          macro_custo: string
          subcentro: string | null
          tipo_operacao: string
        }
        Insert: {
          ativo?: boolean
          centro_custo: string
          cliente_id: string
          codigo?: string | null
          created_at?: string
          fazenda_id: string
          grupo_custo: string
          id?: string
          macro_custo: string
          subcentro?: string | null
          tipo_operacao: string
        }
        Update: {
          ativo?: boolean
          centro_custo?: string
          cliente_id?: string
          codigo?: string | null
          created_at?: string
          fazenda_id?: string
          grupo_custo?: string
          id?: string
          macro_custo?: string
          subcentro?: string | null
          tipo_operacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_centros_custo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_centros_custo_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_conciliacoes: {
        Row: {
          cliente_id: string
          conta_bancaria_id: string
          created_at: string
          created_by: string | null
          extrato_id: string | null
          id: string
          lancamento_id: string | null
          observacao: string | null
          tipo_conciliacao: string
        }
        Insert: {
          cliente_id: string
          conta_bancaria_id: string
          created_at?: string
          created_by?: string | null
          extrato_id?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          tipo_conciliacao?: string
        }
        Update: {
          cliente_id?: string
          conta_bancaria_id?: string
          created_at?: string
          created_by?: string | null
          extrato_id?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          tipo_conciliacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_conciliacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_conciliacoes_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_conciliacoes_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "financeiro_extrato_bancario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_conciliacoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_contas: {
        Row: {
          agencia_conta: string | null
          ativo: boolean
          banco: string | null
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          instrumento: string | null
          nome_conta: string
          tipo: string | null
          uso: string | null
        }
        Insert: {
          agencia_conta?: string | null
          ativo?: boolean
          banco?: string | null
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          instrumento?: string | null
          nome_conta: string
          tipo?: string | null
          uso?: string | null
        }
        Update: {
          agencia_conta?: string | null
          ativo?: boolean
          banco?: string | null
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          instrumento?: string | null
          nome_conta?: string
          tipo?: string | null
          uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_contas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contas_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_contas_bancarias: {
        Row: {
          agencia: string | null
          ativa: boolean
          banco: string | null
          cliente_id: string
          codigo_conta: string | null
          conta_digito: string | null
          created_at: string
          fazenda_id: string
          id: string
          nome_conta: string
          nome_exibicao: string | null
          numero_conta: string | null
          ordem_exibicao: number
          tipo_conta: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativa?: boolean
          banco?: string | null
          cliente_id: string
          codigo_conta?: string | null
          conta_digito?: string | null
          created_at?: string
          fazenda_id: string
          id?: string
          nome_conta: string
          nome_exibicao?: string | null
          numero_conta?: string | null
          ordem_exibicao?: number
          tipo_conta?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativa?: boolean
          banco?: string | null
          cliente_id?: string
          codigo_conta?: string | null
          conta_digito?: string | null
          created_at?: string
          fazenda_id?: string
          id?: string
          nome_conta?: string
          nome_exibicao?: string | null
          numero_conta?: string | null
          ordem_exibicao?: number
          tipo_conta?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_contas_bancarias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contas_bancarias_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_contratos: {
        Row: {
          centro_custo: string | null
          cliente_id: string
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          dados_pagamento: string | null
          data_fim: string | null
          data_inicio: string
          dia_pagamento: number
          fazenda_id: string
          forma_pagamento: string | null
          fornecedor_id: string | null
          frequencia: string
          id: string
          macro_custo: string | null
          observacao: string | null
          produto: string | null
          status: string
          subcentro: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          centro_custo?: string | null
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          dados_pagamento?: string | null
          data_fim?: string | null
          data_inicio: string
          dia_pagamento?: number
          fazenda_id: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          frequencia?: string
          id?: string
          macro_custo?: string | null
          observacao?: string | null
          produto?: string | null
          status?: string
          subcentro?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          centro_custo?: string | null
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          dados_pagamento?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_pagamento?: number
          fazenda_id?: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          frequencia?: string
          id?: string
          macro_custo?: string | null
          observacao?: string | null
          produto?: string | null
          status?: string
          subcentro?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contratos_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contratos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contratos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_duplicidade_log: {
        Row: {
          cliente_id: string
          created_at: string
          dados_linha: Json | null
          fazenda_id: string | null
          hash_calculado: string | null
          id: string
          lancamento_match_id: string | null
          lote_importacao_id: string | null
          motivo: string | null
          nivel_duplicidade: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          dados_linha?: Json | null
          fazenda_id?: string | null
          hash_calculado?: string | null
          id?: string
          lancamento_match_id?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          nivel_duplicidade?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          dados_linha?: Json | null
          fazenda_id?: string | null
          hash_calculado?: string | null
          id?: string
          lancamento_match_id?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          nivel_duplicidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_duplicidade_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_duplicidade_log_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_extrato_bancario: {
        Row: {
          cliente_id: string
          conciliado: boolean
          conciliado_em: string | null
          conta_bancaria_id: string
          created_at: string
          data_movimento: string
          descricao_banco: string | null
          documento: string | null
          hash_conciliacao: string | null
          id: string
          importacao_id: string | null
          lancamento_id: string | null
          saldo_apos: number | null
          tipo_movimento: string
          valor: number
        }
        Insert: {
          cliente_id: string
          conciliado?: boolean
          conciliado_em?: string | null
          conta_bancaria_id: string
          created_at?: string
          data_movimento: string
          descricao_banco?: string | null
          documento?: string | null
          hash_conciliacao?: string | null
          id?: string
          importacao_id?: string | null
          lancamento_id?: string | null
          saldo_apos?: number | null
          tipo_movimento?: string
          valor?: number
        }
        Update: {
          cliente_id?: string
          conciliado?: boolean
          conciliado_em?: string | null
          conta_bancaria_id?: string
          created_at?: string
          data_movimento?: string
          descricao_banco?: string | null
          documento?: string | null
          hash_conciliacao?: string | null
          id?: string
          importacao_id?: string | null
          lancamento_id?: string | null
          saldo_apos?: number | null
          tipo_movimento?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_extrato_bancario_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_extrato_bancario_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_extrato_bancario_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_extrato_bancario_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_fechamentos: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          observacao: string | null
          reaberto_em: string | null
          reaberto_por: string | null
          status_fechamento: string
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status_fechamento?: string
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status_fechamento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fechamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_fechamentos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_fornecedores: {
        Row: {
          agencia: string | null
          aliases: string[] | null
          ativo: boolean
          banco: string | null
          cliente_id: string
          conta: string | null
          cpf_cnpj: string | null
          cpf_cnpj_pagamento: string | null
          created_at: string
          fazenda_id: string
          id: string
          nome: string
          nome_favorecido: string | null
          nome_normalizado: string | null
          observacao_pagamento: string | null
          pix_chave: string | null
          pix_tipo_chave: string | null
          tipo_conta: string | null
          tipo_recebimento: string | null
        }
        Insert: {
          agencia?: string | null
          aliases?: string[] | null
          ativo?: boolean
          banco?: string | null
          cliente_id: string
          conta?: string | null
          cpf_cnpj?: string | null
          cpf_cnpj_pagamento?: string | null
          created_at?: string
          fazenda_id: string
          id?: string
          nome: string
          nome_favorecido?: string | null
          nome_normalizado?: string | null
          observacao_pagamento?: string | null
          pix_chave?: string | null
          pix_tipo_chave?: string | null
          tipo_conta?: string | null
          tipo_recebimento?: string | null
        }
        Update: {
          agencia?: string | null
          aliases?: string[] | null
          ativo?: boolean
          banco?: string | null
          cliente_id?: string
          conta?: string | null
          cpf_cnpj?: string | null
          cpf_cnpj_pagamento?: string | null
          created_at?: string
          fazenda_id?: string
          id?: string
          nome?: string
          nome_favorecido?: string | null
          nome_normalizado?: string | null
          observacao_pagamento?: string | null
          pix_chave?: string | null
          pix_tipo_chave?: string | null
          tipo_conta?: string | null
          tipo_recebimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fornecedores_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_fornecedores_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_importacoes: {
        Row: {
          cancelada_em: string | null
          cancelada_por: string | null
          cliente_id: string
          created_at: string
          data_importacao: string
          fazenda_id: string
          id: string
          nome_arquivo: string
          status: string
          total_com_erro: number
          total_linhas: number
          total_validas: number
          usuario_id: string
        }
        Insert: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id: string
          created_at?: string
          data_importacao?: string
          fazenda_id: string
          id?: string
          nome_arquivo: string
          status?: string
          total_com_erro?: number
          total_linhas?: number
          total_validas?: number
          usuario_id: string
        }
        Update: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id?: string
          created_at?: string
          data_importacao?: string
          fazenda_id?: string
          id?: string
          nome_arquivo?: string
          status?: string
          total_com_erro?: number
          total_linhas?: number
          total_validas?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_importacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_importacoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_importacoes_v2: {
        Row: {
          cancelada_em: string | null
          cancelada_por: string | null
          cliente_id: string
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          data_importacao: string
          fazenda_id: string
          id: string
          nome_arquivo: string
          observacao: string | null
          status: string
          tipo_arquivo: string | null
          total_com_erro: number
          total_linhas: number
          total_validas: number
        }
        Insert: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data_importacao?: string
          fazenda_id: string
          id?: string
          nome_arquivo: string
          observacao?: string | null
          status?: string
          tipo_arquivo?: string | null
          total_com_erro?: number
          total_linhas?: number
          total_validas?: number
        }
        Update: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data_importacao?: string
          fazenda_id?: string
          id?: string
          nome_arquivo?: string
          observacao?: string | null
          status?: string
          tipo_arquivo?: string | null
          total_com_erro?: number
          total_linhas?: number
          total_validas?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_importacoes_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_importacoes_v2_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_importacoes_v2_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_lancamentos: {
        Row: {
          ano_mes: string
          cancelado: boolean
          centro_custo: string | null
          cliente_id: string
          conta_destino: string | null
          conta_origem: string | null
          cpf_cnpj: string | null
          created_at: string
          data_pagamento: string | null
          data_realizacao: string
          editado_manual: boolean
          escopo_negocio: string | null
          fazenda_id: string
          forma_pagamento: string | null
          fornecedor: string | null
          grupo_custo: string | null
          hash_importacao: string | null
          id: string
          importacao_id: string | null
          macro_custo: string | null
          nota_fiscal: string | null
          obs: string | null
          origem_dado: string
          produto: string | null
          recorrencia: string | null
          status_transacao: string | null
          subcentro: string | null
          tipo_operacao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano_mes: string
          cancelado?: boolean
          centro_custo?: string | null
          cliente_id: string
          conta_destino?: string | null
          conta_origem?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_realizacao: string
          editado_manual?: boolean
          escopo_negocio?: string | null
          fazenda_id: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          grupo_custo?: string | null
          hash_importacao?: string | null
          id?: string
          importacao_id?: string | null
          macro_custo?: string | null
          nota_fiscal?: string | null
          obs?: string | null
          origem_dado?: string
          produto?: string | null
          recorrencia?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ano_mes?: string
          cancelado?: boolean
          centro_custo?: string | null
          cliente_id?: string
          conta_destino?: string | null
          conta_origem?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_realizacao?: string
          editado_manual?: boolean
          escopo_negocio?: string | null
          fazenda_id?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          grupo_custo?: string | null
          hash_importacao?: string | null
          id?: string
          importacao_id?: string | null
          macro_custo?: string | null
          nota_fiscal?: string | null
          obs?: string | null
          origem_dado?: string
          produto?: string | null
          recorrencia?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_lancamentos_v2: {
        Row: {
          ano_mes: string
          boitel_id: string | null
          boitel_lote_id: string | null
          cancelado: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          centro_custo: string | null
          cliente_id: string
          conciliado_em: string | null
          conta_bancaria_id: string | null
          conta_destino_id: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          dados_pagamento: string | null
          data_competencia: string
          data_pagamento: string | null
          descricao: string | null
          documento: string | null
          duplicado_de_id: string | null
          editado_manual: boolean
          escopo_negocio: string | null
          favorecido_id: string | null
          fazenda_id: string
          forma_pagamento: string | null
          grupo_custo: string | null
          grupo_geracao_id: string | null
          hash_importacao: string | null
          historico: string | null
          id: string
          importado_duplicado: boolean
          lote_importacao_id: string | null
          macro_custo: string | null
          movimentacao_rebanho_id: string | null
          nivel_duplicidade: string | null
          numero_documento: string | null
          observacao: string | null
          origem_lancamento: string
          origem_tipo: string | null
          plano_conta_id: string | null
          sinal: number
          status_duplicidade: string
          status_transacao: string | null
          subcentro: string | null
          tipo_documento: string | null
          tipo_operacao: string
          transferencia_grupo_id: string | null
          updated_at: string
          updated_by: string | null
          valor: number
        }
        Insert: {
          ano_mes: string
          boitel_id?: string | null
          boitel_lote_id?: string | null
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          centro_custo?: string | null
          cliente_id: string
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          dados_pagamento?: string | null
          data_competencia: string
          data_pagamento?: string | null
          descricao?: string | null
          documento?: string | null
          duplicado_de_id?: string | null
          editado_manual?: boolean
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id: string
          forma_pagamento?: string | null
          grupo_custo?: string | null
          grupo_geracao_id?: string | null
          hash_importacao?: string | null
          historico?: string | null
          id?: string
          importado_duplicado?: boolean
          lote_importacao_id?: string | null
          macro_custo?: string | null
          movimentacao_rebanho_id?: string | null
          nivel_duplicidade?: string | null
          numero_documento?: string | null
          observacao?: string | null
          origem_lancamento?: string
          origem_tipo?: string | null
          plano_conta_id?: string | null
          sinal?: number
          status_duplicidade?: string
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao: string
          transferencia_grupo_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor?: number
        }
        Update: {
          ano_mes?: string
          boitel_id?: string | null
          boitel_lote_id?: string | null
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          centro_custo?: string | null
          cliente_id?: string
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          dados_pagamento?: string | null
          data_competencia?: string
          data_pagamento?: string | null
          descricao?: string | null
          documento?: string | null
          duplicado_de_id?: string | null
          editado_manual?: boolean
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id?: string
          forma_pagamento?: string | null
          grupo_custo?: string | null
          grupo_geracao_id?: string | null
          hash_importacao?: string | null
          historico?: string | null
          id?: string
          importado_duplicado?: boolean
          lote_importacao_id?: string | null
          macro_custo?: string | null
          movimentacao_rebanho_id?: string | null
          nivel_duplicidade?: string | null
          numero_documento?: string | null
          observacao?: string | null
          origem_lancamento?: string
          origem_tipo?: string | null
          plano_conta_id?: string | null
          sinal?: number
          status_duplicidade?: string
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string
          transferencia_grupo_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_v2_boitel_id_fkey"
            columns: ["boitel_id"]
            isOneToOne: false
            referencedRelation: "boitel_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_boitel_lote_id_fkey"
            columns: ["boitel_lote_id"]
            isOneToOne: false
            referencedRelation: "boitel_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_duplicado_de_id_fkey"
            columns: ["duplicado_de_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_favorecido_id_fkey"
            columns: ["favorecido_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_lote_importacao_id_fkey"
            columns: ["lote_importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_movimentacao_rebanho_id_fkey"
            columns: ["movimentacao_rebanho_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_plano_conta_id_fkey"
            columns: ["plano_conta_id"]
            isOneToOne: false
            referencedRelation: "financeiro_plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_mapa_classificacao: {
        Row: {
          ativo: boolean
          centro_custo: string
          cliente_id: string
          created_at: string
          grupo_dashboard: string | null
          grupo_dre: string | null
          grupo_fluxo: string | null
          id: string
          macro_custo: string
          ordem_exibicao: number
          subcentro: string | null
          tipo_operacao: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          centro_custo: string
          cliente_id: string
          created_at?: string
          grupo_dashboard?: string | null
          grupo_dre?: string | null
          grupo_fluxo?: string | null
          id?: string
          macro_custo: string
          ordem_exibicao?: number
          subcentro?: string | null
          tipo_operacao: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          centro_custo?: string
          cliente_id?: string
          created_at?: string
          grupo_dashboard?: string | null
          grupo_dre?: string | null
          grupo_fluxo?: string | null
          id?: string
          macro_custo?: string
          ordem_exibicao?: number
          subcentro?: string | null
          tipo_operacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_mapa_classificacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_plano_contas: {
        Row: {
          ativo: boolean
          centro_custo: string
          cliente_id: string
          created_at: string
          escopo_negocio: string | null
          grupo_custo: string | null
          grupo_fluxo: string | null
          id: string
          macro_custo: string
          ordem_exibicao: number
          subcentro: string | null
          tipo_operacao: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          centro_custo: string
          cliente_id: string
          created_at?: string
          escopo_negocio?: string | null
          grupo_custo?: string | null
          grupo_fluxo?: string | null
          id?: string
          macro_custo: string
          ordem_exibicao?: number
          subcentro?: string | null
          tipo_operacao: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          centro_custo?: string
          cliente_id?: string
          created_at?: string
          escopo_negocio?: string | null
          grupo_custo?: string | null
          grupo_fluxo?: string | null
          id?: string
          macro_custo?: string
          ordem_exibicao?: number
          subcentro?: string | null
          tipo_operacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_plano_contas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_rateio_adm: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          created_by: string | null
          criterio_rateio: string
          id: string
          observacao: string | null
          updated_at: string
          valor_total_rateado: number
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          created_by?: string | null
          criterio_rateio?: string
          id?: string
          observacao?: string | null
          updated_at?: string
          valor_total_rateado?: number
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          criterio_rateio?: string
          id?: string
          observacao?: string | null
          updated_at?: string
          valor_total_rateado?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_rateio_adm_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_rateio_adm_itens: {
        Row: {
          base_rateio: string | null
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          percentual_rateio: number
          rateio_id: string
          valor_rateado: number
        }
        Insert: {
          base_rateio?: string | null
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          percentual_rateio?: number
          rateio_id: string
          valor_rateado?: number
        }
        Update: {
          base_rateio?: string | null
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          percentual_rateio?: number
          rateio_id?: string
          valor_rateado?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_rateio_adm_itens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_rateio_adm_itens_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_rateio_adm_itens_rateio_id_fkey"
            columns: ["rateio_id"]
            isOneToOne: false
            referencedRelation: "financeiro_rateio_adm"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_resumo_caixa: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          entradas: number
          fazenda_id: string
          id: string
          importacao_id: string | null
          saidas: number
          saldo_final_total: number
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          entradas?: number
          fazenda_id: string
          id?: string
          importacao_id?: string | null
          saidas?: number
          saldo_final_total?: number
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          entradas?: number
          fazenda_id?: string
          id?: string
          importacao_id?: string | null
          saidas?: number
          saldo_final_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_resumo_caixa_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_resumo_caixa_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_resumo_caixa_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_saldos_audit: {
        Row: {
          acao: string
          campo_alterado: string | null
          cliente_id: string
          created_at: string
          id: string
          saldo_id: string
          usuario_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao: string
          campo_alterado?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          saldo_id: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo_alterado?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          saldo_id?: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_saldos_audit_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_saldos_audit_saldo_id_fkey"
            columns: ["saldo_id"]
            isOneToOne: false
            referencedRelation: "financeiro_saldos_bancarios_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_saldos_bancarios: {
        Row: {
          ano_mes: string
          cliente_id: string
          conta_banco: string
          created_at: string
          fazenda_id: string
          id: string
          importacao_id: string | null
          saldo_final: number
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          conta_banco: string
          created_at?: string
          fazenda_id: string
          id?: string
          importacao_id?: string | null
          saldo_final?: number
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          conta_banco?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          importacao_id?: string | null
          saldo_final?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_saldos_bancarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_saldos_bancarios_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_saldos_bancarios_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_saldos_bancarios_v2: {
        Row: {
          ano_mes: string
          cliente_id: string
          conta_bancaria_id: string
          created_at: string
          created_by: string | null
          fazenda_id: string
          fechado: boolean
          id: string
          observacao: string | null
          origem_saldo: string | null
          origem_saldo_inicial: string
          saldo_final: number
          saldo_inicial: number
          status_mes: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          conta_bancaria_id: string
          created_at?: string
          created_by?: string | null
          fazenda_id: string
          fechado?: boolean
          id?: string
          observacao?: string | null
          origem_saldo?: string | null
          origem_saldo_inicial?: string
          saldo_final?: number
          saldo_inicial?: number
          status_mes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          conta_bancaria_id?: string
          created_at?: string
          created_by?: string | null
          fazenda_id?: string
          fechado?: boolean
          id?: string
          observacao?: string | null
          origem_saldo?: string | null
          origem_saldo_inicial?: string
          saldo_final?: number
          saldo_inicial?: number
          status_mes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_saldos_bancarios_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_saldos_bancarios_v2_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_saldos_bancarios_v2_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          acrescimos: number | null
          boitel_id: string | null
          boitel_lote_id: string | null
          bonus_lista_trace: number | null
          bonus_precoce: number | null
          bonus_qualidade: number | null
          cancelado: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          categoria: string
          categoria_destino: string | null
          cenario: string
          cliente_id: string
          created_at: string
          created_by: string | null
          data: string
          data_abate: string | null
          data_embarque: string | null
          data_venda: string | null
          deducoes: number | null
          desconto_funrural: number | null
          desconto_qualidade: number | null
          detalhes_snapshot: Json | null
          fazenda_destino: string | null
          fazenda_id: string
          fazenda_origem: string | null
          id: string
          numero_documento: string | null
          observacao: string | null
          outros_descontos: number | null
          peso_carcaca_kg: number | null
          peso_medio_arrobas: number | null
          peso_medio_kg: number | null
          preco_arroba: number | null
          preco_medio_cabeca: number | null
          quantidade: number
          status_operacional: string | null
          tipo: string
          tipo_abate: string | null
          tipo_peso: string | null
          tipo_venda: string | null
          transferencia_par_id: string | null
          updated_at: string
          updated_by: string | null
          valor_total: number | null
        }
        Insert: {
          acrescimos?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria: string
          categoria_destino?: string | null
          cenario?: string
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data: string
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          detalhes_snapshot?: Json | null
          fazenda_destino?: string | null
          fazenda_id: string
          fazenda_origem?: string | null
          id?: string
          numero_documento?: string | null
          observacao?: string | null
          outros_descontos?: number | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          quantidade: number
          status_operacional?: string | null
          tipo: string
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_total?: number | null
        }
        Update: {
          acrescimos?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string
          categoria_destino?: string | null
          cenario?: string
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          detalhes_snapshot?: Json | null
          fazenda_destino?: string | null
          fazenda_id?: string
          fazenda_origem?: string | null
          id?: string
          numero_documento?: string | null
          observacao?: string | null
          outros_descontos?: number | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          quantidade?: number
          status_operacional?: string | null
          tipo?: string
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_boitel_id_fkey"
            columns: ["boitel_id"]
            isOneToOne: false
            referencedRelation: "boitel_operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_boitel_lote_id_fkey"
            columns: ["boitel_lote_id"]
            isOneToOne: false
            referencedRelation: "boitel_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_transferencia_par_id_fkey"
            columns: ["transferencia_par_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_gmd_mensal: {
        Row: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          gmd_previsto: number
          id: string
          updated_at: string
        }
        Insert: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          gmd_previsto?: number
          id?: string
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          gmd_previsto?: number
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_gmd_mensal_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_gmd_mensal_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_preco_mercado: {
        Row: {
          agio_perc: number
          ano_mes: string
          bloco: string
          categoria: string
          cliente_id: string
          created_at: string
          id: string
          unidade: string
          valor: number
        }
        Insert: {
          agio_perc?: number
          ano_mes: string
          bloco: string
          categoria: string
          cliente_id: string
          created_at?: string
          id?: string
          unidade: string
          valor?: number
        }
        Update: {
          agio_perc?: number
          ano_mes?: string
          bloco?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          id?: string
          unidade?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_preco_mercado_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_preco_mercado_status: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_preco_mercado_status_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_valor_rebanho_precos: {
        Row: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at: string
          id: string
          preco_arroba: number
        }
        Insert: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at?: string
          id?: string
          preco_arroba?: number
        }
        Update: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          id?: string
          preco_arroba?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_valor_rebanho_precos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_valor_rebanho_status: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          id: string
          status: string
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          id?: string
          status?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          id?: string
          status?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_valor_rebanho_status_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pasto_condicoes: {
        Row: {
          altura_pasto_cm: number | null
          cliente_id: string
          cobertura_perc: number | null
          condicao: string
          created_at: string
          data_registro: string
          fazenda_id: string
          id: string
          observacoes: string | null
          pasto_id: string
          registrado_por: string | null
        }
        Insert: {
          altura_pasto_cm?: number | null
          cliente_id: string
          cobertura_perc?: number | null
          condicao?: string
          created_at?: string
          data_registro?: string
          fazenda_id: string
          id?: string
          observacoes?: string | null
          pasto_id: string
          registrado_por?: string | null
        }
        Update: {
          altura_pasto_cm?: number | null
          cliente_id?: string
          cobertura_perc?: number | null
          condicao?: string
          created_at?: string
          data_registro?: string
          fazenda_id?: string
          id?: string
          observacoes?: string | null
          pasto_id?: string
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pasto_condicoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasto_condicoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasto_condicoes_pasto_id_fkey"
            columns: ["pasto_id"]
            isOneToOne: false
            referencedRelation: "pastos"
            referencedColumns: ["id"]
          },
        ]
      }
      pasto_geometrias: {
        Row: {
          cliente_id: string
          cor: string | null
          created_at: string
          fazenda_id: string
          geojson: Json
          id: string
          nome_original: string | null
          pasto_id: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          cor?: string | null
          created_at?: string
          fazenda_id: string
          geojson: Json
          id?: string
          nome_original?: string | null
          pasto_id?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          cor?: string | null
          created_at?: string
          fazenda_id?: string
          geojson?: Json
          id?: string
          nome_original?: string | null
          pasto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pasto_geometrias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasto_geometrias_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasto_geometrias_pasto_id_fkey"
            columns: ["pasto_id"]
            isOneToOne: false
            referencedRelation: "pastos"
            referencedColumns: ["id"]
          },
        ]
      }
      pasto_movimentacoes: {
        Row: {
          categoria: string | null
          cliente_id: string
          created_at: string
          data: string
          fazenda_id: string
          id: string
          lote_id: string | null
          observacoes: string | null
          pasto_destino_id: string | null
          pasto_origem_id: string | null
          peso_medio_kg: number | null
          quantidade: number
          referencia_rebanho: string | null
          registrado_por: string | null
          tipo: string
        }
        Insert: {
          categoria?: string | null
          cliente_id: string
          created_at?: string
          data?: string
          fazenda_id: string
          id?: string
          lote_id?: string | null
          observacoes?: string | null
          pasto_destino_id?: string | null
          pasto_origem_id?: string | null
          peso_medio_kg?: number | null
          quantidade?: number
          referencia_rebanho?: string | null
          registrado_por?: string | null
          tipo: string
        }
        Update: {
          categoria?: string | null
          cliente_id?: string
          created_at?: string
          data?: string
          fazenda_id?: string
          id?: string
          lote_id?: string | null
          observacoes?: string | null
          pasto_destino_id?: string | null
          pasto_origem_id?: string | null
          peso_medio_kg?: number | null
          quantidade?: number
          referencia_rebanho?: string | null
          registrado_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pasto_movimentacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasto_movimentacoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasto_movimentacoes_pasto_destino_id_fkey"
            columns: ["pasto_destino_id"]
            isOneToOne: false
            referencedRelation: "pastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasto_movimentacoes_pasto_origem_id_fkey"
            columns: ["pasto_origem_id"]
            isOneToOne: false
            referencedRelation: "pastos"
            referencedColumns: ["id"]
          },
        ]
      }
      pastos: {
        Row: {
          area_produtiva_ha: number | null
          ativo: boolean
          cliente_id: string
          created_at: string
          entra_conciliacao: boolean
          fazenda_id: string
          id: string
          lote_padrao: string | null
          nome: string
          observacoes: string | null
          qualidade: number | null
          referencia_rebanho: string | null
          situacao: string
          tipo_uso: string
          updated_at: string
        }
        Insert: {
          area_produtiva_ha?: number | null
          ativo?: boolean
          cliente_id: string
          created_at?: string
          entra_conciliacao?: boolean
          fazenda_id: string
          id?: string
          lote_padrao?: string | null
          nome: string
          observacoes?: string | null
          qualidade?: number | null
          referencia_rebanho?: string | null
          situacao?: string
          tipo_uso?: string
          updated_at?: string
        }
        Update: {
          area_produtiva_ha?: number | null
          ativo?: boolean
          cliente_id?: string
          created_at?: string
          entra_conciliacao?: boolean
          fazenda_id?: string
          id?: string
          lote_padrao?: string | null
          nome?: string
          observacoes?: string | null
          qualidade?: number | null
          referencia_rebanho?: string | null
          situacao?: string
          tipo_uso?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      preco_mercado: {
        Row: {
          agio_perc: number
          ano_mes: string
          bloco: string
          categoria: string
          created_at: string
          id: string
          unidade: string
          updated_at: string
          valor: number
        }
        Insert: {
          agio_perc?: number
          ano_mes: string
          bloco: string
          categoria: string
          created_at?: string
          id?: string
          unidade?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          agio_perc?: number
          ano_mes?: string
          bloco?: string
          categoria?: string
          created_at?: string
          id?: string
          unidade?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      preco_mercado_ajuste: {
        Row: {
          agio_perc: number
          ano_mes: string
          bloco: string
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          updated_at: string
        }
        Insert: {
          agio_perc?: number
          ano_mes: string
          bloco: string
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          agio_perc?: number
          ano_mes?: string
          bloco?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      preco_mercado_status: {
        Row: {
          ano_mes: string
          created_at: string
          id: string
          status: string
          updated_at: string
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano_mes: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano_mes?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cliente_id: string | null
          created_at: string
          id: string
          nome: string | null
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_iniciais: {
        Row: {
          ano: number
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          peso_medio_kg: number | null
          quantidade: number
        }
        Insert: {
          ano: number
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Update: {
          ano?: number
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldos_iniciais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldos_iniciais_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_fechamento: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          peso_total_kg: number | null
          reaberto_em: string | null
          reaberto_por: string | null
          status: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_total_kg?: number | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_total_kg?: number | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_fechamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_fechamento_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_fechamento_itens: {
        Row: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          peso_medio_kg: number
          preco_kg: number
          quantidade: number
          updated_at: string
          valor_total_categoria: number
        }
        Insert: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_medio_kg?: number
          preco_kg?: number
          quantidade?: number
          updated_at?: string
          valor_total_categoria?: number
        }
        Update: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_medio_kg?: number
          preco_kg?: number
          quantidade?: number
          updated_at?: string
          valor_total_categoria?: number
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_fechamento_itens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_fechamento_itens_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_mensal: {
        Row: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          preco_kg: number
          updated_at: string
        }
        Insert: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          preco_kg?: number
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          preco_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_mensal_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_mensal_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_meta: {
        Row: {
          ano_mes: string
          arrobas_total: number
          cabecas: number
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          peso_medio_kg: number
          peso_total_kg: number
          preco_arroba_medio: number
          status: string
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_cabeca_medio: number
          valor_total: number
        }
        Insert: {
          ano_mes: string
          arrobas_total?: number
          cabecas?: number
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          peso_medio_kg?: number
          peso_total_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number
          valor_total?: number
        }
        Update: {
          ano_mes?: string
          arrobas_total?: number
          cabecas?: number
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          peso_medio_kg?: number
          peso_total_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_meta_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_meta_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_meta_itens: {
        Row: {
          categoria: string
          created_at: string
          id: string
          meta_id: string
          peso_medio_kg: number
          preco_arroba: number
          preco_kg: number
          quantidade: number
          valor_cabeca: number
          valor_total_categoria: number
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          meta_id: string
          peso_medio_kg?: number
          preco_arroba?: number
          preco_kg?: number
          quantidade?: number
          valor_cabeca?: number
          valor_total_categoria?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          meta_id?: string
          peso_medio_kg?: number
          preco_arroba?: number
          preco_kg?: number
          quantidade?: number
          valor_cabeca?: number
          valor_total_categoria?: number
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_meta_itens_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "valor_rebanho_meta"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_meta_validada: {
        Row: {
          ano_mes: string
          arrobas_total: number
          cabecas: number
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          peso_medio_kg: number
          preco_arroba_medio: number
          status: string
          updated_at: string
          validado_em: string | null
          validado_por: string | null
          valor_cabeca_medio: number
          valor_total: number
        }
        Insert: {
          ano_mes: string
          arrobas_total?: number
          cabecas?: number
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          peso_medio_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number
          valor_total?: number
        }
        Update: {
          ano_mes?: string
          arrobas_total?: number
          cabecas?: number
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          peso_medio_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_meta_validada_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_meta_validada_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_realizado_validado: {
        Row: {
          ano_mes: string
          arrobas_total: number
          cabecas: number
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          peso_medio_kg: number
          preco_arroba_medio: number
          status: string
          updated_at: string
          valor_cabeca_medio: number
          valor_total: number
        }
        Insert: {
          ano_mes: string
          arrobas_total?: number
          cabecas?: number
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          peso_medio_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string
          valor_cabeca_medio?: number
          valor_total?: number
        }
        Update: {
          ano_mes?: string
          arrobas_total?: number
          cabecas?: number
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          peso_medio_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string
          valor_cabeca_medio?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_realizado_validado_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_realizado_validado_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_financeiro_auditoria_competencia_caixa: {
        Row: {
          centro_custo: string | null
          cliente_id: string | null
          fazenda_id: string | null
          macro_custo: string | null
          mes_caixa: string | null
          mes_competencia: string | null
          qtd_divergente: number | null
          qtd_lancamentos: number | null
          subcentro: string | null
          tipo_operacao: string | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_financeiro_dashboard_mensal: {
        Row: {
          amortizacoes: number | null
          ano_mes: string | null
          aportes: number | null
          captacao_financeira: number | null
          cliente_id: string | null
          deducao_receitas: number | null
          desembolso_produtivo_agri: number | null
          desembolso_produtivo_pec: number | null
          dividendos: number | null
          fazenda_id: string | null
          outras_receitas: number | null
          receitas_agricultura: number | null
          receitas_pecuaria: number | null
          reposicao_bovinos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_financeiro_desembolso_centro: {
        Row: {
          ano_mes: string | null
          centro_custo: string | null
          cliente_id: string | null
          fazenda_id: string | null
          macro_custo: string | null
          percentual: number | null
          qtd_lancamentos: number | null
          subcentro: string | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_financeiro_fluxo_caixa_mensal: {
        Row: {
          ano_mes: string | null
          cliente_id: string | null
          fazenda_id: string | null
          saldo_mes: number | null
          total_entradas: number | null
          total_saidas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_zoot_categoria_mensal: {
        Row: {
          ano: number | null
          ano_mes: string | null
          categoria_codigo: string | null
          categoria_id: string | null
          categoria_nome: string | null
          cenario: string | null
          cliente_id: string | null
          dias_mes: number | null
          entradas_externas: number | null
          evol_cat_entrada: number | null
          evol_cat_saida: number | null
          fazenda_id: string | null
          fonte_oficial_mes: string | null
          gmd: number | null
          mes: number | null
          ordem_exibicao: number | null
          peso_entradas_externas: number | null
          peso_evol_cat_entrada: number | null
          peso_evol_cat_saida: number | null
          peso_medio_final: number | null
          peso_medio_inicial: number | null
          peso_saidas_externas: number | null
          peso_total_final: number | null
          peso_total_inicial: number | null
          producao_biologica: number | null
          saidas_externas: number | null
          saldo_final: number | null
          saldo_inicial: number | null
        }
        Relationships: []
      }
      vw_zoot_fazenda_mensal: {
        Row: {
          ano: number | null
          ano_mes: string | null
          area_produtiva_ha: number | null
          cabecas_final: number | null
          cabecas_inicio: number | null
          cenario: string | null
          cliente_id: string | null
          dias_mes: number | null
          entradas: number | null
          fazenda_id: string | null
          fonte_oficial_mes: string | null
          gmd_kg_cab_dia: number | null
          gmd_numerador_kg: number | null
          lotacao_ua_ha: number | null
          mes: number | null
          mes_key: string | null
          peso_entradas_kg: number | null
          peso_inicio_kg: number | null
          peso_medio_final_kg: number | null
          peso_saidas_kg: number | null
          peso_total_final_kg: number | null
          saidas: number | null
          ua_media: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      audit_modulo_from_lancamento_tipo: {
        Args: { p_tipo: string }
        Returns: string
      }
      audit_resumo_lancamento: {
        Args: { r: Database["public"]["Tables"]["lancamentos"]["Row"] }
        Returns: string
      }
      auditar_integridade_classificacao: {
        Args: { _cliente_id: string }
        Returns: {
          campo_divergente: string
          lancamento_id: string
          subcentro: string
          valor_lancamento: string
          valor_plano: string
        }[]
      }
      buscar_duplicados_retroativo: {
        Args: { _ano_mes?: string; _cliente_id: string }
        Returns: {
          ano_mes: string
          conta_bancaria_id: string
          created_at: string
          data_pagamento: string
          descricao: string
          fazenda_id: string
          fornecedor_nome: string
          grupo_hash: string
          lancamento_id: string
          lote_importacao_id: string
          numero_documento: string
          observacao: string
          status_duplicidade: string
          subcentro: string
          tipo_operacao: string
          valor: number
        }[]
      }
      can_manage_financeiro_importacao_v2: {
        Args: { _cliente_id: string }
        Returns: boolean
      }
      can_manage_financeiro_lancamento_v2: {
        Args: { _cliente_id: string; _origem_lancamento: string }
        Returns: boolean
      }
      cancel_financeiro_importacao_v2: {
        Args: { _importacao_id: string }
        Returns: Json
      }
      classificar_nivel_duplicidade: {
        Args: {
          _existing_conta_bancaria_id: string
          _existing_data_pagamento: string
          _existing_descricao: string
          _existing_favorecido_id: string
          _existing_numero_documento: string
          _existing_subcentro: string
          _existing_tipo_operacao: string
          _existing_valor: number
          _new_conta_bancaria_id: string
          _new_data_pagamento: string
          _new_descricao: string
          _new_favorecido_id: string
          _new_numero_documento: string
          _new_subcentro: string
          _new_tipo_operacao: string
          _new_valor: number
        }
        Returns: string
      }
      compute_financeiro_lancamento_v2_hash: {
        Args: {
          _cliente_id: string
          _conta_bancaria_id: string
          _data_competencia: string
          _data_pagamento: string
          _descricao: string
          _documento: string
          _favorecido_id: string
          _fazenda_id: string
          _numero_documento: string
          _tipo_operacao: string
          _valor: number
        }
        Returns: string
      }
      fn_auditoria_consistencia_zoot: {
        Args: { p_fazenda_id?: string }
        Returns: {
          ano: number
          cat_peso_total_final: number
          cat_saldo_final: number
          cenario: string
          diff_peso_total_final: number
          diff_saldo_final: number
          faz_peso_total_final: number
          faz_saldo_final: number
          fazenda_id: string
          mes: number
        }[]
      }
      get_status_pilares_fechamento: {
        Args: { _ano_mes: string; _fazenda_id: string }
        Returns: Json
      }
      get_user_cliente_id: { Args: { _user_id?: string }; Returns: string }
      get_user_cliente_ids: { Args: { _user_id?: string }; Returns: string[] }
      get_user_perfil: {
        Args: { _cliente_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["perfil_acesso"]
      }
      is_admin_agroinblue: { Args: { _user_id?: string }; Returns: boolean }
      is_cliente_member: {
        Args: { _cliente_id: string; _user_id: string }
        Returns: boolean
      }
      is_fazenda_member: {
        Args: { _fazenda_id: string; _user_id: string }
        Returns: boolean
      }
      reabrir_pilar_fechamento: {
        Args: {
          _ano_mes: string
          _fazenda_id: string
          _motivo?: string
          _pilar: string
        }
        Returns: Json
      }
      resolve_transfer_destination_fazenda: {
        Args: { _destino_nome: string; _origem_fazenda_id: string }
        Returns: string
      }
      shares_fazenda: {
        Args: { _target_user_id: string; _viewer_id: string }
        Returns: boolean
      }
      validar_conciliacao_rebanho: {
        Args: { _ano_mes: string; _fazenda_id: string }
        Returns: Json
      }
    }
    Enums: {
      perfil_acesso:
        | "admin_agroinblue"
        | "gestor_cliente"
        | "financeiro"
        | "campo"
        | "leitura"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      perfil_acesso: [
        "admin_agroinblue",
        "gestor_cliente",
        "financeiro",
        "campo",
        "leitura",
      ],
    },
  },
} as const
