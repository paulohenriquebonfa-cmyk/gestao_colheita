import Dexie, { type Table } from 'dexie'
import type { BaseEntity, Carga, EstoqueArmazem, MovimentoEstoque, PendingOp, Talhao, VendaGrao } from './types'

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
  }
}

export const db = new ColheitaDb()
