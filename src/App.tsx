import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { db } from './core/db'
import { hasSupabase, supabase } from './core/supabase'
import { installSyncListeners, runSync } from './core/sync'
import { produtividadeSacasPorHa, toSacas } from './core/metrics'
import { validarCarga } from './core/validation'
import { formatPtBrNumber, localDateYmd, makeId, nowIso, parsePtBrNumber } from './core/utils'
import type { BaseEntity, Carga, EstoqueArmazem, Filters, MovimentoEstoque, Talhao, VendaGrao } from './core/types'

type Tab = 'dashboard' | 'cargas' | 'historico' | 'cadastros' | 'analises' | 'frete' | 'vendas' | 'config'

type UserSession = { id: string; email: string }
type NoticeType = 'success' | 'error'
type Notice = { type: NoticeType; message: string } | null

const initialFilters: Filters = {}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function placaLegivel(rawPlaca: string, nomeCaminhao?: string) {
  if (nomeCaminhao) return nomeCaminhao
  if (isUuidLike(rawPlaca)) return 'Caminhao sem placa cadastrada'
  return rawPlaca
}

function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState<Tab>('dashboard')
  const [refreshTick, setRefreshTick] = useState(0)
  const [notice, setNotice] = useState<Notice>(null)
  const [syncDebug, setSyncDebug] = useState('')

  useEffect(() => {
    installSyncListeners()
    void runSync()
    void bootstrapDemoData()
  }, [])

  useEffect(() => {
    const onSyncComplete = () => setRefreshTick((v) => v + 1)
    window.addEventListener('colheita-sync-complete', onSyncComplete)
    return () => window.removeEventListener('colheita-sync-complete', onSyncComplete)
  }, [])

  useEffect(() => {
    const onSyncError = (evt: Event) => {
      const detail = (evt as CustomEvent<{ message?: string }>).detail
      if (detail?.message) setSyncDebug(detail.message)
    }
    window.addEventListener('colheita-sync-error', onSyncError as EventListener)
    return () => window.removeEventListener('colheita-sync-error', onSyncError as EventListener)
  }, [])

  useEffect(() => {
    const onFocus = () => {
      void runSync()
    }
    const interval = window.setInterval(() => {
      void runSync()
    }, 45000)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!hasSupabase || !supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s?.user) {
        setSession({ id: s.user.id, email: s.user.email ?? 'usuario' })
        void runSync()
      }
    })
  }, [])

  const triggerRefresh = () => setRefreshTick((v) => v + 1)
  const notify = (type: NoticeType, message: string) => {
    setNotice({ type, message })
    window.setTimeout(() => setNotice(null), 2600)
  }

  async function login() {
    setAuthError('')
    if (hasSupabase && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) {
        setAuthError(error?.message ?? 'Falha no login')
        return
      }
      setSession({ id: data.user.id, email: data.user.email ?? email })
      await runSync()
      return
    }

    if (!email || !password) {
      setAuthError('Informe email e senha.')
      return
    }

    setSession({ id: `local-${email}`, email })
  }

  async function handleSyncClick() {
    if (!navigator.onLine) {
      notify('error', 'Sem internet. Conecte-se para sincronizar.')
      return
    }
    if (!hasSupabase) {
      notify('error', 'Sincronizacao em nuvem nao configurada.')
      return
    }
    try {
      setSyncDebug('')
      await runSync()
      notify('success', 'Sincronizacao feita com sucesso.')
    } catch {
      notify('error', 'Falha na sincronizacao. Tente novamente.')
    }
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <section className="panel">
          <h1>Sistema de Gestao de Colheita</h1>
          <p className="muted">Acesso para operacao no campo, online ou offline.</p>
          {!hasSupabase && (
            <p className="warning">
              Modo local ativo: o sistema funciona neste aparelho mesmo sem internet.
              Para compartilhar dados entre aparelhos, siga o guia simples em README_LEIGO.md.
            </p>
          )}
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <label>Senha</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          {authError && <p className="error">{authError}</p>}
          <button onClick={login}>Entrar</button>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}
      {syncDebug && <div className="notice error">Detalhe tecnico: {syncDebug}</div>}
      <header className="topbar">
        <div>
          <h1>Gestao de Colheita</h1>
          <p>{session.email}</p>
        </div>
        <div className="actions">
          <button onClick={() => void handleSyncClick()}>Sincronizar</button>
          <button onClick={logout}>Sair</button>
        </div>
      </header>

      <nav className="tabs">
        <button onClick={() => setTab('dashboard')} className={tab === 'dashboard' ? 'active' : ''}>Dashboard</button>
        <button onClick={() => setTab('cargas')} className={tab === 'cargas' ? 'active' : ''}>Nova Carga</button>
        <button onClick={() => setTab('historico')} className={tab === 'historico' ? 'active' : ''}>Historico</button>
        <button onClick={() => setTab('cadastros')} className={tab === 'cadastros' ? 'active' : ''}>Cadastros</button>
        <button onClick={() => setTab('analises')} className={tab === 'analises' ? 'active' : ''}>Analises</button>
        <button onClick={() => setTab('frete')} className={tab === 'frete' ? 'active' : ''}>Frete</button>
        <button onClick={() => setTab('vendas')} className={tab === 'vendas' ? 'active' : ''}>Armazenagem e Vendas</button>
        <button onClick={() => setTab('config')} className={tab === 'config' ? 'active' : ''}>Assistente</button>
      </nav>

      {tab === 'dashboard' && <Dashboard refreshTick={refreshTick} />}
      {tab === 'cargas' && <NovaCarga userId={session.id} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'historico' && <Historico userId={session.id} refreshTick={refreshTick} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'cadastros' && <Cadastros userId={session.id} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'analises' && <Analises refreshTick={refreshTick} />}
      {tab === 'frete' && <Frete refreshTick={refreshTick} ownerEmail={session.email} onNotify={notify} />}
      {tab === 'vendas' && <ArmazenagemVendas userId={session.id} refreshTick={refreshTick} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'config' && <AssistenteConfiguracao onNotify={notify} />}
    </main>
  )
}

