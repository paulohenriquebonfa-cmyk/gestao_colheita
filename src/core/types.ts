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
  safra_id: string
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
  frete_valor_por_saca: number
  frete_valor_total: number
  sync_status: SyncStatus
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export interface TarifaFreteRota {
  id: string
  safra_id: string
  propriedade_id: string
  armazem_id: string
  valor_por_saca: number
  observacao?: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  sync_status: SyncStatus
}

export interface EstoqueArmazem {
  id: string
  safra_id: string
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
  safra_id: string
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
  safra_id: string
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

export interface Safra {
  id: string
  nome: string
  cultura: string
  ano: string
  data_inicio: string
  data_fim: string
  ativa: boolean
  sync_status: SyncStatus
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export type TipoFreteLancamento = 'diesel' | 'vale'

export interface FreteLancamento {
  id: string
  safra_id: string
  caminhao_id: string
  tipo: TipoFreteLancamento
  data: string
  litros?: number | null
  preco_litro?: number | null
  valor_total: number
  observacao?: string
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

export type UserRole = 'proprietario' | 'operador' | 'leitura'

export interface AuditLog {
  id: string
  action: string
  actor_user_id: string
  details?: string
  created_at: string
}

export interface PilotParticipant {
  id: string
  email: string
  nome: string
  status: 'ativo' | 'inativo'
  data_entrada: string
  ultimo_acesso?: string | null
  ultimo_sync?: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  sync_status: SyncStatus
}

export interface FeedbackItem {
  id: string
  categoria: 'erro' | 'usabilidade' | 'nova_funcionalidade' | 'relatorio' | 'outros'
  prioridade: 'baixa' | 'media' | 'alta'
  descricao: string
  contexto: string
  contato?: string
  status: 'novo' | 'em_analise' | 'planejado' | 'concluido'
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  sync_status: SyncStatus
}

export interface AreaVariedadeTalhao {
  id: string
  talhao_id: string
  variedade_id: string
  area_ha: number
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  sync_status: SyncStatus
}

export interface Filters {
  safraId?: string
  dataInicio?: string
  dataFim?: string
  produtorId?: string
  propriedadeId?: string
  talhaoId?: string
  variedadeId?: string
  placa?: string
  armazemId?: string
}
