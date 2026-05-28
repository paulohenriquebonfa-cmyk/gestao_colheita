import { db } from './db'
import { hasSupabase, supabase } from './supabase'
import type { BaseEntity, PendingOp } from './types'

const TABLES = ['propriedades', 'produtores', 'variedades', 'armazens', 'caminhoes', 'talhoes', 'cargas', 'estoque_armazem', 'movimento_estoque', 'venda_grao'] as const

async function pushOp(op: PendingOp) {
  if (!supabase) return false
  if (!TABLES.includes(op.table as (typeof TABLES)[number])) return true

  const table = op.table as (typeof TABLES)[number]
  const { error } = await supabase.from(table).upsert(op.payload as never, { onConflict: 'id' })

  if (error) {
    await db.pending_ops.update(op.id, {
      retries: op.retries + 1,
      error: error.message
    })
    return false
  }

  if (op.table === 'cargas') {
    await db.cargas.update(op.record_id, { sync_status: 'synced' })
  } else if (op.table === 'talhoes') {
    await db.talhoes.update(op.record_id, { sync_status: 'synced' })
  } else if (op.table === 'estoque_armazem') {
    await db.estoque_armazem.update(op.record_id, { sync_status: 'synced' })
  } else if (op.table === 'venda_grao') {
    await db.venda_grao.update(op.record_id, { sync_status: 'synced' })
  } else if (op.table === 'movimento_estoque') {
    await db.movimento_estoque.update(op.record_id, { sync_status: 'synced' })
  } else {
    const tableMap: Record<string, { update: (id: string, data: Partial<BaseEntity>) => Promise<number> }> = {
      propriedades: db.propriedades,
      produtores: db.produtores,
      variedades: db.variedades,
      armazens: db.armazens,
      caminhoes: db.caminhoes
    }
    const anyTable = tableMap[op.table]
    if (anyTable) await anyTable.update(op.record_id, { sync_status: 'synced' })
  }

  await db.pending_ops.delete(op.id)
  return true
}

async function pullFromCloud() {
  if (!supabase) return

  const pullErrors: string[] = []
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error || !data) {
      if (error) pullErrors.push(`${table}: ${error.message}`)
      continue
    }

    if (table === 'propriedades') await db.propriedades.bulkPut(data as BaseEntity[])
    else if (table === 'produtores') await db.produtores.bulkPut(data as BaseEntity[])
    else if (table === 'variedades') await db.variedades.bulkPut(data as BaseEntity[])
    else if (table === 'armazens') await db.armazens.bulkPut(data as BaseEntity[])
    else if (table === 'caminhoes') await db.caminhoes.bulkPut(data as BaseEntity[])
    else if (table === 'talhoes') await db.talhoes.bulkPut(data as never[])
    else if (table === 'cargas') await db.cargas.bulkPut(data as never[])
    else if (table === 'estoque_armazem') await db.estoque_armazem.bulkPut(data as never[])
    else if (table === 'movimento_estoque') await db.movimento_estoque.bulkPut(data as never[])
    else if (table === 'venda_grao') await db.venda_grao.bulkPut(data as never[])
  }

  if (pullErrors.length > 0) {
    throw new Error(`Falha ao baixar dados da nuvem: ${pullErrors.join(' | ')}`)
  }
}

export async function runSync() {
  if (!hasSupabase) {
    const reason = 'supabase_not_configured'
    window.dispatchEvent(new CustomEvent('colheita-sync-error', { detail: { reason, message: 'Supabase nao configurado.' } }))
    window.dispatchEvent(new CustomEvent('colheita-sync-complete', { detail: { ok: false, reason } }))
    return
  }
  if (!navigator.onLine) {
    const reason = 'offline'
    window.dispatchEvent(new CustomEvent('colheita-sync-error', { detail: { reason, message: 'Sem conexao com a internet.' } }))
    window.dispatchEvent(new CustomEvent('colheita-sync-complete', { detail: { ok: false, reason } }))
    return
  }
  try {
    const ops = await db.pending_ops.orderBy('updated_at').toArray()
    for (const op of ops) {
      await pushOp(op)
    }
    await pullFromCloud()
    window.dispatchEvent(new CustomEvent('colheita-sync-complete', { detail: { ok: true } }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido na sincronizacao.'
    window.dispatchEvent(new CustomEvent('colheita-sync-error', { detail: { reason: 'sync_exception', message } }))
    throw error
  } finally {
    window.dispatchEvent(new CustomEvent('colheita-sync-complete'))
  }
}

export function installSyncListeners() {
  window.addEventListener('online', () => {
    void runSync()
  })
}
