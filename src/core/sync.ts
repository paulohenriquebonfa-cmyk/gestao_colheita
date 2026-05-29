import { db } from './db'
import { hasSupabase, supabase } from './supabase'
import type { BaseEntity, Carga, PendingOp, Talhao } from './types'

const TABLES = ['propriedades', 'produtores', 'variedades', 'armazens', 'caminhoes', 'talhoes', 'cargas', 'estoque_armazem', 'movimento_estoque', 'venda_grao', 'pilot_participantes', 'feedback_items'] as const

function normalizePayloadForCloud(table: string, payload: Record<string, unknown>) {
  if (table !== 'pilot_participantes') return payload
  return {
    ...payload,
    ultimo_acesso: payload.ultimo_acesso === '' ? null : payload.ultimo_acesso,
    ultimo_sync: payload.ultimo_sync === '' ? null : payload.ultimo_sync
  }
}

async function pushOp(op: PendingOp) {
  if (!supabase) return false
  if (!TABLES.includes(op.table as (typeof TABLES)[number])) return true

  const table = op.table as (typeof TABLES)[number]
  if (op.op === 'delete') {
    const { error: delError } = await supabase.from(table).delete().eq('id', op.record_id)
    if (delError) {
      await db.pending_ops.update(op.id, {
        retries: op.retries + 1,
        error: delError.message
      })
      return false
    }
    await db.pending_ops.delete(op.id)
    return true
  }
  if (table === 'cargas') {
    const carga = op.payload as Carga
    const propriedade = await db.propriedades.get(carga.propriedade_id)
    const talhao = await db.talhoes.get(carga.talhao_id)
    const produtor = await db.produtores.get(carga.produtor_id)
    const variedade = await db.variedades.get(carga.variedade_id)
    const armazem = await db.armazens.get(carga.armazem_id)

    const deps: Array<{ table: 'propriedades' | 'talhoes' | 'produtores' | 'variedades' | 'armazens'; row: BaseEntity | Talhao | undefined }> = [
      { table: 'propriedades', row: propriedade },
      { table: 'talhoes', row: talhao },
      { table: 'produtores', row: produtor },
      { table: 'variedades', row: variedade },
      { table: 'armazens', row: armazem }
    ]

    for (const dep of deps) {
      if (!dep.row) continue
      const { error: depError } = await supabase.from(dep.table).upsert(dep.row as never, { onConflict: 'id' })
      if (depError) {
        await db.pending_ops.update(op.id, {
          retries: op.retries + 1,
          error: `dependencia ${dep.table}: ${depError.message}`
        })
        return false
      }
    }
  }
  if (table === 'venda_grao') {
    const venda = op.payload as { produtor_id: string; armazem_cliente_id: string }
    const produtor = await db.produtores.get(venda.produtor_id)
    const armazem = await db.armazens.get(venda.armazem_cliente_id)
    const deps: Array<{ table: 'produtores' | 'armazens'; row: BaseEntity | undefined }> = [
      { table: 'produtores', row: produtor },
      { table: 'armazens', row: armazem }
    ]
    for (const dep of deps) {
      if (!dep.row) continue
      const { error: depError } = await supabase.from(dep.table).upsert(dep.row as never, { onConflict: 'id' })
      if (depError) {
        await db.pending_ops.update(op.id, {
          retries: op.retries + 1,
          error: `dependencia ${dep.table}: ${depError.message}`
        })
        return false
      }
    }
  }

  const payload = op.payload as Record<string, unknown>
  const payloadToSend = payload && typeof payload === 'object' && 'sync_status' in payload
    ? normalizePayloadForCloud(table, { ...payload, sync_status: 'synced' })
    : payload

  if (table === 'pilot_participantes') {
    const { data: updatedRows, error: updateError } = await supabase
      .from(table)
      .update(payloadToSend as never)
      .eq('id', op.record_id)
      .select('id')

    if (updateError) {
      await db.pending_ops.update(op.id, {
        retries: op.retries + 1,
        error: updateError.message
      })
      return false
    }

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await supabase.from(table).insert(payloadToSend as never)
      if (insertError) {
        await db.pending_ops.update(op.id, {
          retries: op.retries + 1,
          error: insertError.message
        })
        return false
      }
    }

    await db.pilot_participantes.update(op.record_id, { sync_status: 'synced' })
    await db.pending_ops.delete(op.id)
    return true
  }

  const { error } = await supabase.from(table).upsert(payloadToSend as never, { onConflict: 'id' })

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
  } else if (op.table === 'pilot_participantes') {
    await db.pilot_participantes.update(op.record_id, { sync_status: 'synced' })
  } else if (op.table === 'feedback_items') {
    await db.feedback_items.update(op.record_id, { sync_status: 'synced' })
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
  const pulledData: Record<(typeof TABLES)[number], Array<Record<string, unknown>>> = {
    propriedades: [],
    produtores: [],
    variedades: [],
    armazens: [],
    caminhoes: [],
    talhoes: [],
    cargas: [],
    estoque_armazem: [],
    movimento_estoque: [],
    venda_grao: [],
    pilot_participantes: [],
    feedback_items: []
  }

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error || !data) {
      if (error) pullErrors.push(`${table}: ${error.message}`)
      continue
    }

    pulledData[table] = (data as Array<Record<string, unknown>>).map((row) => ({ ...row, sync_status: 'synced' }))
  }

  if (pullErrors.length > 0) {
    throw new Error(`Falha ao baixar dados da nuvem: ${pullErrors.join(' | ')}`)
  }

  await db.propriedades.clear()
  await db.produtores.clear()
  await db.variedades.clear()
  await db.armazens.clear()
  await db.caminhoes.clear()
  await db.talhoes.clear()
  await db.cargas.clear()
  await db.estoque_armazem.clear()
  await db.movimento_estoque.clear()
  await db.venda_grao.clear()
  await db.pilot_participantes.clear()
  await db.feedback_items.clear()

  await db.propriedades.bulkPut(pulledData.propriedades as unknown as BaseEntity[])
  await db.produtores.bulkPut(pulledData.produtores as unknown as BaseEntity[])
  await db.variedades.bulkPut(pulledData.variedades as unknown as BaseEntity[])
  await db.armazens.bulkPut(pulledData.armazens as unknown as BaseEntity[])
  await db.caminhoes.bulkPut(pulledData.caminhoes as unknown as BaseEntity[])
  await db.talhoes.bulkPut(pulledData.talhoes as never[])
  await db.cargas.bulkPut(pulledData.cargas as never[])
  await db.estoque_armazem.bulkPut(pulledData.estoque_armazem as never[])
  await db.movimento_estoque.bulkPut(pulledData.movimento_estoque as never[])
  await db.venda_grao.bulkPut(pulledData.venda_grao as never[])
  await db.pilot_participantes.bulkPut(pulledData.pilot_participantes as never[])
  await db.feedback_items.bulkPut(pulledData.feedback_items as never[])
}

