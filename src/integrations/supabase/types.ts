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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _backup_rebanho_auto_escopo_null_20260515: {
        Row: {
          ano: number | null
          cenario: string | null
          centro_custo: string | null
          cliente_id: string | null
          created_at: string | null
          escopo_antes: string | null
          fazenda_id: string | null
          grupo_custo: string | null
          id: string | null
          macro_custo: string | null
          mes: number | null
          origem: string | null
          snapshot_em: string | null
          subcentro: string | null
          updated_at: string | null
          valor_planejado: number | null
        }
        Insert: {
          ano?: number | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          escopo_antes?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          macro_custo?: string | null
          mes?: number | null
          origem?: string | null
          snapshot_em?: string | null
          subcentro?: string | null
          updated_at?: string | null
          valor_planejado?: number | null
        }
        Update: {
          ano?: number | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          escopo_antes?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          macro_custo?: string | null
          mes?: number | null
          origem?: string | null
          snapshot_em?: string | null
          subcentro?: string | null
          updated_at?: string | null
          valor_planejado?: number | null
        }
        Relationships: []
      }
      _backup_venda_amendoim_escopo_20260515: {
        Row: {
          ano: number | null
          cenario: string | null
          centro_custo: string | null
          cliente_id: string | null
          created_at: string | null
          escopo_antes: string | null
          fazenda_id: string | null
          grupo_custo: string | null
          id: string | null
          macro_custo: string | null
          mes: number | null
          origem: string | null
          origem_snapshot: string | null
          snapshot_em: string | null
          subcentro: string | null
          updated_at: string | null
          valor_planejado: number | null
        }
        Insert: {
          ano?: number | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          escopo_antes?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          macro_custo?: string | null
          mes?: number | null
          origem?: string | null
          origem_snapshot?: string | null
          snapshot_em?: string | null
          subcentro?: string | null
          updated_at?: string | null
          valor_planejado?: number | null
        }
        Update: {
          ano?: number | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          escopo_antes?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          macro_custo?: string | null
          mes?: number | null
          origem?: string | null
          origem_snapshot?: string | null
          snapshot_em?: string | null
          subcentro?: string | null
          updated_at?: string | null
          valor_planejado?: number | null
        }
        Relationships: []
      }
      _bkp_morte_ident_20260806: {
        Row: {
          abate_fornecedor_id: string | null
          abate_frigorifico: string | null
          acrescimos: number | null
          anexo_acerto_url: string | null
          anexo_nf_url: string | null
          ano_mes: string | null
          arroba: number | null
          boitel_id: string | null
          boitel_lote_id: string | null
          bonus_lista_trace: number | null
          bonus_precoce: number | null
          bonus_qualidade: number | null
          cancelado: boolean | null
          cancelado_em: string | null
          cancelado_por: string | null
          categoria: string | null
          categoria_destino: string | null
          categoria_id: string | null
          categoria_mae_id: string | null
          cenario: string | null
          cliente_id: string | null
          comprador_fornecedor: string | null
          comprador_fornecedor_id: string | null
          created_at: string | null
          created_by: string | null
          data: string | null
          data_abate: string | null
          data_embarque: string | null
          data_venda: string | null
          deducoes: number | null
          desconto_funrural: number | null
          desconto_qualidade: number | null
          destino_final: string | null
          detalhes_snapshot: Json | null
          doc_acerto: string | null
          fazenda_destino: string | null
          fazenda_destino_id: string | null
          fazenda_id: string | null
          fazenda_origem: string | null
          finalidade: string | null
          fornecedor_id: string | null
          fornecedor_nome_snapshot: string | null
          frigorifico: string | null
          hash_linha: string | null
          id: string | null
          instrucao: string | null
          lote: string | null
          lote_importacao_id: string | null
          motivo: string | null
          numero_documento: string | null
          numero_id: string | null
          observacao: string | null
          origem: string | null
          origem_registro: string | null
          outros_descontos: number | null
          pedido: string | null
          peso_carcaca_kg: number | null
          peso_medio_arrobas: number | null
          peso_medio_kg: number | null
          peso_total: number | null
          peso_vivo_total: number | null
          preco_arroba: number | null
          preco_medio_cabeca: number | null
          preco_unitario: number | null
          quantidade: number | null
          rendimento: number | null
          rendimento_carcaca: number | null
          sexo: string | null
          status_operacional: string | null
          tipo: string | null
          tipo_abate: string | null
          tipo_peso: string | null
          tipo_venda: string | null
          transferencia_par_id: string | null
          updated_at: string | null
          updated_by: string | null
          valor_total: number | null
        }
        Insert: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string | null
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string | null
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string | null
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo?: string | null
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Update: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string | null
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string | null
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string | null
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo?: string | null
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      _bkp_ofx_dup_20260804: {
        Row: {
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          cliente_id: string | null
          conta_bancaria_id: string | null
          created_at: string | null
          data_movimento: string | null
          descricao: string | null
          documento: string | null
          flag_suspeita_fornecedor: boolean | null
          flag_suspeita_motivo: string | null
          flag_suspeita_valor: boolean | null
          hash_movimento: string | null
          id: string | null
          ignorado_em: string | null
          ignorado_impacto: number | null
          ignorado_motivo: string | null
          ignorado_por: string | null
          ignorado_ultima_copia: boolean | null
          importacao_id: string | null
          orfao_definitivo: boolean | null
          orfao_definitivo_em: string | null
          orfao_definitivo_motivo: string | null
          orfao_definitivo_por: string | null
          saldo_apos: number | null
          seq_ocorrencia: number | null
          status: string | null
          tipo_movimento: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          data_movimento?: string | null
          descricao?: string | null
          documento?: string | null
          flag_suspeita_fornecedor?: boolean | null
          flag_suspeita_motivo?: string | null
          flag_suspeita_valor?: boolean | null
          hash_movimento?: string | null
          id?: string | null
          ignorado_em?: string | null
          ignorado_impacto?: number | null
          ignorado_motivo?: string | null
          ignorado_por?: string | null
          ignorado_ultima_copia?: boolean | null
          importacao_id?: string | null
          orfao_definitivo?: boolean | null
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          saldo_apos?: number | null
          seq_ocorrencia?: number | null
          status?: string | null
          tipo_movimento?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          data_movimento?: string | null
          descricao?: string | null
          documento?: string | null
          flag_suspeita_fornecedor?: boolean | null
          flag_suspeita_motivo?: string | null
          flag_suspeita_valor?: boolean | null
          hash_movimento?: string | null
          id?: string | null
          ignorado_em?: string | null
          ignorado_impacto?: number | null
          ignorado_motivo?: string | null
          ignorado_por?: string | null
          ignorado_ultima_copia?: boolean | null
          importacao_id?: string | null
          orfao_definitivo?: boolean | null
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          saldo_apos?: number | null
          seq_ocorrencia?: number | null
          status?: string | null
          tipo_movimento?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      _bkp_p0h_cbi_20260630: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          cliente_id: string | null
          created_at: string | null
          criado_por: string | null
          desfeito_em: string | null
          desfeito_motivo: string | null
          desfeito_por: string | null
          extrato_id: string | null
          id: string | null
          lancamento_id: string | null
          snapshot_extrato_data: string | null
          snapshot_extrato_valor: number | null
          snapshot_favorecido_id: string | null
          snapshot_flags_no_momento: Json | null
          snapshot_historico_banco: string | null
          snapshot_lancamento_data: string | null
          snapshot_lancamento_valor: number | null
          sugestao_score_aprovado: number | null
          tipo_aprovacao: string | null
          valor_aplicado: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cliente_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          desfeito_em?: string | null
          desfeito_motivo?: string | null
          desfeito_por?: string | null
          extrato_id?: string | null
          id?: string | null
          lancamento_id?: string | null
          snapshot_extrato_data?: string | null
          snapshot_extrato_valor?: number | null
          snapshot_favorecido_id?: string | null
          snapshot_flags_no_momento?: Json | null
          snapshot_historico_banco?: string | null
          snapshot_lancamento_data?: string | null
          snapshot_lancamento_valor?: number | null
          sugestao_score_aprovado?: number | null
          tipo_aprovacao?: string | null
          valor_aplicado?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cliente_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          desfeito_em?: string | null
          desfeito_motivo?: string | null
          desfeito_por?: string | null
          extrato_id?: string | null
          id?: string | null
          lancamento_id?: string | null
          snapshot_extrato_data?: string | null
          snapshot_extrato_valor?: number | null
          snapshot_favorecido_id?: string | null
          snapshot_flags_no_momento?: Json | null
          snapshot_historico_banco?: string | null
          snapshot_lancamento_data?: string | null
          snapshot_lancamento_valor?: number | null
          sugestao_score_aprovado?: number | null
          tipo_aprovacao?: string | null
          valor_aplicado?: number | null
        }
        Relationships: []
      }
      _bkp_p0h_extrato_20260630: {
        Row: {
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          cliente_id: string | null
          conta_bancaria_id: string | null
          created_at: string | null
          data_movimento: string | null
          descricao: string | null
          documento: string | null
          flag_suspeita_fornecedor: boolean | null
          flag_suspeita_motivo: string | null
          flag_suspeita_valor: boolean | null
          hash_movimento: string | null
          id: string | null
          importacao_id: string | null
          orfao_definitivo: boolean | null
          orfao_definitivo_em: string | null
          orfao_definitivo_motivo: string | null
          orfao_definitivo_por: string | null
          saldo_apos: number | null
          status: string | null
          tipo_movimento: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          data_movimento?: string | null
          descricao?: string | null
          documento?: string | null
          flag_suspeita_fornecedor?: boolean | null
          flag_suspeita_motivo?: string | null
          flag_suspeita_valor?: boolean | null
          hash_movimento?: string | null
          id?: string | null
          importacao_id?: string | null
          orfao_definitivo?: boolean | null
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          saldo_apos?: number | null
          status?: string | null
          tipo_movimento?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          data_movimento?: string | null
          descricao?: string | null
          documento?: string | null
          flag_suspeita_fornecedor?: boolean | null
          flag_suspeita_motivo?: string | null
          flag_suspeita_valor?: boolean | null
          hash_movimento?: string | null
          id?: string | null
          importacao_id?: string | null
          orfao_definitivo?: boolean | null
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          saldo_apos?: number | null
          status?: string | null
          tipo_movimento?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      _bkp_p0h_lancto_20260630: {
        Row: {
          ano_mes: string | null
          boitel_id: string | null
          boitel_lote_id: string | null
          cancelado: boolean | null
          cancelado_em: string | null
          cancelado_por: string | null
          cenario: string | null
          centro_custo: string | null
          cliente_id: string | null
          conciliado_em: string | null
          conta_bancaria_id: string | null
          conta_destino_id: string | null
          contrato_id: string | null
          created_at: string | null
          created_by: string | null
          dados_pagamento: Json | null
          data_competencia: string | null
          data_pagamento: string | null
          descricao: string | null
          documento: string | null
          duplicado_de_id: string | null
          editado_manual: boolean | null
          escopo_negocio: string | null
          favorecido_id: string | null
          fazenda_id: string | null
          financiamento_id: string | null
          forma_pagamento: string | null
          grupo_custo: string | null
          grupo_geracao_id: string | null
          hash_importacao: string | null
          historico: string | null
          id: string | null
          importado_duplicado: boolean | null
          lote_importacao_id: string | null
          macro_custo: string | null
          movimentacao_rebanho_id: string | null
          nivel_duplicidade: number | null
          numero_documento: string | null
          observacao: string | null
          orfao_definitivo: boolean | null
          orfao_definitivo_em: string | null
          orfao_definitivo_motivo: string | null
          orfao_definitivo_por: string | null
          origem_apontamento:
            | Database["public"]["Enums"]["origem_apontamento_enum"]
            | null
          origem_lancamento: string | null
          origem_tipo: string | null
          plano_conta_id: string | null
          safra_id: string | null
          sem_movimentacao_caixa: boolean | null
          sinal: string | null
          staging_id: string | null
          status_duplicidade: string | null
          status_transacao: string | null
          subcentro: string | null
          tipo_documento: string | null
          tipo_operacao: string | null
          transferencia_grupo_id: string | null
          updated_at: string | null
          updated_by: string | null
          valor: number | null
        }
        Insert: {
          ano_mes?: string | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          contrato_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dados_pagamento?: Json | null
          data_competencia?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          documento?: string | null
          duplicado_de_id?: string | null
          editado_manual?: boolean | null
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          financiamento_id?: string | null
          forma_pagamento?: string | null
          grupo_custo?: string | null
          grupo_geracao_id?: string | null
          hash_importacao?: string | null
          historico?: string | null
          id?: string | null
          importado_duplicado?: boolean | null
          lote_importacao_id?: string | null
          macro_custo?: string | null
          movimentacao_rebanho_id?: string | null
          nivel_duplicidade?: number | null
          numero_documento?: string | null
          observacao?: string | null
          orfao_definitivo?: boolean | null
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          origem_apontamento?:
            | Database["public"]["Enums"]["origem_apontamento_enum"]
            | null
          origem_lancamento?: string | null
          origem_tipo?: string | null
          plano_conta_id?: string | null
          safra_id?: string | null
          sem_movimentacao_caixa?: boolean | null
          sinal?: string | null
          staging_id?: string | null
          status_duplicidade?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          transferencia_grupo_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor?: number | null
        }
        Update: {
          ano_mes?: string | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          contrato_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dados_pagamento?: Json | null
          data_competencia?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          documento?: string | null
          duplicado_de_id?: string | null
          editado_manual?: boolean | null
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          financiamento_id?: string | null
          forma_pagamento?: string | null
          grupo_custo?: string | null
          grupo_geracao_id?: string | null
          hash_importacao?: string | null
          historico?: string | null
          id?: string | null
          importado_duplicado?: boolean | null
          lote_importacao_id?: string | null
          macro_custo?: string | null
          movimentacao_rebanho_id?: string | null
          nivel_duplicidade?: number | null
          numero_documento?: string | null
          observacao?: string | null
          orfao_definitivo?: boolean | null
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          origem_apontamento?:
            | Database["public"]["Enums"]["origem_apontamento_enum"]
            | null
          origem_lancamento?: string | null
          origem_tipo?: string | null
          plano_conta_id?: string | null
          safra_id?: string | null
          sem_movimentacao_caixa?: boolean | null
          sinal?: string | null
          staging_id?: string | null
          status_duplicidade?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          transferencia_grupo_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      _bkp_venc_20260823: {
        Row: {
          id: string | null
        }
        Insert: {
          id?: string | null
        }
        Update: {
          id?: string | null
        }
        Relationships: []
      }
      _bkp_venc_b_20260823: {
        Row: {
          data_pagamento: string | null
          id: string | null
        }
        Insert: {
          data_pagamento?: string | null
          id?: string | null
        }
        Update: {
          data_pagamento?: string | null
          id?: string | null
        }
        Relationships: []
      }
      admin_agroinblue: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
        Relationships: []
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
          cliente_id: string | null
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          detalhes: Json | null
          fazenda_id: string | null
          financeiro_ids: string[] | null
          id: string
          lancamento_id: string | null
          movimentacao_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          cliente_id?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          detalhes?: Json | null
          fazenda_id?: string | null
          financeiro_ids?: string[] | null
          id?: string
          lancamento_id?: string | null
          movimentacao_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          cliente_id?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          detalhes?: Json | null
          fazenda_id?: string | null
          financeiro_ids?: string[] | null
          id?: string
          lancamento_id?: string | null
          movimentacao_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      backup_lanc_transferencia_entrada_2020_nj_20260514: {
        Row: {
          abate_fornecedor_id: string | null
          abate_frigorifico: string | null
          acrescimos: number | null
          anexo_acerto_url: string | null
          anexo_nf_url: string | null
          ano_mes: string | null
          arroba: number | null
          boitel_id: string | null
          boitel_lote_id: string | null
          bonus_lista_trace: number | null
          bonus_precoce: number | null
          bonus_qualidade: number | null
          cancelado: boolean | null
          cancelado_em: string | null
          cancelado_por: string | null
          categoria: string | null
          categoria_destino: string | null
          categoria_id: string | null
          categoria_mae_id: string | null
          cenario: string | null
          cliente_id: string | null
          comprador_fornecedor: string | null
          comprador_fornecedor_id: string | null
          created_at: string | null
          created_by: string | null
          data: string | null
          data_abate: string | null
          data_embarque: string | null
          data_venda: string | null
          deducoes: number | null
          desconto_funrural: number | null
          desconto_qualidade: number | null
          destino_final: string | null
          detalhes_snapshot: Json | null
          doc_acerto: string | null
          fazenda_destino: string | null
          fazenda_destino_id: string | null
          fazenda_id: string | null
          fazenda_origem: string | null
          finalidade: string | null
          frigorifico: string | null
          hash_linha: string | null
          id: string | null
          instrucao: string | null
          lote: string | null
          lote_importacao_id: string | null
          motivo: string | null
          numero_documento: string | null
          numero_id: string | null
          observacao: string | null
          origem: string | null
          origem_registro: string | null
          outros_descontos: number | null
          pedido: string | null
          peso_carcaca_kg: number | null
          peso_medio_arrobas: number | null
          peso_medio_kg: number | null
          peso_total: number | null
          peso_vivo_total: number | null
          preco_arroba: number | null
          preco_medio_cabeca: number | null
          preco_unitario: number | null
          quantidade: number | null
          rendimento: number | null
          rendimento_carcaca: number | null
          sexo: string | null
          status_operacional: string | null
          tipo: string | null
          tipo_abate: string | null
          tipo_peso: string | null
          tipo_venda: string | null
          transferencia_par_id: string | null
          updated_at: string | null
          updated_by: string | null
          valor_total: number | null
        }
        Insert: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string | null
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string | null
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo?: string | null
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Update: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string | null
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string | null
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo?: string | null
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      bancos_referencia: {
        Row: {
          ativo: boolean
          codigo_banco: string
          created_at: string | null
          id: string
          nome_banco: string
          nome_curto: string
          ordem_exibicao: number
        }
        Insert: {
          ativo?: boolean
          codigo_banco: string
          created_at?: string | null
          id?: string
          nome_banco: string
          nome_curto: string
          ordem_exibicao?: number
        }
        Update: {
          ativo?: boolean
          codigo_banco?: string
          created_at?: string | null
          id?: string
          nome_banco?: string
          nome_curto?: string
          ordem_exibicao?: number
        }
        Relationships: []
      }
      bf_02b_controle: {
        Row: {
          afetadas_pag: number | null
          afetadas_status: number | null
          afetadas_venc: number | null
          aplicado_em: string | null
          cliente_id: string
          elegiveis: number
        }
        Insert: {
          afetadas_pag?: number | null
          afetadas_status?: number | null
          afetadas_venc?: number | null
          aplicado_em?: string | null
          cliente_id: string
          elegiveis: number
        }
        Update: {
          afetadas_pag?: number | null
          afetadas_status?: number | null
          afetadas_venc?: number | null
          aplicado_em?: string | null
          cliente_id?: string
          elegiveis?: number
        }
        Relationships: []
      }
      bkp_amb18: {
        Row: {
          ano_mes: string | null
          capturado_em: string
          cliente_id: string
          data_competencia: string | null
          data_pagamento_antes: string | null
          data_vencimento_antes: string | null
          id: string
          status_transacao: string | null
          updated_at_antes: string
          updated_at_depois: string | null
        }
        Insert: {
          ano_mes?: string | null
          capturado_em?: string
          cliente_id: string
          data_competencia?: string | null
          data_pagamento_antes?: string | null
          data_vencimento_antes?: string | null
          id: string
          status_transacao?: string | null
          updated_at_antes: string
          updated_at_depois?: string | null
        }
        Update: {
          ano_mes?: string | null
          capturado_em?: string
          cliente_id?: string
          data_competencia?: string | null
          data_pagamento_antes?: string | null
          data_vencimento_antes?: string | null
          id?: string
          status_transacao?: string | null
          updated_at_antes?: string
          updated_at_depois?: string | null
        }
        Relationships: []
      }
      bkp_bf_02b: {
        Row: {
          ano_mes: string | null
          capturado_em: string
          cliente_id: string
          data_competencia: string | null
          data_pagamento_antes: string | null
          data_vencimento_antes: string | null
          id: string
          status_transacao_antes: string | null
          updated_at_antes: string | null
          updated_at_depois: string | null
        }
        Insert: {
          ano_mes?: string | null
          capturado_em?: string
          cliente_id: string
          data_competencia?: string | null
          data_pagamento_antes?: string | null
          data_vencimento_antes?: string | null
          id: string
          status_transacao_antes?: string | null
          updated_at_antes?: string | null
          updated_at_depois?: string | null
        }
        Update: {
          ano_mes?: string | null
          capturado_em?: string
          cliente_id?: string
          data_competencia?: string | null
          data_pagamento_antes?: string | null
          data_vencimento_antes?: string | null
          id?: string
          status_transacao_antes?: string | null
          updated_at_antes?: string | null
          updated_at_depois?: string | null
        }
        Relationships: []
      }
      bkp_fin_normalizacao_01_20260829: {
        Row: {
          cliente_id: string | null
          fornecedor_id: string
          gravado_em: string
          nome: string | null
          nome_normalizado_ant: string | null
        }
        Insert: {
          cliente_id?: string | null
          fornecedor_id: string
          gravado_em?: string
          nome?: string | null
          nome_normalizado_ant?: string | null
        }
        Update: {
          cliente_id?: string | null
          fornecedor_id?: string
          gravado_em?: string
          nome?: string | null
          nome_normalizado_ant?: string | null
        }
        Relationships: []
      }
      bkp_lanc_forn_oc_20260828: {
        Row: {
          backup_em: string | null
          fornecedor_id: string | null
          fornecedor_nome_snapshot: string | null
          id: string | null
          operacao_id: string | null
          quantidade: number | null
          valor_total: number | null
        }
        Insert: {
          backup_em?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string | null
          id?: string | null
          operacao_id?: string | null
          quantidade?: number | null
          valor_total?: number | null
        }
        Update: {
          backup_em?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string | null
          id?: string | null
          operacao_id?: string | null
          quantidade?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      bkp_monterrey_tipouso_20260820: {
        Row: {
          ano_mes: string | null
          id: string | null
          pasto_id: string | null
          tipo_uso_mes: string | null
        }
        Insert: {
          ano_mes?: string | null
          id?: string | null
          pasto_id?: string | null
          tipo_uso_mes?: string | null
        }
        Update: {
          ano_mes?: string | null
          id?: string | null
          pasto_id?: string | null
          tipo_uso_mes?: string | null
        }
        Relationships: []
      }
      bkp_oc_canceladas_20260827: {
        Row: {
          acrescimos: number | null
          backup_em: string | null
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          categoria_negociada: string | null
          cenario: string | null
          cliente_id: string | null
          condicao_pagamento: string | null
          contraparte_id: string | null
          created_at: string | null
          created_by: string | null
          data_abate: string | null
          data_embarque: string | null
          data_operacao: string | null
          data_pagamento_prevista: string | null
          descontos: number | null
          entrega_encerrada: boolean | null
          entrega_encerrada_em: string | null
          entrega_encerrada_motivo: string | null
          entrega_encerrada_por: string | null
          erro_sincronizacao: string | null
          fazenda_id: string | null
          hash_financeiro_esperado: string | null
          id: string | null
          is_teste: boolean | null
          modalidade_comercial: string | null
          numero_documento: string | null
          observacoes: string | null
          peso_carcaca_fonte: string | null
          peso_carcaca_kg_total: number | null
          peso_medio_negociado_kg: number | null
          peso_negociado_soberano: string | null
          peso_total_negociado_kg: number | null
          preco_unitario: number | null
          qtd_negociada: number | null
          rascunho: boolean | null
          rendimento_carcaca: number | null
          responsavel: string | null
          responsavel_nome_snapshot: string | null
          sincronizado_em: string | null
          status_comercial: string | null
          status_financeiro: string | null
          tipo_operacao: string | null
          tipo_peso: string | null
          tipo_precificacao: string | null
          ultima_tentativa_em: string | null
          updated_at: string | null
          updated_by: string | null
          valor_acordado: number | null
          valor_bruto: number | null
          valor_estimado: number | null
          valor_total: number | null
          versao: number | null
        }
        Insert: {
          acrescimos?: number | null
          backup_em?: string | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          categoria_negociada?: string | null
          cenario?: string | null
          cliente_id?: string | null
          condicao_pagamento?: string | null
          contraparte_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_operacao?: string | null
          data_pagamento_prevista?: string | null
          descontos?: number | null
          entrega_encerrada?: boolean | null
          entrega_encerrada_em?: string | null
          entrega_encerrada_motivo?: string | null
          entrega_encerrada_por?: string | null
          erro_sincronizacao?: string | null
          fazenda_id?: string | null
          hash_financeiro_esperado?: string | null
          id?: string | null
          is_teste?: boolean | null
          modalidade_comercial?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          peso_carcaca_fonte?: string | null
          peso_carcaca_kg_total?: number | null
          peso_medio_negociado_kg?: number | null
          peso_negociado_soberano?: string | null
          peso_total_negociado_kg?: number | null
          preco_unitario?: number | null
          qtd_negociada?: number | null
          rascunho?: boolean | null
          rendimento_carcaca?: number | null
          responsavel?: string | null
          responsavel_nome_snapshot?: string | null
          sincronizado_em?: string | null
          status_comercial?: string | null
          status_financeiro?: string | null
          tipo_operacao?: string | null
          tipo_peso?: string | null
          tipo_precificacao?: string | null
          ultima_tentativa_em?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_acordado?: number | null
          valor_bruto?: number | null
          valor_estimado?: number | null
          valor_total?: number | null
          versao?: number | null
        }
        Update: {
          acrescimos?: number | null
          backup_em?: string | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          categoria_negociada?: string | null
          cenario?: string | null
          cliente_id?: string | null
          condicao_pagamento?: string | null
          contraparte_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_operacao?: string | null
          data_pagamento_prevista?: string | null
          descontos?: number | null
          entrega_encerrada?: boolean | null
          entrega_encerrada_em?: string | null
          entrega_encerrada_motivo?: string | null
          entrega_encerrada_por?: string | null
          erro_sincronizacao?: string | null
          fazenda_id?: string | null
          hash_financeiro_esperado?: string | null
          id?: string | null
          is_teste?: boolean | null
          modalidade_comercial?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          peso_carcaca_fonte?: string | null
          peso_carcaca_kg_total?: number | null
          peso_medio_negociado_kg?: number | null
          peso_negociado_soberano?: string | null
          peso_total_negociado_kg?: number | null
          preco_unitario?: number | null
          qtd_negociada?: number | null
          rascunho?: boolean | null
          rendimento_carcaca?: number | null
          responsavel?: string | null
          responsavel_nome_snapshot?: string | null
          sincronizado_em?: string | null
          status_comercial?: string | null
          status_financeiro?: string | null
          tipo_operacao?: string | null
          tipo_peso?: string | null
          tipo_precificacao?: string | null
          ultima_tentativa_em?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_acordado?: number | null
          valor_bruto?: number | null
          valor_estimado?: number | null
          valor_total?: number | null
          versao?: number | null
        }
        Relationships: []
      }
      bkp_oc_compromissos_canc_20260827: {
        Row: {
          backup_em: string | null
          centro_custo: string | null
          cliente_id: string | null
          componente: string | null
          created_at: string | null
          descricao: string | null
          favorecido_id: string | null
          grupo_custo: string | null
          id: string | null
          lote_id: string | null
          macro_custo: string | null
          natureza: string | null
          operacao_id: string | null
          plano_conta_id: string | null
          status: string | null
          subcentro: string | null
          updated_at: string | null
          valor_total: number | null
        }
        Insert: {
          backup_em?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          componente?: string | null
          created_at?: string | null
          descricao?: string | null
          favorecido_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          lote_id?: string | null
          macro_custo?: string | null
          natureza?: string | null
          operacao_id?: string | null
          plano_conta_id?: string | null
          status?: string | null
          subcentro?: string | null
          updated_at?: string | null
          valor_total?: number | null
        }
        Update: {
          backup_em?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          componente?: string | null
          created_at?: string | null
          descricao?: string | null
          favorecido_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          lote_id?: string | null
          macro_custo?: string | null
          natureza?: string | null
          operacao_id?: string | null
          plano_conta_id?: string | null
          status?: string | null
          subcentro?: string | null
          updated_at?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      bkp_oc_documentos_canc_20260827: {
        Row: {
          backup_em: string | null
          cancelado: boolean | null
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          chave_acesso: string | null
          cliente_id: string | null
          data_emissao: string | null
          documento_origem_id: string | null
          especie: string | null
          id: string | null
          nome: string | null
          numero: string | null
          observacao: string | null
          operacao_id: string | null
          serie: string | null
          tamanho_bytes: number | null
          tipo: string | null
          updated_at: string | null
          updated_by: string | null
          uploaded_em: string | null
          uploaded_por: string | null
          url: string | null
          versao: number | null
        }
        Insert: {
          backup_em?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          chave_acesso?: string | null
          cliente_id?: string | null
          data_emissao?: string | null
          documento_origem_id?: string | null
          especie?: string | null
          id?: string | null
          nome?: string | null
          numero?: string | null
          observacao?: string | null
          operacao_id?: string | null
          serie?: string | null
          tamanho_bytes?: number | null
          tipo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          uploaded_em?: string | null
          uploaded_por?: string | null
          url?: string | null
          versao?: number | null
        }
        Update: {
          backup_em?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          chave_acesso?: string | null
          cliente_id?: string | null
          data_emissao?: string | null
          documento_origem_id?: string | null
          especie?: string | null
          id?: string | null
          nome?: string | null
          numero?: string | null
          observacao?: string | null
          operacao_id?: string | null
          serie?: string | null
          tamanho_bytes?: number | null
          tipo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          uploaded_em?: string | null
          uploaded_por?: string | null
          url?: string | null
          versao?: number | null
        }
        Relationships: []
      }
      bkp_oc_eventos_canc_20260827: {
        Row: {
          acao: string | null
          backup_em: string | null
          cliente_id: string | null
          created_at: string | null
          dados_anteriores: Json | null
          dados_novos: Json | null
          detalhes: Json | null
          id: string | null
          operacao_id: string | null
          origem: string | null
          usuario_id: string | null
        }
        Insert: {
          acao?: string | null
          backup_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          detalhes?: Json | null
          id?: string | null
          operacao_id?: string | null
          origem?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string | null
          backup_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          detalhes?: Json | null
          id?: string | null
          operacao_id?: string | null
          origem?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      bkp_oc_liquidacoes_canc_20260827: {
        Row: {
          backup_em: string | null
          cliente_id: string | null
          created_at: string | null
          created_by: string | null
          data: string | null
          descricao: string | null
          estornado: boolean | null
          estornado_em: string | null
          estornado_por: string | null
          estorno_motivo: string | null
          financeiro_lancamento_id: string | null
          forma: string | null
          id: string | null
          natureza: string | null
          observacao: string | null
          operacao_id: string | null
          origem: string | null
          permuta_descricao_bem: string | null
          permuta_documento_url: string | null
          permuta_tipo_bem: string | null
          permuta_valor_atribuido: number | null
          updated_at: string | null
          updated_by: string | null
          valor: number | null
        }
        Insert: {
          backup_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          descricao?: string | null
          estornado?: boolean | null
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_motivo?: string | null
          financeiro_lancamento_id?: string | null
          forma?: string | null
          id?: string | null
          natureza?: string | null
          observacao?: string | null
          operacao_id?: string | null
          origem?: string | null
          permuta_descricao_bem?: string | null
          permuta_documento_url?: string | null
          permuta_tipo_bem?: string | null
          permuta_valor_atribuido?: number | null
          updated_at?: string | null
          updated_by?: string | null
          valor?: number | null
        }
        Update: {
          backup_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          descricao?: string | null
          estornado?: boolean | null
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_motivo?: string | null
          financeiro_lancamento_id?: string | null
          forma?: string | null
          id?: string | null
          natureza?: string | null
          observacao?: string | null
          operacao_id?: string | null
          origem?: string | null
          permuta_descricao_bem?: string | null
          permuta_documento_url?: string | null
          permuta_tipo_bem?: string | null
          permuta_valor_atribuido?: number | null
          updated_at?: string | null
          updated_by?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      bkp_oc_lotes_canc_20260827: {
        Row: {
          backup_em: string | null
          categoria_negociada: string | null
          cliente_id: string | null
          created_at: string | null
          created_by: string | null
          criterio_valor: string | null
          id: string | null
          operacao_id: string | null
          ordem: number | null
          peso_medio_negociado_kg: number | null
          qtd_negociada: number | null
          updated_at: string | null
          updated_by: string | null
          valor_informado: number | null
        }
        Insert: {
          backup_em?: string | null
          categoria_negociada?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          criterio_valor?: string | null
          id?: string | null
          operacao_id?: string | null
          ordem?: number | null
          peso_medio_negociado_kg?: number | null
          qtd_negociada?: number | null
          updated_at?: string | null
          updated_by?: string | null
          valor_informado?: number | null
        }
        Update: {
          backup_em?: string | null
          categoria_negociada?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          criterio_valor?: string | null
          id?: string | null
          operacao_id?: string | null
          ordem?: number | null
          peso_medio_negociado_kg?: number | null
          qtd_negociada?: number | null
          updated_at?: string | null
          updated_by?: string | null
          valor_informado?: number | null
        }
        Relationships: []
      }
      bkp_oc_movimentacoes_canc_20260827: {
        Row: {
          backup_em: string | null
          cliente_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          movimentacao_id: string | null
          operacao_id: string | null
          operacao_lote_id: string | null
        }
        Insert: {
          backup_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          movimentacao_id?: string | null
          operacao_id?: string | null
          operacao_lote_id?: string | null
        }
        Update: {
          backup_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          movimentacao_id?: string | null
          operacao_id?: string | null
          operacao_lote_id?: string | null
        }
        Relationships: []
      }
      bkp_oc_parcelas_canc_20260827: {
        Row: {
          backup_em: string | null
          cliente_id: string | null
          conta_bancaria_id: string | null
          created_at: string | null
          forma: string | null
          id: string | null
          programacao_id: string | null
          sequencia: number | null
          status: string | null
          updated_at: string | null
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          backup_em?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          forma?: string | null
          id?: string | null
          programacao_id?: string | null
          sequencia?: number | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          backup_em?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          forma?: string | null
          id?: string | null
          programacao_id?: string | null
          sequencia?: number | null
          status?: string | null
          updated_at?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: []
      }
      bkp_oc_partes_canc_20260827: {
        Row: {
          backup_em: string | null
          cancelada: boolean | null
          cancelada_em: string | null
          cancelada_motivo: string | null
          cancelada_por: string | null
          centro_custo: string | null
          chave_idempotencia: string | null
          cliente_id: string | null
          componente: string | null
          created_at: string | null
          data_vencimento: string | null
          descricao: string | null
          documento_componente_id: string | null
          documento_id: string | null
          favorecido_id: string | null
          financeiro_lancamento_id: string | null
          grupo_custo: string | null
          id: string | null
          incluso_no_total: boolean | null
          lote_id: string | null
          macro_custo: string | null
          natureza: string | null
          operacao_id: string | null
          origem: string | null
          plano_conta_id: string | null
          programacao_parcela_id: string | null
          quantidade_parcelas: number | null
          sem_movimentacao_caixa: boolean | null
          sequencia_parcela: number | null
          subcentro: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          backup_em?: string | null
          cancelada?: boolean | null
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          cancelada_por?: string | null
          centro_custo?: string | null
          chave_idempotencia?: string | null
          cliente_id?: string | null
          componente?: string | null
          created_at?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          documento_componente_id?: string | null
          documento_id?: string | null
          favorecido_id?: string | null
          financeiro_lancamento_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          incluso_no_total?: boolean | null
          lote_id?: string | null
          macro_custo?: string | null
          natureza?: string | null
          operacao_id?: string | null
          origem?: string | null
          plano_conta_id?: string | null
          programacao_parcela_id?: string | null
          quantidade_parcelas?: number | null
          sem_movimentacao_caixa?: boolean | null
          sequencia_parcela?: number | null
          subcentro?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          backup_em?: string | null
          cancelada?: boolean | null
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          cancelada_por?: string | null
          centro_custo?: string | null
          chave_idempotencia?: string | null
          cliente_id?: string | null
          componente?: string | null
          created_at?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          documento_componente_id?: string | null
          documento_id?: string | null
          favorecido_id?: string | null
          financeiro_lancamento_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          incluso_no_total?: boolean | null
          lote_id?: string | null
          macro_custo?: string | null
          natureza?: string | null
          operacao_id?: string | null
          origem?: string | null
          plano_conta_id?: string | null
          programacao_parcela_id?: string | null
          quantidade_parcelas?: number | null
          sem_movimentacao_caixa?: boolean | null
          sequencia_parcela?: number | null
          subcentro?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      bkp_oc_programacoes_canc_20260827: {
        Row: {
          backup_em: string | null
          cliente_id: string | null
          compromisso_id: string | null
          condicoes: string | null
          created_at: string | null
          id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          backup_em?: string | null
          cliente_id?: string | null
          compromisso_id?: string | null
          condicoes?: string | null
          created_at?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          backup_em?: string | null
          cliente_id?: string | null
          compromisso_id?: string | null
          condicoes?: string | null
          created_at?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bkp_oc_titulo_conta_20260827: {
        Row: {
          backup_em: string | null
          cliente_id: string | null
          conta_bancaria_id: string | null
          conta_parcela: string | null
          descricao: string | null
          id: string | null
          operacao_id: string | null
          parte_id: string | null
          programacao_parcela_id: string | null
          status_transacao: string | null
          valor: number | null
        }
        Insert: {
          backup_em?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          conta_parcela?: string | null
          descricao?: string | null
          id?: string | null
          operacao_id?: string | null
          parte_id?: string | null
          programacao_parcela_id?: string | null
          status_transacao?: string | null
          valor?: number | null
        }
        Update: {
          backup_em?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          conta_parcela?: string | null
          descricao?: string | null
          id?: string | null
          operacao_id?: string | null
          parte_id?: string | null
          programacao_parcela_id?: string | null
          status_transacao?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      bkp_oc_venda_cutover_20260830: {
        Row: {
          abate_fornecedor_id: string | null
          abate_frigorifico: string | null
          acrescimos: number | null
          anexo_acerto_url: string | null
          anexo_nf_url: string | null
          ano_mes: string | null
          arroba: number | null
          boitel_id: string | null
          boitel_lote_id: string | null
          bonus_lista_trace: number | null
          bonus_precoce: number | null
          bonus_qualidade: number | null
          cancelado: boolean | null
          cancelado_em: string | null
          cancelado_por: string | null
          categoria: string | null
          categoria_destino: string | null
          categoria_id: string | null
          categoria_mae_id: string | null
          cenario: string | null
          cliente_id: string | null
          comprador_fornecedor: string | null
          comprador_fornecedor_id: string | null
          created_at: string | null
          created_by: string | null
          data: string | null
          data_abate: string | null
          data_embarque: string | null
          data_venda: string | null
          deducoes: number | null
          desconto_funrural: number | null
          desconto_qualidade: number | null
          destino_final: string | null
          detalhes_snapshot: Json | null
          doc_acerto: string | null
          fazenda_destino: string | null
          fazenda_destino_id: string | null
          fazenda_id: string | null
          fazenda_origem: string | null
          finalidade: string | null
          fornecedor_id: string | null
          fornecedor_nome_snapshot: string | null
          frigorifico: string | null
          hash_linha: string | null
          id: string | null
          instrucao: string | null
          lote: string | null
          lote_importacao_id: string | null
          motivo: string | null
          numero_documento: string | null
          numero_id: string | null
          observacao: string | null
          origem: string | null
          origem_registro: string | null
          outros_descontos: number | null
          pedido: string | null
          peso_carcaca_kg: number | null
          peso_medio_arrobas: number | null
          peso_medio_kg: number | null
          peso_total: number | null
          peso_vivo_total: number | null
          preco_arroba: number | null
          preco_medio_cabeca: number | null
          preco_unitario: number | null
          quantidade: number | null
          rendimento: number | null
          rendimento_carcaca: number | null
          sexo: string | null
          status_operacional: string | null
          tipo: string | null
          tipo_abate: string | null
          tipo_peso: string | null
          tipo_venda: string | null
          transferencia_par_id: string | null
          updated_at: string | null
          updated_by: string | null
          valor_total: number | null
        }
        Insert: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string | null
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string | null
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string | null
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo?: string | null
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Update: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string | null
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string | null
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string | null
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo?: string | null
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      bkp_si_muchachas_bois_20260820: {
        Row: {
          ano: number | null
          categoria: string | null
          categoria_id: string | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string | null
          mes: number | null
          peso_medio_kg: number | null
          peso_total: number | null
          preco_kg: number | null
          quantidade: number | null
        }
        Insert: {
          ano?: number | null
          categoria?: string | null
          categoria_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string | null
          mes?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          preco_kg?: number | null
          quantidade?: number | null
        }
        Update: {
          ano?: number | null
          categoria?: string | null
          categoria_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string | null
          mes?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          preco_kg?: number | null
          quantidade?: number | null
        }
        Relationships: []
      }
      boitel_adiantamentos: {
        Row: {
          cliente_id: string
          created_at: string
          data: string
          descricao: string | null
          id: string
          lote_id: string
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data: string
          descricao?: string | null
          id?: string
          lote_id: string
          valor?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          lote_id?: string
          valor?: number
        }
        Relationships: []
      }
      boitel_lotes: {
        Row: {
          cliente_id: string
          created_at: string
          data_entrada: string | null
          data_saida_prevista: string | null
          data_saida_real: string | null
          fazenda_id: string
          id: string
          nome: string
          status: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_entrada?: string | null
          data_saida_prevista?: string | null
          data_saida_real?: string | null
          fazenda_id: string
          id?: string
          nome: string
          status?: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_entrada?: string | null
          data_saida_prevista?: string | null
          data_saida_real?: string | null
          fazenda_id?: string
          id?: string
          nome?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      boitel_operacoes: {
        Row: {
          cliente_id: string
          created_at: string
          data: string
          id: string
          lote_id: string
          observacoes: string | null
          peso_total_kg: number
          quantidade: number
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data: string
          id?: string
          lote_id: string
          observacoes?: string | null
          peso_total_kg?: number
          quantidade?: number
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data?: string
          id?: string
          lote_id?: string
          observacoes?: string | null
          peso_total_kg?: number
          quantidade?: number
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      boitel_planejamento: {
        Row: {
          ano: number
          cabecas_previstas: number
          cliente_id: string
          created_at: string
          diaria_prevista: number
          fazenda_id: string
          id: string
          mes: number
          receita_prevista: number
          updated_at: string
        }
        Insert: {
          ano: number
          cabecas_previstas?: number
          cliente_id: string
          created_at?: string
          diaria_prevista?: number
          fazenda_id: string
          id?: string
          mes: number
          receita_prevista?: number
          updated_at?: string
        }
        Update: {
          ano?: number
          cabecas_previstas?: number
          cliente_id?: string
          created_at?: string
          diaria_prevista?: number
          fazenda_id?: string
          id?: string
          mes?: number
          receita_prevista?: number
          updated_at?: string
        }
        Relationships: []
      }
      boitel_planejamento_historico: {
        Row: {
          created_at: string
          dados: Json
          id: string
          planejamento_id: string
          versao: number
        }
        Insert: {
          created_at?: string
          dados?: Json
          id?: string
          planejamento_id: string
          versao: number
        }
        Update: {
          created_at?: string
          dados?: Json
          id?: string
          planejamento_id?: string
          versao?: number
        }
        Relationships: []
      }
      categorias: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          ordem: number | null
          tipo: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
          ordem?: number | null
          tipo: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          tipo?: string
        }
        Relationships: []
      }
      categorias_rebanho: {
        Row: {
          ativo: boolean | null
          codigo: string | null
          created_at: string | null
          id: string
          nome: string | null
          ordem_exibicao: number | null
        }
        Insert: {
          ativo?: boolean | null
          codigo?: string | null
          created_at?: string | null
          id?: string
          nome?: string | null
          ordem_exibicao?: number | null
        }
        Update: {
          ativo?: boolean | null
          codigo?: string | null
          created_at?: string | null
          id?: string
          nome?: string | null
          ordem_exibicao?: number | null
        }
        Relationships: []
      }
      cfg_categoria_parametros: {
        Row: {
          ativo: boolean | null
          categoria_codigo: string
          categoria_id: string
          categoria_proxima: string | null
          cliente_id: string
          created_at: string
          gmd_meta_kg: number | null
          grupo: string
          id: string
          is_default: boolean | null
          ordem_hierarquia: number
          peso_evolucao_kg: number | null
          peso_max_kg: number
          peso_medio_entrada_kg: number | null
          peso_medio_saida_kg: number | null
          peso_min_kg: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          categoria_codigo: string
          categoria_id: string
          categoria_proxima?: string | null
          cliente_id: string
          created_at?: string
          gmd_meta_kg?: number | null
          grupo: string
          id?: string
          is_default?: boolean | null
          ordem_hierarquia: number
          peso_evolucao_kg?: number | null
          peso_max_kg: number
          peso_medio_entrada_kg?: number | null
          peso_medio_saida_kg?: number | null
          peso_min_kg: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          categoria_codigo?: string
          categoria_id?: string
          categoria_proxima?: string | null
          cliente_id?: string
          created_at?: string
          gmd_meta_kg?: number | null
          grupo?: string
          id?: string
          is_default?: boolean | null
          ordem_hierarquia?: number
          peso_evolucao_kg?: number | null
          peso_max_kg?: number
          peso_medio_entrada_kg?: number | null
          peso_medio_saida_kg?: number | null
          peso_min_kg?: number
          updated_at?: string
        }
        Relationships: []
      }
      chuvas: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          created_by: string | null
          data: string
          fazenda_id: string
          id: string
          milimetros: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data: string
          fazenda_id: string
          id?: string
          milimetros?: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string
          fazenda_id?: string
          id?: string
          milimetros?: number
        }
        Relationships: [
          {
            foreignKeyName: "chuvas_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      chuvas_backup_20260516: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          data: string | null
          fazenda_id: string | null
          id: string | null
          milimetros: number | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          data?: string | null
          fazenda_id?: string | null
          id?: string | null
          milimetros?: number | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          data?: string | null
          fazenda_id?: string | null
          id?: string | null
          milimetros?: number | null
        }
        Relationships: []
      }
      cliente_membros: {
        Row: {
          ativo: boolean
          cliente_id: string
          created_at: string | null
          id: string
          perfil: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          created_at?: string | null
          id?: string
          perfil?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          created_at?: string | null
          id?: string
          perfil?: string
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
          ativo: boolean | null
          config: Json | null
          created_at: string | null
          email: string | null
          id: string
          nome: string
          slug: string | null
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          config?: Json | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          slug?: string | null
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          config?: Json | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          slug?: string | null
          telefone?: string | null
          user_id?: string | null
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
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      conciliacao_audit_log: {
        Row: {
          acao: string
          actor_user_id: string | null
          ano_mes: string | null
          cliente_id: string
          conciliacao_id: string | null
          created_at: string
          extrato_id: string | null
          id: string
          importacao_id: string | null
          lancamento_id: string | null
          motivo: string | null
          payload_antes: Json | null
          payload_depois: Json | null
        }
        Insert: {
          acao: string
          actor_user_id?: string | null
          ano_mes?: string | null
          cliente_id: string
          conciliacao_id?: string | null
          created_at?: string
          extrato_id?: string | null
          id?: string
          importacao_id?: string | null
          lancamento_id?: string | null
          motivo?: string | null
          payload_antes?: Json | null
          payload_depois?: Json | null
        }
        Update: {
          acao?: string
          actor_user_id?: string | null
          ano_mes?: string | null
          cliente_id?: string
          conciliacao_id?: string | null
          created_at?: string
          extrato_id?: string | null
          id?: string
          importacao_id?: string | null
          lancamento_id?: string | null
          motivo?: string | null
          payload_antes?: Json | null
          payload_depois?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliacao_audit_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacao_bancaria_itens: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          cliente_id: string
          created_at: string
          criado_por: string | null
          desfeito_em: string | null
          desfeito_motivo: string | null
          desfeito_por: string | null
          extrato_id: string
          grupo_id: string | null
          id: string
          lancamento_id: string
          snapshot_extrato_data: string | null
          snapshot_extrato_valor: number | null
          snapshot_favorecido_id: string | null
          snapshot_flags_no_momento: Json | null
          snapshot_historico_banco: string | null
          snapshot_lancamento_data: string | null
          snapshot_lancamento_valor: number | null
          sugestao_score_aprovado: number | null
          tipo_aprovacao: string
          valor_aplicado: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cliente_id: string
          created_at?: string
          criado_por?: string | null
          desfeito_em?: string | null
          desfeito_motivo?: string | null
          desfeito_por?: string | null
          extrato_id: string
          grupo_id?: string | null
          id?: string
          lancamento_id: string
          snapshot_extrato_data?: string | null
          snapshot_extrato_valor?: number | null
          snapshot_favorecido_id?: string | null
          snapshot_flags_no_momento?: Json | null
          snapshot_historico_banco?: string | null
          snapshot_lancamento_data?: string | null
          snapshot_lancamento_valor?: number | null
          sugestao_score_aprovado?: number | null
          tipo_aprovacao?: string
          valor_aplicado: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cliente_id?: string
          created_at?: string
          criado_por?: string | null
          desfeito_em?: string | null
          desfeito_motivo?: string | null
          desfeito_por?: string | null
          extrato_id?: string
          grupo_id?: string | null
          id?: string
          lancamento_id?: string
          snapshot_extrato_data?: string | null
          snapshot_extrato_valor?: number | null
          snapshot_favorecido_id?: string | null
          snapshot_flags_no_momento?: Json | null
          snapshot_historico_banco?: string | null
          snapshot_lancamento_data?: string | null
          snapshot_lancamento_valor?: number | null
          sugestao_score_aprovado?: number | null
          tipo_aprovacao?: string
          valor_aplicado?: number
        }
        Relationships: [
          {
            foreignKeyName: "conciliacao_bancaria_itens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacao_bancaria_itens_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "extrato_bancario_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacao_bancaria_itens_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "v_extrato_conciliacao"
            referencedColumns: ["extrato_id"]
          },
          {
            foreignKeyName: "conciliacao_bancaria_itens_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacao_bancaria_itens_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_classificacao_staging_preview"
            referencedColumns: ["lanc_id"]
          },
          {
            foreignKeyName: "conciliacao_bancaria_itens_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id"]
          },
        ]
      }
      excel_linhas_aux: {
        Row: {
          aplicada_em: string | null
          aplicada_extrato_id: string | null
          aplicada_lancamento_id: string | null
          batch_id: string
          centro_texto: string | null
          cliente_id: string
          conta_bancaria_id: string | null
          created_at: string
          data_referencia: string | null
          favorecido_id: string | null
          fazenda_id: string | null
          fazenda_texto: string | null
          fornecedor_texto: string | null
          id: string
          observacao: string | null
          origem: string
          payload_extra: Json | null
          plano_texto: string | null
          produto_texto: string | null
          status: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          aplicada_em?: string | null
          aplicada_extrato_id?: string | null
          aplicada_lancamento_id?: string | null
          batch_id: string
          centro_texto?: string | null
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          data_referencia?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          fazenda_texto?: string | null
          fornecedor_texto?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          payload_extra?: Json | null
          plano_texto?: string | null
          produto_texto?: string | null
          status?: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          aplicada_em?: string | null
          aplicada_extrato_id?: string | null
          aplicada_lancamento_id?: string | null
          batch_id?: string
          centro_texto?: string | null
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          data_referencia?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          fazenda_texto?: string | null
          fornecedor_texto?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          payload_extra?: Json | null
          plano_texto?: string | null
          produto_texto?: string | null
          status?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: []
      }
      extrato_bancario_staging: {
        Row: {
          cliente_id: string
          confirmado_em: string | null
          conta_bancaria_id: string
          created_at: string
          descartado_em: string | null
          expira_em: string
          hash_arquivo: string
          id: string
          nome_arquivo: string
          owner_user_id: string
          periodo_fim: string
          periodo_inicio: string
          saldo_final_arquivo: number | null
          saldo_inicial_arquivo: number | null
          status: string
          tamanho_bytes: number | null
          total_aguardando: number
          total_ja_importadas: number
          total_linhas: number
          total_novas: number
        }
        Insert: {
          cliente_id: string
          confirmado_em?: string | null
          conta_bancaria_id: string
          created_at?: string
          descartado_em?: string | null
          expira_em?: string
          hash_arquivo: string
          id?: string
          nome_arquivo: string
          owner_user_id: string
          periodo_fim: string
          periodo_inicio: string
          saldo_final_arquivo?: number | null
          saldo_inicial_arquivo?: number | null
          status?: string
          tamanho_bytes?: number | null
          total_aguardando?: number
          total_ja_importadas?: number
          total_linhas?: number
          total_novas?: number
        }
        Update: {
          cliente_id?: string
          confirmado_em?: string | null
          conta_bancaria_id?: string
          created_at?: string
          descartado_em?: string | null
          expira_em?: string
          hash_arquivo?: string
          id?: string
          nome_arquivo?: string
          owner_user_id?: string
          periodo_fim?: string
          periodo_inicio?: string
          saldo_final_arquivo?: number | null
          saldo_inicial_arquivo?: number | null
          status?: string
          tamanho_bytes?: number | null
          total_aguardando?: number
          total_ja_importadas?: number
          total_linhas?: number
          total_novas?: number
        }
        Relationships: [
          {
            foreignKeyName: "extrato_bancario_staging_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_staging_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      extrato_bancario_staging_itens: {
        Row: {
          conciliacao_final_id: string | null
          created_at: string
          data_movimento: string
          documento_ofx: string | null
          extrato_final_id: string | null
          hash_movimento: string
          historico: string
          id: string
          lancamento_sugerido_id: string | null
          staging_id: string
          status_staging: string
          sugestao_calculada_em: string | null
          sugestao_score: number | null
          valor: number
        }
        Insert: {
          conciliacao_final_id?: string | null
          created_at?: string
          data_movimento: string
          documento_ofx?: string | null
          extrato_final_id?: string | null
          hash_movimento: string
          historico: string
          id?: string
          lancamento_sugerido_id?: string | null
          staging_id: string
          status_staging?: string
          sugestao_calculada_em?: string | null
          sugestao_score?: number | null
          valor: number
        }
        Update: {
          conciliacao_final_id?: string | null
          created_at?: string
          data_movimento?: string
          documento_ofx?: string | null
          extrato_final_id?: string | null
          hash_movimento?: string
          historico?: string
          id?: string
          lancamento_sugerido_id?: string | null
          staging_id?: string
          status_staging?: string
          sugestao_calculada_em?: string | null
          sugestao_score?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "extrato_bancario_staging_itens_conciliacao_final_id_fkey"
            columns: ["conciliacao_final_id"]
            isOneToOne: false
            referencedRelation: "conciliacao_bancaria_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_staging_itens_extrato_final_id_fkey"
            columns: ["extrato_final_id"]
            isOneToOne: false
            referencedRelation: "extrato_bancario_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_staging_itens_extrato_final_id_fkey"
            columns: ["extrato_final_id"]
            isOneToOne: false
            referencedRelation: "v_extrato_conciliacao"
            referencedColumns: ["extrato_id"]
          },
          {
            foreignKeyName: "extrato_bancario_staging_itens_lancamento_sugerido_id_fkey"
            columns: ["lancamento_sugerido_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_staging_itens_lancamento_sugerido_id_fkey"
            columns: ["lancamento_sugerido_id"]
            isOneToOne: false
            referencedRelation: "vw_classificacao_staging_preview"
            referencedColumns: ["lanc_id"]
          },
          {
            foreignKeyName: "extrato_bancario_staging_itens_lancamento_sugerido_id_fkey"
            columns: ["lancamento_sugerido_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_staging_itens_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "extrato_bancario_staging"
            referencedColumns: ["id"]
          },
        ]
      }
      extrato_bancario_v2: {
        Row: {
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          cliente_id: string
          conta_bancaria_id: string
          created_at: string
          data_movimento: string
          descricao: string | null
          documento: string | null
          flag_suspeita_fornecedor: boolean
          flag_suspeita_motivo: string | null
          flag_suspeita_valor: boolean
          hash_movimento: string
          id: string
          ignorado_em: string | null
          ignorado_impacto: number | null
          ignorado_motivo: string | null
          ignorado_por: string | null
          ignorado_ultima_copia: boolean | null
          importacao_id: string | null
          orfao_definitivo: boolean
          orfao_definitivo_em: string | null
          orfao_definitivo_motivo: string | null
          orfao_definitivo_por: string | null
          saldo_apos: number | null
          seq_ocorrencia: number
          status: string
          tipo_movimento: string
          updated_at: string
          valor: number
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id: string
          conta_bancaria_id: string
          created_at?: string
          data_movimento: string
          descricao?: string | null
          documento?: string | null
          flag_suspeita_fornecedor?: boolean
          flag_suspeita_motivo?: string | null
          flag_suspeita_valor?: boolean
          hash_movimento: string
          id?: string
          ignorado_em?: string | null
          ignorado_impacto?: number | null
          ignorado_motivo?: string | null
          ignorado_por?: string | null
          ignorado_ultima_copia?: boolean | null
          importacao_id?: string | null
          orfao_definitivo?: boolean
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          saldo_apos?: number | null
          seq_ocorrencia?: number
          status?: string
          tipo_movimento: string
          updated_at?: string
          valor: number
        }
        Update: {
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id?: string
          conta_bancaria_id?: string
          created_at?: string
          data_movimento?: string
          descricao?: string | null
          documento?: string | null
          flag_suspeita_fornecedor?: boolean
          flag_suspeita_motivo?: string | null
          flag_suspeita_valor?: boolean
          hash_movimento?: string
          id?: string
          ignorado_em?: string | null
          ignorado_impacto?: number | null
          ignorado_motivo?: string | null
          ignorado_por?: string | null
          ignorado_ultima_copia?: boolean | null
          importacao_id?: string | null
          orfao_definitivo?: boolean
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          saldo_apos?: number | null
          seq_ocorrencia?: number
          status?: string
          tipo_movimento?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "extrato_bancario_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_v2_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_v2_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      fazenda_cadastros: {
        Row: {
          area_agricultura_ha: number | null
          area_app_ha: number | null
          area_benfeitorias_ha: number | null
          area_outras_ha: number | null
          area_pecuaria_ha: number | null
          area_produtiva_ha: number | null
          area_reserva_ha: number | null
          area_total_ha: number | null
          car: string | null
          cliente_id: string
          created_at: string
          estado: string | null
          fazenda_id: string
          id: string
          ie: string | null
          matricula_conferida_em: string | null
          municipio: string | null
          nirf: string | null
          roteiro: string | null
          updated_at: string
        }
        Insert: {
          area_agricultura_ha?: number | null
          area_app_ha?: number | null
          area_benfeitorias_ha?: number | null
          area_outras_ha?: number | null
          area_pecuaria_ha?: number | null
          area_produtiva_ha?: number | null
          area_reserva_ha?: number | null
          area_total_ha?: number | null
          car?: string | null
          cliente_id: string
          created_at?: string
          estado?: string | null
          fazenda_id: string
          id?: string
          ie?: string | null
          matricula_conferida_em?: string | null
          municipio?: string | null
          nirf?: string | null
          roteiro?: string | null
          updated_at?: string
        }
        Update: {
          area_agricultura_ha?: number | null
          area_app_ha?: number | null
          area_benfeitorias_ha?: number | null
          area_outras_ha?: number | null
          area_pecuaria_ha?: number | null
          area_produtiva_ha?: number | null
          area_reserva_ha?: number | null
          area_total_ha?: number | null
          car?: string | null
          cliente_id?: string
          created_at?: string
          estado?: string | null
          fazenda_id?: string
          id?: string
          ie?: string | null
          matricula_conferida_em?: string | null
          municipio?: string | null
          nirf?: string | null
          roteiro?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fazenda_membros: {
        Row: {
          created_at: string | null
          fazenda_id: string
          id: string
          papel: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fazenda_id: string
          id?: string
          papel?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
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
      fazenda_status_mensal: {
        Row: {
          ano_mes: string
          ativa_no_mes: boolean
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
        }
        Insert: {
          ano_mes: string
          ativa_no_mes?: boolean
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
        }
        Update: {
          ano_mes?: string
          ativa_no_mes?: boolean
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
        }
        Relationships: []
      }
      fazendas: {
        Row: {
          area_total: number | null
          cidade: string | null
          cliente_id: string
          codigo: string
          codigo_importacao: string | null
          created_at: string | null
          estado: string | null
          id: string
          nome: string
          owner_id: string | null
          status_operacional: string | null
          tem_pecuaria: boolean | null
        }
        Insert: {
          area_total?: number | null
          cidade?: string | null
          cliente_id: string
          codigo: string
          codigo_importacao?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          nome: string
          owner_id?: string | null
          status_operacional?: string | null
          tem_pecuaria?: boolean | null
        }
        Update: {
          area_total?: number | null
          cidade?: string | null
          cliente_id?: string
          codigo?: string
          codigo_importacao?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          nome?: string
          owner_id?: string | null
          status_operacional?: string | null
          tem_pecuaria?: boolean | null
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
      fechamento_area_snapshot: {
        Row: {
          ano_mes: string
          area_agricultura_ha: number | null
          area_app_ha: number | null
          area_benfeitorias_ha: number | null
          area_outras_ha: number | null
          area_pecuaria_ha: number | null
          area_produtiva_ha: number
          area_reserva_ha: number | null
          area_silvicultura_ha: number | null
          area_total_ha: number | null
          cliente_id: string
          fazenda_id: string
          fechado_em: string
          fechado_por: string | null
          fechamento_p1_snapshot_id: string | null
          id: string
          origem_area: string
          schema_version: number
          versao: number
        }
        Insert: {
          ano_mes: string
          area_agricultura_ha?: number | null
          area_app_ha?: number | null
          area_benfeitorias_ha?: number | null
          area_outras_ha?: number | null
          area_pecuaria_ha?: number | null
          area_produtiva_ha: number
          area_reserva_ha?: number | null
          area_silvicultura_ha?: number | null
          area_total_ha?: number | null
          cliente_id: string
          fazenda_id: string
          fechado_em?: string
          fechado_por?: string | null
          fechamento_p1_snapshot_id?: string | null
          id?: string
          origem_area?: string
          schema_version?: number
          versao?: number
        }
        Update: {
          ano_mes?: string
          area_agricultura_ha?: number | null
          area_app_ha?: number | null
          area_benfeitorias_ha?: number | null
          area_outras_ha?: number | null
          area_pecuaria_ha?: number | null
          area_produtiva_ha?: number
          area_reserva_ha?: number | null
          area_silvicultura_ha?: number | null
          area_total_ha?: number | null
          cliente_id?: string
          fazenda_id?: string
          fechado_em?: string
          fechado_por?: string | null
          fechamento_p1_snapshot_id?: string | null
          id?: string
          origem_area?: string
          schema_version?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_area_snapshot_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_area_snapshot_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_area_snapshot_fechamento_p1_snapshot_id_fkey"
            columns: ["fechamento_p1_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fechamento_p1_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_execucoes: {
        Row: {
          acao: string
          ano_mes: string
          cliente_id: string
          created_at: string
          detalhes: Json | null
          erro: string | null
          executado_em: string | null
          executado_por: string | null
          fazenda_id: string
          fechamento_id: string
          id: string
          pilar: string
          status: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          ano_mes: string
          cliente_id: string
          created_at?: string
          detalhes?: Json | null
          erro?: string | null
          executado_em?: string | null
          executado_por?: string | null
          fazenda_id: string
          fechamento_id: string
          id?: string
          pilar: string
          status?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          detalhes?: Json | null
          erro?: string | null
          executado_em?: string | null
          executado_por?: string | null
          fazenda_id?: string
          fechamento_id?: string
          id?: string
          pilar?: string
          status?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      fechamento_executivo: {
        Row: {
          ano_mes: string | null
          cliente_id: string
          created_at: string
          fazenda_id: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          json_data: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          ano_mes?: string | null
          cliente_id: string
          created_at?: string
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          json_data?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          ano_mes?: string | null
          cliente_id?: string
          created_at?: string
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          json_data?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fechamento_graficos: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          dados_json: Json
          fazenda_id: string
          fechamento_id: string
          id: string
          json_config: Json | null
          json_dados: Json | null
          ordem: number | null
          secao: string
          subtitulo: string | null
          tipo: string
          tipo_grafico: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          dados_json?: Json
          fazenda_id: string
          fechamento_id: string
          id?: string
          json_config?: Json | null
          json_dados?: Json | null
          ordem?: number | null
          secao: string
          subtitulo?: string | null
          tipo: string
          tipo_grafico: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          dados_json?: Json
          fazenda_id?: string
          fechamento_id?: string
          id?: string
          json_config?: Json | null
          json_dados?: Json | null
          ordem?: number | null
          secao?: string
          subtitulo?: string | null
          tipo?: string
          tipo_grafico?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      fechamento_indicadores: {
        Row: {
          ano_mes: string
          chave: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          fechamento_id: string
          formato: string | null
          grupo: string
          id: string
          indicador: string
          json_origem: Json | null
          label: string
          ordem: number | null
          subgrupo: string | null
          unidade: string | null
          valor: number | null
          valor_ano_anterior: number | null
          valor_meta: number | null
          valor_real: number | null
        }
        Insert: {
          ano_mes: string
          chave: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          fechamento_id: string
          formato?: string | null
          grupo: string
          id?: string
          indicador: string
          json_origem?: Json | null
          label: string
          ordem?: number | null
          subgrupo?: string | null
          unidade?: string | null
          valor?: number | null
          valor_ano_anterior?: number | null
          valor_meta?: number | null
          valor_real?: number | null
        }
        Update: {
          ano_mes?: string
          chave?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          fechamento_id?: string
          formato?: string | null
          grupo?: string
          id?: string
          indicador?: string
          json_origem?: Json | null
          label?: string
          ordem?: number | null
          subgrupo?: string | null
          unidade?: string | null
          valor?: number | null
          valor_ano_anterior?: number | null
          valor_meta?: number | null
          valor_real?: number | null
        }
        Relationships: []
      }
      fechamento_p1: {
        Row: {
          ano_mes: string
          area_oficializada_payload: Json | null
          area_oficializada_schema_version: number
          area_oficializada_snapshot_id: string | null
          cliente_id: string
          conjunto_oficializado_snapshot_id: string | null
          fazenda_id: string
          id: string
          oficializado_em: string | null
          oficializado_por: string | null
          origem_legado: boolean
          reaberto_em: string | null
          reaberto_por: string | null
          status: string
          versao: number
        }
        Insert: {
          ano_mes: string
          area_oficializada_payload?: Json | null
          area_oficializada_schema_version?: number
          area_oficializada_snapshot_id?: string | null
          cliente_id: string
          conjunto_oficializado_snapshot_id?: string | null
          fazenda_id: string
          id?: string
          oficializado_em?: string | null
          oficializado_por?: string | null
          origem_legado?: boolean
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          versao?: number
        }
        Update: {
          ano_mes?: string
          area_oficializada_payload?: Json | null
          area_oficializada_schema_version?: number
          area_oficializada_snapshot_id?: string | null
          cliente_id?: string
          conjunto_oficializado_snapshot_id?: string | null
          fazenda_id?: string
          id?: string
          oficializado_em?: string | null
          oficializado_por?: string | null
          origem_legado?: boolean
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_p1_area_oficializada_snapshot_id_fkey"
            columns: ["area_oficializada_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fechamento_area_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_p1_conjunto_oficializado_snapshot_id_fkey"
            columns: ["conjunto_oficializado_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fechamento_p1_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_p1_snapshot: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          created_by: string | null
          fazenda_id: string
          fechamento_p1_id: string
          id: string
          invalidado_em: string | null
          membros_count: number
          motivo_invalidacao: string | null
          schema_version: number
          status: Database["public"]["Enums"]["snapshot_status"]
          substitui_snapshot_id: string | null
          substituido_por: string | null
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          created_by?: string | null
          fazenda_id: string
          fechamento_p1_id: string
          id?: string
          invalidado_em?: string | null
          membros_count?: number
          motivo_invalidacao?: string | null
          schema_version?: number
          status?: Database["public"]["Enums"]["snapshot_status"]
          substitui_snapshot_id?: string | null
          substituido_por?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          fazenda_id?: string
          fechamento_p1_id?: string
          id?: string
          invalidado_em?: string | null
          membros_count?: number
          motivo_invalidacao?: string | null
          schema_version?: number
          status?: Database["public"]["Enums"]["snapshot_status"]
          substitui_snapshot_id?: string | null
          substituido_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_p1_snapshot_fechamento_p1_id_fkey"
            columns: ["fechamento_p1_id"]
            isOneToOne: false
            referencedRelation: "fechamento_p1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_p1_snapshot_substitui_snapshot_id_fkey"
            columns: ["substitui_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fechamento_p1_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_p1_snapshot_substituido_por_fkey"
            columns: ["substituido_por"]
            isOneToOne: false
            referencedRelation: "fechamento_p1_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_pasto_itens: {
        Row: {
          categoria_id: string
          created_at: string | null
          fechamento_id: string
          id: string
          lote: string | null
          observacoes: string | null
          origem_dado: string | null
          peso_atualizado: boolean
          peso_medio_kg: number | null
          peso_total: number
          quantidade: number
        }
        Insert: {
          categoria_id: string
          created_at?: string | null
          fechamento_id: string
          id?: string
          lote?: string | null
          observacoes?: string | null
          origem_dado?: string | null
          peso_atualizado?: boolean
          peso_medio_kg?: number | null
          peso_total?: number
          quantidade?: number
        }
        Update: {
          categoria_id?: string
          created_at?: string | null
          fechamento_id?: string
          id?: string
          lote?: string | null
          observacoes?: string | null
          origem_dado?: string | null
          peso_atualizado?: boolean
          peso_medio_kg?: number | null
          peso_total?: number
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_pasto_itens_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pasto_itens_fechamento_pasto_id_fkey"
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
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string
          id: string
          lote_mes: string | null
          observacao_mes: string | null
          pasto_id: string
          qualidade_mes: number | null
          responsavel_nome: string | null
          status: string
          tipo_uso_mes: string | null
          updated_at: string | null
        }
        Insert: {
          ano_mes?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id: string
          id?: string
          lote_mes?: string | null
          observacao_mes?: string | null
          pasto_id: string
          qualidade_mes?: number | null
          responsavel_nome?: string | null
          status?: string
          tipo_uso_mes?: string | null
          updated_at?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string
          id?: string
          lote_mes?: string | null
          observacao_mes?: string | null
          pasto_id?: string
          qualidade_mes?: number | null
          responsavel_nome?: string | null
          status?: string
          tipo_uso_mes?: string | null
          updated_at?: string | null
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
      fechamento_pastos_membros: {
        Row: {
          ano_mes: string
          area_considerada_ha: number | null
          ativo_congelado: boolean
          card_fechado: boolean
          cliente_id: string
          congelado_em: string
          congelado_por: string | null
          data_inicio_congelada: string | null
          entra_conciliacao: boolean
          fazenda_id: string
          fechamento_p1_id: string
          fechamento_pasto_id: string | null
          id: string
          nome_exibicao: string
          pasto_id: string
          pasto_versao_id: string | null
          peso_total_congelado: number
          quantidade_total: number
          snapshot_id: string
          tipo_uso: string | null
          vazio_confirmado: boolean
        }
        Insert: {
          ano_mes: string
          area_considerada_ha?: number | null
          ativo_congelado: boolean
          card_fechado?: boolean
          cliente_id: string
          congelado_em?: string
          congelado_por?: string | null
          data_inicio_congelada?: string | null
          entra_conciliacao: boolean
          fazenda_id: string
          fechamento_p1_id: string
          fechamento_pasto_id?: string | null
          id?: string
          nome_exibicao: string
          pasto_id: string
          pasto_versao_id?: string | null
          peso_total_congelado?: number
          quantidade_total?: number
          snapshot_id: string
          tipo_uso?: string | null
          vazio_confirmado?: boolean
        }
        Update: {
          ano_mes?: string
          area_considerada_ha?: number | null
          ativo_congelado?: boolean
          card_fechado?: boolean
          cliente_id?: string
          congelado_em?: string
          congelado_por?: string | null
          data_inicio_congelada?: string | null
          entra_conciliacao?: boolean
          fazenda_id?: string
          fechamento_p1_id?: string
          fechamento_pasto_id?: string | null
          id?: string
          nome_exibicao?: string
          pasto_id?: string
          pasto_versao_id?: string | null
          peso_total_congelado?: number
          quantidade_total?: number
          snapshot_id?: string
          tipo_uso?: string | null
          vazio_confirmado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_pastos_membros_fechamento_p1_id_fkey"
            columns: ["fechamento_p1_id"]
            isOneToOne: false
            referencedRelation: "fechamento_p1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pastos_membros_fechamento_pasto_id_fkey"
            columns: ["fechamento_pasto_id"]
            isOneToOne: false
            referencedRelation: "fechamento_pastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pastos_membros_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "fechamento_p1_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_reaberturas_log: {
        Row: {
          ano_mes: string
          cliente_id: string
          fazenda_id: string
          id: string
          motivo: string | null
          pilar: string
          reaberto_em: string
          reaberto_por: string | null
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          fazenda_id: string
          id?: string
          motivo?: string | null
          pilar: string
          reaberto_em?: string
          reaberto_por?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          fazenda_id?: string
          id?: string
          motivo?: string | null
          pilar?: string
          reaberto_em?: string
          reaberto_por?: string | null
        }
        Relationships: []
      }
      fechamento_textos: {
        Row: {
          ano_mes: string
          cliente_id: string
          conteudo: string
          created_at: string
          editado_em: string | null
          fazenda_id: string
          fechamento_id: string
          gerado_em: string | null
          gerado_por_ia: boolean
          id: string
          modelo_ia: string | null
          prompt_usado: string | null
          secao: string
          texto_editado: string | null
          texto_final: string | null
          texto_ia: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          conteudo?: string
          created_at?: string
          editado_em?: string | null
          fazenda_id: string
          fechamento_id: string
          gerado_em?: string | null
          gerado_por_ia?: boolean
          id?: string
          modelo_ia?: string | null
          prompt_usado?: string | null
          secao: string
          texto_editado?: string | null
          texto_final?: string | null
          texto_ia?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          conteudo?: string
          created_at?: string
          editado_em?: string | null
          fazenda_id?: string
          fechamento_id?: string
          gerado_em?: string | null
          gerado_por_ia?: boolean
          id?: string
          modelo_ia?: string | null
          prompt_usado?: string | null
          secao?: string
          texto_editado?: string | null
          texto_final?: string | null
          texto_ia?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      fechamentos_executivos: {
        Row: {
          ano: number
          ano_mes: string
          cliente_id: string
          created_at: string
          data_fechamento: string | null
          data_geracao: string | null
          fazenda_id: string
          id: string
          mes: number
          observacoes_manuais: string | null
          pdf_url: string | null
          periodo_texto: string | null
          status: string
          status_fechamento: string | null
          updated_at: string
          usuario_gerador: string | null
          versao: number | null
        }
        Insert: {
          ano: number
          ano_mes: string
          cliente_id: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string | null
          fazenda_id: string
          id?: string
          mes: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string | null
          status?: string
          status_fechamento?: string | null
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number | null
        }
        Update: {
          ano?: number
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string | null
          fazenda_id?: string
          id?: string
          mes?: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string | null
          status?: string
          status_fechamento?: string | null
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number | null
        }
        Relationships: []
      }
      fin_juros_comp_bkp_20260826: {
        Row: {
          ano_mes: string | null
          cliente_id: string | null
          data_competencia: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string | null
          valor: number | null
        }
        Insert: {
          ano_mes?: string | null
          cliente_id?: string | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string | null
          valor?: number | null
        }
        Update: {
          ano_mes?: string | null
          cliente_id?: string | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      financeiro_centros_custo: {
        Row: {
          ativo: boolean | null
          centro_custo: string | null
          cliente_id: string | null
          created_at: string | null
          escopo_negocio: string | null
          fazenda_id: string | null
          grupo_custo: string | null
          id: string
          macro_custo: string | null
          ordem_exibicao: number | null
          subcentro: string | null
          tipo_operacao: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          escopo_negocio?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string
          macro_custo?: string | null
          ordem_exibicao?: number | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          escopo_negocio?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string
          macro_custo?: string | null
          ordem_exibicao?: number | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      financeiro_classificacao_regras: {
        Row: {
          ativo: boolean
          cliente_id: string | null
          cond_conta_destino: string | null
          cond_conta_origem: string | null
          cond_data_ate: string | null
          cond_data_de: string | null
          cond_fazenda: string | null
          cond_fornecedor: string | null
          cond_observacao: string | null
          cond_produto: string | null
          cond_safra: string | null
          cond_subcentro: string | null
          cond_tipo_operacao: string | null
          cond_valor_max: number | null
          cond_valor_min: number | null
          created_at: string
          created_by: string | null
          especificidade: number | null
          id: string
          observacao_regra: string | null
          origem: string
          plano_conta_id: string
          prioridade: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          cliente_id?: string | null
          cond_conta_destino?: string | null
          cond_conta_origem?: string | null
          cond_data_ate?: string | null
          cond_data_de?: string | null
          cond_fazenda?: string | null
          cond_fornecedor?: string | null
          cond_observacao?: string | null
          cond_produto?: string | null
          cond_safra?: string | null
          cond_subcentro?: string | null
          cond_tipo_operacao?: string | null
          cond_valor_max?: number | null
          cond_valor_min?: number | null
          created_at?: string
          created_by?: string | null
          especificidade?: number | null
          id?: string
          observacao_regra?: string | null
          origem?: string
          plano_conta_id: string
          prioridade?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          cliente_id?: string | null
          cond_conta_destino?: string | null
          cond_conta_origem?: string | null
          cond_data_ate?: string | null
          cond_data_de?: string | null
          cond_fazenda?: string | null
          cond_fornecedor?: string | null
          cond_observacao?: string | null
          cond_produto?: string | null
          cond_safra?: string | null
          cond_subcentro?: string | null
          cond_tipo_operacao?: string | null
          cond_valor_max?: number | null
          cond_valor_min?: number | null
          created_at?: string
          created_by?: string | null
          especificidade?: number | null
          id?: string
          observacao_regra?: string | null
          origem?: string
          plano_conta_id?: string
          prioridade?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_classificacao_regras_plano_conta_id_fkey"
            columns: ["plano_conta_id"]
            isOneToOne: false
            referencedRelation: "financeiro_plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_classificacao_staging: {
        Row: {
          alias_id_usado: string | null
          aplicado: boolean
          aplicado_em: string | null
          aplicado_por: string | null
          cliente_id: string
          conta_destino_id: string | null
          conta_origem_id: string | null
          created_at: string
          erro_apply: string | null
          estado_anterior: Json | null
          excel_ano_mes: string | null
          excel_conta_destino: string | null
          excel_conta_origem: string | null
          excel_data: string | null
          excel_documento: string | null
          excel_fazenda_codigo: string | null
          excel_fornecedor: string | null
          excel_linha_origem: number | null
          excel_observacao: string | null
          excel_produto: string | null
          excel_subcentro: string | null
          excel_tipo_operacao: string | null
          excel_valor: number | null
          match_lancamento_id: string | null
          match_lancamento_ids: string[] | null
          match_resolvido_em: string | null
          match_resolvido_por: string | null
          match_status: string
          proposto_editado_em: string | null
          proposto_editado_por: string | null
          sessao_id: string
          staging_id: string
          update_proposto: Json | null
          update_proposto_original: Json | null
          updated_at: string
        }
        Insert: {
          alias_id_usado?: string | null
          aplicado?: boolean
          aplicado_em?: string | null
          aplicado_por?: string | null
          cliente_id: string
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          erro_apply?: string | null
          estado_anterior?: Json | null
          excel_ano_mes?: string | null
          excel_conta_destino?: string | null
          excel_conta_origem?: string | null
          excel_data?: string | null
          excel_documento?: string | null
          excel_fazenda_codigo?: string | null
          excel_fornecedor?: string | null
          excel_linha_origem?: number | null
          excel_observacao?: string | null
          excel_produto?: string | null
          excel_subcentro?: string | null
          excel_tipo_operacao?: string | null
          excel_valor?: number | null
          match_lancamento_id?: string | null
          match_lancamento_ids?: string[] | null
          match_resolvido_em?: string | null
          match_resolvido_por?: string | null
          match_status: string
          proposto_editado_em?: string | null
          proposto_editado_por?: string | null
          sessao_id: string
          staging_id?: string
          update_proposto?: Json | null
          update_proposto_original?: Json | null
          updated_at?: string
        }
        Update: {
          alias_id_usado?: string | null
          aplicado?: boolean
          aplicado_em?: string | null
          aplicado_por?: string | null
          cliente_id?: string
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          erro_apply?: string | null
          estado_anterior?: Json | null
          excel_ano_mes?: string | null
          excel_conta_destino?: string | null
          excel_conta_origem?: string | null
          excel_data?: string | null
          excel_documento?: string | null
          excel_fazenda_codigo?: string | null
          excel_fornecedor?: string | null
          excel_linha_origem?: number | null
          excel_observacao?: string | null
          excel_produto?: string | null
          excel_subcentro?: string | null
          excel_tipo_operacao?: string | null
          excel_valor?: number | null
          match_lancamento_id?: string | null
          match_lancamento_ids?: string[] | null
          match_resolvido_em?: string | null
          match_resolvido_por?: string | null
          match_status?: string
          proposto_editado_em?: string | null
          proposto_editado_por?: string | null
          sessao_id?: string
          staging_id?: string
          update_proposto?: Json | null
          update_proposto_original?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_classificacao_staging_alias_id_usado_fkey"
            columns: ["alias_id_usado"]
            isOneToOne: false
            referencedRelation: "financeiro_subcentro_aliases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_classificacao_staging_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_classificacao_staging_match_lancamento_id_fkey"
            columns: ["match_lancamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_classificacao_staging_match_lancamento_id_fkey"
            columns: ["match_lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_classificacao_staging_preview"
            referencedColumns: ["lanc_id"]
          },
          {
            foreignKeyName: "financeiro_classificacao_staging_match_lancamento_id_fkey"
            columns: ["match_lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_conciliacoes: {
        Row: {
          ano_mes: string
          cliente_id: string
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          diferenca: number
          extrato_id: string | null
          fazenda_id: string | null
          id: string
          lancamento_id: string | null
          observacao: string | null
          saldo_extrato: number
          saldo_sistema: number
          status: string
          tipo_conciliacao: string | null
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          diferenca?: number
          extrato_id?: string | null
          fazenda_id?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          saldo_extrato?: number
          saldo_sistema?: number
          status?: string
          tipo_conciliacao?: string | null
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          diferenca?: number
          extrato_id?: string | null
          fazenda_id?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          saldo_extrato?: number
          saldo_sistema?: number
          status?: string
          tipo_conciliacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      financeiro_contas: {
        Row: {
          ativo: boolean
          cliente_id: string
          created_at: string
          fazenda_id: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      financeiro_contas_bancarias: {
        Row: {
          agencia: string | null
          aliases: Json | null
          ativa: boolean | null
          banco: string | null
          cliente_id: string | null
          codigo_conta: string | null
          conta_digito: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string
          mes_inicio: string | null
          nome_conta: string | null
          nome_exibicao: string | null
          numero_conta: string | null
          ordem_exibicao: number | null
          saldo_inicial_oficial: number | null
          tipo_conta: string | null
          updated_at: string | null
        }
        Insert: {
          agencia?: string | null
          aliases?: Json | null
          ativa?: boolean | null
          banco?: string | null
          cliente_id?: string | null
          codigo_conta?: string | null
          conta_digito?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          mes_inicio?: string | null
          nome_conta?: string | null
          nome_exibicao?: string | null
          numero_conta?: string | null
          ordem_exibicao?: number | null
          saldo_inicial_oficial?: number | null
          tipo_conta?: string | null
          updated_at?: string | null
        }
        Update: {
          agencia?: string | null
          aliases?: Json | null
          ativa?: boolean | null
          banco?: string | null
          cliente_id?: string | null
          codigo_conta?: string | null
          conta_digito?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          mes_inicio?: string | null
          nome_conta?: string | null
          nome_exibicao?: string | null
          numero_conta?: string | null
          ordem_exibicao?: number | null
          saldo_inicial_oficial?: number | null
          tipo_conta?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
          data_inicio: string | null
          dia_pagamento: number | null
          fazenda_id: string | null
          forma_pagamento: string | null
          fornecedor_id: string | null
          frequencia: string | null
          id: string
          macro_custo: string | null
          nome: string | null
          observacao: string | null
          produto: string | null
          status: string | null
          subcentro: string | null
          tipo: string | null
          updated_at: string
          valor: number | null
          valor_total: number | null
        }
        Insert: {
          centro_custo?: string | null
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          dados_pagamento?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dia_pagamento?: number | null
          fazenda_id?: string | null
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          frequencia?: string | null
          id?: string
          macro_custo?: string | null
          nome?: string | null
          observacao?: string | null
          produto?: string | null
          status?: string | null
          subcentro?: string | null
          tipo?: string | null
          updated_at?: string
          valor?: number | null
          valor_total?: number | null
        }
        Update: {
          centro_custo?: string | null
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          dados_pagamento?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dia_pagamento?: number | null
          fazenda_id?: string | null
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          frequencia?: string | null
          id?: string
          macro_custo?: string | null
          nome?: string | null
          observacao?: string | null
          produto?: string | null
          status?: string | null
          subcentro?: string | null
          tipo?: string | null
          updated_at?: string
          valor?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      financeiro_dividendos: {
        Row: {
          ativo: boolean | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string
          nome: string | null
          ordem_exibicao: number | null
          percentual: number | null
        }
        Insert: {
          ativo?: boolean | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          nome?: string | null
          ordem_exibicao?: number | null
          percentual?: number | null
        }
        Update: {
          ativo?: boolean | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          nome?: string | null
          ordem_exibicao?: number | null
          percentual?: number | null
        }
        Relationships: []
      }
      financeiro_duplicidade_log: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          lancamento_duplicado_id: string | null
          lancamento_id: string | null
          resolvido: boolean
          score_similaridade: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          lancamento_duplicado_id?: string | null
          lancamento_id?: string | null
          resolvido?: boolean
          score_similaridade?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          lancamento_duplicado_id?: string | null
          lancamento_id?: string | null
          resolvido?: boolean
          score_similaridade?: number | null
        }
        Relationships: []
      }
      financeiro_extrato_bancario: {
        Row: {
          cliente_id: string
          conciliado: boolean
          conta_bancaria_id: string
          created_at: string
          data: string
          data_movimento: string | null
          descricao: string
          hash_conciliacao: string | null
          id: string
          lancamento_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          cliente_id: string
          conciliado?: boolean
          conta_bancaria_id: string
          created_at?: string
          data: string
          data_movimento?: string | null
          descricao: string
          hash_conciliacao?: string | null
          id?: string
          lancamento_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          cliente_id?: string
          conciliado?: boolean
          conta_bancaria_id?: string
          created_at?: string
          data?: string
          data_movimento?: string | null
          descricao?: string
          hash_conciliacao?: string | null
          id?: string
          lancamento_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      financeiro_fechamentos: {
        Row: {
          ano_mes: string | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          observacao: string | null
          reaberto_em: string | null
          reaberto_por: string | null
          status_fechamento: string | null
          updated_at: string | null
        }
        Insert: {
          ano_mes?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status_fechamento?: string | null
          updated_at?: string | null
        }
        Update: {
          ano_mes?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status_fechamento?: string | null
          updated_at?: string | null
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
          aliases: Json | null
          ativo: boolean | null
          banco: string | null
          cliente_id: string | null
          conta: string | null
          cpf_cnpj: string | null
          cpf_cnpj_pagamento: string | null
          created_at: string | null
          documento: string | null
          email: string | null
          escopo: string | null
          fazenda_id: string | null
          fundido_em: string | null
          fundido_em_id: string | null
          fundido_motivo: string | null
          fundido_por: string | null
          id: string
          nome: string
          nome_favorecido: string | null
          nome_normalizado: string | null
          observacao: string | null
          observacao_pagamento: string | null
          pix_chave: string | null
          pix_tipo_chave: string | null
          telefone: string | null
          tipo: string | null
          tipo_conta: string | null
          tipo_recebimento: string | null
          updated_at: string | null
        }
        Insert: {
          agencia?: string | null
          aliases?: Json | null
          ativo?: boolean | null
          banco?: string | null
          cliente_id?: string | null
          conta?: string | null
          cpf_cnpj?: string | null
          cpf_cnpj_pagamento?: string | null
          created_at?: string | null
          documento?: string | null
          email?: string | null
          escopo?: string | null
          fazenda_id?: string | null
          fundido_em?: string | null
          fundido_em_id?: string | null
          fundido_motivo?: string | null
          fundido_por?: string | null
          id?: string
          nome: string
          nome_favorecido?: string | null
          nome_normalizado?: string | null
          observacao?: string | null
          observacao_pagamento?: string | null
          pix_chave?: string | null
          pix_tipo_chave?: string | null
          telefone?: string | null
          tipo?: string | null
          tipo_conta?: string | null
          tipo_recebimento?: string | null
          updated_at?: string | null
        }
        Update: {
          agencia?: string | null
          aliases?: Json | null
          ativo?: boolean | null
          banco?: string | null
          cliente_id?: string | null
          conta?: string | null
          cpf_cnpj?: string | null
          cpf_cnpj_pagamento?: string | null
          created_at?: string | null
          documento?: string | null
          email?: string | null
          escopo?: string | null
          fazenda_id?: string | null
          fundido_em?: string | null
          fundido_em_id?: string | null
          fundido_motivo?: string | null
          fundido_por?: string | null
          id?: string
          nome?: string
          nome_favorecido?: string | null
          nome_normalizado?: string | null
          observacao?: string | null
          observacao_pagamento?: string | null
          pix_chave?: string | null
          pix_tipo_chave?: string | null
          telefone?: string | null
          tipo?: string | null
          tipo_conta?: string | null
          tipo_recebimento?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fornecedores_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_fornecedores_fundido_em_id_fkey"
            columns: ["fundido_em_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_importacoes: {
        Row: {
          cliente_id: string
          created_at: string
          fazenda_id: string | null
          id: string
          nome_arquivo: string
          status: string
          total_erros: number
          total_linhas: number
          total_validas: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          nome_arquivo: string
          status?: string
          total_erros?: number
          total_linhas?: number
          total_validas?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          nome_arquivo?: string
          status?: string
          total_erros?: number
          total_linhas?: number
          total_validas?: number
        }
        Relationships: []
      }
      financeiro_importacoes_v2: {
        Row: {
          cancelada_em: string | null
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          cliente_id: string | null
          conta_bancaria_id: string | null
          created_at: string | null
          created_by: string | null
          data_importacao: string | null
          erros: Json | null
          fazenda_id: string | null
          hash_arquivo: string | null
          id: string
          nome_arquivo: string | null
          owner_user_id: string | null
          status: string | null
          tipo_arquivo: string | null
          total_com_erro: number | null
          total_linhas: number | null
          total_validas: number | null
          updated_at: string | null
        }
        Insert: {
          cancelada_em?: string | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_importacao?: string | null
          erros?: Json | null
          fazenda_id?: string | null
          hash_arquivo?: string | null
          id?: string
          nome_arquivo?: string | null
          owner_user_id?: string | null
          status?: string | null
          tipo_arquivo?: string | null
          total_com_erro?: number | null
          total_linhas?: number | null
          total_validas?: number | null
          updated_at?: string | null
        }
        Update: {
          cancelada_em?: string | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_importacao?: string | null
          erros?: Json | null
          fazenda_id?: string | null
          hash_arquivo?: string | null
          id?: string
          nome_arquivo?: string | null
          owner_user_id?: string | null
          status?: string | null
          tipo_arquivo?: string | null
          total_com_erro?: number | null
          total_linhas?: number | null
          total_validas?: number | null
          updated_at?: string | null
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
          cancelado: boolean | null
          categoria: string | null
          centro_custo: string | null
          cliente_id: string
          conta_destino: string | null
          conta_id: string | null
          conta_origem: string | null
          cpf_cnpj: string | null
          created_at: string
          data: string
          data_pagamento: string | null
          data_realizacao: string
          descricao: string
          editado_manual: boolean | null
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
          origem_dado: string | null
          produto: string | null
          recorrencia: string | null
          status_transacao: string | null
          subcategoria: string | null
          subcentro: string | null
          tipo: string
          tipo_operacao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano_mes: string
          cancelado?: boolean | null
          categoria?: string | null
          centro_custo?: string | null
          cliente_id: string
          conta_destino?: string | null
          conta_id?: string | null
          conta_origem?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data: string
          data_pagamento?: string | null
          data_realizacao: string
          descricao: string
          editado_manual?: boolean | null
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
          origem_dado?: string | null
          produto?: string | null
          recorrencia?: string | null
          status_transacao?: string | null
          subcategoria?: string | null
          subcentro?: string | null
          tipo: string
          tipo_operacao?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          ano_mes?: string
          cancelado?: boolean | null
          categoria?: string | null
          centro_custo?: string | null
          cliente_id?: string
          conta_destino?: string | null
          conta_id?: string | null
          conta_origem?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data?: string
          data_pagamento?: string | null
          data_realizacao?: string
          descricao?: string
          editado_manual?: boolean | null
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
          origem_dado?: string | null
          produto?: string | null
          recorrencia?: string | null
          status_transacao?: string | null
          subcategoria?: string | null
          subcentro?: string | null
          tipo?: string
          tipo_operacao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      financeiro_lancamentos_v2: {
        Row: {
          ano_mes: string | null
          boitel_id: string | null
          boitel_lote_id: string | null
          cancelado: boolean | null
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          cenario: string | null
          centro_custo: string | null
          cliente_id: string | null
          compoe_dre: boolean | null
          conciliado_em: string | null
          conta_bancaria_id: string | null
          conta_destino_id: string | null
          contrato_id: string | null
          created_at: string | null
          created_by: string | null
          dados_pagamento: Json | null
          data_competencia: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          documento: string | null
          duplicado_de_id: string | null
          editado_manual: boolean | null
          escopo_negocio: string | null
          favorecido_id: string | null
          fazenda_id: string | null
          financiamento_id: string | null
          forma_pagamento: string | null
          gera_lcdpr: boolean | null
          grupo_custo: string | null
          grupo_geracao_id: string | null
          hash_importacao: string | null
          historico: string | null
          id: string
          importado_duplicado: boolean | null
          lote_importacao_id: string | null
          macro_custo: string | null
          movimentacao_rebanho_id: string | null
          nivel_duplicidade: string | null
          numero_documento: string | null
          observacao: string | null
          orfao_definitivo: boolean
          orfao_definitivo_em: string | null
          orfao_definitivo_motivo: string | null
          orfao_definitivo_por: string | null
          origem_apontamento:
            | Database["public"]["Enums"]["origem_apontamento_enum"]
            | null
          origem_lancamento: string | null
          origem_tipo: string | null
          plano_conta_id: string | null
          recorrencia_id: string | null
          safra_id: string | null
          sem_movimentacao_caixa: boolean | null
          sinal: string | null
          staging_id: string | null
          status_duplicidade: string | null
          status_transacao: string | null
          subcentro: string | null
          tipo_documento: string | null
          tipo_operacao: string | null
          transferencia_grupo_id: string | null
          updated_at: string | null
          updated_by: string | null
          valor: number
        }
        Insert: {
          ano_mes?: string | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          compoe_dre?: boolean | null
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          contrato_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dados_pagamento?: Json | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          documento?: string | null
          duplicado_de_id?: string | null
          editado_manual?: boolean | null
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          financiamento_id?: string | null
          forma_pagamento?: string | null
          gera_lcdpr?: boolean | null
          grupo_custo?: string | null
          grupo_geracao_id?: string | null
          hash_importacao?: string | null
          historico?: string | null
          id?: string
          importado_duplicado?: boolean | null
          lote_importacao_id?: string | null
          macro_custo?: string | null
          movimentacao_rebanho_id?: string | null
          nivel_duplicidade?: string | null
          numero_documento?: string | null
          observacao?: string | null
          orfao_definitivo?: boolean
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          origem_apontamento?:
            | Database["public"]["Enums"]["origem_apontamento_enum"]
            | null
          origem_lancamento?: string | null
          origem_tipo?: string | null
          plano_conta_id?: string | null
          recorrencia_id?: string | null
          safra_id?: string | null
          sem_movimentacao_caixa?: boolean | null
          sinal?: string | null
          staging_id?: string | null
          status_duplicidade?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          transferencia_grupo_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor?: number
        }
        Update: {
          ano_mes?: string | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          cancelado?: boolean | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          compoe_dre?: boolean | null
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          contrato_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dados_pagamento?: Json | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          documento?: string | null
          duplicado_de_id?: string | null
          editado_manual?: boolean | null
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          financiamento_id?: string | null
          forma_pagamento?: string | null
          gera_lcdpr?: boolean | null
          grupo_custo?: string | null
          grupo_geracao_id?: string | null
          hash_importacao?: string | null
          historico?: string | null
          id?: string
          importado_duplicado?: boolean | null
          lote_importacao_id?: string | null
          macro_custo?: string | null
          movimentacao_rebanho_id?: string | null
          nivel_duplicidade?: string | null
          numero_documento?: string | null
          observacao?: string | null
          orfao_definitivo?: boolean
          orfao_definitivo_em?: string | null
          orfao_definitivo_motivo?: string | null
          orfao_definitivo_por?: string | null
          origem_apontamento?:
            | Database["public"]["Enums"]["origem_apontamento_enum"]
            | null
          origem_lancamento?: string | null
          origem_tipo?: string | null
          plano_conta_id?: string | null
          recorrencia_id?: string | null
          safra_id?: string | null
          sem_movimentacao_caixa?: boolean | null
          sinal?: string | null
          staging_id?: string | null
          status_duplicidade?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          transferencia_grupo_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor?: number
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
          {
            foreignKeyName: "financeiro_lancamentos_v2_financiamento_id_fkey"
            columns: ["financiamento_id"]
            isOneToOne: false
            referencedRelation: "financiamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "financeiro_recorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_safra_id_fkey"
            columns: ["safra_id"]
            isOneToOne: false
            referencedRelation: "financeiro_safras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "mesa_lancamento_staging"
            referencedColumns: ["staging_id"]
          },
          {
            foreignKeyName: "fk_flv2_favorecido_tenant"
            columns: ["favorecido_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "fk_flv2_lote_importacao"
            columns: ["lote_importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_mapa_classificacao: {
        Row: {
          centro_custo_mapeado: string | null
          cliente_id: string
          confirmado: boolean
          created_at: string
          descricao_original: string
          id: string
          macro_custo: string | null
          subcentro_mapeado: string | null
          tipo_operacao: string | null
        }
        Insert: {
          centro_custo_mapeado?: string | null
          cliente_id: string
          confirmado?: boolean
          created_at?: string
          descricao_original: string
          id?: string
          macro_custo?: string | null
          subcentro_mapeado?: string | null
          tipo_operacao?: string | null
        }
        Update: {
          centro_custo_mapeado?: string | null
          cliente_id?: string
          confirmado?: boolean
          created_at?: string
          descricao_original?: string
          id?: string
          macro_custo?: string | null
          subcentro_mapeado?: string | null
          tipo_operacao?: string | null
        }
        Relationships: []
      }
      financeiro_plano_contas: {
        Row: {
          ativo: boolean | null
          centro_custo: string | null
          cliente_id: string | null
          compoe_dre: boolean | null
          created_at: string | null
          escopo_negocio: string | null
          gera_lcdpr: boolean | null
          grupo_custo: string | null
          grupo_fluxo: string | null
          id: string
          macro_custo: string | null
          ordem_exibicao: number | null
          subcentro: string | null
          tipo_operacao: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          centro_custo?: string | null
          cliente_id?: string | null
          compoe_dre?: boolean | null
          created_at?: string | null
          escopo_negocio?: string | null
          gera_lcdpr?: boolean | null
          grupo_custo?: string | null
          grupo_fluxo?: string | null
          id?: string
          macro_custo?: string | null
          ordem_exibicao?: number | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          centro_custo?: string | null
          cliente_id?: string | null
          compoe_dre?: boolean | null
          created_at?: string | null
          escopo_negocio?: string | null
          gera_lcdpr?: boolean | null
          grupo_custo?: string | null
          grupo_fluxo?: string | null
          id?: string
          macro_custo?: string | null
          ordem_exibicao?: number | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      financeiro_rateio_adm: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          created_by: string | null
          criterio_rateio: string | null
          id: string
          observacao: string | null
          status: string
          updated_at: string
          valor_total: number
          valor_total_rateado: number | null
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          created_by?: string | null
          criterio_rateio?: string | null
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
          valor_total_rateado?: number | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          criterio_rateio?: string | null
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
          valor_total_rateado?: number | null
        }
        Relationships: []
      }
      financeiro_rateio_adm_itens: {
        Row: {
          base_rateio: string | null
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          percentual: number
          percentual_rateio: number | null
          rateio_id: string
          valor: number
          valor_rateado: number | null
        }
        Insert: {
          base_rateio?: string | null
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          percentual?: number
          percentual_rateio?: number | null
          rateio_id: string
          valor?: number
          valor_rateado?: number | null
        }
        Update: {
          base_rateio?: string | null
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          percentual?: number
          percentual_rateio?: number | null
          rateio_id?: string
          valor?: number
          valor_rateado?: number | null
        }
        Relationships: []
      }
      financeiro_recorrencias: {
        Row: {
          ativo: boolean
          cliente_id: string
          conta_bancaria_id: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          descricao: string
          dia_vencimento: number
          favorecido_id: string | null
          fazenda_id: string
          forma_pagamento: string | null
          id: string
          observacao: string | null
          periodicidade: string
          primeiro_vencimento: string
          safra_id: string | null
          subcentro: string
          tipo_operacao: string | null
          tipo_valor: string
          ultimo_lancamento_gerado: string | null
          updated_at: string
          updated_by: string | null
          valor_base: number
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          conta_bancaria_id: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          descricao: string
          dia_vencimento: number
          favorecido_id?: string | null
          fazenda_id: string
          forma_pagamento?: string | null
          id?: string
          observacao?: string | null
          periodicidade?: string
          primeiro_vencimento: string
          safra_id?: string | null
          subcentro: string
          tipo_operacao?: string | null
          tipo_valor?: string
          ultimo_lancamento_gerado?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_base: number
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          conta_bancaria_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string
          dia_vencimento?: number
          favorecido_id?: string | null
          fazenda_id?: string
          forma_pagamento?: string | null
          id?: string
          observacao?: string | null
          periodicidade?: string
          primeiro_vencimento?: string
          safra_id?: string | null
          subcentro?: string
          tipo_operacao?: string | null
          tipo_valor?: string
          ultimo_lancamento_gerado?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_recorrencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recorrencias_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recorrencias_favorecido_id_fkey"
            columns: ["favorecido_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recorrencias_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recorrencias_safra_id_fkey"
            columns: ["safra_id"]
            isOneToOne: false
            referencedRelation: "financeiro_safras"
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
          saidas: number
          saldo_final: number
          saldo_inicial: number
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          entradas?: number
          fazenda_id: string
          id?: string
          saidas?: number
          saldo_final?: number
          saldo_inicial?: number
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          entradas?: number
          fazenda_id?: string
          id?: string
          saidas?: number
          saldo_final?: number
          saldo_inicial?: number
          updated_at?: string
        }
        Relationships: []
      }
      financeiro_safras: {
        Row: {
          ativa: boolean
          cliente_id: string
          codigo: string | null
          created_at: string
          descricao: string | null
          escopo_negocio: string | null
          id: string
          nome: string
          observacoes: string | null
          ordem_exibicao: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          cliente_id: string
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          escopo_negocio?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          ordem_exibicao?: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          cliente_id?: string
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          escopo_negocio?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          ordem_exibicao?: number
          updated_at?: string
        }
        Relationships: []
      }
      financeiro_saldos_audit: {
        Row: {
          acao: string | null
          campo_alterado: string | null
          cliente_id: string | null
          created_at: string | null
          id: string
          saldo_id: string | null
          usuario_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao?: string | null
          campo_alterado?: string | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          saldo_id?: string | null
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string | null
          campo_alterado?: string | null
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          saldo_id?: string | null
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      financeiro_saldos_bancarios_v2: {
        Row: {
          ano_mes: string | null
          cliente_id: string | null
          conta_bancaria_id: string | null
          created_at: string | null
          created_by: string | null
          fazenda_id: string | null
          fechado: boolean | null
          id: string
          observacao: string | null
          origem_saldo: string | null
          origem_saldo_inicial: string | null
          saldo_data: string | null
          saldo_final: number | null
          saldo_inicial: number | null
          status_mes: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          ano_mes?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fazenda_id?: string | null
          fechado?: boolean | null
          id?: string
          observacao?: string | null
          origem_saldo?: string | null
          origem_saldo_inicial?: string | null
          saldo_data?: string | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          status_mes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          ano_mes?: string | null
          cliente_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fazenda_id?: string | null
          fechado?: boolean | null
          id?: string
          observacao?: string | null
          origem_saldo?: string | null
          origem_saldo_inicial?: string | null
          saldo_data?: string | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          status_mes?: string | null
          updated_at?: string | null
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
        ]
      }
      financeiro_subcentro_aliases: {
        Row: {
          alias_text: string
          ativo: boolean
          cliente_id: string | null
          created_at: string
          created_by: string | null
          id: string
          observacao: string | null
          origem: string
          plano_conta_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alias_text: string
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          plano_conta_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alias_text?: string
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          plano_conta_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_subcentro_aliases_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_subcentro_aliases_plano_conta_id_fkey"
            columns: ["plano_conta_id"]
            isOneToOne: false
            referencedRelation: "financeiro_plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiros: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          id: string
          nome: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          nome?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      financiamento_destinacoes: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string
          financiamento_id: string
          id: string
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao: string
          financiamento_id: string
          id?: string
          valor?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string
          financiamento_id?: string
          id?: string
          valor?: number
        }
        Relationships: []
      }
      financiamento_parcelas: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          financiamento_id: string
          id: string
          lancamento_id: string | null
          lancamento_juros_id: string | null
          numero_parcela: number | null
          observacao: string | null
          status: string | null
          updated_at: string | null
          valor_juros: number | null
          valor_principal: number | null
          valor_total: number | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          financiamento_id: string
          id?: string
          lancamento_id?: string | null
          lancamento_juros_id?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          status?: string | null
          updated_at?: string | null
          valor_juros?: number | null
          valor_principal?: number | null
          valor_total?: number | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          financiamento_id?: string
          id?: string
          lancamento_id?: string | null
          lancamento_juros_id?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          status?: string | null
          updated_at?: string | null
          valor_juros?: number | null
          valor_principal?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financiamento_parcelas_financiamento_id_fkey"
            columns: ["financiamento_id"]
            isOneToOne: false
            referencedRelation: "financiamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamento_parcelas_lancamento_juros_id_fkey"
            columns: ["lancamento_juros_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamento_parcelas_lancamento_juros_id_fkey"
            columns: ["lancamento_juros_id"]
            isOneToOne: false
            referencedRelation: "vw_classificacao_staging_preview"
            referencedColumns: ["lanc_id"]
          },
          {
            foreignKeyName: "financiamento_parcelas_lancamento_juros_id_fkey"
            columns: ["lancamento_juros_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id"]
          },
        ]
      }
      financiamentos: {
        Row: {
          cliente_id: string
          conta_bancaria_id: string | null
          created_at: string | null
          created_by: string | null
          credor_id: string | null
          data_contrato: string | null
          data_inicio: string | null
          data_primeira_parcela: string | null
          descricao: string | null
          fazenda_id: string | null
          gerar_lancamento_captacao: boolean | null
          id: string
          lancamento_captacao_id: string | null
          numero_contrato: string | null
          observacao: string | null
          plano_conta_captacao_id: string | null
          plano_conta_parcela_id: string | null
          status: string | null
          taxa_juros: number | null
          taxa_juros_mensal: number | null
          tipo_financiamento: string | null
          total_parcelas: number | null
          updated_at: string | null
          valor_entrada: number | null
          valor_total: number | null
        }
        Insert: {
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credor_id?: string | null
          data_contrato?: string | null
          data_inicio?: string | null
          data_primeira_parcela?: string | null
          descricao?: string | null
          fazenda_id?: string | null
          gerar_lancamento_captacao?: boolean | null
          id?: string
          lancamento_captacao_id?: string | null
          numero_contrato?: string | null
          observacao?: string | null
          plano_conta_captacao_id?: string | null
          plano_conta_parcela_id?: string | null
          status?: string | null
          taxa_juros?: number | null
          taxa_juros_mensal?: number | null
          tipo_financiamento?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_total?: number | null
        }
        Update: {
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credor_id?: string | null
          data_contrato?: string | null
          data_inicio?: string | null
          data_primeira_parcela?: string | null
          descricao?: string | null
          fazenda_id?: string | null
          gerar_lancamento_captacao?: boolean | null
          id?: string
          lancamento_captacao_id?: string | null
          numero_contrato?: string | null
          observacao?: string | null
          plano_conta_captacao_id?: string | null
          plano_conta_parcela_id?: string | null
          status?: string | null
          taxa_juros?: number | null
          taxa_juros_mensal?: number | null
          tipo_financiamento?: string | null
          total_parcelas?: number | null
          updated_at?: string | null
          valor_entrada?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financiamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamentos_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamentos_credor_id_fkey"
            columns: ["credor_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamentos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamentos_lancamento_captacao_id_fkey"
            columns: ["lancamento_captacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamentos_lancamento_captacao_id_fkey"
            columns: ["lancamento_captacao_id"]
            isOneToOne: false
            referencedRelation: "vw_classificacao_staging_preview"
            referencedColumns: ["lanc_id"]
          },
          {
            foreignKeyName: "financiamentos_lancamento_captacao_id_fkey"
            columns: ["lancamento_captacao_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamentos_plano_conta_captacao_id_fkey"
            columns: ["plano_conta_captacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financiamentos_plano_conta_parcela_id_fkey"
            columns: ["plano_conta_parcela_id"]
            isOneToOne: false
            referencedRelation: "financeiro_plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          abate_fornecedor_id: string | null
          abate_frigorifico: string | null
          acrescimos: number | null
          anexo_acerto_url: string | null
          anexo_nf_url: string | null
          ano_mes: string | null
          arroba: number | null
          boitel_id: string | null
          boitel_lote_id: string | null
          bonus_lista_trace: number | null
          bonus_precoce: number | null
          bonus_qualidade: number | null
          cancelado: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          categoria: string | null
          categoria_destino: string | null
          categoria_id: string | null
          categoria_mae_id: string | null
          cenario: string
          cliente_id: string | null
          comprador_fornecedor: string | null
          comprador_fornecedor_id: string | null
          created_at: string | null
          created_by: string | null
          data: string
          data_abate: string | null
          data_embarque: string | null
          data_venda: string | null
          deducoes: number | null
          desconto_funrural: number | null
          desconto_qualidade: number | null
          destino_final: string | null
          detalhes_snapshot: Json | null
          doc_acerto: string | null
          fazenda_destino: string | null
          fazenda_destino_id: string | null
          fazenda_id: string | null
          fazenda_origem: string | null
          finalidade: string | null
          fornecedor_id: string | null
          fornecedor_nome_snapshot: string
          frigorifico: string | null
          hash_linha: string | null
          id: string
          instrucao: string | null
          lote: string | null
          lote_importacao_id: string | null
          motivo: string | null
          numero_documento: string | null
          numero_id: string | null
          observacao: string | null
          origem: string | null
          origem_registro: string | null
          outros_descontos: number | null
          pedido: string | null
          peso_carcaca_kg: number | null
          peso_medio_arrobas: number | null
          peso_medio_kg: number | null
          peso_total: number | null
          peso_vivo_total: number | null
          preco_arroba: number | null
          preco_medio_cabeca: number | null
          preco_unitario: number | null
          quantidade: number
          rendimento: number | null
          rendimento_carcaca: number | null
          sexo: string | null
          status_operacional: string | null
          tipo: string
          tipo_abate: string | null
          tipo_peso: string | null
          tipo_venda: string | null
          transferencia_par_id: string | null
          updated_at: string | null
          updated_by: string | null
          valor_total: number | null
        }
        Insert: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data: string
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo: string
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Update: {
          abate_fornecedor_id?: string | null
          abate_frigorifico?: string | null
          acrescimos?: number | null
          anexo_acerto_url?: string | null
          anexo_nf_url?: string | null
          ano_mes?: string | null
          arroba?: number | null
          boitel_id?: string | null
          boitel_lote_id?: string | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          categoria?: string | null
          categoria_destino?: string | null
          categoria_id?: string | null
          categoria_mae_id?: string | null
          cenario?: string
          cliente_id?: string | null
          comprador_fornecedor?: string | null
          comprador_fornecedor_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data?: string
          data_abate?: string | null
          data_embarque?: string | null
          data_venda?: string | null
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          destino_final?: string | null
          detalhes_snapshot?: Json | null
          doc_acerto?: string | null
          fazenda_destino?: string | null
          fazenda_destino_id?: string | null
          fazenda_id?: string | null
          fazenda_origem?: string | null
          finalidade?: string | null
          fornecedor_id?: string | null
          fornecedor_nome_snapshot?: string
          frigorifico?: string | null
          hash_linha?: string | null
          id?: string
          instrucao?: string | null
          lote?: string | null
          lote_importacao_id?: string | null
          motivo?: string | null
          numero_documento?: string | null
          numero_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_registro?: string | null
          outros_descontos?: number | null
          pedido?: string | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          peso_vivo_total?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          preco_unitario?: number | null
          quantidade?: number
          rendimento?: number | null
          rendimento_carcaca?: number | null
          sexo?: string | null
          status_operacional?: string | null
          tipo?: string
          tipo_abate?: string | null
          tipo_peso?: string | null
          tipo_venda?: string | null
          transferencia_par_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_categoria_mae_id_fkey"
            columns: ["categoria_mae_id"]
            isOneToOne: false
            referencedRelation: "categorias"
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
            foreignKeyName: "lancamentos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      mesa_lancamento_staging: {
        Row: {
          ano_mes: string
          centro_custo: string | null
          cliente_id: string
          conta_bancaria_id: string | null
          conta_resolvida_estrategia: string | null
          conta_resolvida_id: string | null
          conta_resolvida_score: number | null
          conta_texto_excel: string | null
          created_at: string
          data_competencia: string | null
          data_pagamento: string
          descricao: string | null
          erro_promocao: string | null
          escopo_negocio: string | null
          excel_key: string
          favorecido_id: string | null
          favorecido_nome_marcado_novo: string | null
          fazenda_id: string | null
          grupo_custo: string | null
          lancamento_v2_id: string | null
          macro_custo: string | null
          motivo_pendencia: string | null
          observacao: string | null
          ofx_extrato_id: string | null
          origem_aprovacao: string
          produto: string | null
          promovido_em: string | null
          promovido_por: string | null
          sessao_id: string
          sinal: string | null
          staging_id: string
          status_promocao: string
          subcentro: string | null
          tipo_operacao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano_mes: string
          centro_custo?: string | null
          cliente_id: string
          conta_bancaria_id?: string | null
          conta_resolvida_estrategia?: string | null
          conta_resolvida_id?: string | null
          conta_resolvida_score?: number | null
          conta_texto_excel?: string | null
          created_at?: string
          data_competencia?: string | null
          data_pagamento: string
          descricao?: string | null
          erro_promocao?: string | null
          escopo_negocio?: string | null
          excel_key: string
          favorecido_id?: string | null
          favorecido_nome_marcado_novo?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          lancamento_v2_id?: string | null
          macro_custo?: string | null
          motivo_pendencia?: string | null
          observacao?: string | null
          ofx_extrato_id?: string | null
          origem_aprovacao: string
          produto?: string | null
          promovido_em?: string | null
          promovido_por?: string | null
          sessao_id: string
          sinal?: string | null
          staging_id?: string
          status_promocao?: string
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          ano_mes?: string
          centro_custo?: string | null
          cliente_id?: string
          conta_bancaria_id?: string | null
          conta_resolvida_estrategia?: string | null
          conta_resolvida_id?: string | null
          conta_resolvida_score?: number | null
          conta_texto_excel?: string | null
          created_at?: string
          data_competencia?: string | null
          data_pagamento?: string
          descricao?: string | null
          erro_promocao?: string | null
          escopo_negocio?: string | null
          excel_key?: string
          favorecido_id?: string | null
          favorecido_nome_marcado_novo?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          lancamento_v2_id?: string | null
          macro_custo?: string | null
          motivo_pendencia?: string | null
          observacao?: string | null
          ofx_extrato_id?: string | null
          origem_aprovacao?: string
          produto?: string | null
          promovido_em?: string | null
          promovido_por?: string | null
          sessao_id?: string
          sinal?: string | null
          staging_id?: string
          status_promocao?: string
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "mesa_lancamento_staging_conta_resolvida_id_fkey"
            columns: ["conta_resolvida_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesa_lancamento_staging_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "mesa_sessao"
            referencedColumns: ["id"]
          },
        ]
      }
      mesa_ofx_validacao: {
        Row: {
          id: string
          ofx_id: string
          sessao_id: string
          status: string
          updated_at: string
        }
        Insert: {
          id?: string
          ofx_id: string
          sessao_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ofx_id?: string
          sessao_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesa_ofx_validacao_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "mesa_sessao"
            referencedColumns: ["id"]
          },
        ]
      }
      mesa_par: {
        Row: {
          aprovacao_json: Json | null
          correcao_json: Json | null
          decisao: string
          excel_key: string
          id: string
          ofx_id_ativo: string | null
          ofx_id_sugerido_original: string | null
          sessao_id: string
          updated_at: string
        }
        Insert: {
          aprovacao_json?: Json | null
          correcao_json?: Json | null
          decisao?: string
          excel_key: string
          id?: string
          ofx_id_ativo?: string | null
          ofx_id_sugerido_original?: string | null
          sessao_id: string
          updated_at?: string
        }
        Update: {
          aprovacao_json?: Json | null
          correcao_json?: Json | null
          decisao?: string
          excel_key?: string
          id?: string
          ofx_id_ativo?: string | null
          ofx_id_sugerido_original?: string | null
          sessao_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesa_par_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "mesa_sessao"
            referencedColumns: ["id"]
          },
        ]
      }
      mesa_par_backup_pr6_1b_20260524: {
        Row: {
          aprovacao_json: Json | null
          correcao_json: Json | null
          decisao: string | null
          excel_key: string | null
          id: string | null
          ofx_id_ativo: string | null
          ofx_id_sugerido_original: string | null
          sessao_id: string | null
          updated_at: string | null
        }
        Insert: {
          aprovacao_json?: Json | null
          correcao_json?: Json | null
          decisao?: string | null
          excel_key?: string | null
          id?: string | null
          ofx_id_ativo?: string | null
          ofx_id_sugerido_original?: string | null
          sessao_id?: string | null
          updated_at?: string | null
        }
        Update: {
          aprovacao_json?: Json | null
          correcao_json?: Json | null
          decisao?: string | null
          excel_key?: string | null
          id?: string | null
          ofx_id_ativo?: string | null
          ofx_id_sugerido_original?: string | null
          sessao_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mesa_par_backup_pr6_1c_20260525: {
        Row: {
          aprovacao_json: Json | null
          correcao_json: Json | null
          decisao: string | null
          excel_key: string | null
          id: string | null
          ofx_id_ativo: string | null
          ofx_id_sugerido_original: string | null
          sessao_id: string | null
          updated_at: string | null
        }
        Insert: {
          aprovacao_json?: Json | null
          correcao_json?: Json | null
          decisao?: string | null
          excel_key?: string | null
          id?: string | null
          ofx_id_ativo?: string | null
          ofx_id_sugerido_original?: string | null
          sessao_id?: string | null
          updated_at?: string | null
        }
        Update: {
          aprovacao_json?: Json | null
          correcao_json?: Json | null
          decisao?: string | null
          excel_key?: string | null
          id?: string | null
          ofx_id_ativo?: string | null
          ofx_id_sugerido_original?: string | null
          sessao_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mesa_sessao: {
        Row: {
          ano_mes: string
          cliente_id: string
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          excel_lotes_json: Json
          id: string
          ofx_extratos_ids: string[] | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          excel_lotes_json?: Json
          id?: string
          ofx_extratos_ids?: string[] | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          excel_lotes_json?: Json
          id?: string
          ofx_extratos_ids?: string[] | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_aprovacoes: {
        Row: {
          ano: number
          aprovado_em: string | null
          aprovado_email: string | null
          aprovado_por: string | null
          cliente_id: string
          created_at: string | null
          fazenda_id: string
          id: string
          observacao: string | null
          status: string
          updated_at: string | null
          versao_id: string
        }
        Insert: {
          ano: number
          aprovado_em?: string | null
          aprovado_email?: string | null
          aprovado_por?: string | null
          cliente_id: string
          created_at?: string | null
          fazenda_id: string
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string | null
          versao_id: string
        }
        Update: {
          ano?: number
          aprovado_em?: string | null
          aprovado_email?: string | null
          aprovado_por?: string | null
          cliente_id?: string
          created_at?: string | null
          fazenda_id?: string
          id?: string
          observacao?: string | null
          status?: string
          updated_at?: string | null
          versao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_aprovacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_aprovacoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_aprovacoes_versao_id_fkey"
            columns: ["versao_id"]
            isOneToOne: false
            referencedRelation: "meta_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_gmd_mensal: {
        Row: {
          ano_mes: string | null
          categoria: string | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          gmd_previsto: number | null
          id: string
          updated_at: string | null
        }
        Insert: {
          ano_mes?: string | null
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          gmd_previsto?: number | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          ano_mes?: string | null
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          gmd_previsto?: number | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_parametros_nutricao: {
        Row: {
          ano: number
          cliente_id: string | null
          comercial_custo_cab: number | null
          created_at: string | null
          cria_custo_cab_mes: number | null
          engorda_consumo_kg_ms: number | null
          engorda_custo_kg_ms: number | null
          engorda_periodo_dias: number | null
          fazenda_id: string
          frete_custo_cab: number | null
          id: string
          recria_custo_cab_mes: number | null
          updated_at: string | null
          versao_id: string | null
        }
        Insert: {
          ano: number
          cliente_id?: string | null
          comercial_custo_cab?: number | null
          created_at?: string | null
          cria_custo_cab_mes?: number | null
          engorda_consumo_kg_ms?: number | null
          engorda_custo_kg_ms?: number | null
          engorda_periodo_dias?: number | null
          fazenda_id: string
          frete_custo_cab?: number | null
          id?: string
          recria_custo_cab_mes?: number | null
          updated_at?: string | null
          versao_id?: string | null
        }
        Update: {
          ano?: number
          cliente_id?: string | null
          comercial_custo_cab?: number | null
          created_at?: string | null
          cria_custo_cab_mes?: number | null
          engorda_consumo_kg_ms?: number | null
          engorda_custo_kg_ms?: number | null
          engorda_periodo_dias?: number | null
          fazenda_id?: string
          frete_custo_cab?: number | null
          id?: string
          recria_custo_cab_mes?: number | null
          updated_at?: string | null
          versao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_parametros_nutricao_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_preco_mercado: {
        Row: {
          ano: number
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string | null
          id: string
          mes: number
          preco_arroba: number
          updated_at: string
        }
        Insert: {
          ano: number
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          mes: number
          preco_arroba?: number
          updated_at?: string
        }
        Update: {
          ano?: number
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          mes?: number
          preco_arroba?: number
          updated_at?: string
        }
        Relationships: []
      }
      meta_preco_mercado_status: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string | null
          id: string
          status: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          status?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      meta_projetos_investimento: {
        Row: {
          abr: number | null
          ago: number | null
          ano: number
          centro_custo: string | null
          cliente_id: string
          created_at: string | null
          dez: number | null
          fazenda_id: string | null
          fev: number | null
          grupo_custo: string | null
          id: string
          jan: number | null
          jul: number | null
          jun: number | null
          macro_custo: string | null
          mai: number | null
          mar: number | null
          nome: string | null
          nov: number | null
          observacao: string | null
          orcamento_total: number | null
          out: number | null
          responsavel: string | null
          set: number | null
          status: string | null
          subcentro: string
        }
        Insert: {
          abr?: number | null
          ago?: number | null
          ano: number
          centro_custo?: string | null
          cliente_id: string
          created_at?: string | null
          dez?: number | null
          fazenda_id?: string | null
          fev?: number | null
          grupo_custo?: string | null
          id?: string
          jan?: number | null
          jul?: number | null
          jun?: number | null
          macro_custo?: string | null
          mai?: number | null
          mar?: number | null
          nome?: string | null
          nov?: number | null
          observacao?: string | null
          orcamento_total?: number | null
          out?: number | null
          responsavel?: string | null
          set?: number | null
          status?: string | null
          subcentro: string
        }
        Update: {
          abr?: number | null
          ago?: number | null
          ano?: number
          centro_custo?: string | null
          cliente_id?: string
          created_at?: string | null
          dez?: number | null
          fazenda_id?: string | null
          fev?: number | null
          grupo_custo?: string | null
          id?: string
          jan?: number | null
          jul?: number | null
          jun?: number | null
          macro_custo?: string | null
          mai?: number | null
          mar?: number | null
          nome?: string | null
          nov?: number | null
          observacao?: string | null
          orcamento_total?: number | null
          out?: number | null
          responsavel?: string | null
          set?: number | null
          status?: string | null
          subcentro?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_projetos_investimento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_projetos_investimento_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_valor_rebanho_precos: {
        Row: {
          ano_mes: string
          categoria: string
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string
          preco_arroba: number | null
          preco_kg: number | null
          updated_at: string | null
        }
        Insert: {
          ano_mes: string
          categoria: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          preco_arroba?: number | null
          preco_kg?: number | null
          updated_at?: string | null
        }
        Update: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          preco_arroba?: number | null
          preco_kg?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_valor_rebanho_status: {
        Row: {
          ano_mes: string
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string
          id: string
          status: string
          updated_at: string | null
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano_mes: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id: string
          id?: string
          status?: string
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string
          id?: string
          status?: string
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_valor_rebanho_status_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_valor_rebanho_status_bkp_20260825: {
        Row: {
          ano_mes: string | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string | null
          status: string | null
          updated_at: string | null
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano_mes?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano_mes?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: []
      }
      meta_versoes: {
        Row: {
          ano: number
          cliente_id: string
          created_at: string | null
          dados: Json | null
          fazenda_id: string | null
          id: string
          nome: string
          status: string
          user_id: string | null
          usuario_email: string | null
        }
        Insert: {
          ano: number
          cliente_id: string
          created_at?: string | null
          dados?: Json | null
          fazenda_id?: string | null
          id?: string
          nome: string
          status?: string
          user_id?: string | null
          usuario_email?: string | null
        }
        Update: {
          ano?: number
          cliente_id?: string
          created_at?: string | null
          dados?: Json | null
          fazenda_id?: string | null
          id?: string
          nome?: string
          status?: string
          user_id?: string | null
          usuario_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_versoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_versoes_backup_20260516: {
        Row: {
          ano: number | null
          cliente_id: string | null
          created_at: string | null
          dados: Json | null
          fazenda_id: string | null
          id: string | null
          nome: string | null
          status: string | null
          user_id: string | null
          usuario_email: string | null
        }
        Insert: {
          ano?: number | null
          cliente_id?: string | null
          created_at?: string | null
          dados?: Json | null
          fazenda_id?: string | null
          id?: string | null
          nome?: string | null
          status?: string | null
          user_id?: string | null
          usuario_email?: string | null
        }
        Update: {
          ano?: number | null
          cliente_id?: string | null
          created_at?: string | null
          dados?: Json | null
          fazenda_id?: string | null
          id?: string | null
          nome?: string | null
          status?: string | null
          user_id?: string | null
          usuario_email?: string | null
        }
        Relationships: []
      }
      pasto_condicoes: {
        Row: {
          condicao: string
          created_at: string
          data_avaliacao: string
          id: string
          observacoes: string | null
          pasto_id: string
        }
        Insert: {
          condicao: string
          created_at?: string
          data_avaliacao: string
          id?: string
          observacoes?: string | null
          pasto_id: string
        }
        Update: {
          condicao?: string
          created_at?: string
          data_avaliacao?: string
          id?: string
          observacoes?: string | null
          pasto_id?: string
        }
        Relationships: []
      }
      pasto_geometrias: {
        Row: {
          created_at: string
          geojson: Json
          id: string
          pasto_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          geojson?: Json
          id?: string
          pasto_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          geojson?: Json
          id?: string
          pasto_id?: string
          updated_at?: string
        }
        Relationships: []
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
          pasto_id: string
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
          data: string
          fazenda_id: string
          id?: string
          lote_id?: string | null
          observacoes?: string | null
          pasto_destino_id?: string | null
          pasto_id: string
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
          pasto_id?: string
          pasto_origem_id?: string | null
          peso_medio_kg?: number | null
          quantidade?: number
          referencia_rebanho?: string | null
          registrado_por?: string | null
          tipo?: string
        }
        Relationships: []
      }
      pastos: {
        Row: {
          area: number | null
          area_produtiva_ha: number | null
          ativo: boolean
          cliente_id: string | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          entra_conciliacao: boolean
          fazenda_id: string
          id: string
          lote_padrao: string | null
          nome: string
          observacoes: string | null
          ordem_exibicao: number | null
          qualidade: number | null
          referencia_rebanho: string | null
          situacao: string | null
          tipo_uso: string | null
          updated_at: string | null
        }
        Insert: {
          area?: number | null
          area_produtiva_ha?: number | null
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          entra_conciliacao?: boolean
          fazenda_id: string
          id?: string
          lote_padrao?: string | null
          nome: string
          observacoes?: string | null
          ordem_exibicao?: number | null
          qualidade?: number | null
          referencia_rebanho?: string | null
          situacao?: string | null
          tipo_uso?: string | null
          updated_at?: string | null
        }
        Update: {
          area?: number | null
          area_produtiva_ha?: number | null
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          entra_conciliacao?: boolean
          fazenda_id?: string
          id?: string
          lote_padrao?: string | null
          nome?: string
          observacoes?: string | null
          ordem_exibicao?: number | null
          qualidade?: number | null
          referencia_rebanho?: string | null
          situacao?: string | null
          tipo_uso?: string | null
          updated_at?: string | null
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
      planejamento_area_meta: {
        Row: {
          ano: number
          area_agricultura_ha: number | null
          area_app_ha: number | null
          area_benfeitorias_ha: number | null
          area_outras_ha: number | null
          area_pecuaria_ha: number | null
          area_reserva_ha: number | null
          area_silvicultura_ha: number | null
          area_total_ha: number | null
          cliente_id: string
          created_at: string
          created_by: string | null
          fazenda_id: string
          id: string
          mes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ano: number
          area_agricultura_ha?: number | null
          area_app_ha?: number | null
          area_benfeitorias_ha?: number | null
          area_outras_ha?: number | null
          area_pecuaria_ha?: number | null
          area_reserva_ha?: number | null
          area_silvicultura_ha?: number | null
          area_total_ha?: number | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          fazenda_id: string
          id?: string
          mes: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ano?: number
          area_agricultura_ha?: number | null
          area_app_ha?: number | null
          area_benfeitorias_ha?: number | null
          area_outras_ha?: number | null
          area_pecuaria_ha?: number | null
          area_reserva_ha?: number | null
          area_silvicultura_ha?: number | null
          area_total_ha?: number | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          fazenda_id?: string
          id?: string
          mes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planejamento_area_meta_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planejamento_area_meta_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      planejamento_financeiro: {
        Row: {
          ano: number
          cenario: string
          centro_custo: string
          cliente_id: string
          created_at: string | null
          driver: string | null
          escopo_negocio: string | null
          fazenda_id: string
          grupo_custo: string | null
          id: string
          macro_custo: string | null
          mes: number
          observacao: string | null
          origem: string
          quantidade_driver: number
          subcentro: string | null
          tipo_custo: string
          unidade_driver: string | null
          updated_at: string | null
          valor_base: number
          valor_planejado: number
        }
        Insert: {
          ano: number
          cenario?: string
          centro_custo: string
          cliente_id: string
          created_at?: string | null
          driver?: string | null
          escopo_negocio?: string | null
          fazenda_id: string
          grupo_custo?: string | null
          id?: string
          macro_custo?: string | null
          mes: number
          observacao?: string | null
          origem?: string
          quantidade_driver?: number
          subcentro?: string | null
          tipo_custo?: string
          unidade_driver?: string | null
          updated_at?: string | null
          valor_base?: number
          valor_planejado?: number
        }
        Update: {
          ano?: number
          cenario?: string
          centro_custo?: string
          cliente_id?: string
          created_at?: string | null
          driver?: string | null
          escopo_negocio?: string | null
          fazenda_id?: string
          grupo_custo?: string | null
          id?: string
          macro_custo?: string | null
          mes?: number
          observacao?: string | null
          origem?: string
          quantidade_driver?: number
          subcentro?: string | null
          tipo_custo?: string
          unidade_driver?: string | null
          updated_at?: string | null
          valor_base?: number
          valor_planejado?: number
        }
        Relationships: [
          {
            foreignKeyName: "planejamento_financeiro_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planejamento_financeiro_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      planejamento_financeiro_backup_20260516: {
        Row: {
          ano: number | null
          cenario: string | null
          centro_custo: string | null
          cliente_id: string | null
          created_at: string | null
          driver: string | null
          escopo_negocio: string | null
          fazenda_id: string | null
          grupo_custo: string | null
          id: string | null
          macro_custo: string | null
          mes: number | null
          observacao: string | null
          origem: string | null
          quantidade_driver: number | null
          subcentro: string | null
          tipo_custo: string | null
          unidade_driver: string | null
          updated_at: string | null
          valor_base: number | null
          valor_planejado: number | null
        }
        Insert: {
          ano?: number | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          driver?: string | null
          escopo_negocio?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          macro_custo?: string | null
          mes?: number | null
          observacao?: string | null
          origem?: string | null
          quantidade_driver?: number | null
          subcentro?: string | null
          tipo_custo?: string | null
          unidade_driver?: string | null
          updated_at?: string | null
          valor_base?: number | null
          valor_planejado?: number | null
        }
        Update: {
          ano?: number | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          driver?: string | null
          escopo_negocio?: string | null
          fazenda_id?: string | null
          grupo_custo?: string | null
          id?: string | null
          macro_custo?: string | null
          mes?: number | null
          observacao?: string | null
          origem?: string | null
          quantidade_driver?: number | null
          subcentro?: string | null
          tipo_custo?: string | null
          unidade_driver?: string | null
          updated_at?: string | null
          valor_base?: number | null
          valor_planejado?: number | null
        }
        Relationships: []
      }
      preco_mercado: {
        Row: {
          agio_perc: number | null
          ano_mes: string
          bloco: string
          categoria: string
          cliente_id: string
          created_at: string
          data_referencia: string
          fonte: string | null
          id: string
          preco_arroba: number
          unidade: string | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          agio_perc?: number | null
          ano_mes: string
          bloco: string
          categoria: string
          cliente_id: string
          created_at?: string
          data_referencia: string
          fonte?: string | null
          id?: string
          preco_arroba?: number
          unidade?: string | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          agio_perc?: number | null
          ano_mes?: string
          bloco?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          data_referencia?: string
          fonte?: string | null
          id?: string
          preco_arroba?: number
          unidade?: string | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: []
      }
      preco_mercado_ajuste: {
        Row: {
          ajustado_por: string | null
          created_at: string
          fator_ajuste: number
          id: string
          motivo: string | null
          preco_id: string
        }
        Insert: {
          ajustado_por?: string | null
          created_at?: string
          fator_ajuste?: number
          id?: string
          motivo?: string | null
          preco_id: string
        }
        Update: {
          ajustado_por?: string | null
          created_at?: string
          fator_ajuste?: number
          id?: string
          motivo?: string | null
          preco_id?: string
        }
        Relationships: []
      }
      preco_mercado_status: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fechado_em: string | null
          id: string
          status: string
          updated_at: string | null
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fechado_em?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fechado_em?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reclassificacoes: {
        Row: {
          ano: number
          categoria_destino_id: string
          categoria_origem_id: string
          created_at: string | null
          fazenda_id: string
          id: string
          mes: number
          observacao: string | null
          quantidade: number
        }
        Insert: {
          ano: number
          categoria_destino_id: string
          categoria_origem_id: string
          created_at?: string | null
          fazenda_id: string
          id?: string
          mes: number
          observacao?: string | null
          quantidade?: number
        }
        Update: {
          ano?: number
          categoria_destino_id?: string
          categoria_origem_id?: string
          created_at?: string | null
          fazenda_id?: string
          id?: string
          mes?: number
          observacao?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "reclassificacoes_categoria_destino_id_fkey"
            columns: ["categoria_destino_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclassificacoes_categoria_origem_id_fkey"
            columns: ["categoria_origem_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclassificacoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_iniciais: {
        Row: {
          ano: number
          categoria: string | null
          categoria_id: string | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string
          id: string
          mes: number | null
          peso_medio_kg: number | null
          peso_total: number | null
          preco_kg: number | null
          quantidade: number
        }
        Insert: {
          ano: number
          categoria?: string | null
          categoria_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id: string
          id?: string
          mes?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          preco_kg?: number | null
          quantidade?: number
        }
        Update: {
          ano?: number
          categoria?: string | null
          categoria_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string
          id?: string
          mes?: number | null
          peso_medio_kg?: number | null
          peso_total?: number | null
          preco_kg?: number | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldos_iniciais_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
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
      transferencia_ofx_pares: {
        Row: {
          ano_mes: string
          cliente_id: string
          confianca: string
          conta_destino_id: string
          conta_origem_id: string
          created_at: string
          data_entrada: string
          data_saida: string
          decidido_em: string | null
          decidido_por: string | null
          detectado_em: string
          id: string
          motivo_rejeicao: string | null
          ofx_entrada_id: string
          ofx_saida_id: string
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          confianca: string
          conta_destino_id: string
          conta_origem_id: string
          created_at?: string
          data_entrada: string
          data_saida: string
          decidido_em?: string | null
          decidido_por?: string | null
          detectado_em?: string
          id?: string
          motivo_rejeicao?: string | null
          ofx_entrada_id: string
          ofx_saida_id: string
          status: string
          updated_at?: string
          valor: number
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          confianca?: string
          conta_destino_id?: string
          conta_origem_id?: string
          created_at?: string
          data_entrada?: string
          data_saida?: string
          decidido_em?: string | null
          decidido_por?: string | null
          detectado_em?: string
          id?: string
          motivo_rejeicao?: string | null
          ofx_entrada_id?: string
          ofx_saida_id?: string
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_ofx_pares_ofx_entrada_id_fkey"
            columns: ["ofx_entrada_id"]
            isOneToOne: false
            referencedRelation: "extrato_bancario_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_ofx_pares_ofx_entrada_id_fkey"
            columns: ["ofx_entrada_id"]
            isOneToOne: false
            referencedRelation: "v_extrato_conciliacao"
            referencedColumns: ["extrato_id"]
          },
          {
            foreignKeyName: "transferencia_ofx_pares_ofx_saida_id_fkey"
            columns: ["ofx_saida_id"]
            isOneToOne: false
            referencedRelation: "extrato_bancario_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_ofx_pares_ofx_saida_id_fkey"
            columns: ["ofx_saida_id"]
            isOneToOne: false
            referencedRelation: "v_extrato_conciliacao"
            referencedColumns: ["extrato_id"]
          },
        ]
      }
      valor_rebanho_fechamento: {
        Row: {
          ano_mes: string
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          peso_total_kg: number | null
          reaberto_em: string | null
          reaberto_por: string | null
          status: string
          updated_at: string | null
          valor_total: number | null
        }
        Insert: {
          ano_mes?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_total_kg?: number | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string | null
          valor_total?: number | null
        }
        Update: {
          ano_mes?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_total_kg?: number | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string | null
          valor_total?: number | null
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
          ano_mes: string | null
          categoria: string | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          peso_medio_kg: number | null
          preco_kg: number | null
          quantidade: number | null
          updated_at: string | null
          valor_total_categoria: number | null
        }
        Insert: {
          ano_mes?: string | null
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_medio_kg?: number | null
          preco_kg?: number | null
          quantidade?: number | null
          updated_at?: string | null
          valor_total_categoria?: number | null
        }
        Update: {
          ano_mes?: string | null
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          peso_medio_kg?: number | null
          preco_kg?: number | null
          quantidade?: number | null
          updated_at?: string | null
          valor_total_categoria?: number | null
        }
        Relationships: []
      }
      valor_rebanho_mensal: {
        Row: {
          ano_mes: string
          categoria: string
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string
          id: string
          preco_kg: number
          updated_at: string | null
        }
        Insert: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id: string
          id?: string
          preco_kg?: number
          updated_at?: string | null
        }
        Update: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string
          id?: string
          preco_kg?: number
          updated_at?: string | null
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
          arrobas_total: number | null
          cabecas: number | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string
          peso_medio_kg: number | null
          peso_total_kg: number | null
          preco_arroba_medio: number | null
          status: string
          updated_at: string | null
          validado_em: string | null
          validado_por: string | null
          valor_cabeca_medio: number | null
          valor_total: number | null
        }
        Insert: {
          ano_mes: string
          arrobas_total?: number | null
          cabecas?: number | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          peso_medio_kg?: number | null
          peso_total_kg?: number | null
          preco_arroba_medio?: number | null
          status?: string
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number | null
          valor_total?: number | null
        }
        Update: {
          ano_mes?: string
          arrobas_total?: number | null
          cabecas?: number | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          peso_medio_kg?: number | null
          peso_total_kg?: number | null
          preco_arroba_medio?: number | null
          status?: string
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number | null
          valor_total?: number | null
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
          created_at: string | null
          id: string
          meta_id: string | null
          peso_medio_kg: number | null
          preco_arroba: number | null
          preco_kg: number | null
          quantidade: number | null
          updated_at: string | null
          valor_cabeca: number | null
          valor_total_categoria: number | null
        }
        Insert: {
          categoria: string
          created_at?: string | null
          id?: string
          meta_id?: string | null
          peso_medio_kg?: number | null
          preco_arroba?: number | null
          preco_kg?: number | null
          quantidade?: number | null
          updated_at?: string | null
          valor_cabeca?: number | null
          valor_total_categoria?: number | null
        }
        Update: {
          categoria?: string
          created_at?: string | null
          id?: string
          meta_id?: string | null
          peso_medio_kg?: number | null
          preco_arroba?: number | null
          preco_kg?: number | null
          quantidade?: number | null
          updated_at?: string | null
          valor_cabeca?: number | null
          valor_total_categoria?: number | null
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
          arrobas_total: number | null
          cabecas: number | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string
          peso_medio_kg: number | null
          preco_arroba_medio: number | null
          status: string | null
          updated_at: string | null
          validado_em: string | null
          validado_por: string | null
          valor_cabeca_medio: number | null
          valor_total: number | null
        }
        Insert: {
          ano_mes: string
          arrobas_total?: number | null
          cabecas?: number | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          peso_medio_kg?: number | null
          preco_arroba_medio?: number | null
          status?: string | null
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number | null
          valor_total?: number | null
        }
        Update: {
          ano_mes?: string
          arrobas_total?: number | null
          cabecas?: number | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string
          peso_medio_kg?: number | null
          preco_arroba_medio?: number | null
          status?: string | null
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      valor_rebanho_meta_validada_backup_20260516: {
        Row: {
          ano_mes: string | null
          arrobas_total: number | null
          cabecas: number | null
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string | null
          id: string | null
          peso_medio_kg: number | null
          preco_arroba_medio: number | null
          status: string | null
          updated_at: string | null
          validado_em: string | null
          validado_por: string | null
          valor_cabeca_medio: number | null
          valor_total: number | null
        }
        Insert: {
          ano_mes?: string | null
          arrobas_total?: number | null
          cabecas?: number | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string | null
          peso_medio_kg?: number | null
          preco_arroba_medio?: number | null
          status?: string | null
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number | null
          valor_total?: number | null
        }
        Update: {
          ano_mes?: string | null
          arrobas_total?: number | null
          cabecas?: number | null
          cliente_id?: string | null
          created_at?: string | null
          fazenda_id?: string | null
          id?: string | null
          peso_medio_kg?: number | null
          preco_arroba_medio?: number | null
          status?: string | null
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      valor_rebanho_realizado_validado: {
        Row: {
          ano_mes: string
          arrobas_total: number
          cabecas: number
          cliente_id: string
          created_at: string | null
          fazenda_id: string
          id: string
          peso_medio_kg: number
          preco_arroba_medio: number
          status: string
          updated_at: string | null
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
          created_at?: string | null
          fazenda_id: string
          id?: string
          peso_medio_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string | null
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
          created_at?: string | null
          fazenda_id?: string
          id?: string
          peso_medio_kg?: number
          preco_arroba_medio?: number
          status?: string
          updated_at?: string | null
          validado_em?: string | null
          validado_por?: string | null
          valor_cabeca_medio?: number
          valor_total?: number
        }
        Relationships: []
      }
      zoo_componentes_financeiros: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string
          created_at: string
          id: string
          natureza: string
          nome: string
          ordem_exibicao: number
          sistemico: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          codigo: string
          created_at?: string
          id?: string
          natureza: string
          nome: string
          ordem_exibicao?: number
          sistemico?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          id?: string
          natureza?: string
          nome?: string
          ordem_exibicao?: number
          sistemico?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      zoo_operacao_boitel: {
        Row: {
          acerto_papel: number | null
          adiantamento_observacao: string | null
          arrobas_totais_abate: number | null
          cenario: string
          cliente_id: string
          created_at: string
          created_by: string | null
          custo_diaria: number | null
          custo_frete: number | null
          custo_frete_no_boitel: boolean
          custo_notas_envio: number
          custo_nutricao: number | null
          custo_oportunidade: number | null
          custo_sanidade: number | null
          data_abate: string | null
          data_adiantamento: string | null
          data_envio: string | null
          despesas_abate: number | null
          despesas_abate_no_boitel: boolean
          dias: number | null
          gmd: number | null
          id: string
          lote_codigo: string | null
          modalidade_custo: string
          morte_quantidade: number | null
          morte_valor_indenizacao: number | null
          nome_boitel: string | null
          notas_envio_no_boitel: boolean
          numero_contrato: string | null
          operacao_id: string
          outros_custos: number | null
          outros_no_boitel: boolean
          peso_saida_fazenda_kg: number | null
          peso_vivo_total_abate: number | null
          possui_adiantamento: boolean
          preco_venda_arroba: number | null
          qtd_abatida: number | null
          quebra_viagem_pct: number | null
          rendimento_entrada_pct: number | null
          rendimento_saida_pct: number | null
          updated_at: string
          updated_by: string | null
          valor_adiantamento_diarias: number | null
          valor_adiantamento_outros: number | null
          valor_adiantamento_sanitario: number | null
          valor_total_abate: number | null
          valor_total_diarias: number | null
        }
        Insert: {
          acerto_papel?: number | null
          adiantamento_observacao?: string | null
          arrobas_totais_abate?: number | null
          cenario: string
          cliente_id: string
          created_at?: string
          created_by?: string | null
          custo_diaria?: number | null
          custo_frete?: number | null
          custo_frete_no_boitel?: boolean
          custo_notas_envio?: number
          custo_nutricao?: number | null
          custo_oportunidade?: number | null
          custo_sanidade?: number | null
          data_abate?: string | null
          data_adiantamento?: string | null
          data_envio?: string | null
          despesas_abate?: number | null
          despesas_abate_no_boitel?: boolean
          dias?: number | null
          gmd?: number | null
          id?: string
          lote_codigo?: string | null
          modalidade_custo?: string
          morte_quantidade?: number | null
          morte_valor_indenizacao?: number | null
          nome_boitel?: string | null
          notas_envio_no_boitel?: boolean
          numero_contrato?: string | null
          operacao_id: string
          outros_custos?: number | null
          outros_no_boitel?: boolean
          peso_saida_fazenda_kg?: number | null
          peso_vivo_total_abate?: number | null
          possui_adiantamento?: boolean
          preco_venda_arroba?: number | null
          qtd_abatida?: number | null
          quebra_viagem_pct?: number | null
          rendimento_entrada_pct?: number | null
          rendimento_saida_pct?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_adiantamento_diarias?: number | null
          valor_adiantamento_outros?: number | null
          valor_adiantamento_sanitario?: number | null
          valor_total_abate?: number | null
          valor_total_diarias?: number | null
        }
        Update: {
          acerto_papel?: number | null
          adiantamento_observacao?: string | null
          arrobas_totais_abate?: number | null
          cenario?: string
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          custo_diaria?: number | null
          custo_frete?: number | null
          custo_frete_no_boitel?: boolean
          custo_notas_envio?: number
          custo_nutricao?: number | null
          custo_oportunidade?: number | null
          custo_sanidade?: number | null
          data_abate?: string | null
          data_adiantamento?: string | null
          data_envio?: string | null
          despesas_abate?: number | null
          despesas_abate_no_boitel?: boolean
          dias?: number | null
          gmd?: number | null
          id?: string
          lote_codigo?: string | null
          modalidade_custo?: string
          morte_quantidade?: number | null
          morte_valor_indenizacao?: number | null
          nome_boitel?: string | null
          notas_envio_no_boitel?: boolean
          numero_contrato?: string | null
          operacao_id?: string
          outros_custos?: number | null
          outros_no_boitel?: boolean
          peso_saida_fazenda_kg?: number | null
          peso_vivo_total_abate?: number | null
          possui_adiantamento?: boolean
          preco_venda_arroba?: number | null
          qtd_abatida?: number | null
          quebra_viagem_pct?: number | null
          rendimento_entrada_pct?: number | null
          rendimento_saida_pct?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_adiantamento_diarias?: number | null
          valor_adiantamento_outros?: number | null
          valor_adiantamento_sanitario?: number | null
          valor_total_abate?: number | null
          valor_total_diarias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_boitel_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_boitel_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_boitel_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id"]
          },
        ]
      }
      zoo_operacao_compromissos: {
        Row: {
          centro_custo: string | null
          cliente_id: string
          componente: string
          created_at: string
          descricao: string | null
          favorecido_id: string | null
          grupo_custo: string | null
          id: string
          lote_id: string | null
          macro_custo: string | null
          natureza: string
          operacao_id: string
          plano_conta_id: string | null
          status: string
          subcentro: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          centro_custo?: string | null
          cliente_id: string
          componente: string
          created_at?: string
          descricao?: string | null
          favorecido_id?: string | null
          grupo_custo?: string | null
          id?: string
          lote_id?: string | null
          macro_custo?: string | null
          natureza: string
          operacao_id: string
          plano_conta_id?: string | null
          status?: string
          subcentro?: string | null
          updated_at?: string
          valor_total: number
        }
        Update: {
          centro_custo?: string | null
          cliente_id?: string
          componente?: string
          created_at?: string
          descricao?: string | null
          favorecido_id?: string | null
          grupo_custo?: string | null
          id?: string
          lote_id?: string | null
          macro_custo?: string | null
          natureza?: string
          operacao_id?: string
          plano_conta_id?: string | null
          status?: string
          subcentro?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_compromissos_componente_fk"
            columns: ["natureza", "componente"]
            isOneToOne: false
            referencedRelation: "zoo_componentes_financeiros"
            referencedColumns: ["natureza", "codigo"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_lote_fk"
            columns: ["lote_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_lotes_recebimento"
            referencedColumns: ["lote_id", "operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_lote_fk"
            columns: ["lote_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_lotes"
            referencedColumns: ["id", "operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_documento_componentes: {
        Row: {
          cancelado: boolean
          cliente_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          documento_id: string
          id: string
          natureza: string
          operacao_id: string
          ordem: number
          tipo: string
          updated_at: string | null
          updated_by: string | null
          valor: number
        }
        Insert: {
          cancelado?: boolean
          cliente_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          documento_id: string
          id?: string
          natureza: string
          operacao_id: string
          ordem: number
          tipo: string
          updated_at?: string | null
          updated_by?: string | null
          valor: number
        }
        Update: {
          cancelado?: boolean
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          documento_id?: string
          id?: string
          natureza?: string
          operacao_id?: string
          ordem?: number
          tipo?: string
          updated_at?: string | null
          updated_by?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "zoo_oc_doc_comp_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_documentos"
            referencedColumns: ["documento_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_doc_comp_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_documentos"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_documento_lotes: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          documento_id: string
          id: string
          operacao_id: string
          operacao_lote_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          documento_id: string
          id?: string
          operacao_id: string
          operacao_lote_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          documento_id?: string
          id?: string
          operacao_id?: string
          operacao_lote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoo_oc_doc_lote_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_documentos"
            referencedColumns: ["documento_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_doc_lote_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_documentos"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_doc_lote_lote_fk"
            columns: ["operacao_lote_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_lotes_recebimento"
            referencedColumns: ["lote_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_doc_lote_lote_fk"
            columns: ["operacao_lote_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_lotes"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_documentos: {
        Row: {
          cancelado: boolean
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          chave_acesso: string | null
          cliente_id: string
          data_emissao: string | null
          documento_origem_id: string | null
          emitente_documento: string | null
          emitente_id: string | null
          emitente_nome: string | null
          especie: string
          id: string
          nome: string
          numero: string | null
          observacao: string | null
          operacao_id: string
          serie: string | null
          tamanho_bytes: number | null
          tipo: string | null
          updated_at: string | null
          updated_by: string | null
          uploaded_em: string
          uploaded_por: string | null
          url: string | null
          versao: number
        }
        Insert: {
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          chave_acesso?: string | null
          cliente_id: string
          data_emissao?: string | null
          documento_origem_id?: string | null
          emitente_documento?: string | null
          emitente_id?: string | null
          emitente_nome?: string | null
          especie?: string
          id?: string
          nome: string
          numero?: string | null
          observacao?: string | null
          operacao_id: string
          serie?: string | null
          tamanho_bytes?: number | null
          tipo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          uploaded_em?: string
          uploaded_por?: string | null
          url?: string | null
          versao?: number
        }
        Update: {
          cancelado?: boolean
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          chave_acesso?: string | null
          cliente_id?: string
          data_emissao?: string | null
          documento_origem_id?: string | null
          emitente_documento?: string | null
          emitente_id?: string | null
          emitente_nome?: string | null
          especie?: string
          id?: string
          nome?: string
          numero?: string | null
          observacao?: string | null
          operacao_id?: string
          serie?: string | null
          tamanho_bytes?: number | null
          tipo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          uploaded_em?: string
          uploaded_por?: string | null
          url?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_doc_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_origem_fk"
            columns: ["documento_origem_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_documentos"
            referencedColumns: ["documento_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_origem_fk"
            columns: ["documento_origem_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_documentos"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_documentos_emitente_id_fkey"
            columns: ["emitente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      zoo_operacao_eventos: {
        Row: {
          acao: string
          cliente_id: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          detalhes: Json | null
          id: string
          operacao_id: string
          origem: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          cliente_id: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          detalhes?: Json | null
          id?: string
          operacao_id: string
          origem?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          cliente_id?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          detalhes?: Json | null
          id?: string
          operacao_id?: string
          origem?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_evt_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_evt_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_evt_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_exclusoes_teste: {
        Row: {
          cliente_id: string
          contagens_por_tabela: Json
          data_exclusao: string
          id: string
          motivo: string
          operacao_id: string
          snapshot: Json
          usuario_executor: string | null
        }
        Insert: {
          cliente_id: string
          contagens_por_tabela: Json
          data_exclusao?: string
          id?: string
          motivo: string
          operacao_id: string
          snapshot: Json
          usuario_executor?: string | null
        }
        Update: {
          cliente_id?: string
          contagens_por_tabela?: Json
          data_exclusao?: string
          id?: string
          motivo?: string
          operacao_id?: string
          snapshot?: Json
          usuario_executor?: string | null
        }
        Relationships: []
      }
      zoo_operacao_liquidacoes: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          estornado: boolean
          estornado_em: string | null
          estornado_por: string | null
          estorno_motivo: string | null
          financeiro_lancamento_id: string | null
          forma: string
          id: string
          natureza: string
          observacao: string | null
          operacao_id: string
          origem: string
          permuta_descricao_bem: string | null
          permuta_documento_url: string | null
          permuta_tipo_bem: string | null
          permuta_valor_atribuido: number | null
          updated_at: string
          updated_by: string | null
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data: string
          descricao?: string | null
          estornado?: boolean
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_motivo?: string | null
          financeiro_lancamento_id?: string | null
          forma: string
          id?: string
          natureza: string
          observacao?: string | null
          operacao_id: string
          origem?: string
          permuta_descricao_bem?: string | null
          permuta_documento_url?: string | null
          permuta_tipo_bem?: string | null
          permuta_valor_atribuido?: number | null
          updated_at?: string
          updated_by?: string | null
          valor: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          estornado?: boolean
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_motivo?: string | null
          financeiro_lancamento_id?: string | null
          forma?: string
          id?: string
          natureza?: string
          observacao?: string | null
          operacao_id?: string
          origem?: string
          permuta_descricao_bem?: string | null
          permuta_documento_url?: string | null
          permuta_tipo_bem?: string | null
          permuta_valor_atribuido?: number | null
          updated_at?: string
          updated_by?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "zoo_oc_liq_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_liq_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_liq_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_liq_titulo_fk"
            columns: ["financeiro_lancamento_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_oc_liq_titulo_fk"
            columns: ["financeiro_lancamento_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_lotes: {
        Row: {
          categoria_negociada: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          criterio_valor: string | null
          id: string
          operacao_id: string
          ordem: number
          peso_medio_negociado_kg: number | null
          qtd_negociada: number | null
          updated_at: string
          updated_by: string | null
          valor_informado: number | null
        }
        Insert: {
          categoria_negociada?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          criterio_valor?: string | null
          id?: string
          operacao_id: string
          ordem: number
          peso_medio_negociado_kg?: number | null
          qtd_negociada?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_informado?: number | null
        }
        Update: {
          categoria_negociada?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          criterio_valor?: string | null
          id?: string
          operacao_id?: string
          ordem?: number
          peso_medio_negociado_kg?: number | null
          qtd_negociada?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_informado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_lotes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_lotes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_lotes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_movimentacoes: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          id: string
          movimentacao_id: string
          operacao_id: string
          operacao_lote_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movimentacao_id: string
          operacao_id: string
          operacao_lote_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movimentacao_id?: string
          operacao_id?: string
          operacao_lote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_mov_lote_fk"
            columns: ["operacao_lote_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_lotes_recebimento"
            referencedColumns: ["lote_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_mov_lote_fk"
            columns: ["operacao_lote_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_lotes"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_mov_movimentacao_fk"
            columns: ["movimentacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_mov_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_mov_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_mov_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_parcelas_programacao: {
        Row: {
          cliente_id: string
          conta_bancaria_id: string | null
          created_at: string
          forma: string | null
          id: string
          programacao_id: string
          sequencia: number
          status: string
          updated_at: string
          valor: number
          vencimento: string | null
        }
        Insert: {
          cliente_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          forma?: string | null
          id?: string
          programacao_id: string
          sequencia: number
          status?: string
          updated_at?: string
          valor: number
          vencimento?: string | null
        }
        Update: {
          cliente_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          forma?: string | null
          id?: string
          programacao_id?: string
          sequencia?: number
          status?: string
          updated_at?: string
          valor?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_parcelas_programacao_prog_fk"
            columns: ["programacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_programacoes"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_partes: {
        Row: {
          cancelada: boolean
          cancelada_em: string | null
          cancelada_motivo: string | null
          cancelada_por: string | null
          centro_custo: string | null
          chave_idempotencia: string | null
          cliente_id: string
          componente: string
          created_at: string
          data_vencimento: string | null
          descricao: string | null
          documento_componente_id: string | null
          documento_id: string | null
          favorecido_id: string | null
          financeiro_lancamento_id: string | null
          grupo_custo: string | null
          id: string
          incluso_no_total: boolean
          lote_id: string | null
          macro_custo: string | null
          natureza: string
          operacao_id: string
          origem: string
          plano_conta_id: string | null
          programacao_parcela_id: string | null
          quantidade_parcelas: number
          sem_movimentacao_caixa: boolean
          sequencia_parcela: number
          subcentro: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          cancelada?: boolean
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          cancelada_por?: string | null
          centro_custo?: string | null
          chave_idempotencia?: string | null
          cliente_id: string
          componente?: string
          created_at?: string
          data_vencimento?: string | null
          descricao?: string | null
          documento_componente_id?: string | null
          documento_id?: string | null
          favorecido_id?: string | null
          financeiro_lancamento_id?: string | null
          grupo_custo?: string | null
          id?: string
          incluso_no_total?: boolean
          lote_id?: string | null
          macro_custo?: string | null
          natureza: string
          operacao_id: string
          origem?: string
          plano_conta_id?: string | null
          programacao_parcela_id?: string | null
          quantidade_parcelas?: number
          sem_movimentacao_caixa?: boolean
          sequencia_parcela?: number
          subcentro?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          cancelada?: boolean
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          cancelada_por?: string | null
          centro_custo?: string | null
          chave_idempotencia?: string | null
          cliente_id?: string
          componente?: string
          created_at?: string
          data_vencimento?: string | null
          descricao?: string | null
          documento_componente_id?: string | null
          documento_id?: string | null
          favorecido_id?: string | null
          financeiro_lancamento_id?: string | null
          grupo_custo?: string | null
          id?: string
          incluso_no_total?: boolean
          lote_id?: string | null
          macro_custo?: string | null
          natureza?: string
          operacao_id?: string
          origem?: string
          plano_conta_id?: string | null
          programacao_parcela_id?: string | null
          quantidade_parcelas?: number
          sem_movimentacao_caixa?: boolean
          sequencia_parcela?: number
          subcentro?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_partes_componente_fk"
            columns: ["natureza", "componente"]
            isOneToOne: false
            referencedRelation: "zoo_componentes_financeiros"
            referencedColumns: ["natureza", "codigo"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_documentos"
            referencedColumns: ["documento_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_documentos"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_lote_fk"
            columns: ["lote_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_lotes_recebimento"
            referencedColumns: ["lote_id", "operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_lote_fk"
            columns: ["lote_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_lotes"
            referencedColumns: ["id", "operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_parcela_prog_fk"
            columns: ["programacao_parcela_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_parcelas_materializacao"
            referencedColumns: ["parcela_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_parcela_prog_fk"
            columns: ["programacao_parcela_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_parcelas_programacao"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_titulo_fk"
            columns: ["financeiro_lancamento_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_titulo_fk"
            columns: ["financeiro_lancamento_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacao_programacoes: {
        Row: {
          cliente_id: string
          compromisso_id: string
          condicoes: string | null
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          compromisso_id: string
          condicoes?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          compromisso_id?: string
          condicoes?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_programacoes_compromisso_fk"
            columns: ["compromisso_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_compromissos_resumo"
            referencedColumns: ["compromisso_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_programacoes_compromisso_fk"
            columns: ["compromisso_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_compromissos"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoo_operacoes_comerciais: {
        Row: {
          acrescimos: number
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          categoria_negociada: string | null
          cenario: string
          cliente_id: string
          condicao_pagamento: string | null
          contraparte_id: string | null
          created_at: string
          created_by: string | null
          data_abate: string | null
          data_embarque: string | null
          data_operacao: string
          data_pagamento_prevista: string | null
          descontos: number
          entrega_encerrada: boolean
          entrega_encerrada_em: string | null
          entrega_encerrada_motivo: string | null
          entrega_encerrada_por: string | null
          erro_sincronizacao: string | null
          fazenda_id: string | null
          hash_financeiro_esperado: string | null
          id: string
          is_teste: boolean
          modalidade_comercial: string | null
          numero_documento: string | null
          observacoes: string | null
          peso_carcaca_fonte: string | null
          peso_carcaca_kg_total: number | null
          peso_medio_negociado_kg: number | null
          peso_negociado_soberano: string | null
          peso_total_negociado_kg: number | null
          preco_unitario: number | null
          qtd_negociada: number | null
          rascunho: boolean
          rendimento_carcaca: number | null
          responsavel: string | null
          responsavel_nome_snapshot: string | null
          sincronizado_em: string | null
          status_comercial: string
          status_financeiro: string
          tipo_operacao: string
          tipo_peso: string | null
          tipo_precificacao: string | null
          ultima_tentativa_em: string | null
          updated_at: string
          updated_by: string | null
          valor_acordado: number | null
          valor_bruto: number | null
          valor_estimado: number | null
          valor_total: number | null
          versao: number
        }
        Insert: {
          acrescimos?: number
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          categoria_negociada?: string | null
          cenario?: string
          cliente_id: string
          condicao_pagamento?: string | null
          contraparte_id?: string | null
          created_at?: string
          created_by?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_operacao: string
          data_pagamento_prevista?: string | null
          descontos?: number
          entrega_encerrada?: boolean
          entrega_encerrada_em?: string | null
          entrega_encerrada_motivo?: string | null
          entrega_encerrada_por?: string | null
          erro_sincronizacao?: string | null
          fazenda_id?: string | null
          hash_financeiro_esperado?: string | null
          id?: string
          is_teste?: boolean
          modalidade_comercial?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          peso_carcaca_fonte?: string | null
          peso_carcaca_kg_total?: number | null
          peso_medio_negociado_kg?: number | null
          peso_negociado_soberano?: string | null
          peso_total_negociado_kg?: number | null
          preco_unitario?: number | null
          qtd_negociada?: number | null
          rascunho?: boolean
          rendimento_carcaca?: number | null
          responsavel?: string | null
          responsavel_nome_snapshot?: string | null
          sincronizado_em?: string | null
          status_comercial?: string
          status_financeiro?: string
          tipo_operacao: string
          tipo_peso?: string | null
          tipo_precificacao?: string | null
          ultima_tentativa_em?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_acordado?: number | null
          valor_bruto?: number | null
          valor_estimado?: number | null
          valor_total?: number | null
          versao?: number
        }
        Update: {
          acrescimos?: number
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          categoria_negociada?: string | null
          cenario?: string
          cliente_id?: string
          condicao_pagamento?: string | null
          contraparte_id?: string | null
          created_at?: string
          created_by?: string | null
          data_abate?: string | null
          data_embarque?: string | null
          data_operacao?: string
          data_pagamento_prevista?: string | null
          descontos?: number
          entrega_encerrada?: boolean
          entrega_encerrada_em?: string | null
          entrega_encerrada_motivo?: string | null
          entrega_encerrada_por?: string | null
          erro_sincronizacao?: string | null
          fazenda_id?: string | null
          hash_financeiro_esperado?: string | null
          id?: string
          is_teste?: boolean
          modalidade_comercial?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          peso_carcaca_fonte?: string | null
          peso_carcaca_kg_total?: number | null
          peso_medio_negociado_kg?: number | null
          peso_negociado_soberano?: string | null
          peso_total_negociado_kg?: number | null
          preco_unitario?: number | null
          qtd_negociada?: number | null
          rascunho?: boolean
          rendimento_carcaca?: number | null
          responsavel?: string | null
          responsavel_nome_snapshot?: string | null
          sincronizado_em?: string | null
          status_comercial?: string
          status_financeiro?: string
          tipo_operacao?: string
          tipo_peso?: string | null
          tipo_precificacao?: string | null
          ultima_tentativa_em?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_acordado?: number | null
          valor_bruto?: number | null
          valor_estimado?: number | null
          valor_total?: number | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacoes_comerciais_contraparte_fk"
            columns: ["contraparte_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacoes_comerciais_fazenda_fk"
            columns: ["fazenda_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      zoot_importacoes: {
        Row: {
          cancelada_em: string | null
          cancelada_por: string | null
          cliente_id: string
          created_at: string
          fazenda_id: string
          hash_arquivo: string | null
          id: string
          linhas_erro: number | null
          linhas_validas: number | null
          nome_arquivo: string
          status: string
          total_erros: number
          total_linhas: number
          total_validas: number
          usuario_id: string | null
        }
        Insert: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id: string
          created_at?: string
          fazenda_id: string
          hash_arquivo?: string | null
          id?: string
          linhas_erro?: number | null
          linhas_validas?: number | null
          nome_arquivo: string
          status?: string
          total_erros?: number
          total_linhas?: number
          total_validas?: number
          usuario_id?: string | null
        }
        Update: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          hash_arquivo?: string | null
          id?: string
          linhas_erro?: number | null
          linhas_validas?: number | null
          nome_arquivo?: string
          status?: string
          total_erros?: number
          total_linhas?: number
          total_validas?: number
          usuario_id?: string | null
        }
        Relationships: []
      }
      zoot_importacoes_staging: {
        Row: {
          created_at: string
          dados_raw: Json
          erro: string | null
          id: string
          importacao_id: string
          linha_numero: number
          status: string
        }
        Insert: {
          created_at?: string
          dados_raw?: Json
          erro?: string | null
          id?: string
          importacao_id: string
          linha_numero: number
          status?: string
        }
        Update: {
          created_at?: string
          dados_raw?: Json
          erro?: string | null
          id?: string
          importacao_id?: string
          linha_numero?: number
          status?: string
        }
        Relationships: []
      }
      zoot_mensal_cache: {
        Row: {
          ano: number | null
          ano_mes: string | null
          cab_abate: number | null
          cab_compra: number | null
          cab_consumo: number | null
          cab_morte: number | null
          cab_nascimento: number | null
          cab_transf_entrada: number | null
          cab_transf_saida: number | null
          cab_venda: number | null
          cab_venda_pe: number | null
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
          peso_abate: number | null
          peso_carcaca_abate: number | null
          peso_compra: number | null
          peso_consumo: number | null
          peso_entradas_externas: number | null
          peso_evol_cat_entrada: number | null
          peso_evol_cat_saida: number | null
          peso_medio_final: number | null
          peso_medio_inicial: number | null
          peso_morte: number | null
          peso_nascimento: number | null
          peso_saidas_externas: number | null
          peso_total_final: number | null
          peso_total_inicial: number | null
          peso_transf_entrada: number | null
          peso_transf_saida: number | null
          peso_venda: number | null
          peso_venda_pe: number | null
          producao_biologica: number | null
          saidas_externas: number | null
          saldo_final: number | null
          saldo_inicial: number | null
          saldo_p1: number | null
          saldo_sistema: number | null
          updated_at: string
        }
        Insert: {
          ano?: number | null
          ano_mes?: string | null
          cab_abate?: number | null
          cab_compra?: number | null
          cab_consumo?: number | null
          cab_morte?: number | null
          cab_nascimento?: number | null
          cab_transf_entrada?: number | null
          cab_transf_saida?: number | null
          cab_venda?: number | null
          cab_venda_pe?: number | null
          categoria_codigo?: string | null
          categoria_id?: string | null
          categoria_nome?: string | null
          cenario?: string | null
          cliente_id?: string | null
          dias_mes?: number | null
          entradas_externas?: number | null
          evol_cat_entrada?: number | null
          evol_cat_saida?: number | null
          fazenda_id?: string | null
          fonte_oficial_mes?: string | null
          gmd?: number | null
          mes?: number | null
          ordem_exibicao?: number | null
          peso_abate?: number | null
          peso_carcaca_abate?: number | null
          peso_compra?: number | null
          peso_consumo?: number | null
          peso_entradas_externas?: number | null
          peso_evol_cat_entrada?: number | null
          peso_evol_cat_saida?: number | null
          peso_medio_final?: number | null
          peso_medio_inicial?: number | null
          peso_morte?: number | null
          peso_nascimento?: number | null
          peso_saidas_externas?: number | null
          peso_total_final?: number | null
          peso_total_inicial?: number | null
          peso_transf_entrada?: number | null
          peso_transf_saida?: number | null
          peso_venda?: number | null
          peso_venda_pe?: number | null
          producao_biologica?: number | null
          saidas_externas?: number | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          saldo_p1?: number | null
          saldo_sistema?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number | null
          ano_mes?: string | null
          cab_abate?: number | null
          cab_compra?: number | null
          cab_consumo?: number | null
          cab_morte?: number | null
          cab_nascimento?: number | null
          cab_transf_entrada?: number | null
          cab_transf_saida?: number | null
          cab_venda?: number | null
          cab_venda_pe?: number | null
          categoria_codigo?: string | null
          categoria_id?: string | null
          categoria_nome?: string | null
          cenario?: string | null
          cliente_id?: string | null
          dias_mes?: number | null
          entradas_externas?: number | null
          evol_cat_entrada?: number | null
          evol_cat_saida?: number | null
          fazenda_id?: string | null
          fonte_oficial_mes?: string | null
          gmd?: number | null
          mes?: number | null
          ordem_exibicao?: number | null
          peso_abate?: number | null
          peso_carcaca_abate?: number | null
          peso_compra?: number | null
          peso_consumo?: number | null
          peso_entradas_externas?: number | null
          peso_evol_cat_entrada?: number | null
          peso_evol_cat_saida?: number | null
          peso_medio_final?: number | null
          peso_medio_inicial?: number | null
          peso_morte?: number | null
          peso_nascimento?: number | null
          peso_saidas_externas?: number | null
          peso_total_final?: number | null
          peso_total_inicial?: number | null
          peso_transf_entrada?: number | null
          peso_transf_saida?: number | null
          peso_venda?: number | null
          peso_venda_pe?: number | null
          producao_biologica?: number | null
          saidas_externas?: number | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          saldo_p1?: number | null
          saldo_sistema?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_extrato_conciliacao: {
        Row: {
          cancelado_em: string | null
          cliente_id: string | null
          conta_bancaria_id: string | null
          data_movimento: string | null
          descricao: string | null
          documento: string | null
          extrato_id: string | null
          ignorado_em: string | null
          situacao: string | null
          valor: number | null
          valor_aberto: number | null
          valor_conciliado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "extrato_bancario_v2_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_bancario_v2_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_classificacao_staging_preview: {
        Row: {
          aplicado: boolean | null
          aplicado_em: string | null
          aplicado_por: string | null
          cliente_id: string | null
          conflito_subcentro: boolean | null
          conta_filtro_id: string | null
          conta_filtro_nome: string | null
          created_at: string | null
          erro_apply: string | null
          excel_conta_destino: string | null
          excel_conta_origem: string | null
          excel_data: string | null
          excel_documento: string | null
          excel_fazenda_codigo: string | null
          excel_fornecedor: string | null
          excel_linha_origem: number | null
          excel_observacao: string | null
          excel_produto: string | null
          excel_subcentro: string | null
          excel_tipo_operacao: string | null
          excel_valor: number | null
          lanc_centro_atual: string | null
          lanc_conta_bancaria_id: string | null
          lanc_conta_bancaria_nome: string | null
          lanc_conta_destino_id: string | null
          lanc_conta_destino_nome: string | null
          lanc_data_competencia: string | null
          lanc_data_pagamento: string | null
          lanc_descricao: string | null
          lanc_favorecido_id_atual: string | null
          lanc_favorecido_nome_atual: string | null
          lanc_fazenda_id: string | null
          lanc_fazenda_nome: string | null
          lanc_grupo_atual: string | null
          lanc_id: string | null
          lanc_macro_atual: string | null
          lanc_numero_documento: string | null
          lanc_observacao: string | null
          lanc_plano_conta_id_atual: string | null
          lanc_sinal: string | null
          lanc_status: string | null
          lanc_subcentro_atual: string | null
          lanc_tipo_operacao: string | null
          lanc_valor: number | null
          lote_aplicavel: boolean | null
          match_status: string | null
          motor_version: number | null
          proposto_alias_id: string | null
          proposto_categoria: string | null
          proposto_favorecido_id: string | null
          proposto_favorecido_nome: string | null
          proposto_fazenda_id: string | null
          proposto_fazenda_nome: string | null
          proposto_macro: string | null
          proposto_numero_documento: string | null
          proposto_origem_resolucao: string | null
          proposto_produto: string | null
          proposto_regra_id: string | null
          proposto_safra: string | null
          proposto_subcentro: string | null
          proposto_subcentro_existe_no_plano: boolean | null
          proposto_tier: string | null
          sessao_id: string | null
          staging_id: string | null
          updated_at: string | null
          will_change_anything: boolean | null
          will_create_subcentro_orfao: boolean | null
          will_set_favorecido: boolean | null
          will_set_fazenda: boolean | null
          will_set_subcentro: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_classificacao_staging_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_fazenda_id_fkey"
            columns: ["lanc_fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
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
      vw_financeiro_lancamentos_v2_doc: {
        Row: {
          ano_mes: string | null
          cancelado: boolean | null
          cenario: string | null
          centro_custo: string | null
          cliente_id: string | null
          conciliado_em: string | null
          conta_bancaria_id: string | null
          conta_destino_id: string | null
          created_at: string | null
          dados_pagamento: Json | null
          data_competencia: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          documento: string | null
          documento_formatado: string | null
          editado_manual: boolean | null
          escopo_negocio: string | null
          favorecido_id: string | null
          fazenda_id: string | null
          financiamento_id: string | null
          forma_pagamento: string | null
          grupo_custo: string | null
          historico: string | null
          id: string | null
          lote_importacao_id: string | null
          macro_custo: string | null
          mes_competencia: number | null
          mes_financeira: number | null
          mes_pagamento: number | null
          mes_vencimento: number | null
          movimentacao_rebanho_id: string | null
          numero_documento: string | null
          observacao: string | null
          origem_lancamento: string | null
          origem_tipo: string | null
          safra_id: string | null
          sinal: string | null
          status_transacao: string | null
          subcentro: string | null
          tipo_documento: string | null
          tipo_operacao: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          ano_mes?: string | null
          cancelado?: boolean | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          created_at?: string | null
          dados_pagamento?: Json | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          documento?: string | null
          documento_formatado?: never
          editado_manual?: boolean | null
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          financiamento_id?: string | null
          forma_pagamento?: string | null
          grupo_custo?: string | null
          historico?: string | null
          id?: string | null
          lote_importacao_id?: string | null
          macro_custo?: string | null
          mes_competencia?: never
          mes_financeira?: never
          mes_pagamento?: never
          mes_vencimento?: never
          movimentacao_rebanho_id?: string | null
          numero_documento?: string | null
          observacao?: string | null
          origem_lancamento?: string | null
          origem_tipo?: string | null
          safra_id?: string | null
          sinal?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          ano_mes?: string | null
          cancelado?: boolean | null
          cenario?: string | null
          centro_custo?: string | null
          cliente_id?: string | null
          conciliado_em?: string | null
          conta_bancaria_id?: string | null
          conta_destino_id?: string | null
          created_at?: string | null
          dados_pagamento?: Json | null
          data_competencia?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          documento?: string | null
          documento_formatado?: never
          editado_manual?: boolean | null
          escopo_negocio?: string | null
          favorecido_id?: string | null
          fazenda_id?: string | null
          financiamento_id?: string | null
          forma_pagamento?: string | null
          grupo_custo?: string | null
          historico?: string | null
          id?: string | null
          lote_importacao_id?: string | null
          macro_custo?: string | null
          mes_competencia?: never
          mes_financeira?: never
          mes_pagamento?: never
          mes_vencimento?: never
          movimentacao_rebanho_id?: string | null
          numero_documento?: string | null
          observacao?: string | null
          origem_lancamento?: string | null
          origem_tipo?: string | null
          safra_id?: string | null
          sinal?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_documento?: string | null
          tipo_operacao?: string | null
          updated_at?: string | null
          valor?: number | null
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
          {
            foreignKeyName: "financeiro_lancamentos_v2_financiamento_id_fkey"
            columns: ["financiamento_id"]
            isOneToOne: false
            referencedRelation: "financiamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_v2_safra_id_fkey"
            columns: ["safra_id"]
            isOneToOne: false
            referencedRelation: "financeiro_safras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_flv2_favorecido_tenant"
            columns: ["favorecido_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "fk_flv2_lote_importacao"
            columns: ["lote_importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_oc_compromissos_resumo: {
        Row: {
          cliente_id: string | null
          componente: string | null
          compromisso_id: string | null
          favorecido_id: string | null
          lote_id: string | null
          natureza: string | null
          operacao_id: string | null
          plano_conta_id: string | null
          programacao_ativa_id: string | null
          saldo_a_materializar: number | null
          saldo_a_programar: number | null
          saldo_financeiro: number | null
          status: string | null
          tem_divergencia: boolean | null
          tem_programacao_ativa: boolean | null
          total_liquidado: number | null
          total_liquidado_monetario: number | null
          total_liquidado_nao_monetario: number | null
          total_materializado: number | null
          total_programado: number | null
          valor_compromisso: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_compromissos_componente_fk"
            columns: ["natureza", "componente"]
            isOneToOne: false
            referencedRelation: "zoo_componentes_financeiros"
            referencedColumns: ["natureza", "codigo"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_lote_fk"
            columns: ["lote_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_lotes_recebimento"
            referencedColumns: ["lote_id", "operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_lote_fk"
            columns: ["lote_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_lotes"
            referencedColumns: ["id", "operacao_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_compromissos_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      vw_oc_documentos: {
        Row: {
          cancelado: boolean | null
          chave_acesso: string | null
          cliente_id: string | null
          data_emissao: string | null
          documento_id: string | null
          documento_origem_id: string | null
          emitente_documento: string | null
          emitente_id: string | null
          emitente_nome: string | null
          especie: string | null
          numero: string | null
          observacao: string | null
          operacao_id: string | null
          qtd_componentes: number | null
          qtd_lotes: number | null
          serie: string | null
          situacao: string | null
          total_acrescimos: number | null
          total_descontos_comerciais: number | null
          total_despesas_desembolso: number | null
          total_retencoes_sem_caixa: number | null
          url: string | null
          valor_liquido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_doc_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_origem_fk"
            columns: ["documento_origem_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_documentos"
            referencedColumns: ["documento_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_doc_origem_fk"
            columns: ["documento_origem_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_documentos"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_documentos_emitente_id_fkey"
            columns: ["emitente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_oc_lotes_recebimento: {
        Row: {
          categoria_negociada: string | null
          cliente_id: string | null
          diferenca: number | null
          estado_recebimento: string | null
          lote_id: string | null
          operacao_id: string | null
          ordem: number | null
          peso_medio_negociado_kg: number | null
          qtd_negociada: number | null
          qtd_recebida: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_lotes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_lotes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_lotes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      vw_oc_obrigacoes: {
        Row: {
          cancelada: boolean | null
          cliente_id: string | null
          componente: string | null
          data_vencimento: string | null
          documento_id: string | null
          estado: string | null
          favorecido_id: string | null
          natureza: string | null
          obrigacao_id: string | null
          operacao_id: string | null
          origem: string | null
          quantidade_parcelas: number | null
          saldo_aberto: number | null
          sem_movimentacao_caixa: boolean | null
          sequencia_parcela: number | null
          titulo_id: string | null
          total_liquidado: number | null
          total_liquidado_monetario: number | null
          total_liquidado_nao_monetario: number | null
          valor_nominal: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_partes_componente_fk"
            columns: ["natureza", "componente"]
            isOneToOne: false
            referencedRelation: "zoo_componentes_financeiros"
            referencedColumns: ["natureza", "codigo"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_documentos"
            referencedColumns: ["documento_id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_documento_fk"
            columns: ["documento_id", "operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacao_documentos"
            referencedColumns: ["id", "operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_titulo_fk"
            columns: ["titulo_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_titulo_fk"
            columns: ["titulo_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      vw_oc_operacao_compromissos_resumo: {
        Row: {
          cliente_id: string | null
          entrada_liquidado: number | null
          entrada_materializado: number | null
          entrada_obrigacao: number | null
          entrada_programado: number | null
          modo: string | null
          n_compromissos: number | null
          obrigacao_total: number | null
          operacao_id: string | null
          saida_liquidado: number | null
          saida_materializado: number | null
          saida_obrigacao: number | null
          saida_programado: number | null
          saldo_financeiro: number | null
          tem_compromissos: boolean | null
          tem_divergencia: boolean | null
          tem_partes_legadas: boolean | null
          total_liquidado: number | null
          total_materializado: number | null
          total_programado: number | null
        }
        Relationships: []
      }
      vw_oc_operacao_liquidacao: {
        Row: {
          base: number | null
          base_origem: string | null
          cliente_id: string | null
          estado_liquidacao: string | null
          operacao_id: string | null
          saldo_operacao: number | null
          total_liquidado_monetario: number | null
          total_liquidado_nao_monetario: number | null
          total_liquidado_valido: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      vw_oc_parcelas_materializacao: {
        Row: {
          cliente_id: string | null
          compromisso_id: string | null
          compromisso_status: string | null
          conta_bancaria_id: string | null
          forma: string | null
          materializada: boolean | null
          operacao_id: string | null
          parcela_id: string | null
          parte_id: string | null
          programacao_id: string | null
          programacao_status: string | null
          saldo_titulo: number | null
          sequencia: number | null
          status: string | null
          tem_divergencia: boolean | null
          titulo_id: string | null
          titulo_status_transacao: string | null
          titulo_valor: number | null
          total_liquidado_titulo: number | null
          valor: number | null
          vencimento: string | null
          vinculo_integro: boolean | null
        }
        Relationships: []
      }
      vw_oc_titulos_liquidacao: {
        Row: {
          cliente_id: string | null
          estado: string | null
          operacao_id: string | null
          saldo_titulo: number | null
          titulo_cancelado: boolean | null
          titulo_id: string | null
          total_liquidado_monetario: number | null
          total_liquidado_nao_monetario: number | null
          total_liquidado_valido: number | null
          valor_titulo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_compromissos_resumo"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_oc_operacao_liquidacao"
            referencedColumns: ["operacao_id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_operacao_fk"
            columns: ["operacao_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "zoo_operacoes_comerciais"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_titulo_fk"
            columns: ["titulo_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos_v2"
            referencedColumns: ["id", "cliente_id"]
          },
          {
            foreignKeyName: "zoo_operacao_partes_titulo_fk"
            columns: ["titulo_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_financeiro_lancamentos_v2_doc"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      vw_valor_rebanho_realizado_global_mensal: {
        Row: {
          ano_mes: string | null
          arrobas_total: number | null
          cabecas: number | null
          cliente_id: string | null
          peso_medio_kg: number | null
          preco_arroba_medio: number | null
          qtd_fazendas: number | null
          valor_cabeca_medio: number | null
          valor_total: number | null
        }
        Relationships: []
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
      _oc_aplicar_partes: {
        Args: { p_cliente_id: string; p_operacao_id: string; p_parcelas: Json }
        Returns: undefined
      }
      _oc_base_divida_operacao: {
        Args: { p_operacao_id: string }
        Returns: {
          base: number
          base_origem: string
        }[]
      }
      _oc_base_saldo_operacao: {
        Args: { p_operacao_id: string }
        Returns: {
          base: number
          base_origem: string
        }[]
      }
      _oc_conciliar_peso: {
        Args: { p_medio: number; p_qtd: number; p_total: number }
        Returns: Json
      }
      _oc_documento_aplicar: {
        Args: {
          p_actor: string
          p_cliente_id: string
          p_componentes: Json
          p_documento_id: string
          p_lotes: Json
          p_operacao_id: string
        }
        Returns: undefined
      }
      _oc_estado_liquidacao: {
        Args: { p_base: number; p_liquidado: number }
        Returns: string
      }
      _oc_estorno_mov: {
        Args: {
          p_actor: string
          p_cliente_id: string
          p_estorno_id: string
          p_link_id: string
          p_motivo: string
        }
        Returns: Json
      }
      _oc_estorno_reabrir_entrega: {
        Args: {
          p_actor: string
          p_cliente_id: string
          p_estorno_id: string
          p_motivo: string
          p_operacao_id: string
        }
        Returns: boolean
      }
      _oc_valor_do_lote: { Args: { p_lote_id: string }; Returns: Json }
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
      can_close_valor_rebanho: {
        Args: { _ano_mes: string; _fazenda_id: string }
        Returns: Json
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
      cancel_zoot_importacao: {
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
      exec_query: { Args: { sql: string }; Returns: Json }
      exec_sql: { Args: { sql: string }; Returns: Json }
      fn_ajustes_sugeridos_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          ano_mes: string
          cliente_id: string
          data_inicio: string
          eh_ajuste: boolean
          entra_conciliacao: boolean
          fazenda_id: string
          natureza_patrimonial: string
          nome_exibicao: string
          pasto_id: string
          sugerir_no_fechamento: boolean
          tipo_entidade: string
          tipo_uso: string
        }[]
      }
      fn_area_vigente_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          ano_mes: string
          area_agricultura_ha: number | null
          area_app_ha: number | null
          area_benfeitorias_ha: number | null
          area_outras_ha: number | null
          area_pecuaria_ha: number | null
          area_produtiva_ha: number
          area_reserva_ha: number | null
          area_silvicultura_ha: number | null
          area_total_ha: number | null
          cliente_id: string
          fazenda_id: string
          fechado_em: string
          fechado_por: string | null
          fechamento_p1_snapshot_id: string | null
          id: string
          origem_area: string
          schema_version: number
          versao: number
        }[]
        SetofOptions: {
          from: "*"
          to: "fechamento_area_snapshot"
          isOneToOne: false
          isSetofReturn: true
        }
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
      fn_cancelar_lancamento_auditoria: {
        Args: { p_lancamento_id: string; p_motivo?: string }
        Returns: Json
      }
      fn_candidatos_conciliacao: {
        Args: { p_cliente_id: string; p_extrato_id: string; p_limite?: number }
        Returns: {
          ambiguo: boolean
          competencia: string
          contraparte_nome: string
          data_referencia: string
          delta_dias: number
          delta_valor: string
          descricao: string
          dias_atraso: number
          favorecido: string
          id: string
          indisponivel: boolean
          ja_conciliado: string
          motivo_indisponivel: string
          numero_documento: string
          pagamento: string
          pre_marcado: boolean
          saldo: string
          score: number
          status: string
          transferencia_id: string
          valor: string
          vencido: boolean
          vencimento: string
        }[]
      }
      fn_cards_componentes_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          ano_mes: string
          cliente_id: string
          eh_ajuste: boolean
          fazenda_id: string
          fechamento_pasto_id: string
          natureza_patrimonial: string
          nome_exibicao: string
          pasto_id: string
          peso_total_kg: number
          possui_itens: boolean
          quantidade_total: number
          status: string
          tipo_entidade: string
          tipo_uso_mes: string
          uso_operacional: string
          uso_operacional_origem: string
        }[]
      }
      fn_classificacao_apply: { Args: { p_sessao_id: string }; Returns: Json }
      fn_classificacao_apply_row: {
        Args: { p_overwrite?: boolean; p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_candidatos_ambiguo: {
        Args: { p_staging_id: string }
        Returns: {
          conta_bancaria_nome: string
          conta_destino_nome: string
          data_pagamento: string
          descricao: string
          favorecido_id: string
          favorecido_nome: string
          grupo_atual: string
          lanc_id: string
          macro_atual: string
          observacao: string
          subcentro_atual: string
          tipo_operacao: string
          valor: number
        }[]
      }
      fn_classificacao_candidatos_grupo: {
        Args: { p_staging_id: string }
        Returns: {
          conta_bancaria_nome: string
          conta_destino_nome: string
          data_pagamento: string
          descricao: string
          distancia_dias: number
          documento: string
          favorecido_id: string
          favorecido_nome: string
          grupo_atual: string
          lanc_id: string
          macro_atual: string
          observacao: string
          subcentro_atual: string
          tipo_operacao: string
          valor: number
        }[]
      }
      fn_classificacao_candidatos_proximos: {
        Args: { p_staging_id: string }
        Returns: {
          conta_bancaria_nome: string
          conta_destino_nome: string
          data_pagamento: string
          descricao: string
          distancia_dias: number
          documento: string
          favorecido_id: string
          favorecido_nome: string
          grupo_atual: string
          lanc_id: string
          macro_atual: string
          observacao: string
          subcentro_atual: string
          tipo_operacao: string
          valor: number
        }[]
      }
      fn_classificacao_composicao_sugerida: {
        Args: { p_lancamento_id: string; p_sessao_id: string }
        Returns: {
          composicao_n: number
          diferenca: number
          linhas: number[]
          soma: number
          staging_ids: string[]
        }[]
      }
      fn_classificacao_desfazer_ambiguo: {
        Args: { p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_desfazer_grupo: {
        Args: { p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_desfazer_proximos: {
        Args: { p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_editar_proposto: {
        Args: { p_patch: Json; p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_meta: { Args: { p_motor: Json }; Returns: Json }
      fn_classificacao_populate_staging: {
        Args: { p_cliente_id: string; p_rows: Json; p_sessao_id: string }
        Returns: Json
      }
      fn_classificacao_reresolver_match_sessao: {
        Args: { p_sessao_id: string }
        Returns: Json
      }
      fn_classificacao_reresolver_sessao: {
        Args: { p_sessao_id: string }
        Returns: Json
      }
      fn_classificacao_resetar_proposto: {
        Args: { p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_resolver_ambiguo: {
        Args: { p_lanc_id: string; p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_resolver_conta: {
        Args: { p_cliente_id: string; p_texto: string }
        Returns: string
      }
      fn_classificacao_resolver_contexto: {
        Args: { p_cliente_id: string; p_ctx: Json; p_skip_guard?: boolean }
        Returns: Json
      }
      fn_classificacao_resolver_grupo: {
        Args: { p_lancamento_ids: string[]; p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_resolver_proximos: {
        Args: { p_lancamento_id: string; p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_resolver_subcentro: {
        Args: { p_cliente_id: string; p_subcentro: string }
        Returns: Json
      }
      fn_classificacao_reverter_row: {
        Args: { p_staging_id: string }
        Returns: Json
      }
      fn_classificacao_sistema_nao_explicado: {
        Args: { p_conta_id?: string; p_sessao_id: string }
        Returns: {
          conta_nome: string
          data_pagamento: string
          descricao: string
          documento: string
          favorecido_nome: string
          lanc_id: string
          tipo_operacao: string
          valor: number
        }[]
      }
      fn_classificacao_split_substituir: {
        Args: {
          p_lancamento_id: string
          p_sessao_id: string
          p_staging_ids: string[]
        }
        Returns: Json
      }
      fn_compoe_dre_por_macro: {
        Args: { p_macro: string; p_tipo: string }
        Returns: boolean
      }
      fn_composicao_componentes_categoria_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          ano_mes: string
          categoria_codigo: string
          categoria_id: string
          cliente_id: string
          eh_ajuste: boolean
          fazenda_id: string
          fechamento_pasto_id: string
          natureza_patrimonial: string
          nome_exibicao: string
          pasto_id: string
          peso_medio_kg: number
          peso_total_kg: number
          quantidade: number
          status: string
          tipo_entidade: string
          tipo_uso_mes: string
          uso_operacional: string
          uso_operacional_origem: string
        }[]
      }
      fn_conciliacao_cartoes: {
        Args: { p_ano: number; p_cliente_id: string }
        Returns: {
          ano_mes: string
          conta_id: string
          diferenca: number
          diferenca_posicao: number
          entradas_terceiros: number
          estado: string
          estado_posicao: string
          qtd_lancamentos: number
          saidas_terceiros: number
          saldo_calculado: number
          saldo_data: string
          saldo_extrato: number
          saldo_inicial: number
          saldo_sistema_ate: number
          sem_conta_entradas: number
          sem_conta_qtd: number
          sem_conta_saidas: number
          sem_conta_valor: number
          total_entradas: number
          total_saidas: number
          transferencias_enviadas: number
          transferencias_recebidas: number
        }[]
      }
      fn_conciliacao_soberana: {
        Args: { p_cliente: string; p_conta: string; p_mes: string }
        Returns: Json
      }
      fn_contrato_criar_e_gerar: {
        Args: {
          p_centro_custo: string
          p_conta_bancaria_id: string
          p_dados_pagamento: string
          p_data_fim: string
          p_data_inicio: string
          p_dia_pagamento: number
          p_fazenda_id: string
          p_forma_pagamento: string
          p_fornecedor_id: string
          p_frequencia: string
          p_macro_custo: string
          p_observacao: string
          p_produto: string
          p_status: string
          p_subcentro: string
          p_valor: number
        }
        Returns: Json
      }
      fn_contrato_editar_e_regenerar: {
        Args: {
          p_a_partir_de: string
          p_centro_custo: string
          p_conta_bancaria_id: string
          p_contrato_id: string
          p_dados_pagamento: string
          p_data_fim: string
          p_data_inicio: string
          p_dia_pagamento: number
          p_fazenda_id: string
          p_forma_pagamento: string
          p_fornecedor_id: string
          p_frequencia: string
          p_macro_custo: string
          p_observacao: string
          p_produto: string
          p_status: string
          p_subcentro: string
          p_valor: number
          p_versao: string
        }
        Returns: Json
      }
      fn_criar_lancamento_de_extrato: {
        Args: {
          p_dados_pagamento?: Json
          p_data_competencia?: string
          p_data_vencimento?: string
          p_descricao?: string
          p_extrato_id: string
          p_favorecido_id?: string
          p_fazenda_id: string
          p_forma_pagamento?: string
          p_numero_documento?: string
          p_observacao?: string
          p_safra_id?: string
          p_subcentro?: string
          p_tipo_documento?: string
        }
        Returns: Json
      }
      fn_desfazer_grupo_conciliacao: {
        Args: { p_grupo_id: string; p_motivo?: string }
        Returns: Json
      }
      fn_desfazer_vinculo_extrato: {
        Args: { p_extrato_id: string; p_motivo?: string }
        Returns: string
      }
      fn_diag_fechamento_sessao: {
        Args: { p_sessao_id: string }
        Returns: Json
      }
      fn_endividamento_mensal: {
        Args: { p_ano: number; p_cliente_id: string }
        Returns: {
          amortizacao_agri: number
          amortizacao_pec: number
          captacao_agri: number
          captacao_pec: number
          divida_final_agri: number
          divida_final_pec: number
          divida_inicial_agri: number
          divida_inicial_pec: number
          juros_agri: number
          juros_pec: number
          mes: number
        }[]
      }
      fn_expirar_stagings_antigos: { Args: never; Returns: number }
      fn_extrato_chave_doc: { Args: { p_doc: string }; Returns: string }
      fn_extratos_espelhados: {
        Args: { p_cliente: string; p_conta: string; p_mes: string }
        Returns: Json
      }
      fn_fornecedores_com_uso: {
        Args: { p_cliente_id: string }
        Returns: {
          ativo: boolean
          fundido_em_id: string
          id: string
          nome: string
          nome_normalizado: string
          ultimo_uso: string
          usos: number
        }[]
      }
      fn_gerar_area_de_snapshot: {
        Args: { p_fechamento_p1_snapshot_id: string }
        Returns: Json
      }
      fn_gerar_codigo_conta: {
        Args: { p_cliente_id: string; p_tipo_conta: string }
        Returns: string
      }
      fn_get_mesa_v2_mode: { Args: never; Returns: string }
      fn_invalidar_origem_extrato: {
        Args: { p_decisoes?: Json; p_extrato_id: string; p_motivo: string }
        Returns: Json
      }
      fn_lista_v2_totais: {
        Args: {
          p_centro_custo?: string
          p_cliente_id: string
          p_conta_bancaria_id?: string
          p_conta_destino_id?: string
          p_dimensao?: string
          p_exigir_data_dimensao?: boolean
          p_faixas?: unknown[]
          p_fazenda_id?: string
          p_grupo_custo?: string
          p_incluir_conciliado?: boolean
          p_incluir_sem_vencimento?: boolean
          p_lista_atividade?: string
          p_lista_conta_direcao?: string
          p_lista_documento?: string
          p_lista_fornecedor_id?: string
          p_lista_grupo_custo?: string
          p_lista_produto?: string
          p_macro_custo?: string
          p_meses?: number[]
          p_status_transacoes?: string[]
          p_subcentro?: string
          p_tipo_operacao?: string
        }
        Returns: {
          entradas: number
          excluidos_sem_vencimento: number
          saidas: number
          total: number
        }[]
      }
      fn_locais_sugeridos_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          ano_mes: string
          cliente_id: string
          data_inicio: string
          entra_conciliacao: boolean
          fazenda_id: string
          natureza_patrimonial: string
          nome_exibicao: string
          pasto_id: string
          sugerir_no_fechamento: boolean
          tipo_uso: string
        }[]
      }
      fn_lock_p1: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: undefined
      }
      fn_marcar_extrato_transferencia: {
        Args: {
          p_conta_contraparte: string
          p_extrato_id: string
          p_motivo?: string
        }
        Returns: Json
      }
      fn_materializar_conjunto_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: Json
      }
      fn_natureza_patrimonial_fazenda: {
        Args: { p_fazenda_id: string }
        Returns: {
          natureza_patrimonial: string
          pasto_id: string
        }[]
      }
      fn_obter_ou_criar_fechamento_pasto: {
        Args: {
          p_ano_mes: string
          p_fazenda_id: string
          p_pasto_id: string
          p_responsavel_nome?: string
          p_status_inicial?: string
          p_tipo_uso_mes?: string
        }
        Returns: {
          ano_mes: string
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string
          id: string
          lote_mes: string | null
          observacao_mes: string | null
          pasto_id: string
          qualidade_mes: number | null
          responsavel_nome: string | null
          status: string
          tipo_uso_mes: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fechamento_pastos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_obter_ou_criar_fechamentos_lote: {
        Args: {
          p_ano_mes: string
          p_fazenda_id: string
          p_pasto_ids: string[]
          p_responsavel_nome?: string
          p_status_inicial?: string
        }
        Returns: {
          ano_mes: string
          cliente_id: string | null
          created_at: string | null
          fazenda_id: string
          id: string
          lote_mes: string | null
          observacao_mes: string | null
          pasto_id: string
          qualidade_mes: number | null
          responsavel_nome: string | null
          status: string
          tipo_uso_mes: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "fechamento_pastos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_oficializar_p1: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: Json
      }
      fn_pastos_aplicaveis_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          area_considerada_ha: number
          ativo: boolean
          data_inicio: string
          entra_conciliacao: boolean
          nome: string
          pasto_id: string
          tipo_uso: string
        }[]
      }
      fn_pendencias_fechamento_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          ano_mes: string
          cliente_id: string
          eh_ajuste: boolean
          fazenda_id: string
          fechamento_pasto_id: string
          natureza_patrimonial: string
          nome_exibicao: string
          pasto_id: string
          status: string
          tipo_entidade: string
          tipo_uso_mes: string
          uso_operacional: string
          uso_operacional_origem: string
        }[]
      }
      fn_promover_staging: { Args: { p_sessao_id: string }; Returns: Json }
      fn_reabrir_p1_operacional: {
        Args: { p_ano_mes: string; p_fazenda_id: string; p_motivo: string }
        Returns: Json
      }
      fn_reativar_vinculo_extrato: {
        Args: { p_extrato_id: string }
        Returns: string
      }
      fn_rebaixar_p1_oficial: {
        Args: { p_fechamento_p1_id: string; p_motivo: string }
        Returns: Json
      }
      fn_reconciliar_financiamento: {
        Args: {
          p_dry_run?: boolean
          p_financiamento_id: string
          p_recalcula_vt?: boolean
        }
        Returns: Json
      }
      fn_reconciliar_parcela_financiamento: {
        Args: {
          p_conta_bancaria_id?: string
          p_dry_run?: boolean
          p_parcela_id: string
          p_recalcula_vt?: boolean
        }
        Returns: Json
      }
      fn_reconciliar_todos_financiamentos: {
        Args: {
          p_cliente_id?: string
          p_dry_run?: boolean
          p_recalcula_vt?: boolean
        }
        Returns: Json
      }
      fn_recorrencia_cancelar: {
        Args: { p_recorrencia_id: string }
        Returns: Json
      }
      fn_recorrencia_gerar: {
        Args: { p_ate?: string; p_recorrencia_id: string; p_simular?: boolean }
        Returns: Json
      }
      fn_regenerar_area_do_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: Json
      }
      fn_reverter_desconsideracao_extrato: {
        Args: { p_extrato_id: string }
        Returns: string
      }
      fn_saldo_inicial_pasto: {
        Args: {
          p_ano: number
          p_categoria_codigo: string
          p_fazenda_id: string
          p_mes: number
        }
        Returns: {
          peso_medio_kg: number
          quantidade: number
        }[]
      }
      fn_sugestoes_extrato: {
        Args: {
          p_ate: string
          p_cliente_id: string
          p_conta_bancaria_id: string
          p_de: string
        }
        Returns: {
          ambiguo: boolean
          data_movimento: string
          descricao: string
          documento: string
          estado: string
          extrato_id: string
          pre_marcado: boolean
          score: number
          situacao: string
          sugestao_delta_dias: number
          sugestao_delta_valor: string
          sugestao_descricao: string
          sugestao_favorecido: string
          sugestao_id: string
          sugestao_status: string
          sugestao_valor: string
          valor: string
          valor_aberto: string
          valor_conciliado: string
        }[]
      }
      fn_transferir_vinculo_extrato: {
        Args: {
          p_extrato_destino: string
          p_extrato_origem: string
          p_lancamento_id: string
          p_valor_aplicado?: number
        }
        Returns: Json
      }
      fn_uso_operacional_mes: {
        Args: { p_ano_mes: string; p_fazenda_id: string }
        Returns: {
          fechamento_pasto_id: string
          pasto_id: string
          uso_operacional: string
          uso_operacional_origem: string
        }[]
      }
      fn_vincular_exatos_mes: {
        Args: {
          p_ate: string
          p_cliente_id: string
          p_conta_bancaria_id: string
          p_de: string
          p_simular?: boolean
        }
        Returns: Json
      }
      fn_vincular_extrato_lancamento: {
        Args: {
          p_extrato_id: string
          p_lancamento_id: string
          p_valor_aplicado?: number
        }
        Returns: Json
      }
      fn_vincular_grupo_conciliacao: {
        Args: {
          p_extrato_id: string
          p_lancamentos: string[]
          p_motivo?: string
          p_valores?: number[]
        }
        Returns: Json
      }
      fn_ws_candidatos_financeiros: {
        Args: { p_extrato_id: string }
        Returns: Json
      }
      fn_ws_conciliacao: {
        Args: { p_id: string; p_tipo: string }
        Returns: Json
      }
      fn_zoot_cache_ensure: {
        Args: { p_ano: number; p_cliente_id: string }
        Returns: undefined
      }
      fn_zoot_cache_has_gap: {
        Args: { p_ano: number; p_cliente_id: string }
        Returns: boolean
      }
      fn_zoot_cache_rebuild: {
        Args: { p_ano: number; p_cliente_id: string }
        Returns: undefined
      }
      fn_zoot_categoria_mensal: {
        Args: { p_ano: number; p_cenario?: string; p_fazenda_id: string }
        Returns: {
          ano: number
          ano_mes: string
          cab_abate: number
          cab_compra: number
          cab_consumo: number
          cab_morte: number
          cab_nascimento: number
          cab_transf_entrada: number
          cab_transf_saida: number
          cab_venda: number
          cab_venda_pe: number
          categoria_codigo: string
          categoria_id: string
          categoria_nome: string
          cenario: string
          cliente_id: string
          dias_mes: number
          entradas_externas: number
          evol_cat_entrada: number
          evol_cat_saida: number
          fazenda_id: string
          fonte_oficial_mes: string
          gmd: number
          mes: number
          ordem_exibicao: number
          peso_abate: number
          peso_carcaca_abate: number
          peso_compra: number
          peso_consumo: number
          peso_entradas_externas: number
          peso_evol_cat_entrada: number
          peso_evol_cat_saida: number
          peso_medio_final: number
          peso_medio_inicial: number
          peso_morte: number
          peso_nascimento: number
          peso_saidas_externas: number
          peso_total_final: number
          peso_total_inicial: number
          peso_transf_entrada: number
          peso_transf_saida: number
          peso_venda: number
          peso_venda_pe: number
          producao_biologica: number
          saidas_externas: number
          saldo_final: number
          saldo_inicial: number
          saldo_p1: number
          saldo_sistema: number
        }[]
      }
      gerar_snapshot_area: {
        Args: {
          p_ano_mes: string
          p_fazenda_id: string
          p_fechado_por?: string
        }
        Returns: string
      }
      get_anos_financeiro_v2: {
        Args: { p_cliente_id: string }
        Returns: {
          ano: number
        }[]
      }
      get_anos_lancamentos: {
        Args: { p_cliente_id: string }
        Returns: {
          ano: number
        }[]
      }
      get_status_pilares_ano: {
        Args: { p_ano: number; p_cliente_id: string }
        Returns: {
          ano_mes: string
          fazenda_id: string
          fazenda_nome: string
          p1: string
          p2: string
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
      oc_acrescentar_parcelas: {
        Args: {
          p_compromisso_id: string
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_adotar_titulo_financeiro: {
        Args: {
          p_componente?: string
          p_descricao?: string
          p_financeiro_lancamento_id: string
          p_motivo?: string
          p_natureza?: string
          p_operacao_id: string
          p_quantidade_parcelas?: number
          p_sequencia_parcela?: number
        }
        Returns: Json
      }
      oc_ajustar_valor_compromisso: {
        Args: {
          p_cliente_id: string
          p_compromisso_id: string
          p_motivo: string
          p_novo_valor: number
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_alterar_parcelas: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_parcelas: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_cancelar: {
        Args: {
          p_cliente_id: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_cancelar_compromisso: {
        Args: {
          p_cliente_id: string
          p_compromisso_id: string
          p_estorno_id?: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_cancelar_obrigacao: {
        Args: { p_cliente_id: string; p_motivo: string; p_parte_id: string }
        Returns: Json
      }
      oc_cancelar_programacao: {
        Args: {
          p_cliente_id: string
          p_estorno_id?: string
          p_motivo: string
          p_operacao_id: string
          p_programacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_confirmar: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_criar_compromisso: {
        Args: {
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_criar_rascunho: {
        Args: { p_cliente_id: string; p_payload: Json }
        Returns: Json
      }
      oc_derivar_status: {
        Args: { p_cliente_id: string; p_operacao_id: string }
        Returns: Json
      }
      oc_documento_cancelar: {
        Args: { p_cliente_id: string; p_documento_id: string; p_motivo: string }
        Returns: Json
      }
      oc_documento_editar: {
        Args: {
          p_cliente_id: string
          p_documento_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_documento_registrar: {
        Args: { p_cliente_id: string; p_operacao_id: string; p_payload: Json }
        Returns: Json
      }
      oc_editar_dados_operacao: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_editar_negociacao: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_encerrar_entrega: {
        Args: {
          p_cliente_id: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_estornar_liquidacao: {
        Args: {
          p_cliente_id: string
          p_liquidacao_id: string
          p_motivo: string
        }
        Returns: Json
      }
      oc_estornar_materializacao: {
        Args: {
          p_cliente_id: string
          p_estorno_id?: string
          p_motivo: string
          p_operacao_id: string
          p_parcela_id: string
          p_programacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_estornar_movimentacao: {
        Args: {
          p_cliente_id: string
          p_motivo: string
          p_movimentacao_id: string
        }
        Returns: Json
      }
      oc_estornar_recebimento: {
        Args: {
          p_cliente_id: string
          p_estorno_id?: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_excluir_definitivamente: {
        Args: { p_cliente_id: string; p_motivo: string; p_operacao_id: string }
        Returns: Json
      }
      oc_gerar_obrigacoes: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_limpar_operacao_teste: {
        Args: { p_confirmacao: string; p_motivo: string; p_operacao_id: string }
        Returns: Json
      }
      oc_materializar_programacao: {
        Args: {
          p_operacao_id: string
          p_parcela_id: string
          p_programacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_programar_compromisso: {
        Args: {
          p_compromisso_id: string
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_reabrir: {
        Args: {
          p_cliente_id: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_reabrir_entrega: {
        Args: {
          p_cliente_id: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_reabrir_para_estorno: {
        Args: {
          p_cliente_id: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_reabrir_para_reconciliacao: {
        Args: {
          p_cliente_id: string
          p_motivo: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_receber_lotes: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_recebimentos: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_registrar_liquidacao: {
        Args: { p_cliente_id: string; p_operacao_id: string; p_payload: Json }
        Returns: Json
      }
      oc_registrar_movimentacao: {
        Args: {
          p_categoria: string
          p_cliente_id: string
          p_data: string
          p_lote_id: string
          p_observacao: string
          p_operacao_id: string
          p_peso_medio_kg: number
          p_peso_total_kg: number
          p_quantidade: number
        }
        Returns: Json
      }
      oc_revalorar_lote: {
        Args: {
          p_cliente_id: string
          p_lote_id: string
          p_motivo: string
          p_novo_valor: number
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_salvar_boitel: {
        Args: {
          p_cenario: string
          p_cliente_id: string
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_salvar_lotes: {
        Args: {
          p_cliente_id: string
          p_lotes: Json
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_salvar_rascunho: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_payload: Json
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_sincronizar: {
        Args: {
          p_cliente_id: string
          p_operacao_id: string
          p_versao_esperada: number
        }
        Returns: Json
      }
      oc_sincronizar_liquidacao_de_financeiro: {
        Args: { p_financeiro_lancamento_id: string }
        Returns: undefined
      }
      provisionar_cliente: {
        Args: { p_nome: string; p_slug: string }
        Returns: {
          cliente_id: string
          fazenda_id: string
          membro_id: string
        }[]
      }
      reabrir_pilar_fechamento: {
        Args: {
          _ano_mes: string
          _fazenda_id: string
          _motivo?: string
          _pilar: string
          _usuario_id?: string
        }
        Returns: Json
      }
      refresh_zoot_cache:
        | { Args: { p_ano: number; p_fazenda_id: string }; Returns: undefined }
        | {
            Args: { p_ano: number; p_cenario: string; p_fazenda_id: string }
            Returns: undefined
          }
        | {
            Args: { p_ano: number; p_fazenda_id: string; p_mes: number }
            Returns: undefined
          }
      resolve_transfer_destination_fazenda: {
        Args: { _destino_nome: string; _origem_fazenda_id: string }
        Returns: string
      }
      resolver_nome_usuario: { Args: { p_user_id: string }; Returns: string }
      shares_fazenda: {
        Args: { _target_user_id: string; _viewer_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      origem_apontamento_enum:
        | "excel_historico"
        | "excel_operacional"
        | "manual"
        | "ajuste_operacional"
        | "programado"
        | "ofx_direto"
        | "financiamento"
        | "zoot"
      perfil_acesso:
        | "admin_agroinblue"
        | "gestor_cliente"
        | "financeiro"
        | "campo"
        | "leitura"
      snapshot_status: "vigente" | "substituido" | "invalidado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      origem_apontamento_enum: [
        "excel_historico",
        "excel_operacional",
        "manual",
        "ajuste_operacional",
        "programado",
        "ofx_direto",
        "financiamento",
        "zoot",
      ],
      perfil_acesso: [
        "admin_agroinblue",
        "gestor_cliente",
        "financeiro",
        "campo",
        "leitura",
      ],
      snapshot_status: ["vigente", "substituido", "invalidado"],
    },
  },
} as const