function AssistenteConfiguracao({ onNotify }: { onNotify: (type: NoticeType, message: string) => void }) {
  const conectado = hasSupabase
  const [backupInfo, setBackupInfo] = useState('')

  async function exportarBackup() {
    const [propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao] = await Promise.all([
      db.propriedades.toArray(),
      db.produtores.toArray(),
      db.variedades.toArray(),
      db.armazens.toArray(),
      db.caminhoes.toArray(),
      db.talhoes.toArray(),
      db.cargas.toArray(),
      db.estoque_armazem.toArray(),
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray()
    ])

    const payload = {
      exportado_em: nowIso(),
      versao: 1,
      dados: { propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = localDateYmd()
    a.href = url
    a.download = `backup-colheita-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    setBackupInfo('Backup exportado com sucesso.')
    onNotify('success', 'Backup exportado com sucesso.')
  }

  async function importarBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw = await file.text()
      const json = JSON.parse(raw) as {
        dados?: {
          propriedades?: BaseEntity[]
          produtores?: BaseEntity[]
          variedades?: BaseEntity[]
          armazens?: BaseEntity[]
          caminhoes?: BaseEntity[]
          talhoes?: Talhao[]
          cargas?: Carga[]
          estoque_armazem?: EstoqueArmazem[]
          movimento_estoque?: MovimentoEstoque[]
          venda_grao?: VendaGrao[]
        }
      }
      if (!json.dados) {
        setBackupInfo('Arquivo invalido para backup.')
        onNotify('error', 'Arquivo de backup invalido.')
        return
      }

      if (json.dados?.propriedades) await db.propriedades.bulkPut(json.dados.propriedades)
      if (json.dados?.produtores) await db.produtores.bulkPut(json.dados.produtores)
      if (json.dados?.variedades) await db.variedades.bulkPut(json.dados.variedades)
      if (json.dados?.armazens) await db.armazens.bulkPut(json.dados.armazens)
      if (json.dados?.caminhoes) await db.caminhoes.bulkPut(json.dados.caminhoes)
      if (json.dados?.talhoes) await db.talhoes.bulkPut(json.dados.talhoes)
      if (json.dados?.cargas) await db.cargas.bulkPut(json.dados.cargas)
      if (json.dados?.estoque_armazem) await db.estoque_armazem.bulkPut(json.dados.estoque_armazem)
      if (json.dados?.movimento_estoque) await db.movimento_estoque.bulkPut(json.dados.movimento_estoque)
      if (json.dados?.venda_grao) await db.venda_grao.bulkPut(json.dados.venda_grao)
      setBackupInfo('Backup importado com sucesso. Clique em Sincronizar para enviar para nuvem.')
      onNotify('success', 'Backup importado com sucesso.')
    } catch {
      setBackupInfo('Nao foi possivel importar. Verifique se o arquivo e um backup JSON valido.')
      onNotify('error', 'Falha ao importar backup.')
    } finally {
      event.target.value = ''
    }
  }

  async function excluirTodosDados() {
    const confirmou = window.confirm('Tem certeza que deseja EXCLUIR TODOS OS DADOS? Esta acao nao pode ser desfeita.')
    if (!confirmou) return
    const confirmouNovamente = window.confirm('Confirmacao final: apagar tudo agora?')
    if (!confirmouNovamente) return

    try {
      if (supabase) {
        const client = supabase
        const limparTabelaNuvem = async (table: string) => {
          const { error } = await client.from(table).delete().not('id', 'is', null)
          if (error) throw new Error(`${table}: ${error.message}`)
        }

        await limparTabelaNuvem('movimento_estoque')
        await limparTabelaNuvem('venda_grao')
        await limparTabelaNuvem('estoque_armazem')
        await limparTabelaNuvem('cargas')
        await limparTabelaNuvem('talhoes')
        await limparTabelaNuvem('caminhoes')
        await limparTabelaNuvem('variedades')
        await limparTabelaNuvem('produtores')
        await limparTabelaNuvem('propriedades')
        await limparTabelaNuvem('armazens')
      }

      await db.pending_ops.clear()
      await db.movimento_estoque.clear()
      await db.venda_grao.clear()
      await db.estoque_armazem.clear()
      await db.cargas.clear()
      await db.talhoes.clear()
      await db.caminhoes.clear()
      await db.variedades.clear()
      await db.produtores.clear()
      await db.propriedades.clear()
      await db.armazens.clear()

      onNotify('success', 'Todos os dados foram excluidos com sucesso.')
      window.location.reload()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'erro desconhecido'
      onNotify('error', `Falha ao excluir todos os dados: ${msg}`)
    }
  }

  return (
    <section className="panel">
      <h2>Assistente de Configuracao</h2>
      <p className="muted">Este painel mostra, em linguagem simples, o que falta para sincronizar entre aparelhos.</p>
      <div className="kpis">
        <article>
          <span>Status de conexao online</span>
          <strong>{conectado ? 'Ativo' : 'Nao configurado'}</strong>
        </article>
      </div>
      {!conectado && (
        <>
          <h3>Passos</h3>
          <ol>
            <li>Criar conta gratuita no Supabase.</li>
            <li>Criar um projeto novo.</li>
            <li>Executar o arquivo <code>supabase/schema.sql</code> no SQL Editor.</li>
            <li>Preencher o arquivo <code>.env</code> com URL e chave anon.</li>
            <li>Reiniciar o app com <code>npm run dev</code>.</li>
          </ol>
          <p className="info">Guia completo: arquivo README_LEIGO.md na pasta do projeto.</p>
        </>
      )}
      {conectado && (
        <p className="info">Configuracao online ativa. Login e sincronizacao entre dispositivos estao prontos para uso.</p>
      )}
      <h3>Backup</h3>
      <div className="actions">
        <button onClick={() => void exportarBackup()}>Exportar Backup (JSON)</button>
        <label className="file-input-label">
          Importar Backup (JSON)
          <input type="file" accept=".json,application/json" onChange={importarBackup} />
        </label>
        <button onClick={() => void excluirTodosDados()}>Excluir todos os dados</button>
      </div>
      {backupInfo && <p className="info">{backupInfo}</p>}
    </section>
  )
}

function baseRecord(nome: string, userId: string): BaseEntity {
  const now = nowIso()
  return {
    id: makeId(),
    nome,
    created_at: now,
    updated_at: now,
    created_by: userId,
    updated_by: userId,
    sync_status: 'pending_sync'
  }
}

async function queueOp(table: string, recordId: string, payload: unknown) {
  await db.pending_ops.put({
    id: makeId(),
    table,
    record_id: recordId,
    op: 'upsert',
    payload,
    updated_at: nowIso(),
    retries: 0
  })
}

async function queueDeleteOp(table: string, recordId: string) {
  await db.pending_ops.put({
    id: makeId(),
    table,
    record_id: recordId,
    op: 'delete',
    payload: { id: recordId },
    updated_at: nowIso(),
    retries: 0
  })
}

async function getOrCreateEstoque(armazemId: string, userId: string) {
  const existing = await db.estoque_armazem.where('armazem_id').equals(armazemId).first()
  if (existing) return existing

  const now = nowIso()
  const saldoInicial = (await db.cargas.where('armazem_id').equals(armazemId).toArray()).reduce((acc, c) => acc + c.sacas, 0)
  const novo: EstoqueArmazem = {
    id: makeId(),
    armazem_id: armazemId,
    saldo_sacas: saldoInicial,
    sync_status: 'pending_sync',
    created_at: now,
    updated_at: now,
    created_by: userId,
    updated_by: userId
  }
  await db.estoque_armazem.put(novo)
  await queueOp('estoque_armazem', novo.id, novo)
  return novo
}

async function registrarMovimentoEstoque(input: {
  userId: string
  tipo: MovimentoEstoque['tipo']
  armazemId: string
  sacas: number
  origem: MovimentoEstoque['origem']
  referenciaId: string
  motivo?: string
}) {
  const now = nowIso()
  const mov: MovimentoEstoque = {
    id: makeId(),
    tipo: input.tipo,
    armazem_id: input.armazemId,
    sacas: input.sacas,
    origem: input.origem,
    referencia_id: input.referenciaId,
    motivo: input.motivo,
    sync_status: 'pending_sync',
    created_at: now,
    updated_at: now,
    created_by: input.userId,
    updated_by: input.userId
  }
  await db.movimento_estoque.put(mov)
  await queueOp('movimento_estoque', mov.id, mov)
}

async function aplicarSaldoEstoque(userId: string, armazemId: string, deltaSacas: number) {
  const estoque = await getOrCreateEstoque(armazemId, userId)
  const now = nowIso()
  const updated: EstoqueArmazem = {
    ...estoque,
    saldo_sacas: Number((estoque.saldo_sacas + deltaSacas).toFixed(4)),
    updated_at: now,
    updated_by: userId,
    sync_status: 'pending_sync'
  }
  await db.estoque_armazem.put(updated)
  await queueOp('estoque_armazem', updated.id, updated)
  return updated
}

function monthRangeYmd(ref = new Date()) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
  return { start: localDateYmd(start), end: localDateYmd(end) }
}

function Cadastros({ userId, onSaved, onNotify }: { userId: string; onSaved: () => void; onNotify: (type: NoticeType, message: string) => void }) {
  const [nome, setNome] = useState('')
  const [areaHa, setAreaHa] = useState('')
  const [tipo, setTipo] = useState('propriedades')
  const [lista, setLista] = useState<Array<BaseEntity | Talhao>>([])
  const [editId, setEditId] = useState('')
  const [editNome, setEditNome] = useState('')
  const [editAreaHa, setEditAreaHa] = useState('')

  useEffect(() => {
    void (async () => {
      if (tipo === 'talhoes') {
        setLista(await db.talhoes.toArray())
        return
      }
      const tableMap: Record<string, { toArray: () => Promise<BaseEntity[]> }> = {
        propriedades: db.propriedades,
        produtores: db.produtores,
        variedades: db.variedades,
        armazens: db.armazens,
        caminhoes: db.caminhoes
      }
      const table = tableMap[tipo]
      if (!table) {
        setLista([])
        return
      }
      setLista(await table.toArray())
    })()
  }, [tipo])

  async function saveBase() {
    if (!nome.trim()) {
      onNotify('error', 'Preencha o nome para salvar.')
      return
    }
    const rec = baseRecord(nome.trim(), userId)
    if (tipo === 'talhoes') return
    const tableMap: Record<string, { put: (v: BaseEntity) => Promise<string>; toArray: () => Promise<BaseEntity[]> }> = {
      propriedades: db.propriedades,
      produtores: db.produtores,
      variedades: db.variedades,
      armazens: db.armazens,
      caminhoes: db.caminhoes
    }
    const table = tableMap[tipo]
    if (!table) return
    await table.put(rec)
    await queueOp(tipo, rec.id, rec)
    await runSync()
    setNome('')
    onSaved()
    setLista(await table.toArray())
    onNotify('success', 'Cadastro salvo com sucesso.')
  }

  async function saveTalhao() {
    if (!nome.trim() || !areaHa) {
      onNotify('error', 'Preencha nome e area do talhao.')
      return
    }
    const base = baseRecord(nome.trim(), userId)
    const talhao: Talhao = { ...base, area_ha: Number(areaHa) }
    await db.talhoes.put(talhao)
    await queueOp('talhoes', talhao.id, talhao)
    await runSync()
    setNome('')
    setAreaHa('')
    onSaved()
    setLista(await db.talhoes.toArray())
    onNotify('success', 'Talhao salvo com sucesso.')
  }

  function iniciarEdicao(item: BaseEntity | Talhao) {
    setEditId(item.id)
    setEditNome(item.nome)
    if ('area_ha' in item) setEditAreaHa(String(item.area_ha))
    else setEditAreaHa('')
  }

  async function salvarEdicao() {
    if (!editId || !editNome.trim()) {
      onNotify('error', 'Preencha os dados da edicao.')
      return
    }
    const now = nowIso()
    if (tipo === 'talhoes') {
      const original = await db.talhoes.get(editId)
      if (!original) return
      const area = parsePtBrNumber(editAreaHa)
      if (!Number.isFinite(area) || area <= 0) {
        onNotify('error', 'Area do talhao invalida.')
        return
      }
      const updated: Talhao = {
        ...original,
        nome: editNome.trim(),
        area_ha: area,
        updated_at: now,
        updated_by: userId,
        sync_status: 'pending_sync'
      }
      await db.talhoes.put(updated)
      await queueOp('talhoes', updated.id, updated)
    } else {
      const tableMap: Record<string, { get: (id: string) => Promise<BaseEntity | undefined>; put: (v: BaseEntity) => Promise<string> }> = {
        propriedades: db.propriedades,
        produtores: db.produtores,
        variedades: db.variedades,
        armazens: db.armazens,
        caminhoes: db.caminhoes
      }
      const table = tableMap[tipo]
      if (!table) return
      const original = await table.get(editId)
      if (!original) return
      const updated: BaseEntity = {
        ...original,
        nome: editNome.trim(),
        updated_at: now,
        updated_by: userId,
        sync_status: 'pending_sync'
      }
      await table.put(updated)
      await queueOp(tipo, updated.id, updated)
    }
    await runSync()
    setEditId('')
    setEditNome('')
    setEditAreaHa('')
    onSaved()
    if (tipo === 'talhoes') setLista(await db.talhoes.toArray())
    else {
      const tableMap: Record<string, { toArray: () => Promise<BaseEntity[]> }> = {
        propriedades: db.propriedades,
        produtores: db.produtores,
        variedades: db.variedades,
        armazens: db.armazens,
        caminhoes: db.caminhoes
      }
      const table = tableMap[tipo]
      if (table) setLista(await table.toArray())
    }
    onNotify('success', 'Cadastro atualizado com sucesso.')
  }

  async function apagarCadastro(item: BaseEntity | Talhao) {
    const confirmar = window.confirm('Tem certeza que deseja apagar este cadastro?')
    if (!confirmar) return
    try {
      if (tipo === 'talhoes') {
        await db.talhoes.delete(item.id)
        await db.pending_ops.where('record_id').equals(item.id).delete()
        await queueDeleteOp('talhoes', item.id)
        setLista(await db.talhoes.toArray())
      } else {
        const tableMap: Record<string, { delete: (id: string) => Promise<void>; toArray: () => Promise<BaseEntity[]> }> = {
          propriedades: db.propriedades,
          produtores: db.produtores,
          variedades: db.variedades,
          armazens: db.armazens,
          caminhoes: db.caminhoes
        }
        const table = tableMap[tipo]
        if (!table) return
        await table.delete(item.id)
        await db.pending_ops.where('record_id').equals(item.id).delete()
        await queueDeleteOp(tipo, item.id)
        setLista(await table.toArray())
      }
      if (editId === item.id) setEditId('')
      onSaved()
      onNotify('success', 'Cadastro apagado com sucesso.')
    } catch {
      window.alert('Nao foi possivel apagar. Esse cadastro pode estar sendo usado em cargas ja registradas.')
      onNotify('error', 'Nao foi possivel apagar este cadastro.')
    }
  }

  return (
    <section className="panel">
      <h2>Cadastros Basicos</h2>
      <div className="row">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="propriedades">Propriedade</option>
          <option value="produtores">Produtor</option>
          <option value="variedades">Variedade</option>
          <option value="armazens">Armazem</option>
          <option value="caminhoes">Placa do Caminhao</option>
          <option value="talhoes">Talhao</option>
        </select>
        <input placeholder={tipo === 'caminhoes' ? 'Placa (ex: ABC1D23)' : 'Nome'} value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} />
        {tipo === 'talhoes' && (
          <input placeholder="Area (ha)" type="number" min="0" step="0.01" value={areaHa} onChange={(e) => setAreaHa(e.target.value)} />
        )}
        <button onClick={tipo === 'talhoes' ? saveTalhao : saveBase}>Salvar</button>
      </div>
      {editId && (
        <div className="row">
          <input value={editNome} onChange={(e) => setEditNome(e.target.value.toUpperCase())} />
          {tipo === 'talhoes' && (
            <input value={editAreaHa} onChange={(e) => setEditAreaHa(e.target.value)} placeholder="Area (ha)" />
          )}
          <button onClick={() => void salvarEdicao()}>Salvar Edicao</button>
          <button onClick={() => setEditId('')}>Cancelar</button>
        </div>
      )}
      <ul>
        {lista.map((item) => (
          <li key={item.id}>
            {'area_ha' in item ? `${item.nome} | ${formatPtBrNumber(item.area_ha)} ha` : item.nome}
            <div className="actions">
              <button onClick={() => iniciarEdicao(item)}>Editar</button>
              <button onClick={() => void apagarCadastro(item)}>Apagar</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NovaCarga({ userId, onSaved, onNotify }: { userId: string; onSaved: () => void; onNotify: (type: NoticeType, message: string) => void }) {
  const [data, setData] = useState(localDateYmd())
  const [placa, setPlaca] = useState('')
  const [pesoBruto, setPesoBruto] = useState('')
  const [pesoLiquido, setPesoLiquido] = useState('')
  const [propriedadeId, setPropriedadeId] = useState('')
  const [talhaoId, setTalhaoId] = useState('')
  const [produtorId, setProdutorId] = useState('')
  const [variedadeId, setVariedadeId] = useState('')
  const [armazemId, setArmazemId] = useState('')
  const [refs, setRefs] = useState<{[k: string]: BaseEntity[] | Talhao[]}>({})
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    void Promise.all([
      db.propriedades.toArray(),
      db.talhoes.toArray(),
      db.produtores.toArray(),
      db.variedades.toArray(),
      db.armazens.toArray(),
      db.caminhoes.toArray()
    ]).then(([propriedades, talhoes, produtores, variedades, armazens, caminhoes]) => {
      setRefs({ propriedades, talhoes, produtores, variedades, armazens, caminhoes })
    })
  }, [])

  const sacas = useMemo(() => {
    const liquido = parsePtBrNumber(pesoLiquido || '0')
    return Number.isFinite(liquido) ? toSacas(liquido) : 0
  }, [pesoLiquido])

  async function salvar() {
    const erros = validarCarga({
      data,
      placa,
      propriedadeId,
      talhaoId,
      produtorId,
      variedadeId,
      armazemId,
      pesoBruto,
      pesoLiquido
    })
    setErrors(erros)
    if (erros.length > 0) {
      onNotify('error', 'Nao foi possivel salvar. Verifique os campos.')
      return
    }
    const now = nowIso()
    const carga: Carga = {
      id: makeId(),
      data,
      placa,
      propriedade_id: propriedadeId,
      talhao_id: talhaoId,
      produtor_id: produtorId,
      variedade_id: variedadeId,
      armazem_id: armazemId,
      peso_bruto_kg: parsePtBrNumber(pesoBruto),
      peso_liquido_kg: parsePtBrNumber(pesoLiquido),
      sacas,
      sync_status: 'pending_sync',
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId
    }

    await db.cargas.put(carga)
    await queueOp('cargas', carga.id, carga)
    await aplicarSaldoEstoque(userId, carga.armazem_id, carga.sacas)
    await registrarMovimentoEstoque({
      userId,
      tipo: 'entrada',
      armazemId: carga.armazem_id,
      sacas: carga.sacas,
      origem: 'carga',
      referenciaId: carga.id
    })
    await runSync()

    setPlaca('')
    setPesoBruto('')
    setPesoLiquido('')
    setErrors([])
    onSaved()
    onNotify('success', 'Carga salva com sucesso.')
  }

  return (
    <section className="panel">
      <h2>Nova Carga</h2>
      <div className="grid">
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <SelectFromList label="Placa (caminhao)" value={placa} onChange={setPlaca} items={(refs.caminhoes as BaseEntity[]) ?? []} />
        <SelectFromList label="Propriedade" value={propriedadeId} onChange={setPropriedadeId} items={(refs.propriedades as BaseEntity[]) ?? []} />
        <SelectFromList label="Talhao" value={talhaoId} onChange={setTalhaoId} items={(refs.talhoes as Talhao[]) ?? []} />
        <SelectFromList label="Produtor" value={produtorId} onChange={setProdutorId} items={(refs.produtores as BaseEntity[]) ?? []} />
        <SelectFromList label="Variedade" value={variedadeId} onChange={setVariedadeId} items={(refs.variedades as BaseEntity[]) ?? []} />
        <SelectFromList label="Armazem" value={armazemId} onChange={setArmazemId} items={(refs.armazens as BaseEntity[]) ?? []} />
        <input placeholder="Peso bruto (kg) ex: 21.000" value={pesoBruto} onChange={(e) => setPesoBruto(e.target.value)} />
        <input placeholder="Peso liquido (kg) ex: 20.500" value={pesoLiquido} onChange={(e) => setPesoLiquido(e.target.value)} />
      </div>
      <p className="info">Sacas (automatico): <strong>{sacas.toFixed(2)}</strong></p>
      {errors.length > 0 && (
        <ul className="error-list">
          {errors.map((err) => <li key={err}>{err}</li>)}
        </ul>
      )}
      <button onClick={salvar}>Salvar Carga</button>
    </section>
  )
}

function SelectFromList({ label, value, onChange, items }: { label: string; value: string; onChange: (v: string) => void; items: Array<{id: string; nome: string}> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}</option>
      {items.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
    </select>
  )
}

function Dashboard({ refreshTick }: { refreshTick: number }) {
  const [cargas, setCargas] = useState<Carga[]>([])
  const [talhoes, setTalhoes] = useState<Talhao[]>([])
  const [caminhoes, setCaminhoes] = useState<BaseEntity[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    void Promise.all([db.cargas.toArray(), db.talhoes.toArray(), db.caminhoes.toArray(), db.pending_ops.toArray()]).then(([cs, ts, cms, ops]) => {
      setCargas(cs)
      setTalhoes(ts)
      setCaminhoes(cms)
      setPendingIds(new Set(ops.map((o) => o.record_id)))
    })
  }, [refreshTick])

  const totalKg = cargas.reduce((acc, c) => acc + c.peso_liquido_kg, 0)
  const totalSacas = cargas.reduce((acc, c) => acc + c.sacas, 0)
  const totalArea = talhoes.reduce((acc, t) => acc + t.area_ha, 0)
  const prodGeral = totalArea > 0 ? totalSacas / totalArea : 0

  const porTalhao = talhoes.map((t) => {
    const subconjunto = cargas.filter((c) => c.talhao_id === t.id)
    const sacas = subconjunto.reduce((acc, c) => acc + c.sacas, 0)
    return { nome: t.nome, valor: produtividadeSacasPorHa(sacas, t.area_ha) }
  })

  const placaPorId = new Map(caminhoes.map((c) => [c.id, c.nome]))
  const statusLabel: Record<Carga['sync_status'], string> = {
    local_only: 'Somente neste aparelho',
    pending_sync: 'Pendente de sincronizacao',
    synced: 'Sincronizado',
    sync_error: 'Erro de sincronizacao'
  }

  return (
    <section className="panel">
      <h2>Dashboard</h2>
      <div className="kpis">
        <article><span>Total liquido (kg)</span><strong>{totalKg.toFixed(2)}</strong></article>
        <article><span>Total em sacas</span><strong>{totalSacas.toFixed(2)}</strong></article>
        <article><span>Produtividade geral (sacas/ha)</span><strong>{prodGeral.toFixed(2)}</strong></article>
      </div>
      <h3>Produtividade por talhao (sacas/ha)</h3>
      <ul>
        {porTalhao.map((item) => <li key={item.nome}>{item.nome}: {item.valor.toFixed(2)}</li>)}
      </ul>
      <h3>Ultimas cargas</h3>
      <ul>
        {cargas.slice(-5).reverse().map((c) => (
          <li key={c.id}>
            {c.data} | {placaLegivel(c.placa, placaPorId.get(c.placa))} | {formatPtBrNumber(c.peso_liquido_kg)} kg | {formatPtBrNumber(c.sacas)} sacas | {pendingIds.has(c.id) ? statusLabel.pending_sync : statusLabel.synced}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Analises({ refreshTick }: { refreshTick: number }) {
  const [cargas, setCargas] = useState<Carga[]>([])
  const [talhoes, setTalhoes] = useState<Talhao[]>([])
  const [variedades, setVariedades] = useState<BaseEntity[]>([])
  const [produtores, setProdutores] = useState<BaseEntity[]>([])
  const [armazens, setArmazens] = useState<BaseEntity[]>([])
  const [talhoesSelecionados, setTalhoesSelecionados] = useState<string[]>([])
  const [produtorRelatorioId, setProdutorRelatorioId] = useState('')
  const [dataRelInicio, setDataRelInicio] = useState('')
  const [dataRelFim, setDataRelFim] = useState('')

  useEffect(() => {
    void Promise.all([
      db.cargas.toArray(),
      db.talhoes.toArray(),
      db.variedades.toArray(),
      db.produtores.toArray(),
      db.armazens.toArray()
    ]).then(([cs, ts, vs, ps, ars]) => {
      setCargas(cs)
      setTalhoes(ts)
      setVariedades(vs)
      setProdutores(ps)
      setArmazens(ars)
    })
  }, [refreshTick])

  const mediaGeralKg = cargas.length > 0 ? cargas.reduce((acc, c) => acc + c.peso_liquido_kg, 0) / cargas.length : 0
  const mediaGeralSacas = cargas.length > 0 ? cargas.reduce((acc, c) => acc + c.sacas, 0) / cargas.length : 0
  const areaTotal = talhoes.reduce((acc, t) => acc + t.area_ha, 0)
  const prodGeral = produtividadeSacasPorHa(cargas.reduce((acc, c) => acc + c.sacas, 0), areaTotal)

  const mediasTalhao = talhoes.map((t) => {
    const items = cargas.filter((c) => c.talhao_id === t.id)
    const mediaKg = items.length > 0 ? items.reduce((acc, c) => acc + c.peso_liquido_kg, 0) / items.length : 0
    const mediaSacas = items.length > 0 ? items.reduce((acc, c) => acc + c.sacas, 0) / items.length : 0
    return { nome: t.nome, mediaKg, mediaSacas }
  })

  const mediasVariedade = variedades.map((v) => {
    const items = cargas.filter((c) => c.variedade_id === v.id)
    const mediaKg = items.length > 0 ? items.reduce((acc, c) => acc + c.peso_liquido_kg, 0) / items.length : 0
    const mediaSacas = items.length > 0 ? items.reduce((acc, c) => acc + c.sacas, 0) / items.length : 0
    return { nome: v.nome, mediaKg, mediaSacas }
  })

  const entregaPorProdutor = produtores.map((p) => {
    const items = cargas.filter((c) => c.produtor_id === p.id)
    const totalKg = items.reduce((acc, c) => acc + c.peso_liquido_kg, 0)
    const totalSacas = items.reduce((acc, c) => acc + c.sacas, 0)
    return { nome: p.nome, totalKg, totalSacas, viagens: items.length }
  })

  const cargasSelecionadas = talhoesSelecionados.length > 0
    ? cargas.filter((c) => talhoesSelecionados.includes(c.talhao_id))
    : []
  const talhoesSelecionadosObjs = talhoes.filter((t) => talhoesSelecionados.includes(t.id))
  const areaSelecionada = talhoesSelecionadosObjs.reduce((acc, t) => acc + t.area_ha, 0)
  const mediaSelKg = cargasSelecionadas.length > 0
    ? cargasSelecionadas.reduce((acc, c) => acc + c.peso_liquido_kg, 0) / cargasSelecionadas.length
    : 0
  const mediaSelSacas = cargasSelecionadas.length > 0
    ? cargasSelecionadas.reduce((acc, c) => acc + c.sacas, 0) / cargasSelecionadas.length
    : 0
  const prodSel = produtividadeSacasPorHa(cargasSelecionadas.reduce((acc, c) => acc + c.sacas, 0), areaSelecionada)

  function toggleTalhao(id: string) {
    setTalhoesSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const armazemPorId = new Map(armazens.map((a) => [a.id, a.nome]))
  const cargasProdutorRel = cargas.filter((c) => {
    if (!produtorRelatorioId) return false
    if (c.produtor_id !== produtorRelatorioId) return false
    if (dataRelInicio && c.data < dataRelInicio) return false
    if (dataRelFim && c.data > dataRelFim) return false
    return true
  })
  const totalRelKg = cargasProdutorRel.reduce((acc, c) => acc + c.peso_liquido_kg, 0)
  const totalRelSacas = cargasProdutorRel.reduce((acc, c) => acc + c.sacas, 0)

  function exportarRelProdCsv() {
    const nomeProd = produtores.find((p) => p.id === produtorRelatorioId)?.nome ?? 'produtor'
    const cab = ['data', 'armazem', 'peso_liquido_kg', 'sacas']
    const linhas = cargasProdutorRel.map((c) => [
      c.data,
      armazemPorId.get(c.armazem_id) ?? c.armazem_id,
      c.peso_liquido_kg.toFixed(2),
      c.sacas.toFixed(2)
    ])
    const csv = [cab, ...linhas].map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-produtor-${nomeProd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportarRelProdPdf() {
    const doc = new jsPDF()
    const nomeProd = produtores.find((p) => p.id === produtorRelatorioId)?.nome ?? 'Produtor'
    const emissao = new Date().toLocaleString('pt-BR')
    let y = 14
    doc.setFontSize(17)
    doc.text('RELATORIO DE ENTREGA DO PRODUTOR', 14, y)
    y += 8
    doc.setFontSize(11)
    doc.text(`Produtor: ${nomeProd}`, 14, y)
    y += 6
    doc.text(`Periodo: ${dataRelInicio || '-'} ate ${dataRelFim || '-'}`, 14, y)
    y += 6
    doc.text(`Emitido em: ${emissao}`, 14, y)
    y += 8
    doc.text(`Total entregue: ${formatPtBrNumber(totalRelKg)} kg liquido | ${formatPtBrNumber(totalRelSacas)} sacas`, 14, y)
    y += 9
    doc.setFontSize(12)
    doc.text('Entregas por armazem', 14, y)
    y += 6
    doc.setFontSize(10)

    if (cargasProdutorRel.length === 0) {
      doc.text('Nenhuma entrega encontrada para o filtro selecionado.', 14, y)
    } else {
      for (const c of cargasProdutorRel) {
        const linha = `${c.data} | Armazem: ${armazemPorId.get(c.armazem_id) ?? c.armazem_id} | ${formatPtBrNumber(c.peso_liquido_kg)} kg | ${formatPtBrNumber(c.sacas)} sacas`
        const partes = doc.splitTextToSize(linha, 180)
        doc.text(partes, 14, y)
        y += partes.length * 5
        if (y > 280) {
          doc.addPage()
          y = 14
        }
      }
    }
    doc.save(`relatorio-produtor-${nomeProd}.pdf`)
  }

  return (
    <section className="panel">
      <h2>Analises de Medias</h2>
      <div className="kpis">
        <article><span>Media geral (kg/carga)</span><strong>{mediaGeralKg.toFixed(2)}</strong></article>
        <article><span>Media geral (sacas/carga)</span><strong>{mediaGeralSacas.toFixed(2)}</strong></article>
        <article><span>Produtividade geral (sacas/ha)</span><strong>{prodGeral.toFixed(2)}</strong></article>
      </div>
      <h3>Media por talhao</h3>
      <ul>
        {mediasTalhao.map((m) => <li key={m.nome}>{m.nome}: {m.mediaKg.toFixed(2)} kg/carga | {m.mediaSacas.toFixed(2)} sacas/carga</li>)}
      </ul>
      <h3>Media por variedade</h3>
      <ul>
        {mediasVariedade.map((m) => <li key={m.nome}>{m.nome}: {m.mediaKg.toFixed(2)} kg/carga | {m.mediaSacas.toFixed(2)} sacas/carga</li>)}
      </ul>
      <h3>Comparativo de varios talhoes</h3>
      <div className="grid">
        {talhoes.map((t) => (
          <label key={t.id}>
            <input
              type="checkbox"
              checked={talhoesSelecionados.includes(t.id)}
              onChange={() => toggleTalhao(t.id)}
            />{' '}
            {t.nome}
          </label>
        ))}
      </div>
      <div className="kpis">
        <article><span>Media selecionada (kg/carga)</span><strong>{mediaSelKg.toFixed(2)}</strong></article>
        <article><span>Media selecionada (sacas/carga)</span><strong>{mediaSelSacas.toFixed(2)}</strong></article>
        <article><span>Produtividade selecionada (sacas/ha)</span><strong>{prodSel.toFixed(2)}</strong></article>
      </div>
      <h3>Quantidade de graos por produtor</h3>
      <ul>
        {entregaPorProdutor.map((p) => (
          <li key={p.nome}>
            {p.nome}: {formatPtBrNumber(p.totalKg)} kg liquido | {formatPtBrNumber(p.totalSacas)} sacas | {p.viagens} viagens
          </li>
        ))}
      </ul>
      <h3>Relatorio para entregar ao produtor</h3>
      <div className="grid">
        <SelectFromList label="Produtor" value={produtorRelatorioId} onChange={setProdutorRelatorioId} items={produtores} />
        <input type="date" value={dataRelInicio} onChange={(e) => setDataRelInicio(e.target.value)} />
        <input type="date" value={dataRelFim} onChange={(e) => setDataRelFim(e.target.value)} />
      </div>
      <div className="kpis">
        <article><span>Total do produtor (kg liquido)</span><strong>{formatPtBrNumber(totalRelKg)}</strong></article>
        <article><span>Total do produtor (sacas)</span><strong>{formatPtBrNumber(totalRelSacas)}</strong></article>
        <article><span>Entregas no periodo</span><strong>{cargasProdutorRel.length}</strong></article>
      </div>
      <div className="actions">
        <button onClick={exportarRelProdCsv} disabled={!produtorRelatorioId}>Exportar CSV Produtor</button>
        <button onClick={exportarRelProdPdf} disabled={!produtorRelatorioId}>Exportar PDF Produtor</button>
      </div>
      <ul>
        {cargasProdutorRel.map((c) => (
          <li key={c.id}>
            {c.data} | Armazem: {armazemPorId.get(c.armazem_id) ?? c.armazem_id} | {formatPtBrNumber(c.peso_liquido_kg)} kg | {formatPtBrNumber(c.sacas)} sacas
          </li>
        ))}
      </ul>
    </section>
  )
}

function ArmazenagemVendas({
  userId,
  refreshTick,
  onSaved,
  onNotify
}: {
  userId: string
  refreshTick: number
  onSaved: () => void
  onNotify: (type: NoticeType, message: string) => void
}) {
  const [armazens, setArmazens] = useState<BaseEntity[]>([])
  const [produtores, setProdutores] = useState<BaseEntity[]>([])
  const [cargas, setCargas] = useState<Carga[]>([])
  const [estoques, setEstoques] = useState<EstoqueArmazem[]>([])
  const [movimentos, setMovimentos] = useState<MovimentoEstoque[]>([])
  const [vendas, setVendas] = useState<VendaGrao[]>([])

  const mesAtual = monthRangeYmd()
  const [filtroInicio, setFiltroInicio] = useState(mesAtual.start)
  const [filtroFim, setFiltroFim] = useState(mesAtual.end)

  const [vData, setVData] = useState(localDateYmd())
  const [vProdutor, setVProdutor] = useState('')
  const [vArmazem, setVArmazem] = useState('')
  const [vSacas, setVSacas] = useState('')
  const [vValorSaca, setVValorSaca] = useState('')
  const [produtoresExcluidos, setProdutoresExcluidos] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`estoque_excluir_produtores_${userId}`)
      if (!raw) return []
      const arr = JSON.parse(raw) as string[]
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  })
  const [produtoresExcluidosSalvos, setProdutoresExcluidosSalvos] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`estoque_excluir_produtores_${userId}`)
      if (!raw) return []
      const arr = JSON.parse(raw) as string[]
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  })

  const [ajArmazem, setAjArmazem] = useState('')
  const [ajSacas, setAjSacas] = useState('')
  const [ajMotivo, setAjMotivo] = useState('')
  const [ajTipo, setAjTipo] = useState<'entrada' | 'saida'>('entrada')

  useEffect(() => {
    void Promise.all([
      db.armazens.toArray(),
      db.produtores.toArray(),
      db.cargas.toArray(),
      db.estoque_armazem.toArray(),
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray()
    ]).then(([ars, ps, cs, est, mov, ven]) => {
      setArmazens(ars)
      setProdutores(ps)
      setCargas(cs)
      setEstoques(est)
      setMovimentos(mov)
      setVendas(ven)
    })
  }, [refreshTick])

  async function carregar() {
    const [ars, ps, cs, est, mov, ven] = await Promise.all([
      db.armazens.toArray(),
      db.produtores.toArray(),
      db.cargas.toArray(),
      db.estoque_armazem.toArray(),
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray()
    ])
    setArmazens(ars)
    setProdutores(ps)
    setCargas(cs)
    setEstoques(est)
    setMovimentos(mov)
    setVendas(ven)
  }

  const nomeArmazem = new Map(armazens.map((a) => [a.id, a.nome]))
  const nomeProdutor = new Map(produtores.map((p) => [p.id, p.nome]))
  const saldoPorArmazem = armazens.map((a) => ({
    armazem: a.nome,
    saldo: estoques.find((e) => e.armazem_id === a.id)?.saldo_sacas ?? 0
  }))
  const totalCargaProdutor = vProdutor ? cargas.filter((c) => c.produtor_id === vProdutor).reduce((acc, c) => acc + c.sacas, 0) : 0
  const totalVendaProdutor = vProdutor ? vendas.filter((v) => v.produtor_id === vProdutor && v.status === 'ativa').reduce((acc, v) => acc + v.sacas, 0) : 0
  const saldoDisponivelProdutor = Number((totalCargaProdutor - totalVendaProdutor).toFixed(4))
  const sacasSolicitadas = parsePtBrNumber(vSacas)
  const valorPorSacaAtual = parsePtBrNumber(vValorSaca)
  const saldoRestanteVenda = Number.isFinite(sacasSolicitadas)
    ? Number((saldoDisponivelProdutor - sacasSolicitadas).toFixed(4))
    : saldoDisponivelProdutor
  const totalEstoqueComExclusoes = Number(
    (
      cargas
        .filter((c) => !produtoresExcluidos.includes(c.produtor_id))
        .reduce((acc, c) => acc + c.sacas, 0) -
      vendas
        .filter((v) => v.status === 'ativa' && !produtoresExcluidos.includes(v.produtor_id))
        .reduce((acc, v) => acc + v.sacas, 0)
    ).toFixed(4)
  )

  async function salvarVenda() {
    const sacas = parsePtBrNumber(vSacas)
    const valorPorSaca = parsePtBrNumber(vValorSaca)
    if (!vProdutor || !vArmazem || !vData || !Number.isFinite(sacas) || sacas <= 0 || !Number.isFinite(valorPorSaca) || valorPorSaca <= 0) {
      onNotify('error', 'Preencha os campos obrigatorios da venda.')
      return
    }
    if (saldoDisponivelProdutor < sacas) {
      onNotify('error', 'Saldo insuficiente deste produtor para venda.')
      return
    }
    const estoque = await getOrCreateEstoque(vArmazem, userId)
    if (estoque.saldo_sacas < sacas) {
      onNotify('error', 'Saldo insuficiente para esta venda.')
      return
    }
    const now = nowIso()
    const venda: VendaGrao = {
      id: makeId(),
      data: vData,
      produtor_id: vProdutor,
      armazem_cliente_id: vArmazem,
      sacas,
      valor_por_saca: valorPorSaca,
      valor_total: Number((sacas * valorPorSaca).toFixed(2)),
      status: 'ativa',
      sync_status: 'pending_sync',
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId
    }
    await db.venda_grao.put(venda)
    await queueOp('venda_grao', venda.id, venda)
    await aplicarSaldoEstoque(userId, vArmazem, -sacas)
    await registrarMovimentoEstoque({
      userId,
      tipo: 'saida',
      armazemId: vArmazem,
      sacas,
      origem: 'venda',
      referenciaId: venda.id
    })
    await runSync()
    setVData(localDateYmd())
    setVProdutor('')
    setVArmazem('')
    setVSacas('')
    setVValorSaca('')
    await carregar()
    onSaved()
    onNotify('success', 'Venda registrada com sucesso.')
  }

  async function cancelarVenda(venda: VendaGrao) {
    if (venda.status === 'cancelada') return
    const ok = window.confirm('Cancelar esta venda e estornar estoque?')
    if (!ok) return
    const updated: VendaGrao = {
      ...venda,
      status: 'cancelada',
      updated_at: nowIso(),
      updated_by: userId,
      sync_status: 'pending_sync'
    }
    await db.venda_grao.put(updated)
    await queueOp('venda_grao', updated.id, updated)
    await aplicarSaldoEstoque(userId, venda.armazem_cliente_id, venda.sacas)
    await registrarMovimentoEstoque({
      userId,
      tipo: 'estorno',
      armazemId: venda.armazem_cliente_id,
      sacas: venda.sacas,
      origem: 'cancelamento',
      referenciaId: venda.id
    })
    await runSync()
    await carregar()
    onSaved()
    onNotify('success', 'Venda cancelada e estoque estornado.')
  }

  async function aplicarAjusteManual() {
    const sacas = parsePtBrNumber(ajSacas)
    if (!ajArmazem || !Number.isFinite(sacas) || sacas <= 0 || !ajMotivo.trim()) {
      onNotify('error', 'Preencha armazem, sacas e motivo do ajuste.')
      return
    }
    const delta = ajTipo === 'entrada' ? sacas : -sacas
    const estoque = await getOrCreateEstoque(ajArmazem, userId)
    if (delta < 0 && estoque.saldo_sacas < Math.abs(delta)) {
      onNotify('error', 'Saldo insuficiente para ajuste de saida.')
      return
    }
    await aplicarSaldoEstoque(userId, ajArmazem, delta)
    await registrarMovimentoEstoque({
      userId,
      tipo: 'ajuste',
      armazemId: ajArmazem,
      sacas,
      origem: 'manual',
      referenciaId: makeId(),
      motivo: ajMotivo.trim()
    })
    await runSync()
    setAjSacas('')
    setAjMotivo('')
    await carregar()
    onSaved()
    onNotify('success', 'Ajuste de estoque aplicado com sucesso.')
  }

  const vendasFiltradas = vendas.filter((v) => v.data >= filtroInicio && v.data <= filtroFim)
  const movimentosFiltrados = movimentos.filter((m) => {
    const d = m.created_at.slice(0, 10)
    return d >= filtroInicio && d <= filtroFim
  })

  const resumoVendas = {
    totalSacas: vendasFiltradas.filter((v) => v.status === 'ativa').reduce((acc, v) => acc + v.sacas, 0),
    totalValor: vendasFiltradas.filter((v) => v.status === 'ativa').reduce((acc, v) => acc + v.valor_total, 0),
    totalRegistros: vendasFiltradas.length
  }
  const valorMedioPorSaca = resumoVendas.totalSacas > 0 ? Number((resumoVendas.totalValor / resumoVendas.totalSacas).toFixed(4)) : 0

  function toggleProdutorExcluido(id: string) {
    setProdutoresExcluidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function salvarConfigExclusaoProdutores() {
    const key = `estoque_excluir_produtores_${userId}`
    localStorage.setItem(key, JSON.stringify(produtoresExcluidos))
    setProdutoresExcluidosSalvos(produtoresExcluidos)
    onNotify('success', 'Configuracao de exclusao de produtores salva.')
  }

  function exportarRelatorioCsv() {
    const cab = ['tipo', 'data', 'produtor', 'armazem', 'sacas', 'valor_rs', 'status', 'motivo']
    const vendasRows = vendasFiltradas.map((v) => ['venda', v.data, nomeProdutor.get(v.produtor_id) ?? v.produtor_id, nomeArmazem.get(v.armazem_cliente_id) ?? v.armazem_cliente_id, v.sacas.toFixed(2), v.valor_total.toFixed(2), v.status, ''])
    const movRows = movimentosFiltrados.map((m) => ['movimento', m.created_at.slice(0, 10), nomeArmazem.get(m.armazem_id) ?? m.armazem_id, m.sacas.toFixed(2), '', m.tipo, m.motivo ?? ''])
    const csv = [cab, ...vendasRows, ...movRows].map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'relatorio-armazenagem-vendas.csv'
    a.click()
    URL.revokeObjectURL(url)
    onNotify('success', 'Relatorio CSV de armazenagem/vendas gerado.')
  }

  function exportarRelatorioPdf() {
    const doc = new jsPDF()
    let y = 14
    doc.setFontSize(16)
    doc.text('RELATORIO DE ARMAZENAGEM E VENDAS', 14, y)
    y += 8
    doc.setFontSize(11)
    doc.text(`Periodo: ${filtroInicio} ate ${filtroFim}`, 14, y)
    y += 6
    doc.text(`Total vendido: ${formatPtBrNumber(resumoVendas.totalSacas)} sacas | R$ ${formatPtBrNumber(resumoVendas.totalValor)}`, 14, y)
    y += 6
    doc.text(`Valor medio por saca: R$ ${formatPtBrNumber(valorMedioPorSaca)}`, 14, y)
    y += 6
    doc.text(`Estoque total (considerando exclusoes): ${formatPtBrNumber(totalEstoqueComExclusoes)} sacas`, 14, y)
    y += 8
    doc.setFontSize(12)
    doc.text('Saldo por armazem', 14, y)
    y += 6
    doc.setFontSize(10)
    for (const s of saldoPorArmazem) {
      doc.text(`${s.armazem}: ${formatPtBrNumber(s.saldo)} sacas`, 14, y)
      y += 5
      if (y > 280) { doc.addPage(); y = 14 }
    }
    y += 4
    doc.setFontSize(12)
    doc.text('Vendas no periodo', 14, y)
    y += 6
    doc.setFontSize(10)
    for (const v of vendasFiltradas) {
      const linha = `${v.data} | Produtor: ${nomeProdutor.get(v.produtor_id) ?? v.produtor_id} | ${nomeArmazem.get(v.armazem_cliente_id) ?? v.armazem_cliente_id} | ${formatPtBrNumber(v.sacas)} sacas | R$ ${formatPtBrNumber(v.valor_total)} | ${v.status}`
      const partes = doc.splitTextToSize(linha, 180)
      doc.text(partes, 14, y)
      y += partes.length * 5
      if (y > 280) { doc.addPage(); y = 14 }
    }
    doc.save('relatorio-armazenagem-vendas.pdf')
    onNotify('success', 'Relatorio PDF de armazenagem/vendas gerado.')
  }

  return (
    <section className="panel">
      <h2>Armazenagem e Vendas</h2>
      <div className="kpis">
        <article><span>Total vendido (sacas)</span><strong>{formatPtBrNumber(resumoVendas.totalSacas)}</strong></article>
        <article><span>Total de vendas (R$)</span><strong>{formatPtBrNumber(resumoVendas.totalValor)}</strong></article>
        <article><span>Valor medio por saca (R$)</span><strong>{formatPtBrNumber(valorMedioPorSaca)}</strong></article>
        <article><span>Registros no periodo</span><strong>{resumoVendas.totalRegistros}</strong></article>
      </div>
      <h3>Exclusao de produtor da somatoria de estoque</h3>
      <div className="grid">
        {produtores.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={produtoresExcluidos.includes(p.id)}
              onChange={() => toggleProdutorExcluido(p.id)}
            />{' '}
            Excluir {p.nome}
          </label>
        ))}
      </div>
      <div className="actions">
        <button onClick={salvarConfigExclusaoProdutores}>Salvar configuracao</button>
      </div>
      {JSON.stringify(produtoresExcluidos) !== JSON.stringify(produtoresExcluidosSalvos) && (
        <p className="warning">Voce alterou a selecao. Clique em "Salvar configuracao" para manter no proximo acesso.</p>
      )}
      <p className="info">Estoque total considerando exclusoes: {formatPtBrNumber(totalEstoqueComExclusoes)} sacas</p>

      <h3>Nova venda de grao</h3>
      <div className="grid">
        <input type="date" value={vData} onChange={(e) => setVData(e.target.value)} />
        <SelectFromList label="Produtor da venda" value={vProdutor} onChange={setVProdutor} items={produtores} />
        <SelectFromList label="Armazem cliente" value={vArmazem} onChange={setVArmazem} items={armazens} />
        <input placeholder="Sacas" value={vSacas} onChange={(e) => setVSacas(e.target.value)} />
        <input placeholder="Valor por saca (R$)" value={vValorSaca} onChange={(e) => setVValorSaca(e.target.value)} />
      </div>
      <div className="kpis">
        <article><span>Saldo disponivel do produtor (sacas)</span><strong>{formatPtBrNumber(saldoDisponivelProdutor)}</strong></article>
        <article><span>Saldo restante apos venda (sacas)</span><strong>{formatPtBrNumber(saldoRestanteVenda)}</strong></article>
        <article><span>Valor total da venda (R$)</span><strong>{formatPtBrNumber((Number.isFinite(sacasSolicitadas) ? sacasSolicitadas : 0) * (Number.isFinite(valorPorSacaAtual) ? valorPorSacaAtual : 0))}</strong></article>
      </div>
      <button onClick={() => void salvarVenda()}>Salvar venda</button>

      <h3>Ajuste manual de estoque</h3>
      <div className="grid">
        <SelectFromList label="Armazem" value={ajArmazem} onChange={setAjArmazem} items={armazens} />
        <select value={ajTipo} onChange={(e) => setAjTipo(e.target.value as 'entrada' | 'saida')}>
          <option value="entrada">Entrada</option>
          <option value="saida">Saida</option>
        </select>
        <input placeholder="Sacas" value={ajSacas} onChange={(e) => setAjSacas(e.target.value)} />
        <input placeholder="Motivo obrigatorio" value={ajMotivo} onChange={(e) => setAjMotivo(e.target.value)} />
      </div>
      <button onClick={() => void aplicarAjusteManual()}>Aplicar ajuste</button>

      <h3>Saldo por armazem (sacas)</h3>
      <ul>
        {saldoPorArmazem.map((s) => (
          <li key={s.armazem}>{s.armazem}: {formatPtBrNumber(s.saldo)} sacas</li>
        ))}
      </ul>

      <h3>Relatorios (mes atual por padrao)</h3>
      <div className="grid">
        <input type="date" value={filtroInicio} onChange={(e) => setFiltroInicio(e.target.value)} />
        <input type="date" value={filtroFim} onChange={(e) => setFiltroFim(e.target.value)} />
      </div>
      <div className="actions">
        <button onClick={exportarRelatorioCsv}>Exportar CSV</button>
        <button onClick={exportarRelatorioPdf}>Exportar PDF</button>
      </div>

      <h3>Vendas no periodo</h3>
      <ul>
        {vendasFiltradas.map((v) => (
          <li key={v.id}>
            {v.data} | Produtor: {nomeProdutor.get(v.produtor_id) ?? v.produtor_id} | {nomeArmazem.get(v.armazem_cliente_id) ?? v.armazem_cliente_id} | {formatPtBrNumber(v.sacas)} sacas | R$ {formatPtBrNumber(v.valor_total)} | {v.status}
            {v.status === 'ativa' && <button onClick={() => void cancelarVenda(v)}>Cancelar</button>}
          </li>
        ))}
      </ul>

      <h3>Movimentacoes de estoque no periodo</h3>
      <ul>
        {movimentosFiltrados.map((m) => (
          <li key={m.id}>
            {m.created_at.slice(0, 10)} | {nomeArmazem.get(m.armazem_id) ?? m.armazem_id} | {m.tipo} | {formatPtBrNumber(m.sacas)} sacas | {m.origem}{m.motivo ? ` | motivo: ${m.motivo}` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Frete({ refreshTick, ownerEmail, onNotify }: { refreshTick: number; ownerEmail: string; onNotify: (type: NoticeType, message: string) => void }) {
  const [cargas, setCargas] = useState<Carga[]>([])
  const [caminhoes, setCaminhoes] = useState<BaseEntity[]>([])
  const [propriedades, setPropriedades] = useState<BaseEntity[]>([])
  const [caminhaoId, setCaminhaoId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [usarCalculoFrete, setUsarCalculoFrete] = useState(false)
  const [valorPorSaca, setValorPorSaca] = useState('')

  useEffect(() => {
    void Promise.all([db.cargas.toArray(), db.caminhoes.toArray(), db.propriedades.toArray()]).then(([cs, cms, props]) => {
      setCargas(cs)
      setCaminhoes(cms)
      setPropriedades(props)
    })
  }, [refreshTick])

  const placaPorId = new Map(caminhoes.map((c) => [c.id, c.nome]))
  const filtradas = cargas.filter((c) => {
    if (caminhaoId && c.placa !== caminhaoId) return false
    if (dataInicio && c.data < dataInicio) return false
    if (dataFim && c.data > dataFim) return false
    return true
  })

  const totalViagens = filtradas.length
  const totalKgBruto = filtradas.reduce((acc, c) => acc + c.peso_bruto_kg, 0)
  const totalSacas = filtradas.reduce((acc, c) => acc + c.sacas, 0)
  const valorSacaNum = parsePtBrNumber(valorPorSaca)
  const totalFrete = usarCalculoFrete && Number.isFinite(valorSacaNum) ? totalSacas * valorSacaNum : 0

  function exportarCsv() {
    const cab = usarCalculoFrete
      ? ['data', 'placa', 'peso_bruto_kg', 'sacas', 'valor_frete_rs']
      : ['data', 'placa', 'peso_bruto_kg', 'sacas']
    const linhas = filtradas.map((c) => [
      c.data,
      placaPorId.get(c.placa) ?? c.placa,
      c.peso_bruto_kg.toFixed(2),
      c.sacas.toFixed(2),
      ...(usarCalculoFrete && Number.isFinite(valorSacaNum) ? [(c.sacas * valorSacaNum).toFixed(2)] : [])
    ])
    const csv = [cab, ...linhas].map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'relatorio-frete.csv'
    a.click()
    URL.revokeObjectURL(url)
    onNotify('success', 'Relatorio CSV gerado com sucesso.')
  }

  function exportarPdf() {
    const doc = new jsPDF()
    const placaSelecionada = caminhaoId ? (placaPorId.get(caminhaoId) ?? caminhaoId) : 'Todos'
    const fazendaNome = propriedades.length > 0 ? propriedades[0].nome : 'Fazenda nao informada'
    let y = 14
    const dataEmissao = new Date().toLocaleString('pt-BR')
    doc.setFontSize(17)
    doc.text('RELATORIO DE FRETE', 14, y)
    y += 8
    doc.setFontSize(11)
    doc.text('Documento de conferencia para transportador e contratante', 14, y)
    y += 6
    doc.text(`Emitido em: ${dataEmissao}`, 14, y)
    y += 6
    doc.text(`Fazenda: ${fazendaNome}`, 14, y)
    y += 6
    doc.text(`Responsavel: ${ownerEmail}`, 14, y)
    y += 6
    doc.text(`Caminhao (placa): ${placaSelecionada}`, 14, y)
    y += 6
    doc.text(`Periodo: ${dataInicio || '-'} ate ${dataFim || '-'}`, 14, y)
    y += 6
    doc.setDrawColor(140, 160, 150)
    doc.line(14, y, 196, y)
    y += 7

    doc.setFontSize(13)
    doc.text('Resumo do Frete', 14, y)
    y += 7
    doc.setFontSize(11)
    doc.text(`Total de viagens: ${totalViagens}`, 14, y)
    y += 6
    doc.text(`Peso bruto total transportado: ${formatPtBrNumber(totalKgBruto)} kg`, 14, y)
    y += 6
    doc.text(`Total em sacas: ${formatPtBrNumber(totalSacas)} sacas`, 14, y)
    y += 8
    if (usarCalculoFrete && Number.isFinite(valorSacaNum)) {
      doc.text(`Valor por saca: R$ ${formatPtBrNumber(valorSacaNum)}`, 14, y)
      y += 6
      doc.text(`Valor total do frete: R$ ${formatPtBrNumber(totalFrete)}`, 14, y)
      y += 6
    }
    doc.setFontSize(10)
    doc.text('Observacao: o peso usado para frete neste relatorio e o PESO BRUTO.', 14, y)
    y += 10

    doc.setFontSize(12)
    doc.text('Detalhamento das Viagens', 14, y)
    y += 6
    doc.setFontSize(10)

    if (filtradas.length === 0) {
      doc.text('Nenhum registro encontrado.', 14, y)
    } else {
      for (const c of filtradas) {
        const linha = `${c.data} | ${placaPorId.get(c.placa) ?? c.placa} | ${formatPtBrNumber(c.peso_bruto_kg)} kg bruto | ${formatPtBrNumber(c.sacas)} sacas`
        const linhaFrete = usarCalculoFrete && Number.isFinite(valorSacaNum)
          ? `${linha} | frete R$ ${formatPtBrNumber(c.sacas * valorSacaNum)}`
          : linha
        const partes = doc.splitTextToSize(linhaFrete, 180)
        doc.text(partes, 14, y)
        y += partes.length * 5
        if (y > 280) {
          doc.addPage()
          y = 14
        }
      }
    }

    if (y > 250) {
      doc.addPage()
      y = 14
    } else {
      y += 12
    }

    doc.setDrawColor(140, 160, 150)
    doc.line(14, y, 196, y)
    y += 8
    doc.setFontSize(11)
    doc.text('Conferencia e Assinatura', 14, y)
    y += 8
    doc.setFontSize(10)
    doc.text('Responsavel pelo frete: _________________________________', 14, y)
    y += 10
    doc.text('Contratante / Fazenda: ___________________________________', 14, y)
    y += 10
    doc.text('Data da conferencia: ____/____/________', 14, y)

    doc.save('relatorio-frete.pdf')
    onNotify('success', 'Relatorio PDF gerado com sucesso.')
  }

  return (
    <section className="panel">
      <h2>Relatorio de Frete por Caminhao</h2>
      <div className="grid frete-filtros">
        <SelectFromList label="Caminhao" value={caminhaoId} onChange={setCaminhaoId} items={caminhoes} />
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
      </div>
      <div className="row frete-calc">
        <label>
          <input type="checkbox" checked={usarCalculoFrete} onChange={(e) => setUsarCalculoFrete(e.target.checked)} /> Calcular frete
        </label>
        {usarCalculoFrete && (
          <input
            placeholder="Valor por saca (R$)"
            value={valorPorSaca}
            onChange={(e) => setValorPorSaca(e.target.value)}
          />
        )}
      </div>
      <div className="kpis">
        <article><span>Total de viagens</span><strong>{totalViagens}</strong></article>
        <article><span>Total bruto (kg)</span><strong>{formatPtBrNumber(totalKgBruto)}</strong></article>
        <article><span>Total em sacas</span><strong>{formatPtBrNumber(totalSacas)}</strong></article>
        {usarCalculoFrete && Number.isFinite(valorSacaNum) && (
          <article><span>Total frete (R$)</span><strong>{formatPtBrNumber(totalFrete)}</strong></article>
        )}
      </div>
      <div className="actions frete-actions">
        <button onClick={exportarCsv}>Exportar CSV</button>
        <button onClick={exportarPdf}>Exportar PDF</button>
      </div>
      <ul className="frete-lista">
        {filtradas.map((c) => (
          <li key={c.id}>
            {c.data} | {placaPorId.get(c.placa) ?? c.placa} | {formatPtBrNumber(c.peso_bruto_kg)} kg bruto | {formatPtBrNumber(c.sacas)} sacas
            {usarCalculoFrete && Number.isFinite(valorSacaNum) ? ` | frete R$ ${formatPtBrNumber(c.sacas * valorSacaNum)}` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Historico({ userId, refreshTick, onSaved, onNotify }: { userId: string; refreshTick: number; onSaved: () => void; onNotify: (type: NoticeType, message: string) => void }) {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [cargas, setCargas] = useState<Carga[]>([])
  const [refs, setRefs] = useState<{[k: string]: BaseEntity[] | Talhao[]}>({})
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [editId, setEditId] = useState('')
  const [editData, setEditData] = useState('')
  const [editPlaca, setEditPlaca] = useState('')
  const [editBruto, setEditBruto] = useState('')
  const [editLiquido, setEditLiquido] = useState('')
  const [editPropriedadeId, setEditPropriedadeId] = useState('')
  const [editTalhaoId, setEditTalhaoId] = useState('')
  const [editProdutorId, setEditProdutorId] = useState('')
  const [editVariedadeId, setEditVariedadeId] = useState('')
  const [editArmazemId, setEditArmazemId] = useState('')
  const [editErrors, setEditErrors] = useState<string[]>([])

  useEffect(() => {
    void Promise.all([
      db.cargas.toArray(),
      db.propriedades.toArray(),
      db.talhoes.toArray(),
      db.produtores.toArray(),
      db.variedades.toArray(),
      db.armazens.toArray(),
      db.caminhoes.toArray(),
      db.pending_ops.toArray()
    ]).then(([cs, propriedades, talhoes, produtores, variedades, armazens, caminhoes, ops]) => {
      setCargas(cs)
      setRefs({ propriedades, talhoes, produtores, variedades, armazens, caminhoes })
      setPendingIds(new Set(ops.map((o) => o.record_id)))
    })
  }, [refreshTick])

  const filtered = cargas.filter((c) => {
    if (filters.dataInicio && c.data < filters.dataInicio) return false
    if (filters.dataFim && c.data > filters.dataFim) return false
    if (filters.produtorId && c.produtor_id !== filters.produtorId) return false
    if (filters.propriedadeId && c.propriedade_id !== filters.propriedadeId) return false
    if (filters.talhaoId && c.talhao_id !== filters.talhaoId) return false
    if (filters.variedadeId && c.variedade_id !== filters.variedadeId) return false
    if (filters.armazemId && c.armazem_id !== filters.armazemId) return false
    if (filters.placa && !c.placa.toLowerCase().includes(filters.placa.toLowerCase())) return false
    return true
  })

  const nomePropriedade = new Map(((refs.propriedades as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeTalhao = new Map(((refs.talhoes as Talhao[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeProdutor = new Map(((refs.produtores as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeVariedade = new Map(((refs.variedades as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeArmazem = new Map(((refs.armazens as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeCaminhao = new Map(((refs.caminhoes as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))

  const statusCarga: Record<Carga['sync_status'], string> = {
    local_only: 'Somente neste aparelho',
    pending_sync: 'Pendente de sincronizacao',
    synced: 'Sincronizado',
    sync_error: 'Erro de sincronizacao'
  }

  function iniciarEdicao(c: Carga) {
    setEditId(c.id)
    setEditData(c.data)
    setEditPlaca(c.placa)
    setEditBruto(String(c.peso_bruto_kg))
    setEditLiquido(String(c.peso_liquido_kg))
    setEditPropriedadeId(c.propriedade_id)
    setEditTalhaoId(c.talhao_id)
    setEditProdutorId(c.produtor_id)
    setEditVariedadeId(c.variedade_id)
    setEditArmazemId(c.armazem_id)
    setEditErrors([])
  }

  async function salvarEdicao() {
    if (!editId) return
    const erros = validarCarga({
      data: editData,
      placa: editPlaca,
      propriedadeId: editPropriedadeId,
      talhaoId: editTalhaoId,
      produtorId: editProdutorId,
      variedadeId: editVariedadeId,
      armazemId: editArmazemId,
      pesoBruto: editBruto,
      pesoLiquido: editLiquido
    })
    setEditErrors(erros)
    if (erros.length > 0) {
      onNotify('error', 'Nao foi possivel atualizar. Verifique os campos.')
      return
    }

    const original = await db.cargas.get(editId)
    if (!original) return
    const sacasAntigas = original.sacas
    const armazemAntigo = original.armazem_id
    const updated: Carga = {
      ...original,
      data: editData,
      placa: editPlaca.toUpperCase(),
      propriedade_id: editPropriedadeId,
      talhao_id: editTalhaoId,
      produtor_id: editProdutorId,
      variedade_id: editVariedadeId,
      armazem_id: editArmazemId,
      peso_bruto_kg: parsePtBrNumber(editBruto),
      peso_liquido_kg: parsePtBrNumber(editLiquido),
      sacas: toSacas(parsePtBrNumber(editLiquido)),
      updated_at: nowIso(),
      updated_by: userId,
      sync_status: 'pending_sync'
    }
    await db.cargas.put(updated)
    await queueOp('cargas', updated.id, updated)
    if (armazemAntigo === updated.armazem_id) {
      const delta = updated.sacas - sacasAntigas
      if (delta !== 0) {
        await aplicarSaldoEstoque(userId, updated.armazem_id, delta)
        await registrarMovimentoEstoque({
          userId,
          tipo: 'ajuste',
          armazemId: updated.armazem_id,
          sacas: Math.abs(delta),
          origem: 'manual',
          referenciaId: updated.id,
          motivo: 'Ajuste automatico por edicao de carga'
        })
      }
    } else {
      await aplicarSaldoEstoque(userId, armazemAntigo, -sacasAntigas)
      await aplicarSaldoEstoque(userId, updated.armazem_id, updated.sacas)
      await registrarMovimentoEstoque({
        userId,
        tipo: 'ajuste',
        armazemId: armazemAntigo,
        sacas: sacasAntigas,
        origem: 'manual',
        referenciaId: updated.id,
        motivo: 'Transferencia de armazem por edicao de carga'
      })
      await registrarMovimentoEstoque({
        userId,
        tipo: 'ajuste',
        armazemId: updated.armazem_id,
        sacas: updated.sacas,
        origem: 'manual',
        referenciaId: updated.id,
        motivo: 'Transferencia de armazem por edicao de carga'
      })
    }
    await runSync()
    setEditId('')
    onSaved()
    onNotify('success', 'Carga atualizada com sucesso.')
  }

  async function apagarCarga(cargaId: string) {
    const confirmar = window.confirm('Tem certeza que deseja apagar esta carga? Essa acao nao pode ser desfeita.')
    if (!confirmar) return
    const existing = await db.cargas.get(cargaId)
    await db.cargas.delete(cargaId)
    await db.pending_ops.where('record_id').equals(cargaId).delete()
    await queueDeleteOp('cargas', cargaId)
    if (existing) {
      await aplicarSaldoEstoque(userId, existing.armazem_id, -existing.sacas)
      await registrarMovimentoEstoque({
        userId,
        tipo: 'ajuste',
        armazemId: existing.armazem_id,
        sacas: existing.sacas,
        origem: 'manual',
        referenciaId: existing.id,
        motivo: 'Ajuste automatico por exclusao de carga'
      })
    }
    if (editId === cargaId) setEditId('')
    onSaved()
    onNotify('success', 'Carga apagada com sucesso.')
  }

  return (
    <section className="panel">
      <h2>Historico e Filtros</h2>
      <div className="grid">
        <input type="date" value={filters.dataInicio ?? ''} onChange={(e) => setFilters((f) => ({ ...f, dataInicio: e.target.value }))} />
        <input type="date" value={filters.dataFim ?? ''} onChange={(e) => setFilters((f) => ({ ...f, dataFim: e.target.value }))} />
        <input placeholder="Placa" value={filters.placa ?? ''} onChange={(e) => setFilters((f) => ({ ...f, placa: e.target.value }))} />
        <SelectFromList label="Produtor" value={filters.produtorId ?? ''} onChange={(v) => setFilters((f) => ({ ...f, produtorId: v || undefined }))} items={(refs.produtores as BaseEntity[]) ?? []} />
        <SelectFromList label="Propriedade" value={filters.propriedadeId ?? ''} onChange={(v) => setFilters((f) => ({ ...f, propriedadeId: v || undefined }))} items={(refs.propriedades as BaseEntity[]) ?? []} />
        <SelectFromList label="Talhao" value={filters.talhaoId ?? ''} onChange={(v) => setFilters((f) => ({ ...f, talhaoId: v || undefined }))} items={(refs.talhoes as Talhao[]) ?? []} />
        <SelectFromList label="Variedade" value={filters.variedadeId ?? ''} onChange={(v) => setFilters((f) => ({ ...f, variedadeId: v || undefined }))} items={(refs.variedades as BaseEntity[]) ?? []} />
        <SelectFromList label="Armazem" value={filters.armazemId ?? ''} onChange={(v) => setFilters((f) => ({ ...f, armazemId: v || undefined }))} items={(refs.armazens as BaseEntity[]) ?? []} />
      </div>
      <p>{filtered.length} registros</p>
      {editId && (
        <section className="panel">
          <h3>Editando carga</h3>
          <div className="grid">
            <input type="date" value={editData} onChange={(e) => setEditData(e.target.value)} />
            <input placeholder="Placa" value={editPlaca} onChange={(e) => setEditPlaca(e.target.value)} />
            <SelectFromList label="Propriedade" value={editPropriedadeId} onChange={setEditPropriedadeId} items={(refs.propriedades as BaseEntity[]) ?? []} />
            <SelectFromList label="Talhao" value={editTalhaoId} onChange={setEditTalhaoId} items={(refs.talhoes as Talhao[]) ?? []} />
            <SelectFromList label="Produtor" value={editProdutorId} onChange={setEditProdutorId} items={(refs.produtores as BaseEntity[]) ?? []} />
            <SelectFromList label="Variedade" value={editVariedadeId} onChange={setEditVariedadeId} items={(refs.variedades as BaseEntity[]) ?? []} />
            <SelectFromList label="Armazem" value={editArmazemId} onChange={setEditArmazemId} items={(refs.armazens as BaseEntity[]) ?? []} />
            <input placeholder="Peso bruto (kg) ex: 21.000" value={editBruto} onChange={(e) => setEditBruto(e.target.value)} />
            <input placeholder="Peso liquido (kg) ex: 20.500" value={editLiquido} onChange={(e) => setEditLiquido(e.target.value)} />
          </div>
          {editErrors.length > 0 && <ul className="error-list">{editErrors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="actions">
            <button onClick={() => void salvarEdicao()}>Salvar alteracoes</button>
            <button onClick={() => setEditId('')}>Cancelar</button>
          </div>
        </section>
      )}
      <ul>
        {filtered.map((c) => (
          <li key={c.id}>
            {c.data} | Placa: {placaLegivel(c.placa, nomeCaminhao.get(c.placa))} | Propriedade: {nomePropriedade.get(c.propriedade_id) ?? '-'} | Talhao: {nomeTalhao.get(c.talhao_id) ?? '-'} | Produtor: {nomeProdutor.get(c.produtor_id) ?? '-'} | Variedade: {nomeVariedade.get(c.variedade_id) ?? '-'} | Armazem: {nomeArmazem.get(c.armazem_id) ?? '-'} | Liquido: {formatPtBrNumber(c.peso_liquido_kg)} kg | Bruto: {formatPtBrNumber(c.peso_bruto_kg)} kg | Status: {pendingIds.has(c.id) ? statusCarga.pending_sync : statusCarga.synced}
            <button onClick={() => iniciarEdicao(c)}>Editar</button>
            <button onClick={() => void apagarCarga(c.id)}>Apagar</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

async function bootstrapDemoData() {
  const count = await db.propriedades.count()
  if (count > 0) return
  const user = 'seed'
  const records = ['Sede', 'Fazenda Norte']
  for (const nome of records) {
    const rec = baseRecord(nome, user)
    await db.propriedades.put(rec)
    await queueOp('propriedades', rec.id, rec)
  }
}

export default App
