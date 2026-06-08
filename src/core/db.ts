import Dexie, { type Table } from 'dexie'
import type { AreaVariedadeTalhao, AuditLog, BaseEntity, Carga, EstoqueArmazem, FeedbackItem, FreteLancamento, MovimentoEstoque, PendingOp, PilotParticipant, Safra, Talhao, TarifaFreteRota, VendaGrao } from './types'

class ColheitaDb extends Dexie {
  propriedades!: Table<BaseEntity, string>
  produtores!: Table<BaseEntity, string>
  variedades!: Table<BaseEntity, string>
  armazens!: Table<BaseEntity, string>
  caminhoes!: Table<BaseEntity, string>
  talhoes!: Table<Talhao, string>
  cargas!: Table<Carga, string>
  estoque_armazem!: Table<EstoqueArmazem, string>
  movimento_estoque!: Table<MovimentoEstoque, string>
  venda_grao!: Table<VendaGrao, string>
  pending_ops!: Table<PendingOp, string>
  audit_logs!: Table<AuditLog, string>
  pilot_participantes!: Table<PilotParticipant, string>
  feedback_items!: Table<FeedbackItem, string>
  area_variedade_talhao!: Table<AreaVariedadeTalhao, string>
  safras!: Table<Safra, string>
  frete_lancamentos!: Table<FreteLancamento, string>
  tarifas_frete_rota!: Table<TarifaFreteRota, string>

  constructor() {
    super('colheita_mvp_db')
    this.version(1).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries'
    })
    this.version(2).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,updated_at,sync_status',
      estoque_armazem: 'id,armazem_id,updated_at,sync_status',
      movimento_estoque: 'id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,data,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries'
    })
    this.version(3).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,updated_at,sync_status',
      estoque_armazem: 'id,armazem_id,updated_at,sync_status',
      movimento_estoque: 'id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,data,produtor_id,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries'
    })
    this.version(4).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,updated_at,sync_status',
      estoque_armazem: 'id,armazem_id,updated_at,sync_status',
      movimento_estoque: 'id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,data,produtor_id,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries',
      audit_logs: 'id,action,actor_user_id,created_at'
    })
    this.version(5).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,updated_at,sync_status',
      estoque_armazem: 'id,armazem_id,updated_at,sync_status',
      movimento_estoque: 'id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,data,produtor_id,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries',
      audit_logs: 'id,action,actor_user_id,created_at',
      pilot_participantes: 'id,email,status,data_entrada,updated_at,sync_status',
      feedback_items: 'id,categoria,prioridade,status,created_by,updated_at,sync_status'
    })
    this.version(6).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,updated_at,sync_status',
      estoque_armazem: 'id,armazem_id,updated_at,sync_status',
      movimento_estoque: 'id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,data,produtor_id,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries',
      audit_logs: 'id,action,actor_user_id,created_at',
      pilot_participantes: 'id,email,status,data_entrada,updated_at,sync_status',
      feedback_items: 'id,categoria,prioridade,status,created_by,updated_at,sync_status',
      area_variedade_talhao: 'id,talhao_id,variedade_id,created_by,updated_at,sync_status'
    })
    this.version(7).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,updated_at,sync_status',
      estoque_armazem: 'id,armazem_id,updated_at,sync_status',
      movimento_estoque: 'id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,data,produtor_id,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries',
      audit_logs: 'id,action,actor_user_id,created_at',
      pilot_participantes: 'id,email,status,data_entrada,updated_at,sync_status',
      feedback_items: 'id,categoria,prioridade,status,created_by,updated_at,sync_status',
      area_variedade_talhao: 'id,talhao_id,variedade_id,created_by,updated_at,sync_status',
      safras: 'id,nome,cultura,ano,data_inicio,data_fim,created_by,updated_at,sync_status',
      frete_lancamentos: 'id,safra_id,caminhao_id,tipo,data,created_by,updated_at,sync_status'
    })
    this.version(8).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,frete_valor_por_saca,frete_valor_total,updated_at,sync_status',
      estoque_armazem: 'id,armazem_id,updated_at,sync_status',
      movimento_estoque: 'id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,data,produtor_id,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries',
      audit_logs: 'id,action,actor_user_id,created_at',
      pilot_participantes: 'id,email,status,data_entrada,updated_at,sync_status',
      feedback_items: 'id,categoria,prioridade,status,created_by,updated_at,sync_status',
      area_variedade_talhao: 'id,talhao_id,variedade_id,created_by,updated_at,sync_status',
      safras: 'id,nome,cultura,ano,ativa,data_inicio,data_fim,created_by,updated_at,sync_status',
      frete_lancamentos: 'id,safra_id,caminhao_id,tipo,data,created_by,updated_at,sync_status',
      tarifas_frete_rota: 'id,propriedade_id,armazem_id,valor_por_saca,created_by,updated_at,sync_status,[propriedade_id+armazem_id]'
    })
    this.version(9).stores({
      propriedades: 'id,nome,updated_at,sync_status',
      produtores: 'id,nome,updated_at,sync_status',
      variedades: 'id,nome,updated_at,sync_status',
      armazens: 'id,nome,updated_at,sync_status',
      caminhoes: 'id,nome,updated_at,sync_status',
      talhoes: 'id,nome,area_ha,updated_at,sync_status',
      cargas: 'id,safra_id,data,placa,propriedade_id,talhao_id,produtor_id,variedade_id,armazem_id,frete_valor_por_saca,frete_valor_total,updated_at,sync_status',
      estoque_armazem: 'id,safra_id,armazem_id,updated_at,sync_status,[safra_id+armazem_id]',
      movimento_estoque: 'id,safra_id,tipo,armazem_id,origem,referencia_id,updated_at,sync_status',
      venda_grao: 'id,safra_id,data,produtor_id,armazem_cliente_id,status,updated_at,sync_status',
      pending_ops: 'id,table,record_id,updated_at,retries',
      audit_logs: 'id,action,actor_user_id,created_at',
      pilot_participantes: 'id,email,status,data_entrada,updated_at,sync_status',
      feedback_items: 'id,categoria,prioridade,status,created_by,updated_at,sync_status',
      area_variedade_talhao: 'id,talhao_id,variedade_id,created_by,updated_at,sync_status',
      safras: 'id,nome,cultura,ano,ativa,data_inicio,data_fim,created_by,updated_at,sync_status',
      frete_lancamentos: 'id,safra_id,caminhao_id,tipo,data,created_by,updated_at,sync_status',
      tarifas_frete_rota: 'id,safra_id,propriedade_id,armazem_id,valor_por_saca,created_by,updated_at,sync_status,[safra_id+propriedade_id+armazem_id]'
    })
  }
}

export const db = new ColheitaDb()
