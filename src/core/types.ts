export type SyncStatus = 'local_only' | 'pending_sync' | 'synced' | 'sync_error'

export interface BaseEntity {
  id: string
  nome: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  sync_status: SyncStatus
}

export interface Talhao extends BaseEntity {
  area_ha: number
}

export interface Carga {
  id: string
  data: string
  placa: string
  propriedade_id: string
  talhao_id: string
  produtor_id: string
  variedade_id: string
  armazem_id: string
  peso_bruto_kg: number
  peso_liquido_kg: number
  sacas: number
  sync_status: SyncStatus
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export interface EstoqueArmazem {
  id: string
  armazem_id: string
  saldo_sacas: number
  sync_status: SyncStatus
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export type TipoMovimentoEstoque = 'entrada' | 'saida' | 'ajuste' | 'estorno'
export type OrigemMovimentoEstoque = 'carga' | 'venda' | 'manual' | 'cancelamento'

export interface MovimentoEstoque {
  id: string
  tipo: TipoMovimentoEstoque
  armazem_id: string
  sacas: number
  origem: OrigemMovimentoEstoque
  referencia_id: string
  motivo?: string
  sync_status: SyncStatus
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export type StatusVendaGrao = 'ativa' | 'cancelada'

export interface VendaGrao {
  id: string
  data: string
  produtor_id: string
  armazem_cliente_id: string
  sacas: number
  valor_por_saca: number
  valor_total: number
  status: StatusVendaGrao
  sync_status: SyncStatus
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export interface PendingOp {
  id: string
  table: string
  record_id: string
  op: 'upsert' | 'delete'
  payload: unknown
  updated_at: string
  retries: number
  error?: string
}

export interface Filters {
  dataInicio?: string
  dataFim?: string
  produtorId?: string
  propriedadeId?: string
  talhaoId?: string
  variedadeId?: string
  placa?: string
  armazemId?: string
}