export async function runSync() {
  if (!hasSupabase) {
    const reason = 'supabase_not_configured'
    window.dispatchEvent(new CustomEvent('colheita-sync-error', { detail: { reason, message: 'Supabase nao configurado.' } }))
    window.dispatchEvent(new CustomEvent('colheita-sync-complete', { detail: { ok: false, reason } }))
    return
  }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      window.dispatchEvent(new CustomEvent('colheita-sync-complete', { detail: { ok: false, reason: 'unauthenticated' } }))
      return
    }
  }
  if (!navigator.onLine) {
    const reason = 'offline'
    window.dispatchEvent(new CustomEvent('colheita-sync-error', { detail: { reason, message: 'Sem conexao com a internet.' } }))
    window.dispatchEvent(new CustomEvent('colheita-sync-complete', { detail: { ok: false, reason } }))
    return
  }
  try {
    const ops = await db.pending_ops.orderBy('updated_at').toArray()
    const failed: string[] = []
    for (const op of ops) {
      const ok = await pushOp(op)
      if (!ok) {
        const refreshed = await db.pending_ops.get(op.id)
        failed.push(`${op.table}: ${refreshed?.error ?? 'falha ao enviar'}`)
      }
    }
    if (failed.length > 0) {
      throw new Error(`Falha ao enviar dados para nuvem: ${failed.join(' | ')}`)
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
