import { useCallback, useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { db } from './core/db'
import { hasSupabase, supabase } from './core/supabase'
import { installSyncListeners, runSync } from './core/sync'
import { produtividadeSacasPorHa, toSacas } from './core/metrics'
import { dividirPesoBrutoProporcional, produtividadeVariedadeNoTalhao as calcProdutividadeVariedadeNoTalhao, totalSacasDivididas } from './core/analises'
import { calcularFechamentoFrete, calcularValorDiesel } from './core/frete'
import { validarCarga } from './core/validation'
import { formatDateBr, formatDateTimeBr, formatDateTimeBrWithZone, formatPtBrNumber, localDateYmd, localYmdFromValue, makeId, nowIso, parsePtBrNumber } from './core/utils'
import { valorReaisPorExtenso } from './core/valorExtenso'
import type { AreaVariedadeTalhao, AuditLog, BaseEntity, Carga, EstoqueArmazem, FeedbackItem, Filters, FreteLancamento, MovimentoEstoque, PilotParticipant, Safra, Talhao, UserRole, VendaGrao } from './core/types'

type Tab = 'dashboard' | 'cargas' | 'historico' | 'cadastros' | 'analises' | 'frete' | 'vendas' | 'feedback' | 'config' | 'operacao'

type UserSession = { id: string; email: string }
type NoticeType = 'success' | 'error'
type Notice = { type: NoticeType; message: string } | null
type PilotConfig = { ativo: boolean; inicio: string; fim: string; ownerEmail: string }

const initialFilters: Filters = {}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function placaLegivel(rawPlaca: string, nomeCaminhao?: string) {
  if (nomeCaminhao) return nomeCaminhao
  if (isUuidLike(rawPlaca)) return 'Caminhao sem placa cadastrada'
  return rawPlaca
}

function statusSyncLegivel(syncStatus: Carga['sync_status'], pending: boolean) {
  if (pending) return 'Pendente de sincronizacao'
  if (syncStatus === 'synced') return 'Sincronizado'
  if (syncStatus === 'sync_error') return 'Erro de sincronizacao'
  if (syncStatus === 'local_only') return 'Somente neste aparelho'
  return 'Pendente de sincronizacao'
}

function isMovimentoAutomaticoDeCarga(m: MovimentoEstoque) {
  const motivo = (m.motivo ?? '').toLowerCase()
  return motivo.includes('ajuste automatico por edicao de carga')
    || motivo.includes('transferencia de armazem por edicao de carga')
    || motivo.includes('ajuste automatico por exclusao de carga')
}

function isAjusteManualValido(m: MovimentoEstoque) {
  if (m.origem !== 'manual') return false
  const motivo = (m.motivo ?? '').trim().toLowerCase()
  return motivo.startsWith('ajuste manual:')
}

async function registrarAuditoria(actorUserId: string, action: string, details?: string) {
  const row: AuditLog = {
    id: makeId(),
    action,
    actor_user_id: actorUserId,
    details,
    created_at: nowIso()
  }
  await db.audit_logs.put(row)
}

function buildDefaultPilotConfig(): PilotConfig {
  return {
    ativo: true,
    inicio: localDateYmd(),
    fim: localDateYmd(new Date(new Date().setDate(new Date().getDate() + 45))),
    ownerEmail: ''
  }
}

function loadPilotConfigFromStorage(defaultOwnerEmail = ''): PilotConfig {
  const fallback = { ...buildDefaultPilotConfig(), ownerEmail: defaultOwnerEmail }
  const raw = localStorage.getItem('pilot_config')
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<PilotConfig>
    return {
      ativo: typeof parsed.ativo === 'boolean' ? parsed.ativo : fallback.ativo,
      inicio: parsed.inicio || fallback.inicio,
      fim: parsed.fim || fallback.fim,
      ownerEmail: parsed.ownerEmail || fallback.ownerEmail
    }
  } catch {
    return fallback
  }
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
  const [userRole, setUserRole] = useState<UserRole>('proprietario')
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [pilotConfig, setPilotConfig] = useState<PilotConfig>(() => loadPilotConfigFromStorage())

  const isOwner = useCallback((emailValue: string) => {
    const owner = pilotConfig.ownerEmail.trim().toLowerCase()
    const current = emailValue.trim().toLowerCase()
    return !owner || owner === current
  }, [pilotConfig.ownerEmail])

  const resolveRole = useCallback((userId: string, emailValue: string): UserRole => {
    const roleKey = `user_role_${userId}`
    const savedRole = localStorage.getItem(roleKey) as UserRole | null
    if (!savedRole) return isOwner(emailValue) ? 'proprietario' : 'operador'
    if (!isOwner(emailValue) && savedRole === 'proprietario') return 'operador'
    return savedRole
  }, [isOwner])

  const validarConvite = useCallback(async (emailValue: string) => {
    if (!pilotConfig.ativo) return true
    if (isOwner(emailValue)) return true
    const normalized = emailValue.trim().toLowerCase()
    const localInvite = await db.pilot_participantes.where('email').equals(normalized).first()
    if (localInvite?.status === 'ativo') return true

    if (hasSupabase && supabase && navigator.onLine) {
      const { data, error } = await supabase
        .from('pilot_participantes')
        .select('*')
        .eq('email', normalized)
        .eq('status', 'ativo')
        .limit(1)

      if (!error && data && data.length > 0) {
        const cloudInvite = { ...(data[0] as PilotParticipant), sync_status: 'synced' as const }
        await db.pilot_participantes.put(cloudInvite)
        return true
      }
    }

    return false
  }, [isOwner, pilotConfig.ativo])

  useEffect(() => {
    installSyncListeners()
    void runSync()
    if (!hasSupabase) void bootstrapDemoData()
  }, [])

  useEffect(() => {
    const onSyncComplete = () => setRefreshTick((v) => v + 1)
    window.addEventListener('colheita-sync-complete', onSyncComplete)
    return () => window.removeEventListener('colheita-sync-complete', onSyncComplete)
  }, [])

  useEffect(() => {
    const onSyncError = (evt: Event) => {
      const detail = (evt as CustomEvent<{ message?: string }>).detail
      if (detail?.message) {
        setSyncDebug(detail.message)
        localStorage.setItem('last_sync_error', detail.message)
      }
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

  const limparPendenciasLegadas = useCallback(async (userId: string) => {
    const ops = await db.pending_ops.toArray()
    for (const op of ops) {
      if (op.op !== 'upsert' || !op.payload || typeof op.payload !== 'object') continue
      const payload = op.payload as Record<string, unknown>
      const createdBy = String(payload.created_by ?? '')
      const updatedBy = String(payload.updated_by ?? '')
      const legado = createdBy === 'seed' || createdBy.startsWith('local-') || updatedBy === 'seed' || updatedBy.startsWith('local-')
      if (!legado) continue
      const fixed = { ...payload, created_by: userId, updated_by: userId }
      await db.pending_ops.update(op.id, { payload: fixed, updated_at: nowIso(), retries: 0, error: undefined })
    }
  }, [])

  useEffect(() => {
    if (!hasSupabase || !supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s?.user) {
        const sess = { id: s.user.id, email: s.user.email ?? 'usuario' }
        if (!pilotConfig.ownerEmail && sess.email) {
          const cfg = { ...pilotConfig, ownerEmail: sess.email }
          setPilotConfig(cfg)
          localStorage.setItem('pilot_config', JSON.stringify(cfg))
        }
        setSession(sess)
        void registrarAuditoria(sess.id, 'sessao_restaurada', 'Sessao Supabase restaurada')
        setUserRole(resolveRole(sess.id, sess.email))
        const onboardKey = `onboarding_done_${sess.id}`
        if (!localStorage.getItem(onboardKey)) setOnboardingOpen(true)
        void limparPendenciasLegadas(sess.id)
        void runSync()
        void validarConvite(sess.email).then((ok) => {
          if (!ok) {
            setSession(null)
            setAuthError('Acesso de piloto restrito. Solicite convite ao administrador.')
          }
        })
      }
    })
  }, [limparPendenciasLegadas, pilotConfig, resolveRole, validarConvite])

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
      if (!pilotConfig.ownerEmail && data.user.email) {
        const cfg = { ...pilotConfig, ownerEmail: data.user.email }
        setPilotConfig(cfg)
        localStorage.setItem('pilot_config', JSON.stringify(cfg))
      }
      const invited = await validarConvite(data.user.email ?? email)
      if (!invited) {
        await supabase.auth.signOut()
        setAuthError('Acesso de piloto restrito. Seu email ainda nao foi convidado.')
        return
      }
      setSession({ id: data.user.id, email: data.user.email ?? email })
      await registrarAuditoria(data.user.id, 'login_sucesso', 'Login via Supabase Auth')
      const participante = await db.pilot_participantes.where('email').equals((data.user.email ?? email).toLowerCase()).first()
      if (participante) {
        const updated: PilotParticipant = {
          ...participante,
          ultimo_acesso: nowIso(),
          updated_at: nowIso(),
          updated_by: data.user.id,
          sync_status: 'pending_sync'
        }
        await db.pilot_participantes.put(updated)
        await queueOp('pilot_participantes', updated.id, updated)
      }
      setUserRole(resolveRole(data.user.id, data.user.email ?? email))
      const onboardKey = `onboarding_done_${data.user.id}`
      if (!localStorage.getItem(onboardKey)) setOnboardingOpen(true)
      await limparPendenciasLegadas(data.user.id)
      await runSync()
      return
    }

    if (!email || !password) {
      setAuthError('Informe email e senha.')
      return
    }

    const sess = { id: `local-${email}`, email }
    if (!pilotConfig.ownerEmail) {
      const cfg = { ...pilotConfig, ownerEmail: email }
      setPilotConfig(cfg)
      localStorage.setItem('pilot_config', JSON.stringify(cfg))
    }
    const invited = await validarConvite(email)
    if (!invited) {
      setAuthError('Acesso de piloto restrito. Seu email ainda nao foi convidado.')
      return
    }
    setSession(sess)
    await registrarAuditoria(sess.id, 'login_local', 'Login em modo local sem Supabase')
    setUserRole(resolveRole(sess.id, sess.email))
    const onboardKey = `onboarding_done_${sess.id}`
    if (!localStorage.getItem(onboardKey)) setOnboardingOpen(true)
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
      localStorage.removeItem('last_sync_error')
      await runSync()
      const pendencias = await db.pending_ops.count()
      if (session) {
        const syncAt = nowIso()
        localStorage.setItem(`last_sync_success_${session.id}`, syncAt)
        const participante = await db.pilot_participantes.where('email').equals(session.email.toLowerCase()).first()
        if (participante) {
          const updated: PilotParticipant = {
            ...participante,
            ultimo_sync: syncAt,
            updated_at: syncAt,
            updated_by: session.id,
            sync_status: 'pending_sync'
          }
          await db.pilot_participantes.put(updated)
          await queueOp('pilot_participantes', updated.id, updated)
        }
      }
      if (pendencias > 0) {
        notify('error', `Sincronizacao parcial: ${pendencias} pendencia(s) ainda precisam ser enviadas.`)
      } else {
        notify('success', 'Sincronizacao feita com sucesso.')
      }
    } catch {
      localStorage.setItem('last_sync_error', syncDebug || 'Falha na sincronizacao')
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
          <p className="info">Fase de demonstracao: acesso somente por convite individual.</p>
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
          <p>{session.email} | Perfil: {userRole}</p>
        </div>
        <div className="actions">
          <button onClick={() => void handleSyncClick()}>Sincronizar</button>
          <button onClick={logout}>Sair</button>
        </div>
      </header>

      <nav className="tabs">
        <button onClick={() => setTab('dashboard')} className={tab === 'dashboard' ? 'active' : ''}>Dashboard</button>
        {userRole !== 'leitura' && <button onClick={() => setTab('cargas')} className={tab === 'cargas' ? 'active' : ''}>Nova Carga</button>}
        <button onClick={() => setTab('historico')} className={tab === 'historico' ? 'active' : ''}>Historico</button>
        {userRole !== 'leitura' && <button onClick={() => setTab('cadastros')} className={tab === 'cadastros' ? 'active' : ''}>Cadastros</button>}
        <button onClick={() => setTab('analises')} className={tab === 'analises' ? 'active' : ''}>Analises</button>
        <button onClick={() => setTab('frete')} className={tab === 'frete' ? 'active' : ''}>Frete</button>
        {userRole !== 'leitura' && <button onClick={() => setTab('vendas')} className={tab === 'vendas' ? 'active' : ''}>Armazenagem e Vendas</button>}
        <button onClick={() => setTab('feedback')} className={tab === 'feedback' ? 'active' : ''}>Enviar Feedback</button>
        {userRole === 'proprietario' && <button onClick={() => setTab('operacao')} className={tab === 'operacao' ? 'active' : ''}>Operacao Piloto</button>}
        <button onClick={() => setTab('config')} className={tab === 'config' ? 'active' : ''}>Assistente</button>
      </nav>

      {tab === 'dashboard' && <Dashboard refreshTick={refreshTick} />}
      {tab === 'cargas' && userRole !== 'leitura' && <NovaCarga userId={session.id} refreshTick={refreshTick} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'historico' && <Historico userId={session.id} refreshTick={refreshTick} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'cadastros' && userRole !== 'leitura' && <Cadastros userId={session.id} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'analises' && <Analises refreshTick={refreshTick} userId={session.id} />}
      {tab === 'frete' && <Frete refreshTick={refreshTick} ownerEmail={session.email} userId={session.id} onNotify={notify} />}
      {tab === 'vendas' && userRole !== 'leitura' && <ArmazenagemVendas userId={session.id} refreshTick={refreshTick} onSaved={triggerRefresh} onNotify={notify} />}
      {tab === 'feedback' && <FeedbackPiloto user={session} onNotify={notify} refreshTick={refreshTick} onSaved={triggerRefresh} isOwner={isOwner(session.email)} />}
      {tab === 'operacao' && <OperacaoSaas user={session} onNotify={notify} />}
      {tab === 'config' && <AssistenteConfiguracao onNotify={notify} user={session} onRefresh={triggerRefresh} userRole={userRole} setUserRole={setUserRole} isOwnerUser={isOwner(session.email)} />}
      {onboardingOpen && (
        <OnboardingPiloto
          user={session}
          onClose={() => {
            localStorage.setItem(`onboarding_done_${session.id}`, '1')
            setOnboardingOpen(false)
            notify('success', 'Termo de demonstracao aceito.')
          }}
        />
      )}
    </main>
  )
}

function AssistenteConfiguracao({
  onNotify,
  user,
  onRefresh,
  userRole,
  setUserRole,
  isOwnerUser
}: {
  onNotify: (type: NoticeType, message: string) => void
  user: UserSession
  onRefresh: () => void
  userRole: UserRole
  setUserRole: (role: UserRole) => void
  isOwnerUser: boolean
}) {
  const conectado = hasSupabase
  const [backupInfo, setBackupInfo] = useState('')
  const [lgpdCanal, setLgpdCanal] = useState(() => localStorage.getItem(`lgpd_channel_${user.id}`) || user.email)
  const [retencaoDias, setRetencaoDias] = useState(() => localStorage.getItem(`lgpd_retention_days_${user.id}`) || '730')
  const [syncOpsByTable, setSyncOpsByTable] = useState<Record<string, number>>({})
  const initialPilotConfig = loadPilotConfigFromStorage(user.email)
  const [pilotAtivo, setPilotAtivo] = useState(initialPilotConfig.ativo)
  const [pilotInicio, setPilotInicio] = useState(initialPilotConfig.inicio)
  const [pilotFim, setPilotFim] = useState(initialPilotConfig.fim)
  const [pilotOwnerEmail, setPilotOwnerEmail] = useState(initialPilotConfig.ownerEmail || user.email)
  const lastSyncSuccess = localStorage.getItem(`last_sync_success_${user.id}`) ?? ''

  useEffect(() => {
    void db.pending_ops.toArray().then((ops) => {
      const grouped: Record<string, number> = {}
      for (const op of ops) grouped[op.table] = (grouped[op.table] ?? 0) + 1
      setSyncOpsByTable(grouped)
    })
  }, [user.id])

  function salvarConfigPiloto() {
    const cfg = {
      ativo: pilotAtivo,
      inicio: pilotInicio,
      fim: pilotFim,
      ownerEmail: pilotOwnerEmail.trim().toLowerCase() || user.email
    }
    localStorage.setItem('pilot_config', JSON.stringify(cfg))
    onNotify('success', 'Configuracao do piloto salva com sucesso.')
  }

  function baixarJson(fileName: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function salvarCanalLgpd() {
    const canal = lgpdCanal.trim()
    if (!canal) {
      onNotify('error', 'Informe um canal LGPD valido.')
      return
    }
    localStorage.setItem(`lgpd_channel_${user.id}`, canal)
    localStorage.setItem(`lgpd_retention_days_${user.id}`, retencaoDias)
    onNotify('success', 'Configuracao LGPD salva com sucesso.')
  }

  async function exportarBackup() {
    const [propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao, safras, frete_lancamentos] = await Promise.all([
      db.propriedades.toArray(),
      db.produtores.toArray(),
      db.variedades.toArray(),
      db.armazens.toArray(),
      db.caminhoes.toArray(),
      db.talhoes.toArray(),
      db.cargas.toArray(),
      db.estoque_armazem.toArray(),
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray(),
      db.safras.toArray(),
      db.frete_lancamentos.toArray()
    ])

    const payload = {
      exportado_em: nowIso(),
      versao: 1,
      dados: { propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao, safras, frete_lancamentos }
    }
    const stamp = localDateYmd()
    baixarJson(`backup-colheita-${stamp}.json`, payload)
    setBackupInfo('Backup exportado com sucesso.')
    onNotify('success', 'Backup exportado com sucesso.')
  }

  async function salvarSnapshotSemanal() {
    const [propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao, safras, frete_lancamentos] = await Promise.all([
      db.propriedades.toArray(),
      db.produtores.toArray(),
      db.variedades.toArray(),
      db.armazens.toArray(),
      db.caminhoes.toArray(),
      db.talhoes.toArray(),
      db.cargas.toArray(),
      db.estoque_armazem.toArray(),
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray(),
      db.safras.toArray(),
      db.frete_lancamentos.toArray()
    ])
    const payload = {
      snapshot_em: nowIso(),
      dados: { propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao, safras, frete_lancamentos }
    }
    localStorage.setItem(`weekly_backup_${user.id}`, JSON.stringify(payload))
    localStorage.setItem(`weekly_backup_at_${user.id}`, nowIso())
    onNotify('success', 'Snapshot semanal salvo neste aparelho.')
  }

  async function restaurarSnapshotSemanal() {
    const raw = localStorage.getItem(`weekly_backup_${user.id}`)
    if (!raw) {
      onNotify('error', 'Nenhum snapshot semanal encontrado neste aparelho.')
      return
    }
    const confirmou = window.confirm('Restaurar o snapshot semanal local agora?')
    if (!confirmou) return
    try {
      const payload = JSON.parse(raw) as {
        dados: {
          propriedades: BaseEntity[]
          produtores: BaseEntity[]
          variedades: BaseEntity[]
          armazens: BaseEntity[]
          caminhoes: BaseEntity[]
          talhoes: Talhao[]
          cargas: Carga[]
          estoque_armazem: EstoqueArmazem[]
          movimento_estoque: MovimentoEstoque[]
          venda_grao: VendaGrao[]
          safras?: Safra[]
          frete_lancamentos?: FreteLancamento[]
        }
      }
      await db.propriedades.bulkPut(payload.dados.propriedades ?? [])
      await db.produtores.bulkPut(payload.dados.produtores ?? [])
      await db.variedades.bulkPut(payload.dados.variedades ?? [])
      await db.armazens.bulkPut(payload.dados.armazens ?? [])
      await db.caminhoes.bulkPut(payload.dados.caminhoes ?? [])
      await db.talhoes.bulkPut(payload.dados.talhoes ?? [])
      await db.cargas.bulkPut(payload.dados.cargas ?? [])
      await db.estoque_armazem.bulkPut(payload.dados.estoque_armazem ?? [])
      await db.movimento_estoque.bulkPut(payload.dados.movimento_estoque ?? [])
      await db.venda_grao.bulkPut(payload.dados.venda_grao ?? [])
      await db.safras.bulkPut(payload.dados.safras ?? [])
      await db.frete_lancamentos.bulkPut(payload.dados.frete_lancamentos ?? [])
      onRefresh()
      onNotify('success', 'Snapshot semanal restaurado com sucesso.')
    } catch {
      onNotify('error', 'Falha ao restaurar snapshot semanal.')
    }
  }

  async function coletarDadosDoTitular() {
    const filtrar = <T extends { created_by: string }>(rows: T[]) => rows.filter((r) => r.created_by === user.id)
    const [propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao, safras, frete_lancamentos] = await Promise.all([
      db.propriedades.toArray(),
      db.produtores.toArray(),
      db.variedades.toArray(),
      db.armazens.toArray(),
      db.caminhoes.toArray(),
      db.talhoes.toArray(),
      db.cargas.toArray(),
      db.estoque_armazem.toArray(),
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray(),
      db.safras.toArray(),
      db.frete_lancamentos.toArray()
    ])
    return {
      propriedades: filtrar(propriedades),
      produtores: filtrar(produtores),
      variedades: filtrar(variedades),
      armazens: filtrar(armazens),
      caminhoes: filtrar(caminhoes),
      talhoes: filtrar(talhoes),
      cargas: filtrar(cargas),
      estoque_armazem: filtrar(estoque_armazem),
      movimento_estoque: filtrar(movimento_estoque),
      venda_grao: filtrar(venda_grao),
      safras: filtrar(safras),
      frete_lancamentos: filtrar(frete_lancamentos)
    }
  }

  async function exportarBackupPessoal() {
    const dados = await coletarDadosDoTitular()
    const payload = {
      tipo: 'backup_pessoal',
      titular: { id: user.id, email: user.email },
      exportado_em: nowIso(),
      versao: 1,
      dados
    }
    baixarJson(`backup-pessoal-${localDateYmd()}.json`, payload)
    onNotify('success', 'Backup pessoal exportado com sucesso.')
  }

  async function importarBackupPessoal(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw = await file.text()
      const json = JSON.parse(raw) as {
        titular?: { id?: string; email?: string }
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
          safras?: Safra[]
          frete_lancamentos?: FreteLancamento[]
        }
      }
      if (!json.dados) {
        onNotify('error', 'Arquivo invalido para backup pessoal.')
        return
      }
      if (json.titular?.id && json.titular.id !== user.id) {
        onNotify('error', 'Este backup pertence a outro usuario e nao pode ser importado nesta conta.')
        return
      }

      const preparar = <T extends { id: string; created_by: string; updated_by: string; updated_at: string; sync_status: string }>(rows: T[] | undefined): T[] => {
        if (!rows) return []
        const now = nowIso()
        return rows
          .filter((r) => !json.titular?.id || r.created_by === user.id)
          .map((r) => ({ ...r, created_by: user.id, updated_by: user.id, updated_at: now, sync_status: 'pending_sync' as const }))
      }

      const propriedades = preparar(json.dados.propriedades)
      const produtores = preparar(json.dados.produtores)
      const variedades = preparar(json.dados.variedades)
      const armazens = preparar(json.dados.armazens)
      const caminhoes = preparar(json.dados.caminhoes)
      const talhoes = preparar(json.dados.talhoes)
      const cargas = preparar(json.dados.cargas)
      const estoque = preparar(json.dados.estoque_armazem)
      const movimentos = preparar(json.dados.movimento_estoque)
      const vendas = preparar(json.dados.venda_grao)
      const safras = preparar(json.dados.safras)
      const freteLancamentos = preparar(json.dados.frete_lancamentos)

      await db.propriedades.bulkPut(propriedades)
      await db.produtores.bulkPut(produtores)
      await db.variedades.bulkPut(variedades)
      await db.armazens.bulkPut(armazens)
      await db.caminhoes.bulkPut(caminhoes)
      await db.talhoes.bulkPut(talhoes)
      await db.cargas.bulkPut(cargas)
      await db.estoque_armazem.bulkPut(estoque)
      await db.movimento_estoque.bulkPut(movimentos)
      await db.venda_grao.bulkPut(vendas)
      await db.safras.bulkPut(safras)
      await db.frete_lancamentos.bulkPut(freteLancamentos)

      for (const row of propriedades) await queueOp('propriedades', row.id, row)
      for (const row of produtores) await queueOp('produtores', row.id, row)
      for (const row of variedades) await queueOp('variedades', row.id, row)
      for (const row of armazens) await queueOp('armazens', row.id, row)
      for (const row of caminhoes) await queueOp('caminhoes', row.id, row)
      for (const row of talhoes) await queueOp('talhoes', row.id, row)
      for (const row of cargas) await queueOp('cargas', row.id, row)
      for (const row of estoque) await queueOp('estoque_armazem', row.id, row)
      for (const row of movimentos) await queueOp('movimento_estoque', row.id, row)
      for (const row of vendas) await queueOp('venda_grao', row.id, row)
      for (const row of safras) await queueOp('safras', row.id, row)
      for (const row of freteLancamentos) await queueOp('frete_lancamentos', row.id, row)

      onRefresh()
      onNotify('success', 'Backup pessoal importado com sucesso. Clique em Sincronizar para enviar para nuvem.')
    } catch {
      onNotify('error', 'Nao foi possivel importar o backup pessoal. Verifique se o arquivo e valido.')
    } finally {
      event.target.value = ''
    }
  }

  async function exportarDadosTitular() {
    const dados = await coletarDadosDoTitular()
    const payload = {
      titular: { id: user.id, email: user.email },
      exportado_em: nowIso(),
      dados
    }
    baixarJson(`lgpd-dados-titular-${localDateYmd()}.json`, payload)
    onNotify('success', 'Arquivo de dados do titular gerado com sucesso.')
  }

  async function excluirDadosTitular() {
    const confirmou = window.confirm('Deseja excluir apenas os dados deste usuario (LGPD)?')
    if (!confirmou) return
    const confirmouFinal = window.confirm('Confirmacao final: excluir meus dados agora?')
    if (!confirmouFinal) return

    try {
      if (supabase) {
        const client = supabase
        const limparPorUsuario = async (table: string) => {
          const { error } = await client.from(table).delete().eq('created_by', user.id)
          if (error) throw new Error(`${table}: ${error.message}`)
        }
        await limparPorUsuario('movimento_estoque')
        await limparPorUsuario('venda_grao')
        await limparPorUsuario('frete_lancamentos')
        await limparPorUsuario('safras')
        await limparPorUsuario('estoque_armazem')
        await limparPorUsuario('cargas')
        await limparPorUsuario('talhoes')
        await limparPorUsuario('caminhoes')
        await limparPorUsuario('variedades')
        await limparPorUsuario('produtores')
        await limparPorUsuario('propriedades')
        await limparPorUsuario('armazens')
      }

      const purgeLocalByUser = async <T extends { id: string; created_by: string }>(rows: T[], remove: (id: string) => Promise<void>) => {
        for (const row of rows) {
          if (row.created_by === user.id) await remove(row.id)
        }
      }

      await purgeLocalByUser(await db.movimento_estoque.toArray(), (id) => db.movimento_estoque.delete(id))
      await purgeLocalByUser(await db.venda_grao.toArray(), (id) => db.venda_grao.delete(id))
      await purgeLocalByUser(await db.frete_lancamentos.toArray(), (id) => db.frete_lancamentos.delete(id))
      await purgeLocalByUser(await db.safras.toArray(), (id) => db.safras.delete(id))
      await purgeLocalByUser(await db.estoque_armazem.toArray(), (id) => db.estoque_armazem.delete(id))
      await purgeLocalByUser(await db.cargas.toArray(), (id) => db.cargas.delete(id))
      await purgeLocalByUser(await db.talhoes.toArray(), (id) => db.talhoes.delete(id))
      await purgeLocalByUser(await db.caminhoes.toArray(), (id) => db.caminhoes.delete(id))
      await purgeLocalByUser(await db.variedades.toArray(), (id) => db.variedades.delete(id))
      await purgeLocalByUser(await db.produtores.toArray(), (id) => db.produtores.delete(id))
      await purgeLocalByUser(await db.propriedades.toArray(), (id) => db.propriedades.delete(id))
      await purgeLocalByUser(await db.armazens.toArray(), (id) => db.armazens.delete(id))

      await db.pending_ops.clear()
      onRefresh()
      onNotify('success', 'Dados do titular excluidos com sucesso.')
      await registrarAuditoria(user.id, 'lgpd_exclusao_titular', 'Exclusao de dados do titular executada')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'erro desconhecido'
      onNotify('error', `Falha ao excluir dados do titular: ${msg}`)
    }
  }

  async function aplicarRetencao() {
    const dias = Number(retencaoDias)
    if (!Number.isFinite(dias) || dias < 30) {
      onNotify('error', 'Retencao invalida. Use no minimo 30 dias.')
      return
    }
    localStorage.setItem(`lgpd_retention_days_${user.id}`, String(dias))
    const limite = new Date()
    limite.setDate(limite.getDate() - dias)
    const limiteStr = localDateYmd(limite)

    try {
      if (supabase) {
        const client = supabase
        const { error: erroMov } = await client.from('movimento_estoque').delete().lt('created_at', `${limiteStr}T00:00:00.000Z`)
        if (erroMov) throw new Error(`movimento_estoque: ${erroMov.message}`)
        const { error: erroVendas } = await client.from('venda_grao').delete().lt('data', limiteStr)
        if (erroVendas) throw new Error(`venda_grao: ${erroVendas.message}`)
        const { error: erroFrete } = await client.from('frete_lancamentos').delete().lt('data', limiteStr)
        if (erroFrete) throw new Error(`frete_lancamentos: ${erroFrete.message}`)
        const { error: erroCargas } = await client.from('cargas').delete().lt('data', limiteStr)
        if (erroCargas) throw new Error(`cargas: ${erroCargas.message}`)
      }

      const movimentos = await db.movimento_estoque.toArray()
      for (const m of movimentos) {
        if (m.created_at.slice(0, 10) < limiteStr) await db.movimento_estoque.delete(m.id)
      }
      const vendas = await db.venda_grao.toArray()
      for (const v of vendas) {
        if (v.data < limiteStr) await db.venda_grao.delete(v.id)
      }
      const fretes = await db.frete_lancamentos.toArray()
      for (const f of fretes) {
        if (f.data < limiteStr) await db.frete_lancamentos.delete(f.id)
      }
      const cargas = await db.cargas.toArray()
      for (const c of cargas) {
        if (c.data < limiteStr) await db.cargas.delete(c.id)
      }
      await db.pending_ops.clear()
      onRefresh()
      onNotify('success', `Retencao aplicada. Registros anteriores a ${limiteStr} foram removidos.`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'erro desconhecido'
      onNotify('error', `Falha ao aplicar retencao: ${msg}`)
    }
  }

  async function gerarRelatorioLgpd() {
    const [propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao, safras, frete_lancamentos] = await Promise.all([
      db.propriedades.count(),
      db.produtores.count(),
      db.variedades.count(),
      db.armazens.count(),
      db.caminhoes.count(),
      db.talhoes.count(),
      db.cargas.count(),
      db.estoque_armazem.count(),
      db.movimento_estoque.count(),
      db.venda_grao.count(),
      db.safras.count(),
      db.frete_lancamentos.count()
    ])
    const payload = {
      gerado_em: nowIso(),
      controlador: user.email,
      canal_titular: lgpdCanal || user.email,
      retencao_dias: Number(retencaoDias),
      bases_legais_recomendadas: [
        'Execucao de contrato e procedimentos preliminares',
        'Legitimo interesse para operacao e seguranca',
        'Cumprimento de obrigacao legal/regulatoria quando aplicavel'
      ],
      inventario_tabelas: {
        propriedades, produtores, variedades, armazens, caminhoes, talhoes, cargas, estoque_armazem, movimento_estoque, venda_grao, safras, frete_lancamentos
      },
      direitos_titular_habilitados: [
        'Acesso aos dados (exportacao LGPD)',
        'Exclusao dos dados do titular',
        'Canal de atendimento ao titular'
      ]
    }
    baixarJson(`lgpd-relatorio-tratamento-${localDateYmd()}.json`, payload)
    onNotify('success', 'Relatorio LGPD gerado com sucesso.')
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
          safras?: Safra[]
          frete_lancamentos?: FreteLancamento[]
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
      if (json.dados?.safras) await db.safras.bulkPut(json.dados.safras)
      if (json.dados?.frete_lancamentos) await db.frete_lancamentos.bulkPut(json.dados.frete_lancamentos)
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
          const { count: beforeCount, error: beforeError } = await client
            .from(table)
            .select('id', { count: 'exact', head: true })
          if (beforeError) throw new Error(`${table}: ${beforeError.message}`)
          if (!beforeCount || beforeCount === 0) return

          const { error } = await client.from(table).delete().not('id', 'is', null)
          if (error) throw new Error(`${table}: ${error.message}`)

          const { count: afterCount, error: afterError } = await client
            .from(table)
            .select('id', { count: 'exact', head: true })
          if (afterError) throw new Error(`${table}: ${afterError.message}`)
          if ((afterCount ?? 0) > 0) {
            throw new Error(`${table}: ainda restam ${afterCount} registro(s) na nuvem`)
          }
        }

        await limparTabelaNuvem('movimento_estoque')
        await limparTabelaNuvem('venda_grao')
        await limparTabelaNuvem('frete_lancamentos')
        await limparTabelaNuvem('safras')
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
      await db.frete_lancamentos.clear()
      await db.safras.clear()
      await db.estoque_armazem.clear()
      await db.cargas.clear()
      await db.talhoes.clear()
      await db.caminhoes.clear()
      await db.variedades.clear()
      await db.produtores.clear()
      await db.propriedades.clear()
      await db.armazens.clear()

      onNotify('success', 'Todos os dados foram excluidos com sucesso.')
      await registrarAuditoria(user.id, 'exclusao_total_dados', 'Exclusao total de dados local e nuvem')
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
      {!isOwnerUser && (
        <p className="warning">
          Conta convidada: configuracoes administrativas ficam visiveis apenas para o dono do sistema.
        </p>
      )}
      {isOwnerUser && (
        <>
      <h3>Configuracao do Piloto Gratuito</h3>
      <div className="grid">
        <label>
          <input type="checkbox" checked={pilotAtivo} onChange={(e) => setPilotAtivo(e.target.checked)} />
          Modo piloto ativo
        </label>
        <input type="date" value={pilotInicio} onChange={(e) => setPilotInicio(e.target.value)} />
        <input type="date" value={pilotFim} onChange={(e) => setPilotFim(e.target.value)} />
        <input placeholder="Email do dono (admin principal)" value={pilotOwnerEmail} onChange={(e) => setPilotOwnerEmail(e.target.value)} />
      </div>
      <div className="actions">
        <button onClick={salvarConfigPiloto}>Salvar configuracao do piloto</button>
      </div>

      <h3>Backup</h3>
      <div className="actions">
        <button onClick={() => void exportarBackup()}>Exportar Backup (JSON)</button>
        <label className="file-input-label">
          Importar Backup (JSON)
          <input type="file" accept=".json,application/json" onChange={importarBackup} />
        </label>
        <button onClick={() => void salvarSnapshotSemanal()}>Salvar snapshot semanal</button>
        <button onClick={() => void restaurarSnapshotSemanal()}>Restore assistido</button>
        <button onClick={() => void excluirTodosDados()}>Excluir todos os dados</button>
      </div>
      {backupInfo && <p className="info">{backupInfo}</p>}

      <h3>Perfis e Acesso</h3>
      <div className="grid">
        <select
          value={userRole}
          onChange={(e) => {
            const newRole = e.target.value as UserRole
            setUserRole(newRole)
            localStorage.setItem(`user_role_${user.id}`, newRole)
            void registrarAuditoria(user.id, 'troca_perfil', `Perfil alterado para ${newRole}`)
            onNotify('success', `Perfil atualizado para ${newRole}.`)
          }}
        >
          <option value="proprietario">Proprietario (acesso total)</option>
          <option value="operador">Operador (operacao do dia a dia)</option>
          <option value="leitura">Leitura (somente consulta)</option>
        </select>
      </div>
      </>
      )}
      <p className="muted">Ultima sincronizacao com sucesso: {lastSyncSuccess ? formatDateTimeBr(lastSyncSuccess) : 'ainda nao registrada'}</p>
      <h3>Saude da Sincronizacao</h3>
      <ul>
        {Object.keys(syncOpsByTable).length === 0 && <li>Sem pendencias na fila local.</li>}
        {Object.entries(syncOpsByTable).map(([table, qty]) => (
          <li key={table}>{table}: {qty} pendencia(s)</li>
        ))}
      </ul>

      {!isOwnerUser && (
        <>
      <h3>Backup Pessoal</h3>
      <p className="muted">Estas opcoes trabalham somente com os dados da sua conta convidada.</p>
      <div className="actions">
        <button onClick={() => void exportarBackupPessoal()}>Exportar meus dados (JSON)</button>
        <label className="file-input-label">
          Importar meus dados (JSON)
          <input type="file" accept=".json,application/json" onChange={importarBackupPessoal} />
        </label>
      </div>

      <h3>LGPD Pessoal</h3>
      <p className="muted">Voce pode acessar ou excluir somente os seus proprios dados.</p>
      <div className="actions">
        <button onClick={() => void exportarDadosTitular()}>Exportar meus dados (LGPD)</button>
        <button onClick={() => void excluirDadosTitular()}>Excluir meus dados (LGPD)</button>
      </div>
      </>
      )}

      {isOwnerUser && (
        <>
      <h3>LGPD e Privacidade</h3>
      <p className="muted">
        Este modulo registra operacoes da colheita e oferece acoes praticas de privacidade para o titular dos dados.
      </p>
      <div className="grid">
        <input
          placeholder="Canal de atendimento LGPD (email ou telefone)"
          value={lgpdCanal}
          onChange={(e) => setLgpdCanal(e.target.value)}
        />
        <input
          type="number"
          min="30"
          step="1"
          placeholder="Retencao em dias"
          value={retencaoDias}
          onChange={(e) => setRetencaoDias(e.target.value)}
        />
      </div>
      <div className="actions">
        <button onClick={salvarCanalLgpd}>Salvar configuracao LGPD</button>
        <button onClick={() => void exportarDadosTitular()}>Exportar meus dados (LGPD)</button>
        <button onClick={() => void excluirDadosTitular()}>Excluir meus dados (LGPD)</button>
        <button onClick={() => void aplicarRetencao()}>Aplicar retencao</button>
        <button onClick={() => void gerarRelatorioLgpd()}>Gerar relatorio LGPD</button>
      </div>
      <ul>
        <li>Canal do titular: {lgpdCanal || user.email}</li>
        <li>Direitos operacionais ativos: acesso/exportacao, exclusao e contato do titular.</li>
        <li>Boas praticas aplicadas: minimizacao de dados, autenticacao e trilha de auditoria por created_at/updated_at.</li>
        <li>Documentos comerciais/LGPD no projeto: docs/TERMOS_DE_USO.md, docs/POLITICA_DE_PRIVACIDADE.md e docs/DPA_MODELO.md.</li>
      </ul>
      </>
      )}
    </section>
  )
}

function OperacaoSaas({ user, onNotify }: { user: UserSession; onNotify: (type: NoticeType, message: string) => void }) {
  const [participantes, setParticipantes] = useState<PilotParticipant[]>([])
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNome, setInviteNome] = useState('')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [opsPendentes, setOpsPendentes] = useState(0)
  const [ultimoErroSync, setUltimoErroSync] = useState('')

  useEffect(() => {
    void Promise.all([
      db.pilot_participantes.toArray(),
      db.feedback_items.toArray(),
      db.audit_logs.orderBy('created_at').reverse().limit(20).toArray(),
      db.pending_ops.count()
    ]).then(([ps, fs, ls, pend]) => {
      setParticipantes(ps)
      setFeedbacks(fs)
      setLogs(ls)
      setOpsPendentes(pend)
      setUltimoErroSync(localStorage.getItem('last_sync_error') ?? '')
    })
  }, [user.id])

  async function convidarParticipante() {
    if (!inviteEmail.trim()) {
      onNotify('error', 'Informe o email do participante.')
      return
    }
    const existente = await db.pilot_participantes.where('email').equals(inviteEmail.trim().toLowerCase()).first()
    if (existente) {
      onNotify('error', 'Este email ja esta cadastrado no piloto.')
      return
    }
    const now = nowIso()
    const novo: PilotParticipant = {
      id: makeId(),
      email: inviteEmail.trim().toLowerCase(),
      nome: inviteNome.trim() || inviteEmail.trim().split('@')[0],
      status: 'ativo',
      data_entrada: localDateYmd(),
      ultimo_acesso: null,
      ultimo_sync: null,
      created_at: now,
      updated_at: now,
      created_by: user.id,
      updated_by: user.id,
      sync_status: 'pending_sync'
    }
    await db.pilot_participantes.put(novo)
    await queueOp('pilot_participantes', novo.id, novo)
    await runSync()
    await registrarAuditoria(user.id, 'piloto_convite_criado', `Convite para ${novo.email}`)
    setParticipantes(await db.pilot_participantes.toArray())
    setInviteEmail('')
    setInviteNome('')
    onNotify('success', 'Participante convidado no piloto.')
  }

  async function alterarStatusParticipante(id: string, status: PilotParticipant['status']) {
    const row = await db.pilot_participantes.get(id)
    if (!row) return
    const updated: PilotParticipant = {
      ...row,
      status,
      updated_at: nowIso(),
      updated_by: user.id,
      sync_status: 'pending_sync'
    }
    await db.pilot_participantes.put(updated)
    await queueOp('pilot_participantes', updated.id, updated)
    await runSync()
    await registrarAuditoria(user.id, 'piloto_status_participante', `${row.email} => ${status}`)
    setParticipantes(await db.pilot_participantes.toArray())
  }

  async function resetAmbientePiloto() {
    const confirmou = window.confirm('Resetar ambiente de PILOTO? Esta acao apaga dados de teste.')
    if (!confirmou) return
    const confirmou2 = window.confirm('Confirmacao final: resetar ambiente piloto agora?')
    if (!confirmou2) return

    try {
      await db.pending_ops.clear()
      await db.feedback_items.clear()
      await db.pilot_participantes.clear()
      await db.cargas.clear()
      await db.venda_grao.clear()
      await db.frete_lancamentos.clear()
      await db.safras.clear()
      await db.movimento_estoque.clear()
      await db.estoque_armazem.clear()
      await db.talhoes.clear()
      await db.propriedades.clear()
      await db.produtores.clear()
      await db.variedades.clear()
      await db.armazens.clear()
      await db.caminhoes.clear()
      await registrarAuditoria(user.id, 'piloto_reset_ambiente', 'Ambiente de piloto resetado')
      onNotify('success', 'Ambiente piloto resetado com sucesso.')
      setParticipantes([])
      setFeedbacks([])
    } catch {
      onNotify('error', 'Falha ao resetar ambiente piloto.')
    }
  }

  const ativos = participantes.filter((p) => p.status === 'ativo').length
  const ativadosComUso = participantes.filter((p) => Boolean(p.ultimo_sync || p.ultimo_acesso)).length
  const ativacao = participantes.length > 0 ? Math.round((ativadosComUso / participantes.length) * 100) : 0
  const limite30 = new Date()
  limite30.setDate(limite30.getDate() - 30)
  const limite90 = new Date()
  limite90.setDate(limite90.getDate() - 90)
  const retencao30 = participantes.filter((p) => p.ultimo_acesso && new Date(p.ultimo_acesso) >= limite30).length
  const retencao90 = participantes.filter((p) => p.ultimo_acesso && new Date(p.ultimo_acesso) >= limite90).length
  const taxaErroSync = participantes.length > 0 ? Math.round((opsPendentes / participantes.length) * 100) : 0
  const feedbackPorCategoria = feedbacks.reduce<Record<string, number>>((acc, fb) => {
    acc[fb.categoria] = (acc[fb.categoria] ?? 0) + 1
    return acc
  }, {})

  return (
    <section className="panel">
      <h2>Painel Interno do Piloto</h2>
      <p className="muted">Termo de participacao: uso gratuito para testes e melhorias, sem cobranca nesta fase.</p>
      <div className="kpis">
        <article><span>Participantes ativos</span><strong>{ativos}</strong></article>
        <article><span>Taxa de ativacao</span><strong>{ativacao}%</strong></article>
        <article><span>Pendencias de sync</span><strong>{opsPendentes}</strong></article>
        <article><span>Retencao 30 dias</span><strong>{retencao30}</strong></article>
        <article><span>Retencao 90 dias</span><strong>{retencao90}</strong></article>
        <article><span>Taxa erro sync (proxy)</span><strong>{taxaErroSync}%</strong></article>
        <article><span>Feedbacks recebidos</span><strong>{feedbacks.length}</strong></article>
      </div>
      {ultimoErroSync && <p className="error">Ultimo erro de sync: {ultimoErroSync}</p>}

      <h3>Convidar participante</h3>
      <div className="grid">
        <input placeholder="Email do produtor" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
        <input placeholder="Nome do produtor" value={inviteNome} onChange={(e) => setInviteNome(e.target.value)} />
      </div>
      <button onClick={() => void convidarParticipante()}>Adicionar convite</button>

      <h3>Participantes</h3>
      <ul>
        {participantes.length === 0 && <li>Nenhum participante convidado.</li>}
        {participantes.map((p) => (
          <li key={p.id}>
            {p.nome} | {p.email} | status: {p.status} | entrada: {formatDateBr(p.data_entrada)} | ultimo acesso: {formatDateTimeBr(p.ultimo_acesso)} | ultimo sync: {formatDateTimeBr(p.ultimo_sync)}
            <select value={p.status} onChange={(e) => void alterarStatusParticipante(p.id, e.target.value as PilotParticipant['status'])}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </li>
        ))}
      </ul>

      <h3>Feedback por categoria</h3>
      <ul>
        {Object.keys(feedbackPorCategoria).length === 0 && <li>Nenhum feedback registrado.</li>}
        {Object.entries(feedbackPorCategoria).map(([cat, qtd]) => <li key={cat}>{cat}: {qtd}</li>)}
      </ul>

      <h3>Ultimos logs criticos</h3>
      <ul>
        {logs.length === 0 && <li>Nenhum log registrado ainda.</li>}
        {logs.slice(0, 10).map((l) => (
          <li key={l.id}>{formatDateTimeBr(l.created_at)} | {l.action} | {l.details ?? '-'}</li>
        ))}
      </ul>

      <button onClick={() => void resetAmbientePiloto()}>Resetar ambiente piloto</button>
    </section>
  )
}

function OnboardingPiloto({
  user,
  onClose
}: {
  user: UserSession
  onClose: () => void
}) {
  return (
    <section className="panel">
      <h2>Termo de Participacao no Piloto</h2>
      <p className="muted">
        Bem-vindo, {user.email}. Esta fase e gratuita e serve para validacao do sistema em campo.
        Seus feedbacks serao usados para melhorias antes da comercializacao.
      </p>
      <ul>
        <li>Sem cobranca nesta fase de demonstracao.</li>
        <li>Uso por convite individual e acompanhamento do administrador.</li>
        <li>Voce pode enviar feedbacks na aba Enviar Feedback.</li>
      </ul>
      <button onClick={onClose}>Aceitar e continuar</button>
    </section>
  )
}

function FeedbackPiloto({
  user,
  onNotify,
  refreshTick,
  onSaved,
  isOwner
}: {
  user: UserSession
  onNotify: (type: NoticeType, message: string) => void
  refreshTick: number
  onSaved: () => void
  isOwner: boolean
}) {
  const [categoria, setCategoria] = useState<FeedbackItem['categoria']>('usabilidade')
  const [prioridade, setPrioridade] = useState<FeedbackItem['prioridade']>('media')
  const [descricao, setDescricao] = useState('')
  const [contexto, setContexto] = useState('')
  const [contato, setContato] = useState(user.email)
  const [lista, setLista] = useState<FeedbackItem[]>([])

  useEffect(() => {
    void db.feedback_items.orderBy('created_at').reverse().toArray().then(setLista)
  }, [refreshTick])

  async function enviar() {
    if (!descricao.trim() || !contexto.trim()) {
      onNotify('error', 'Descreva o feedback e o contexto da tela/fluxo.')
      return
    }
    const now = nowIso()
    const row: FeedbackItem = {
      id: makeId(),
      categoria,
      prioridade,
      descricao: descricao.trim(),
      contexto: contexto.trim(),
      contato: contato.trim() || undefined,
      status: 'novo',
      created_at: now,
      updated_at: now,
      created_by: user.id,
      updated_by: user.id,
      sync_status: 'pending_sync'
    }
    await db.feedback_items.put(row)
    await queueOp('feedback_items', row.id, row)
    await runSync()
    await registrarAuditoria(user.id, 'feedback_enviado', `${categoria}/${prioridade}`)
    setDescricao('')
    setContexto('')
    onSaved()
    setLista(await db.feedback_items.orderBy('created_at').reverse().toArray())
    onNotify('success', 'Feedback enviado com sucesso. Obrigado!')
  }

  async function atualizarStatus(id: string, status: FeedbackItem['status']) {
    const fb = await db.feedback_items.get(id)
    if (!fb) return
    const updated: FeedbackItem = { ...fb, status, updated_at: nowIso(), updated_by: user.id, sync_status: 'pending_sync' }
    await db.feedback_items.put(updated)
    await queueOp('feedback_items', updated.id, updated)
    await runSync()
    setLista(await db.feedback_items.orderBy('created_at').reverse().toArray())
    onNotify('success', 'Status do feedback atualizado.')
  }

  return (
    <section className="panel">
      <h2>Enviar Feedback</h2>
      <p className="muted">Use este formulario para sugerir melhorias do piloto gratuito.</p>
      <div className="grid">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as FeedbackItem['categoria'])}>
          <option value="erro">Erro</option>
          <option value="usabilidade">Usabilidade</option>
          <option value="nova_funcionalidade">Nova funcionalidade</option>
          <option value="relatorio">Relatorio</option>
          <option value="outros">Outros</option>
        </select>
        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as FeedbackItem['prioridade'])}>
          <option value="baixa">Baixa</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </select>
        <input placeholder="Contexto (tela/fluxo)" value={contexto} onChange={(e) => setContexto(e.target.value)} />
        <input placeholder="Contato opcional" value={contato} onChange={(e) => setContato(e.target.value)} />
      </div>
      <textarea
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Descreva o feedback com exemplos reais."
        style={{ width: '100%', minHeight: 110, padding: '0.7rem', borderRadius: 10, border: '1px solid #acbaae' }}
      />
      <div className="actions">
        <button onClick={() => void enviar()}>Enviar feedback</button>
      </div>

      <h3>Feedbacks registrados</h3>
      <ul>
        {lista.length === 0 && <li>Nenhum feedback enviado ainda.</li>}
        {lista.map((f) => (
          <li key={f.id}>
            {formatDateBr(f.created_at)} | {f.categoria} | prioridade {f.prioridade} | status {f.status} | {f.contexto} | {f.descricao}
            {isOwner && (
              <select value={f.status} onChange={(e) => void atualizarStatus(f.id, e.target.value as FeedbackItem['status'])}>
                <option value="novo">Novo</option>
                <option value="em_analise">Em analise</option>
                <option value="planejado">Planejado</option>
                <option value="concluido">Concluido</option>
              </select>
            )}
          </li>
        ))}
      </ul>
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
    await registrarAuditoria(userId, 'cadastro_sensivel_editado', `Tipo ${tipo} atualizado`)
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
      await registrarAuditoria(userId, 'cadastro_sensivel_excluido', `Tipo ${tipo} removido`)
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

function NovaCarga({
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
  type SplitItem = {
    id: string
    talhaoId: string
    variedadeId: string
    pesoLiquido: string
  }

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
  const [ultimasCargas, setUltimasCargas] = useState<Carga[]>([])
  const [qtdCargasLocal, setQtdCargasLocal] = useState(0)
  const [modoDividido, setModoDividido] = useState(false)
  const [splitItems, setSplitItems] = useState<SplitItem[]>([
    { id: makeId(), talhaoId: '', variedadeId: '', pesoLiquido: '' },
    { id: makeId(), talhaoId: '', variedadeId: '', pesoLiquido: '' }
  ])

  const carregarUltimasCargas = useCallback(async () => {
    const [rows, ops] = await Promise.all([db.cargas.toArray(), db.pending_ops.toArray()])
    const pendentes = ops
      .filter((op) => op.table === 'cargas' && op.op === 'upsert' && op.payload && typeof op.payload === 'object')
      .map((op) => op.payload as Carga)

    const mapa = new Map<string, Carga>()
    for (const c of [...rows, ...pendentes]) {
      if (!c?.id) continue
      mapa.set(c.id, c)
    }

    const base = Array.from(mapa.values())
    setQtdCargasLocal(base.length)
    const ultimas = base
      .sort((a, b) => `${b.data}T${b.created_at}`.localeCompare(`${a.data}T${a.created_at}`))
      .slice(0, 3)
    setUltimasCargas(ultimas)
  }, [])

  useEffect(() => {
    void Promise.all([
      db.propriedades.toArray(),
      db.talhoes.toArray(),
      db.produtores.toArray(),
      db.variedades.toArray(),
      db.armazens.toArray(),
      db.caminhoes.toArray(),
      db.cargas.toArray(),
      db.pending_ops.toArray()
    ]).then(([propriedades, talhoes, produtores, variedades, armazens, caminhoes, rows, ops]) => {
      setRefs({ propriedades, talhoes, produtores, variedades, armazens, caminhoes })
      const pendentes = ops
        .filter((op) => op.table === 'cargas' && op.op === 'upsert' && op.payload && typeof op.payload === 'object')
        .map((op) => op.payload as Carga)
      const mapa = new Map<string, Carga>()
      for (const c of [...rows, ...pendentes]) {
        if (!c?.id) continue
        mapa.set(c.id, c)
      }
      const base = Array.from(mapa.values())
      setQtdCargasLocal(base.length)
      setUltimasCargas(
        base
          .sort((a, b) => `${b.data}T${b.created_at}`.localeCompare(`${a.data}T${a.created_at}`))
          .slice(0, 3)
      )
    })
  }, [refreshTick])

  const sacas = useMemo(() => {
    const liquido = parsePtBrNumber(pesoLiquido || '0')
    return Number.isFinite(liquido) ? toSacas(liquido) : 0
  }, [pesoLiquido])

  const liquidosDivididosValidos = useMemo(
    () => splitItems.map((item) => parsePtBrNumber(item.pesoLiquido)).filter((n) => Number.isFinite(n) && n > 0),
    [splitItems]
  )
  const totalLiquidoDividido = useMemo(
    () => liquidosDivididosValidos.reduce((acc, n) => acc + n, 0),
    [liquidosDivididosValidos]
  )
  const totalSacasDividido = useMemo(() => totalSacasDivididas(liquidosDivididosValidos), [liquidosDivididosValidos])

  function adicionarSplitItem() {
    setSplitItems((prev) => [...prev, { id: makeId(), talhaoId: '', variedadeId: '', pesoLiquido: '' }])
  }

  function removerSplitItem(id: string) {
    setSplitItems((prev) => {
      if (prev.length <= 2) return prev
      return prev.filter((item) => item.id !== id)
    })
  }

  function atualizarSplitItem(id: string, patch: Partial<SplitItem>) {
    setSplitItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function salvar() {
    if (modoDividido) {
      const brutoTotal = parsePtBrNumber(pesoBruto)
      if (!data || !placa || !propriedadeId || !produtorId || !armazemId) {
        onNotify('error', 'Preencha os campos principais da carga.')
        return
      }
      if (!Number.isFinite(brutoTotal) || brutoTotal <= 0) {
        onNotify('error', 'Informe o peso bruto total da carga.')
        return
      }
      const linhasValidas = splitItems
        .map((item) => ({
          ...item,
          liquidoNum: parsePtBrNumber(item.pesoLiquido)
        }))
        .filter((item) => item.talhaoId && item.variedadeId && Number.isFinite(item.liquidoNum) && item.liquidoNum > 0)

      if (linhasValidas.length < 2) {
        onNotify('error', 'Informe pelo menos 2 linhas validas para dividir a carga.')
        return
      }
      const totalLiquido = linhasValidas.reduce((acc, item) => acc + item.liquidoNum, 0)
      if (totalLiquido <= 0) {
        onNotify('error', 'Peso liquido total invalido para divisao.')
        return
      }
      if (totalLiquido > brutoTotal) {
        onNotify('error', 'Peso liquido total nao pode ser maior que peso bruto total.')
        return
      }
      const brutosDistribuidos = dividirPesoBrutoProporcional(brutoTotal, linhasValidas.map((i) => i.liquidoNum))
      if (brutosDistribuidos.length !== linhasValidas.length) {
        onNotify('error', 'Falha ao dividir peso bruto entre as linhas.')
        return
      }

      const now = nowIso()
      for (let i = 0; i < linhasValidas.length; i += 1) {
        const linha = linhasValidas[i]
        const brutoLinha = brutosDistribuidos[i]

        const carga: Carga = {
          id: makeId(),
          data,
          placa,
          propriedade_id: propriedadeId,
          talhao_id: linha.talhaoId,
          produtor_id: produtorId,
          variedade_id: linha.variedadeId,
          armazem_id: armazemId,
          peso_bruto_kg: brutoLinha,
          peso_liquido_kg: linha.liquidoNum,
          sacas: toSacas(linha.liquidoNum),
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
          referenciaId: carga.id,
          motivo: 'Carga dividida por talhao/variedade'
        })
      }
      await runSync()
      setPesoBruto('')
      setPesoLiquido('')
      setSplitItems([
        { id: makeId(), talhaoId: '', variedadeId: '', pesoLiquido: '' },
        { id: makeId(), talhaoId: '', variedadeId: '', pesoLiquido: '' }
      ])
      setErrors([])
      await carregarUltimasCargas()
      onSaved()
      onNotify('success', 'Carga dividida salva com sucesso.')
      return
    }

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

    const brutoAtual = parsePtBrNumber(pesoBruto)
    const liquidoAtual = parsePtBrNumber(pesoLiquido)
    const similares = (await db.cargas.toArray()).filter((c) => {
      if (c.data !== data) return false
      if (c.placa !== placa) return false
      const difBruto = Math.abs(c.peso_bruto_kg - brutoAtual)
      const difLiquido = Math.abs(c.peso_liquido_kg - liquidoAtual)
      return difBruto <= 100 && difLiquido <= 100
    })
    if (similares.length > 0) {
      const confirmar = window.confirm(
        `Atencao: encontramos ${similares.length} carga(s) parecida(s) (mesma data/placa e peso proximo). Deseja salvar mesmo assim?`
      )
      if (!confirmar) {
        onNotify('error', 'Salvamento cancelado para evitar duplicidade.')
        return
      }
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
      peso_bruto_kg: brutoAtual,
      peso_liquido_kg: liquidoAtual,
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
    await carregarUltimasCargas()
    onSaved()
    onNotify('success', 'Carga salva com sucesso.')
  }

  const placaPorId = new Map(((refs.caminhoes as BaseEntity[]) ?? []).map((c) => [c.id, c.nome]))

  return (
    <section className="panel">
      <h2>Nova Carga</h2>
      <div className="grid">
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <SelectFromList label="Placa (caminhao)" value={placa} onChange={setPlaca} items={(refs.caminhoes as BaseEntity[]) ?? []} />
        <SelectFromList label="Propriedade" value={propriedadeId} onChange={setPropriedadeId} items={(refs.propriedades as BaseEntity[]) ?? []} />
        <SelectFromList label="Produtor" value={produtorId} onChange={setProdutorId} items={(refs.produtores as BaseEntity[]) ?? []} />
        <SelectFromList label="Armazem" value={armazemId} onChange={setArmazemId} items={(refs.armazens as BaseEntity[]) ?? []} />
        {!modoDividido && <SelectFromList label="Talhao" value={talhaoId} onChange={setTalhaoId} items={(refs.talhoes as Talhao[]) ?? []} />}
        {!modoDividido && <SelectFromList label="Variedade" value={variedadeId} onChange={setVariedadeId} items={(refs.variedades as BaseEntity[]) ?? []} />}
        <input placeholder="Peso bruto (kg) ex: 21.000" value={pesoBruto} onChange={(e) => setPesoBruto(e.target.value)} />
        {!modoDividido && <input placeholder="Peso liquido (kg) ex: 20.500" value={pesoLiquido} onChange={(e) => setPesoLiquido(e.target.value)} />}
      </div>
      <label>
        <input type="checkbox" checked={modoDividido} onChange={(e) => setModoDividido(e.target.checked)} /> Dividir carga por talhao e variedade
      </label>
      {!modoDividido && <p className="info">Sacas (automatico): <strong>{sacas.toFixed(2)}</strong></p>}
      {modoDividido && (
        <section className="panel">
          <h3>Divisao da carga</h3>
          <p className="muted">Preencha cada parte da carga com talhao, variedade e peso liquido.</p>
          <div className="actions">
            <button onClick={adicionarSplitItem}>Adicionar linha</button>
          </div>
          {splitItems.map((item, idx) => (
            <div className="grid" key={item.id}>
              <SelectFromList label={`Talhao (linha ${idx + 1})`} value={item.talhaoId} onChange={(v) => atualizarSplitItem(item.id, { talhaoId: v })} items={(refs.talhoes as Talhao[]) ?? []} />
              <SelectFromList label={`Variedade (linha ${idx + 1})`} value={item.variedadeId} onChange={(v) => atualizarSplitItem(item.id, { variedadeId: v })} items={(refs.variedades as BaseEntity[]) ?? []} />
              <input
                placeholder="Peso liquido desta linha (kg)"
                value={item.pesoLiquido}
                onChange={(e) => atualizarSplitItem(item.id, { pesoLiquido: e.target.value })}
              />
              <button onClick={() => removerSplitItem(item.id)} disabled={splitItems.length <= 2}>Remover linha</button>
            </div>
          ))}
          <div className="kpis">
            <article><span>Peso liquido total dividido (kg)</span><strong>{formatPtBrNumber(totalLiquidoDividido)}</strong></article>
            <article><span>Total em sacas (automatico)</span><strong>{formatPtBrNumber(totalSacasDividido)}</strong></article>
          </div>
        </section>
      )}
      {errors.length > 0 && (
        <ul className="error-list">
          {errors.map((err) => <li key={err}>{err}</li>)}
        </ul>
      )}
      <button onClick={salvar}>Salvar Carga</button>
      <h3>Ultimas 3 cargas cadastradas</h3>
      <p className="muted">Confira antes de salvar para evitar duplicidade.</p>
      <p className="muted">Cargas encontradas no dispositivo: {qtdCargasLocal}</p>
      <ul>
        {ultimasCargas.length === 0 && <li>Nenhuma carga cadastrada ainda.</li>}
        {ultimasCargas.map((c) => (
          <li key={c.id}>
            {formatDateBr(c.data)} | Placa: {placaLegivel(c.placa, placaPorId.get(c.placa))} | Liquido: {formatPtBrNumber(c.peso_liquido_kg)} kg | Sacas: {formatPtBrNumber(c.sacas)}
          </li>
        ))}
      </ul>
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
  const cargasOrdenadas = [...cargas].sort((a, b) => `${b.data}T${b.created_at}`.localeCompare(`${a.data}T${a.created_at}`))

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
        {porTalhao.map((item, idx) => <li key={`${item.nome}-${idx}`}>{item.nome}: {item.valor.toFixed(2)}</li>)}
      </ul>
      <h3>Ultimas cargas</h3>
      <ul>
        {cargasOrdenadas.slice(0, 5).map((c) => (
          <li key={c.id}>
            {c.data} | {placaLegivel(c.placa, placaPorId.get(c.placa))} | {formatPtBrNumber(c.peso_liquido_kg)} kg | {formatPtBrNumber(c.sacas)} sacas | {statusSyncLegivel(c.sync_status, pendingIds.has(c.id))}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Analises({ refreshTick, userId }: { refreshTick: number; userId: string }) {
  const [cargas, setCargas] = useState<Carga[]>([])
  const [talhoes, setTalhoes] = useState<Talhao[]>([])
  const [variedades, setVariedades] = useState<BaseEntity[]>([])
  const [produtores, setProdutores] = useState<BaseEntity[]>([])
  const [armazens, setArmazens] = useState<BaseEntity[]>([])
  const [talhoesSelecionados, setTalhoesSelecionados] = useState<string[]>([])
  const [produtorRelatorioId, setProdutorRelatorioId] = useState('')
  const [dataRelInicio, setDataRelInicio] = useState('')
  const [dataRelFim, setDataRelFim] = useState('')
  const [cfgTalhaoId, setCfgTalhaoId] = useState('')
  const [cfgVariedadeId, setCfgVariedadeId] = useState('')
  const [cfgAreaHa, setCfgAreaHa] = useState('')
  const [areasVarTalhao, setAreasVarTalhao] = useState<AreaVariedadeTalhao[]>([])

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

  useEffect(() => {
    void db.area_variedade_talhao.toArray().then((rows) => {
      setAreasVarTalhao(rows.filter((r) => r.created_by === userId))
    })
  }, [refreshTick, userId])

  const mediaGeralKg = cargas.length > 0 ? cargas.reduce((acc, c) => acc + c.peso_liquido_kg, 0) / cargas.length : 0
  const mediaGeralSacas = cargas.length > 0 ? cargas.reduce((acc, c) => acc + c.sacas, 0) / cargas.length : 0
  const areaTotal = talhoes.reduce((acc, t) => acc + t.area_ha, 0)
  const prodGeral = produtividadeSacasPorHa(cargas.reduce((acc, c) => acc + c.sacas, 0), areaTotal)
  const areaConfigMap = new Map(areasVarTalhao.map((a) => [`${a.talhao_id}::${a.variedade_id}`, a.area_ha]))

  const mediasTalhao = talhoes.map((t) => {
    const items = cargas.filter((c) => c.talhao_id === t.id)
    const mediaKg = items.length > 0 ? items.reduce((acc, c) => acc + c.peso_liquido_kg, 0) / items.length : 0
    const mediaSacas = items.length > 0 ? items.reduce((acc, c) => acc + c.sacas, 0) / items.length : 0
    const totalSacasTalhao = items.reduce((acc, c) => acc + c.sacas, 0)
    const prodSacasHa = produtividadeSacasPorHa(totalSacasTalhao, t.area_ha)
    return { nome: t.nome, mediaKg, mediaSacas, prodSacasHa }
  })

  const mediasVariedade = variedades.map((v) => {
    const items = cargas.filter((c) => c.variedade_id === v.id)
    const mediaKg = items.length > 0 ? items.reduce((acc, c) => acc + c.peso_liquido_kg, 0) / items.length : 0
    const mediaSacas = items.length > 0 ? items.reduce((acc, c) => acc + c.sacas, 0) / items.length : 0
    const pares = new Set(items.map((c) => `${c.talhao_id}::${v.id}`))
    const areaVariedade = Array.from(pares).reduce((acc, key) => acc + (areaConfigMap.get(key) ?? 0), 0)
    const totalSacasVariedade = items.reduce((acc, c) => acc + c.sacas, 0)
    const prodSacasHa = produtividadeSacasPorHa(totalSacasVariedade, areaVariedade)
    return { nome: v.nome, mediaKg, mediaSacas, prodSacasHa, areaVariedade }
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

  const talhaoParaAnalise = cfgTalhaoId || talhoes[0]?.id || ''
  const produtividadeVariedadeNoTalhao = calcProdutividadeVariedadeNoTalhao(cargas, areasVarTalhao, talhaoParaAnalise).map((r) => ({
    variedadeId: r.variedade_id,
    variedade: variedades.find((v) => v.id === r.variedade_id)?.nome ?? r.variedade_id,
    sacasTotal: r.sacas_total,
    areaCfg: r.area_ha,
    scHa: r.sc_ha
  }))

  const areasDoTalhao = areasVarTalhao.filter((a) => a.talhao_id === talhaoParaAnalise)

  async function salvarAreaVariedadeTalhao() {
    if (!cfgTalhaoId || !cfgVariedadeId) return
    const area = parsePtBrNumber(cfgAreaHa)
    if (!Number.isFinite(area) || area <= 0) return

    const now = nowIso()
    const existente = areasVarTalhao.find((a) => a.talhao_id === cfgTalhaoId && a.variedade_id === cfgVariedadeId)
    const row: AreaVariedadeTalhao = existente
      ? {
          ...existente,
          area_ha: area,
          updated_at: now,
          updated_by: userId,
          sync_status: 'pending_sync'
        }
      : {
          id: makeId(),
          talhao_id: cfgTalhaoId,
          variedade_id: cfgVariedadeId,
          area_ha: area,
          created_at: now,
          updated_at: now,
          created_by: userId,
          updated_by: userId,
          sync_status: 'pending_sync'
        }
    await db.area_variedade_talhao.put(row)
    await queueOp('area_variedade_talhao', row.id, row)
    await runSync()
    const rows = await db.area_variedade_talhao.toArray()
    setAreasVarTalhao(rows.filter((r) => r.created_by === userId))
    setCfgAreaHa('')
  }

  async function removerAreaVariedadeTalhao(id: string) {
    await db.area_variedade_talhao.delete(id)
    await db.pending_ops.where('record_id').equals(id).delete()
    await queueDeleteOp('area_variedade_talhao', id)
    await runSync()
    const rows = await db.area_variedade_talhao.toArray()
    setAreasVarTalhao(rows.filter((r) => r.created_by === userId))
  }

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
    const cab = ['tipo', 'data', 'armazem', 'peso_liquido_kg', 'sacas', 'observacao']
    const resumo = [
      ['resumo', 'periodo_inicio', dataRelInicio || '-', '', '', ''],
      ['resumo', 'periodo_fim', dataRelFim || '-', '', '', ''],
      ['resumo', 'total_kg_liquido', '', totalRelKg.toFixed(2), '', ''],
      ['resumo', 'total_sacas', '', '', totalRelSacas.toFixed(2), '']
    ]
    const linhas = cargasProdutorRel.map((c) => [
      'detalhe',
      c.data,
      armazemPorId.get(c.armazem_id) ?? c.armazem_id,
      c.peso_liquido_kg.toFixed(2),
      c.sacas.toFixed(2),
      ''
    ])
    const csv = [cab, ...resumo, ...linhas].map((r) => r.join(';')).join('\n')
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
    const emissao = formatDateTimeBrWithZone(nowIso())
    let y = 14
    doc.setFontSize(17)
    doc.text('RELATORIO DE ENTREGA DO PRODUTOR', 14, y)
    y += 8
    doc.setFontSize(11)
    doc.text(`Produtor: ${nomeProd}`, 14, y)
    y += 6
    doc.text(`Periodo: ${dataRelInicio ? formatDateBr(dataRelInicio) : '-'} ate ${dataRelFim ? formatDateBr(dataRelFim) : '-'}`, 14, y)
    y += 6
    doc.text(`Data/Hora local: ${emissao}`, 14, y)
    y += 8
    doc.text(`Total entregue: ${formatPtBrNumber(totalRelKg)} kg liquido | ${formatPtBrNumber(totalRelSacas)} sacas`, 14, y)
    y += 9
    doc.setFontSize(12)
    doc.text('Detalhamento das Entregas por Armazem', 14, y)
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
    if (y > 250) {
      doc.addPage()
      y = 14
    } else {
      y += 10
    }
    doc.setDrawColor(140, 160, 150)
    doc.line(14, y, 196, y)
    y += 8
    doc.setFontSize(11)
    doc.text('Conferencia e Assinatura', 14, y)
    y += 8
    doc.setFontSize(10)
    doc.text('Responsavel pelo produtor: ______________________________', 14, y)
    y += 10
    doc.text('Representante da fazenda: ________________________________', 14, y)
    y += 10
    doc.text('Data da conferencia: ____/____/________', 14, y)
    doc.save(`relatorio-produtor-${nomeProd}.pdf`)
  }

  return (
    <section className="panel">
      <h2>Analises de Medias e Produtividade</h2>
      <div className="kpis">
        <article><span>Media geral (kg/carga)</span><strong>{mediaGeralKg.toFixed(2)}</strong></article>
        <article><span>Media geral (sacas/carga)</span><strong>{mediaGeralSacas.toFixed(2)}</strong></article>
        <article><span>Produtividade geral (sacas/ha)</span><strong>{prodGeral.toFixed(2)}</strong></article>
      </div>
      <h3>Media por talhao</h3>
      <div className="analysis-cards">
        {mediasTalhao.map((m) => (
          <article className="analysis-card" key={m.nome}>
            <h4>{m.nome}</h4>
            <p><strong>{formatPtBrNumber(m.mediaKg)}</strong> kg/carga</p>
            <p><strong>{formatPtBrNumber(m.mediaSacas)}</strong> sacas/carga</p>
            <p><strong>{formatPtBrNumber(m.prodSacasHa)}</strong> sacas/ha</p>
          </article>
        ))}
      </div>
      <h3>Media por variedade</h3>
      <div className="analysis-cards">
        {mediasVariedade.map((m) => (
          <article className="analysis-card" key={m.nome}>
            <h4>{m.nome}</h4>
            <p><strong>{formatPtBrNumber(m.mediaKg)}</strong> kg/carga</p>
            <p><strong>{formatPtBrNumber(m.mediaSacas)}</strong> sacas/carga</p>
            <p><strong>{formatPtBrNumber(m.areaVariedade)}</strong> ha configurados</p>
            <p><strong>{formatPtBrNumber(m.prodSacasHa)}</strong> sacas/ha</p>
          </article>
        ))}
      </div>
      <h3>Area por variedade dentro do talhao</h3>
      <p className="muted">Configure os hectares de cada variedade no talhao para calcular sc/ha com precisao.</p>
      <div className="grid">
        <SelectFromList label="Talhao" value={cfgTalhaoId} onChange={setCfgTalhaoId} items={talhoes} />
        <SelectFromList label="Variedade" value={cfgVariedadeId} onChange={setCfgVariedadeId} items={variedades} />
        <input placeholder="Area da variedade (ha)" value={cfgAreaHa} onChange={(e) => setCfgAreaHa(e.target.value)} />
        <button onClick={() => void salvarAreaVariedadeTalhao()}>Salvar area</button>
      </div>
      <div className="analysis-cards">
        {areasDoTalhao.length === 0 && <article className="analysis-card"><p>Nenhuma area configurada para este talhao.</p></article>}
        {areasDoTalhao.map((a) => (
          <article className="analysis-card" key={a.id}>
            <h4>{variedades.find((v) => v.id === a.variedade_id)?.nome ?? a.variedade_id}</h4>
            <p><strong>{formatPtBrNumber(a.area_ha)}</strong> ha</p>
            <button onClick={() => void removerAreaVariedadeTalhao(a.id)}>Remover</button>
          </article>
        ))}
      </div>
      <h3>Produtividade por variedade no talhao (sc/ha)</h3>
      <div className="grid">
        <SelectFromList label="Talhao para analisar" value={talhaoParaAnalise} onChange={setCfgTalhaoId} items={talhoes} />
      </div>
      <div className="analysis-cards">
        {produtividadeVariedadeNoTalhao.length === 0 && <article className="analysis-card"><p>Sem cargas com variedade neste talhao.</p></article>}
        {produtividadeVariedadeNoTalhao.map((r) => (
          <article className="analysis-card" key={r.variedadeId}>
            <h4>{r.variedade}</h4>
            <p><strong>{formatPtBrNumber(r.sacasTotal)}</strong> sacas</p>
            <p><strong>{formatPtBrNumber(r.areaCfg)}</strong> ha configurados</p>
            <p><strong>{formatPtBrNumber(r.scHa)}</strong> sc/ha</p>
          </article>
        ))}
      </div>
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
      <div className="analysis-cards">
        {entregaPorProdutor.map((p) => (
          <article className="analysis-card" key={p.nome}>
            <h4>{p.nome}</h4>
            <p><strong>{formatPtBrNumber(p.totalKg)}</strong> kg liquido</p>
            <p><strong>{formatPtBrNumber(p.totalSacas)}</strong> sacas</p>
            <p><strong>{p.viagens}</strong> viagens</p>
          </article>
        ))}
      </div>
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
  const isFromCurrentUser = useCallback(
    <T extends { created_by: string }>(row: T) => row.created_by === userId,
    [userId]
  )

  const [armazens, setArmazens] = useState<BaseEntity[]>([])
  const [produtores, setProdutores] = useState<BaseEntity[]>([])
  const [cargas, setCargas] = useState<Carga[]>([])
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
  const [vendaFeedback, setVendaFeedback] = useState<Notice>(null)
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
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray()
    ]).then(([ars, ps, cs, mov, ven]) => {
      setArmazens(ars.filter(isFromCurrentUser))
      setProdutores(ps.filter(isFromCurrentUser))
      setCargas(cs.filter(isFromCurrentUser))
      setMovimentos(mov.filter(isFromCurrentUser))
      setVendas(ven.filter(isFromCurrentUser))
    })
  }, [isFromCurrentUser, refreshTick])

  async function carregar() {
    const [ars, ps, cs, mov, ven] = await Promise.all([
      db.armazens.toArray(),
      db.produtores.toArray(),
      db.cargas.toArray(),
      db.movimento_estoque.toArray(),
      db.venda_grao.toArray()
    ])
    setArmazens(ars.filter(isFromCurrentUser))
    setProdutores(ps.filter(isFromCurrentUser))
    setCargas(cs.filter(isFromCurrentUser))
    setMovimentos(mov.filter(isFromCurrentUser))
    setVendas(ven.filter(isFromCurrentUser))
  }

  const nomeArmazem = new Map(armazens.map((a) => [a.id, a.nome]))
  const nomeProdutor = new Map(produtores.map((p) => [p.id, p.nome]))
  const saldoBasePorArmazem = new Map<string, number>()
  for (const c of cargas) {
    saldoBasePorArmazem.set(c.armazem_id, (saldoBasePorArmazem.get(c.armazem_id) ?? 0) + c.sacas)
  }
  for (const v of vendas) {
    if (v.status !== 'ativa') continue
    saldoBasePorArmazem.set(v.armazem_cliente_id, (saldoBasePorArmazem.get(v.armazem_cliente_id) ?? 0) - v.sacas)
  }
  for (const m of movimentos) {
    if (isMovimentoAutomaticoDeCarga(m)) continue
    if (!isAjusteManualValido(m)) continue
    if (m.tipo === 'entrada' || m.tipo === 'estorno') {
      saldoBasePorArmazem.set(m.armazem_id, (saldoBasePorArmazem.get(m.armazem_id) ?? 0) + m.sacas)
    } else if (m.tipo === 'saida') {
      saldoBasePorArmazem.set(m.armazem_id, (saldoBasePorArmazem.get(m.armazem_id) ?? 0) - m.sacas)
    }
  }

  const saldoPorArmazem = armazens
    .map((a) => ({
      armazemId: a.id,
      armazem: a.nome,
      saldo: Math.max(0, Number((saldoBasePorArmazem.get(a.id) ?? 0).toFixed(4)))
    }))
    .sort((a, b) => a.armazem.localeCompare(b.armazem))
  const totalCargaProdutor = vProdutor ? cargas.filter((c) => c.produtor_id === vProdutor).reduce((acc, c) => acc + c.sacas, 0) : 0
  const totalVendaProdutor = vProdutor ? vendas.filter((v) => v.produtor_id === vProdutor && v.status === 'ativa').reduce((acc, v) => acc + v.sacas, 0) : 0
  const saldoDisponivelProdutor = Number((totalCargaProdutor - totalVendaProdutor).toFixed(4))
  const sacasSolicitadas = parsePtBrNumber(vSacas)
  const valorPorSacaAtual = parsePtBrNumber(vValorSaca)
  const saldoRestanteVenda = Number.isFinite(sacasSolicitadas)
    ? Number((saldoDisponivelProdutor - sacasSolicitadas).toFixed(4))
    : saldoDisponivelProdutor
  const totalEstoqueComExclusoesBruto = Number(
    (
      cargas
        .filter((c) => !produtoresExcluidos.includes(c.produtor_id))
        .reduce((acc, c) => acc + c.sacas, 0) -
      vendas
        .filter((v) => v.status === 'ativa' && !produtoresExcluidos.includes(v.produtor_id))
        .reduce((acc, v) => acc + v.sacas, 0)
    ).toFixed(4)
  )
  const totalEstoqueComExclusoes = Math.max(0, totalEstoqueComExclusoesBruto)

  async function salvarVenda() {
    try {
      const sacas = parsePtBrNumber(vSacas)
      const valorPorSaca = parsePtBrNumber(vValorSaca)
      if (!vProdutor || !vArmazem || !vData || !Number.isFinite(sacas) || sacas <= 0 || !Number.isFinite(valorPorSaca) || valorPorSaca <= 0) {
        setVendaFeedback({ type: 'error', message: 'Preencha os campos obrigatorios da venda.' })
        onNotify('error', 'Preencha os campos obrigatorios da venda.')
        return
      }
      if (saldoDisponivelProdutor < sacas) {
        setVendaFeedback({ type: 'error', message: 'Saldo insuficiente deste produtor para venda.' })
        onNotify('error', 'Saldo insuficiente deste produtor para venda.')
        return
      }
      const saldoArmazemSelecionado = saldoPorArmazem.find((s) => s.armazemId === vArmazem)?.saldo ?? 0
      if (saldoArmazemSelecionado < sacas) {
        setVendaFeedback({ type: 'error', message: 'Saldo insuficiente para esta venda.' })
        onNotify('error', 'Saldo insuficiente para esta venda.')
        return
      }
      const similares = vendas.filter((v) => {
        if (v.status !== 'ativa') return false
        if (v.data !== vData) return false
        if (v.produtor_id !== vProdutor) return false
        if (v.armazem_cliente_id !== vArmazem) return false
        const difSacas = Math.abs(v.sacas - sacas)
        const difValor = Math.abs(v.valor_por_saca - valorPorSaca)
        return difSacas <= 1 && difValor <= 1
      })
      if (similares.length > 0) {
        const confirmar = window.confirm(
          `Atencao: encontramos ${similares.length} venda(s) parecida(s) para este produtor/armazem na mesma data. Deseja salvar mesmo assim?`
        )
        if (!confirmar) {
          setVendaFeedback({ type: 'error', message: 'Salvamento cancelado para evitar duplicidade.' })
          onNotify('error', 'Salvamento cancelado para evitar duplicidade.')
          return
        }
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
      setVData(localDateYmd())
      setVProdutor('')
      setVArmazem('')
      setVSacas('')
      setVValorSaca('')
      await carregar()
      onSaved()
      await runSync()
      setVendaFeedback({ type: 'success', message: 'Venda registrada com sucesso.' })
      onNotify('success', 'Venda registrada com sucesso.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao registrar venda.'
      if (/sync|nuvem|permission|network|fetch/i.test(message)) {
        setVendaFeedback({ type: 'success', message: 'Venda salva neste aparelho. A sincronizacao com a nuvem falhou e podera ser refeita depois.' })
        onNotify('success', 'Venda salva neste aparelho. A sincronizacao com a nuvem falhou e podera ser refeita depois.')
        return
      }
      setVendaFeedback({ type: 'error', message: `Nao foi possivel registrar a venda. Detalhe: ${message}` })
      onNotify('error', `Nao foi possivel registrar a venda. Detalhe: ${message}`)
    }
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
    await carregar()
    onSaved()
    try {
      await runSync()
      onNotify('success', 'Venda cancelada e estoque estornado.')
    } catch {
      onNotify('success', 'Cancelamento salvo neste aparelho. A sincronizacao com a nuvem falhou e podera ser refeita depois.')
    }
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
      tipo: ajTipo,
      armazemId: ajArmazem,
      sacas,
      origem: 'manual',
      referenciaId: makeId(),
      motivo: `Ajuste manual: ${ajMotivo.trim()}`
    })
    await runSync()
    setAjSacas('')
    setAjMotivo('')
    await carregar()
    onSaved()
    onNotify('success', 'Ajuste de estoque aplicado com sucesso.')
  }

  async function recalcularSaldosArmazens() {
    const confirmar = window.confirm('Recalcular saldos agora? Isso vai corrigir residuos antigos e manter apenas o saldo baseado em cargas, vendas e ajustes manuais validos.')
    if (!confirmar) return

    const baseMap = new Map<string, number>()
    for (const c of cargas) {
      baseMap.set(c.armazem_id, (baseMap.get(c.armazem_id) ?? 0) + c.sacas)
    }
    for (const v of vendas) {
      if (v.status !== 'ativa') continue
      baseMap.set(v.armazem_cliente_id, (baseMap.get(v.armazem_cliente_id) ?? 0) - v.sacas)
    }
    for (const m of movimentos) {
      if (isMovimentoAutomaticoDeCarga(m)) continue
      if (!isAjusteManualValido(m)) continue
      if (m.tipo === 'entrada' || m.tipo === 'estorno') {
        baseMap.set(m.armazem_id, (baseMap.get(m.armazem_id) ?? 0) + m.sacas)
      } else if (m.tipo === 'saida') {
        baseMap.set(m.armazem_id, (baseMap.get(m.armazem_id) ?? 0) - m.sacas)
      }
    }

    const now = nowIso()
    for (const armazem of armazens) {
      const saldo = Math.max(0, Number((baseMap.get(armazem.id) ?? 0).toFixed(4)))
      const atual = await db.estoque_armazem.where('armazem_id').equals(armazem.id).first()
      if (atual) {
        const updated: EstoqueArmazem = {
          ...atual,
          saldo_sacas: saldo,
          updated_at: now,
          updated_by: userId,
          sync_status: 'pending_sync'
        }
        await db.estoque_armazem.put(updated)
        await queueOp('estoque_armazem', updated.id, updated)
      } else {
        const novo: EstoqueArmazem = {
          id: makeId(),
          armazem_id: armazem.id,
          saldo_sacas: saldo,
          created_at: now,
          updated_at: now,
          created_by: userId,
          updated_by: userId,
          sync_status: 'pending_sync'
        }
        await db.estoque_armazem.put(novo)
        await queueOp('estoque_armazem', novo.id, novo)
      }
    }

    await runSync()
    await carregar()
    onSaved()
    onNotify('success', 'Saldos recalculados com sucesso.')
  }

  const vendasFiltradas = vendas
    .filter((v) => v.data >= filtroInicio && v.data <= filtroFim)
    .sort((a, b) => `${b.data}T${b.created_at}`.localeCompare(`${a.data}T${a.created_at}`))
  const movimentosFiltrados = movimentos.filter((m) => {
    const d = localYmdFromValue(m.created_at)
    return d >= filtroInicio && d <= filtroFim
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))

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
    const resumo = [
      ['resumo', 'periodo_inicio', '', '', filtroInicio, '', '', ''],
      ['resumo', 'periodo_fim', '', '', filtroFim, '', '', ''],
      ['resumo', 'total_vendido_sacas', '', '', resumoVendas.totalSacas.toFixed(2), '', '', ''],
      ['resumo', 'total_vendas_rs', '', '', '', resumoVendas.totalValor.toFixed(2), '', ''],
      ['resumo', 'valor_medio_por_saca_rs', '', '', '', valorMedioPorSaca.toFixed(2), '', '']
    ]
    const vendasRows = vendasFiltradas.map((v) => ['venda', v.data, nomeProdutor.get(v.produtor_id) ?? v.produtor_id, nomeArmazem.get(v.armazem_cliente_id) ?? v.armazem_cliente_id, v.sacas.toFixed(2), v.valor_total.toFixed(2), v.status, ''])
    const movRows = movimentosFiltrados.map((m) => [
      'movimento',
      localYmdFromValue(m.created_at),
      '-',
      nomeArmazem.get(m.armazem_id) ?? m.armazem_id,
      m.sacas.toFixed(2),
      '',
      m.tipo,
      m.motivo ?? ''
    ])
    const csv = [cab, ...resumo, ...vendasRows, ...movRows].map((r) => r.join(';')).join('\n')
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
    const emissao = formatDateTimeBrWithZone(nowIso())
    let y = 14
    doc.setFontSize(16)
    doc.text('RELATORIO DE ARMAZENAGEM E VENDAS', 14, y)
    y += 8
    doc.setFontSize(11)
    doc.text(`Data/Hora local: ${emissao}`, 14, y)
    y += 6
    doc.text(`Periodo: ${formatDateBr(filtroInicio)} ate ${formatDateBr(filtroFim)}`, 14, y)
    y += 6
    doc.text(`Total vendido: ${formatPtBrNumber(resumoVendas.totalSacas)} sacas | R$ ${formatPtBrNumber(resumoVendas.totalValor)}`, 14, y)
    y += 6
    doc.text(`Valor medio por saca: R$ ${formatPtBrNumber(valorMedioPorSaca)}`, 14, y)
    y += 6
    doc.text(`Estoque total (considerando exclusoes): ${formatPtBrNumber(totalEstoqueComExclusoes)} sacas`, 14, y)
    y += 8
    doc.setFontSize(12)
    doc.text('Detalhamento de Saldo por Armazem', 14, y)
    y += 6
    doc.setFontSize(10)
    for (const s of saldoPorArmazem) {
      doc.text(`${s.armazem}: ${formatPtBrNumber(s.saldo)} sacas`, 14, y)
      y += 5
      if (y > 280) { doc.addPage(); y = 14 }
    }
    y += 4
    doc.setFontSize(12)
    doc.text('Detalhamento das Vendas no Periodo', 14, y)
    y += 6
    doc.setFontSize(10)
    for (const v of vendasFiltradas) {
      const linha = `${v.data} | Produtor: ${nomeProdutor.get(v.produtor_id) ?? v.produtor_id} | ${nomeArmazem.get(v.armazem_cliente_id) ?? v.armazem_cliente_id} | ${formatPtBrNumber(v.sacas)} sacas | R$ ${formatPtBrNumber(v.valor_total)} | ${v.status}`
      const partes = doc.splitTextToSize(linha, 180)
      doc.text(partes, 14, y)
      y += partes.length * 5
      if (y > 280) { doc.addPage(); y = 14 }
    }
    if (y > 250) {
      doc.addPage()
      y = 14
    } else {
      y += 10
    }
    doc.setDrawColor(140, 160, 150)
    doc.line(14, y, 196, y)
    y += 8
    doc.setFontSize(11)
    doc.text('Conferencia e Assinatura', 14, y)
    y += 8
    doc.setFontSize(10)
    doc.text('Responsavel pela armazenagem: ____________________________', 14, y)
    y += 10
    doc.text('Responsavel pela venda: ___________________________________', 14, y)
    y += 10
    doc.text('Data da conferencia: ____/____/________', 14, y)
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
      {vendaFeedback && <p className={vendaFeedback.type === 'error' ? 'error' : 'info'}>{vendaFeedback.message}</p>}

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
      <div className="actions">
        <button onClick={() => void recalcularSaldosArmazens()}>Recalcular saldos agora</button>
      </div>
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
            {formatDateBr(m.created_at)} | {nomeArmazem.get(m.armazem_id) ?? m.armazem_id} | {m.tipo} | {formatPtBrNumber(m.sacas)} sacas | {m.origem}{m.motivo ? ` | motivo: ${m.motivo}` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Frete({
  refreshTick,
  ownerEmail,
  userId,
  onNotify
}: {
  refreshTick: number
  ownerEmail: string
  userId: string
  onNotify: (type: NoticeType, message: string) => void
}) {
  const [cargas, setCargas] = useState<Carga[]>([])
  const [caminhoes, setCaminhoes] = useState<BaseEntity[]>([])
  const [propriedades, setPropriedades] = useState<BaseEntity[]>([])
  const [safras, setSafras] = useState<Safra[]>([])
  const [lancamentos, setLancamentos] = useState<FreteLancamento[]>([])
  const [safraId, setSafraId] = useState('')
  const [caminhaoId, setCaminhaoId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [valorPorSaca, setValorPorSaca] = useState('')
  const [safraNome, setSafraNome] = useState('')
  const [safraCultura, setSafraCultura] = useState('')
  const [safraAno, setSafraAno] = useState(String(new Date().getFullYear()))
  const [safraInicio, setSafraInicio] = useState('')
  const [safraFim, setSafraFim] = useState('')
  const [dieselData, setDieselData] = useState(localDateYmd())
  const [dieselLitros, setDieselLitros] = useState('')
  const [dieselPreco, setDieselPreco] = useState('')
  const [dieselObs, setDieselObs] = useState('')
  const [valeData, setValeData] = useState(localDateYmd())
  const [valeValor, setValeValor] = useState('')
  const [valeObs, setValeObs] = useState('')
  const [reciboPagador, setReciboPagador] = useState('')
  const [reciboData, setReciboData] = useState(localDateYmd())
  const [reciboLocal, setReciboLocal] = useState('')
  const [reciboRecebedor, setReciboRecebedor] = useState('')
  const [reciboValor, setReciboValor] = useState('')
  const [reciboDocumentoTipo, setReciboDocumentoTipo] = useState<'CPF' | 'RG'>('CPF')
  const [reciboDocumentoNumero, setReciboDocumentoNumero] = useState('')

  const carregar = useCallback(async () => {
    const [cs, cms, props, sfs, lancs] = await Promise.all([
      db.cargas.toArray(),
      db.caminhoes.toArray(),
      db.propriedades.toArray(),
      db.safras.toArray(),
      db.frete_lancamentos.toArray()
    ])
      setCargas(cs)
      setCaminhoes(cms)
      setPropriedades(props)
    setSafras(sfs.filter((s) => s.created_by === userId).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio)))
    setLancamentos(lancs.filter((l) => l.created_by === userId))
  }, [userId])

  useEffect(() => {
    void carregar()
  }, [carregar, refreshTick])

  const safraSelecionada = safras.find((s) => s.id === safraId)

  useEffect(() => {
    if (!safraSelecionada) return
    setDataInicio(safraSelecionada.data_inicio)
    setDataFim(safraSelecionada.data_fim)
    if (!reciboPagador && propriedades[0]?.nome) setReciboPagador(propriedades[0].nome)
  }, [propriedades, reciboPagador, safraSelecionada])

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
  const lancamentosFiltrados = lancamentos
    .filter((l) => (!safraId || l.safra_id === safraId) && (!caminhaoId || l.caminhao_id === caminhaoId))
    .sort((a, b) => `${b.data}T${b.created_at}`.localeCompare(`${a.data}T${a.created_at}`))
  const abastecidas = lancamentosFiltrados.filter((l) => l.tipo === 'diesel')
  const vales = lancamentosFiltrados.filter((l) => l.tipo === 'vale')
  const fechamento = calcularFechamentoFrete({
    totalViagens,
    totalSacas,
    valorPorSaca: Number.isFinite(valorSacaNum) ? valorSacaNum : 0,
    lancamentos: lancamentosFiltrados
  })
  const dieselValorAtual = calcularValorDiesel(parsePtBrNumber(dieselLitros), parsePtBrNumber(dieselPreco))

  useEffect(() => {
    setReciboValor(fechamento.valorLiquido ? String(fechamento.valorLiquido) : '')
  }, [fechamento.valorLiquido])

  async function salvarSafra() {
    if (!safraNome.trim() || !safraCultura.trim() || !safraAno.trim() || !safraInicio || !safraFim) {
      onNotify('error', 'Preencha nome, cultura, ano e periodo da safra.')
      return
    }
    if (safraFim < safraInicio) {
      onNotify('error', 'Data final da safra nao pode ser menor que a inicial.')
      return
    }
    const now = nowIso()
    const row: Safra = {
      id: makeId(),
      nome: safraNome.trim(),
      cultura: safraCultura.trim().toLowerCase(),
      ano: safraAno.trim(),
      data_inicio: safraInicio,
      data_fim: safraFim,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId,
      sync_status: 'pending_sync'
    }
    await db.safras.put(row)
    await queueOp('safras', row.id, row)
    try {
      await runSync()
    } catch {
      onNotify('success', 'Safra salva neste aparelho. Sincronize depois quando a nuvem estiver disponivel.')
    }
    setSafraId(row.id)
    setSafraNome('')
    setSafraCultura('')
    setSafraAno(String(new Date().getFullYear()))
    setSafraInicio('')
    setSafraFim('')
    await carregar()
    onNotify('success', 'Safra salva com sucesso.')
  }

  function validarContextoLancamento() {
    if (!safraSelecionada || !caminhaoId) {
      onNotify('error', 'Selecione uma safra e um caminhao.')
      return false
    }
    return true
  }

  function dataDentroDaSafra(data: string) {
    if (!safraSelecionada) return false
    return data >= safraSelecionada.data_inicio && data <= safraSelecionada.data_fim
  }

  async function salvarDiesel() {
    if (!validarContextoLancamento()) return
    const litros = parsePtBrNumber(dieselLitros)
    const precoLitro = parsePtBrNumber(dieselPreco)
    if (!dieselData || !Number.isFinite(litros) || litros <= 0 || !Number.isFinite(precoLitro) || precoLitro <= 0) {
      onNotify('error', 'Informe data, litros e preco por litro validos.')
      return
    }
    if (!dataDentroDaSafra(dieselData)) {
      onNotify('error', 'A data do diesel deve estar dentro da safra selecionada.')
      return
    }
    const now = nowIso()
    const row: FreteLancamento = {
      id: makeId(),
      safra_id: safraId,
      caminhao_id: caminhaoId,
      tipo: 'diesel',
      data: dieselData,
      litros,
      preco_litro: precoLitro,
      valor_total: calcularValorDiesel(litros, precoLitro),
      observacao: dieselObs.trim() || undefined,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId,
      sync_status: 'pending_sync'
    }
    await db.frete_lancamentos.put(row)
    await queueOp('frete_lancamentos', row.id, row)
    try {
      await runSync()
    } catch {
      onNotify('success', 'Abastecida salva neste aparelho. Sincronize depois quando a nuvem estiver disponivel.')
    }
    setDieselLitros('')
    setDieselPreco('')
    setDieselObs('')
    await carregar()
    onNotify('success', 'Abastecida de diesel registrada.')
  }

  async function salvarVale() {
    if (!validarContextoLancamento()) return
    const valor = parsePtBrNumber(valeValor)
    if (!valeData || !Number.isFinite(valor) || valor <= 0) {
      onNotify('error', 'Informe data e valor do vale.')
      return
    }
    if (!dataDentroDaSafra(valeData)) {
      onNotify('error', 'A data do vale deve estar dentro da safra selecionada.')
      return
    }
    const now = nowIso()
    const row: FreteLancamento = {
      id: makeId(),
      safra_id: safraId,
      caminhao_id: caminhaoId,
      tipo: 'vale',
      data: valeData,
      litros: null,
      preco_litro: null,
      valor_total: Number(valor.toFixed(2)),
      observacao: valeObs.trim() || undefined,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: userId,
      sync_status: 'pending_sync'
    }
    await db.frete_lancamentos.put(row)
    await queueOp('frete_lancamentos', row.id, row)
    try {
      await runSync()
    } catch {
      onNotify('success', 'Vale salvo neste aparelho. Sincronize depois quando a nuvem estiver disponivel.')
    }
    setValeValor('')
    setValeObs('')
    await carregar()
    onNotify('success', 'Vale registrado.')
  }

  async function apagarLancamento(id: string) {
    const ok = window.confirm('Apagar este lancamento de frete?')
    if (!ok) return
    await db.frete_lancamentos.delete(id)
    await db.pending_ops.where('record_id').equals(id).delete()
    await queueDeleteOp('frete_lancamentos', id)
    try {
      await runSync()
    } catch {
      onNotify('success', 'Lancamento apagado neste aparelho. Sincronize depois quando a nuvem estiver disponivel.')
    }
    await carregar()
    onNotify('success', 'Lancamento apagado.')
  }

  function exportarCsv() {
    const cab = ['tipo', 'data', 'descricao', 'placa', 'peso_bruto_kg', 'sacas', 'litros', 'preco_litro_rs', 'valor_rs']
    const resumo = [
      ['resumo', 'safra', safraSelecionada?.nome ?? '-', '', '', '', '', '', ''],
      ['resumo', 'cultura', safraSelecionada?.cultura ?? '-', '', '', '', '', '', ''],
      ['resumo', 'ano', safraSelecionada?.ano ?? '-', '', '', '', '', '', ''],
      ['resumo', 'periodo_inicio', dataInicio || '-', '', '', '', '', '', ''],
      ['resumo', 'periodo_fim', dataFim || '-', '', '', '', '', '', ''],
      ['resumo', 'total_viagens', String(totalViagens), '', '', '', '', '', ''],
      ['resumo', 'total_bruto_kg', '', '', totalKgBruto.toFixed(2), '', '', '', ''],
      ['resumo', 'total_sacas', '', '', '', fechamento.totalSacas.toFixed(2), '', '', ''],
      ['resumo', 'valor_por_saca_rs', '', '', '', '', '', '', fechamento.valorPorSaca.toFixed(2)],
      ['resumo', 'frete_bruto_rs', '', '', '', '', '', '', fechamento.freteBruto.toFixed(2)],
      ['resumo', 'total_diesel_rs', '', '', '', '', '', '', fechamento.totalDiesel.toFixed(2)],
      ['resumo', 'total_vales_rs', '', '', '', '', '', '', fechamento.totalVales.toFixed(2)],
      ['resumo', 'valor_liquido_rs', '', '', '', '', '', '', fechamento.valorLiquido.toFixed(2)]
    ]
    const linhas = filtradas.map((c) => [
      'viagem',
      c.data,
      'Carga transportada',
      placaPorId.get(c.placa) ?? c.placa,
      c.peso_bruto_kg.toFixed(2),
      c.sacas.toFixed(2),
      '',
      '',
      (c.sacas * fechamento.valorPorSaca).toFixed(2)
    ])
    const lancRows = lancamentosFiltrados.map((l) => [
      l.tipo,
      l.data,
      l.observacao ?? (l.tipo === 'diesel' ? 'Abastecida de diesel' : 'Vale em dinheiro'),
      placaPorId.get(l.caminhao_id) ?? l.caminhao_id,
      '',
      '',
      l.litros?.toFixed(2) ?? '',
      l.preco_litro?.toFixed(2) ?? '',
      l.valor_total.toFixed(2)
    ])
    const csv = [cab, ...resumo, ...linhas, ...lancRows].map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'relatorio-frete.csv'
    a.click()
    URL.revokeObjectURL(url)
    onNotify('success', 'Relatorio CSV gerado com sucesso.')
  }

  function ensureSpace(doc: jsPDF, y: number, needed = 18) {
    if (y + needed <= 280) return y
    doc.addPage()
    return 14
  }

  function exportarRelatorioConferenciaPdf() {
    const doc = new jsPDF()
    const placaSelecionada = caminhaoId ? (placaPorId.get(caminhaoId) ?? caminhaoId) : 'Todos'
    const fazendaNome = propriedades.length > 0 ? propriedades[0].nome : 'Fazenda nao informada'
    let y = 14
    const dataEmissao = formatDateTimeBrWithZone(nowIso())
    doc.setFontSize(17)
    doc.text('RELATORIO DE CONFERENCIA DE FRETE', 14, y)
    y += 8
    doc.setFontSize(11)
    doc.text('Documento para conferencia de contas antes do pagamento. Nao e recibo de quitacao.', 14, y)
    y += 6
    doc.text(`Data/Hora local: ${dataEmissao}`, 14, y)
    y += 6
    doc.text(`Fazenda: ${fazendaNome}`, 14, y)
    y += 6
    doc.text(`Responsavel: ${ownerEmail}`, 14, y)
    y += 6
    doc.text(`Caminhao (placa): ${placaSelecionada}`, 14, y)
    y += 6
    doc.text(`Safra: ${safraSelecionada ? `${safraSelecionada.nome} | ${safraSelecionada.cultura} ${safraSelecionada.ano}` : '-'}`, 14, y)
    y += 6
    doc.text(`Periodo: ${dataInicio ? formatDateBr(dataInicio) : '-'} ate ${dataFim ? formatDateBr(dataFim) : '-'}`, 14, y)
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
    y += 6
    doc.text(`Valor por saca: R$ ${formatPtBrNumber(fechamento.valorPorSaca)}`, 14, y)
    y += 6
    doc.text(`Frete bruto: R$ ${formatPtBrNumber(fechamento.freteBruto)}`, 14, y)
    y += 6
    doc.text(`Diesel: R$ ${formatPtBrNumber(fechamento.totalDiesel)} | Vales: R$ ${formatPtBrNumber(fechamento.totalVales)}`, 14, y)
    y += 6
    doc.text(`Valor liquido: R$ ${formatPtBrNumber(fechamento.valorLiquido)}`, 14, y)
    y += 6
    doc.text(`Litros diesel: ${formatPtBrNumber(fechamento.totalLitrosDiesel)} | Preco medio diesel: R$ ${formatPtBrNumber(fechamento.precoMedioDiesel)}`, 14, y)
    y += 10

    doc.setFontSize(12)
    doc.text('Detalhamento das Viagens', 14, y)
    y += 6
    doc.setFontSize(10)

    if (filtradas.length === 0) {
      doc.text('Nenhum registro encontrado.', 14, y)
    } else {
      for (const c of filtradas) {
        const linhaFrete = `${formatDateBr(c.data)} | ${placaPorId.get(c.placa) ?? c.placa} | ${formatPtBrNumber(c.peso_bruto_kg)} kg bruto | ${formatPtBrNumber(c.sacas)} sacas | frete R$ ${formatPtBrNumber(c.sacas * fechamento.valorPorSaca)}`
        const partes = doc.splitTextToSize(linhaFrete, 180)
        y = ensureSpace(doc, y, partes.length * 5 + 4)
        doc.text(partes, 14, y)
        y += partes.length * 5
      }
    }

    y = ensureSpace(doc, y, 26)
    y += 8
    doc.setFontSize(12)
    doc.text('Abastecidas de Diesel', 14, y)
    y += 6
    doc.setFontSize(10)
    if (abastecidas.length === 0) {
      doc.text('Nenhuma abastecida registrada.', 14, y)
      y += 5
    } else {
      for (const l of abastecidas) {
        const linha = `${formatDateBr(l.data)} | ${formatPtBrNumber(l.litros ?? 0)} litros | R$ ${formatPtBrNumber(l.preco_litro ?? 0)}/litro | total R$ ${formatPtBrNumber(l.valor_total)}${l.observacao ? ` | ${l.observacao}` : ''}`
        const partes = doc.splitTextToSize(linha, 180)
        y = ensureSpace(doc, y, partes.length * 5 + 4)
        doc.text(partes, 14, y)
        y += partes.length * 5
      }
    }

    y = ensureSpace(doc, y, 26)
    y += 8
    doc.setFontSize(12)
    doc.text('Vales em Dinheiro', 14, y)
    y += 6
    doc.setFontSize(10)
    if (vales.length === 0) {
      doc.text('Nenhum vale registrado.', 14, y)
    } else {
      for (const l of vales) {
        const linha = `${formatDateBr(l.data)} | R$ ${formatPtBrNumber(l.valor_total)}${l.observacao ? ` | ${l.observacao}` : ''}`
        const partes = doc.splitTextToSize(linha, 180)
        y = ensureSpace(doc, y, partes.length * 5 + 4)
        doc.text(partes, 14, y)
        y += partes.length * 5
      }
    }

    doc.save('relatorio-conferencia-frete.pdf')
    onNotify('success', 'Relatorio de conferencia gerado com sucesso.')
  }

  function exportarReciboPdf() {
    if (!safraSelecionada || !caminhaoId) {
      onNotify('error', 'Selecione safra e caminhao para gerar o recibo.')
      return
    }
    const valor = parsePtBrNumber(reciboValor)
    if (!reciboPagador.trim() || !reciboData || !reciboLocal.trim() || !reciboRecebedor.trim() || !reciboDocumentoNumero.trim() || !Number.isFinite(valor)) {
      onNotify('error', 'Preencha pagador, valor, data, local, recebedor e documento do recibo.')
      return
    }
    const doc = new jsPDF()
    const valorExtensoInfo = `Valor por extenso: ${valorReaisPorExtenso(valor)}`
    let y = 22
    doc.setFontSize(17)
    doc.text('RECIBO DE PAGAMENTO DE FRETE', 14, y)
    y += 14
    doc.setFontSize(12)
    const texto = `Recebi de ${reciboPagador.trim()} a quantia de R$ ${formatPtBrNumber(valor)} no dia ${formatDateBr(reciboData)} em ${reciboLocal.trim()}, referente a frete de colheita de ${safraSelecionada.cultura} da safra ${safraSelecionada.ano}.`
    const partes = doc.splitTextToSize(texto, 180)
    doc.text(partes, 14, y)
    y += partes.length * 7 + 8
    doc.text(`Caminhao/placa: ${placaPorId.get(caminhaoId) ?? caminhaoId}`, 14, y)
    y += 8
    doc.text(`Recebedor: ${reciboRecebedor.trim()}`, 14, y)
    y += 12
    doc.text(valorExtensoInfo, 14, y)
    y += 26
    doc.text('Assinatura do recebedor: __________________________________________', 14, y)
    y += 14
    doc.text(`Documento (${reciboDocumentoTipo}): ${reciboDocumentoNumero.trim()}`, 14, y)
    doc.save('recibo-pagamento-frete.pdf')
    onNotify('success', 'Recibo de pagamento gerado com sucesso.')
  }

  return (
    <section className="panel">
      <h2>Frete por Safra e Caminhao</h2>
      <h3>Cadastro de Safra</h3>
      <div className="grid">
        <input placeholder="Nome da safra (ex: Safra Soja 2026)" value={safraNome} onChange={(e) => setSafraNome(e.target.value)} />
        <input placeholder="Cultura (soja, milho...)" value={safraCultura} onChange={(e) => setSafraCultura(e.target.value)} />
        <input placeholder="Ano da safra" value={safraAno} onChange={(e) => setSafraAno(e.target.value)} />
        <input type="date" value={safraInicio} onChange={(e) => setSafraInicio(e.target.value)} />
        <input type="date" value={safraFim} onChange={(e) => setSafraFim(e.target.value)} />
      </div>
      <div className="actions">
        <button onClick={() => void salvarSafra()}>Salvar safra</button>
      </div>

      <h3>Fechamento</h3>
      <div className="grid frete-filtros">
        <SelectFromList label="Safra" value={safraId} onChange={setSafraId} items={safras} />
        <SelectFromList label="Caminhao" value={caminhaoId} onChange={setCaminhaoId} items={caminhoes} />
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        <input placeholder="Valor por saca (R$)" value={valorPorSaca} onChange={(e) => setValorPorSaca(e.target.value)} />
      </div>
      <div className="kpis">
        <article><span>Total de viagens</span><strong>{totalViagens}</strong></article>
        <article><span>Total bruto (kg)</span><strong>{formatPtBrNumber(totalKgBruto)}</strong></article>
        <article><span>Total em sacas</span><strong>{formatPtBrNumber(totalSacas)}</strong></article>
        <article><span>Frete bruto (R$)</span><strong>{formatPtBrNumber(fechamento.freteBruto)}</strong></article>
        <article><span>Diesel (R$)</span><strong>{formatPtBrNumber(fechamento.totalDiesel)}</strong></article>
        <article><span>Vales (R$)</span><strong>{formatPtBrNumber(fechamento.totalVales)}</strong></article>
        <article><span>Liquido a pagar (R$)</span><strong>{formatPtBrNumber(fechamento.valorLiquido)}</strong></article>
        <article><span>Preco medio diesel (R$/L)</span><strong>{formatPtBrNumber(fechamento.precoMedioDiesel)}</strong></article>
      </div>

      <h3>Abastecida de diesel</h3>
      <div className="grid">
        <input type="date" value={dieselData} onChange={(e) => setDieselData(e.target.value)} />
        <input placeholder="Litros" value={dieselLitros} onChange={(e) => setDieselLitros(e.target.value)} />
        <input placeholder="Preco por litro (R$)" value={dieselPreco} onChange={(e) => setDieselPreco(e.target.value)} />
        <input placeholder="Observacao" value={dieselObs} onChange={(e) => setDieselObs(e.target.value)} />
      </div>
      <p className="info">Total desta abastecida: R$ {formatPtBrNumber(dieselValorAtual)}</p>
      <div className="actions">
        <button onClick={() => void salvarDiesel()}>Registrar diesel</button>
      </div>

      <h3>Vale em dinheiro</h3>
      <div className="grid">
        <input type="date" value={valeData} onChange={(e) => setValeData(e.target.value)} />
        <input placeholder="Valor do vale (R$)" value={valeValor} onChange={(e) => setValeValor(e.target.value)} />
        <input placeholder="Observacao" value={valeObs} onChange={(e) => setValeObs(e.target.value)} />
      </div>
      <div className="actions">
        <button onClick={() => void salvarVale()}>Registrar vale</button>
      </div>

      <div className="actions frete-actions">
        <button onClick={exportarCsv}>Exportar CSV</button>
        <button onClick={exportarRelatorioConferenciaPdf}>Gerar relatorio de conferencia</button>
      </div>

      <h3>Recibo de pagamento</h3>
      <div className="grid">
        <input placeholder="Recebi de (pagador)" value={reciboPagador} onChange={(e) => setReciboPagador(e.target.value)} />
        <input placeholder="Valor recebido (R$)" value={reciboValor} onChange={(e) => setReciboValor(e.target.value)} />
        <input type="date" value={reciboData} onChange={(e) => setReciboData(e.target.value)} />
        <input placeholder="Local" value={reciboLocal} onChange={(e) => setReciboLocal(e.target.value)} />
        <input placeholder="Recebedor / caminhoneiro" value={reciboRecebedor} onChange={(e) => setReciboRecebedor(e.target.value)} />
        <select value={reciboDocumentoTipo} onChange={(e) => setReciboDocumentoTipo(e.target.value as 'CPF' | 'RG')}>
          <option value="CPF">CPF</option>
          <option value="RG">RG</option>
        </select>
        <input placeholder="Numero do documento" value={reciboDocumentoNumero} onChange={(e) => setReciboDocumentoNumero(e.target.value)} />
      </div>
      <p className="info">Valor por extenso: {valorReaisPorExtenso(parsePtBrNumber(reciboValor))}</p>
      <div className="actions">
        <button onClick={exportarReciboPdf}>Gerar recibo separado</button>
      </div>

      <h3>Abastecidas e vales</h3>
      <ul>
        {lancamentosFiltrados.length === 0 && <li>Nenhum diesel ou vale registrado para este filtro.</li>}
        {lancamentosFiltrados.map((l) => (
          <li key={l.id}>
            {formatDateBr(l.data)} | {l.tipo === 'diesel' ? `Diesel: ${formatPtBrNumber(l.litros ?? 0)} L x R$ ${formatPtBrNumber(l.preco_litro ?? 0)}` : 'Vale'} | R$ {formatPtBrNumber(l.valor_total)}{l.observacao ? ` | ${l.observacao}` : ''}
            <button onClick={() => void apagarLancamento(l.id)}>Apagar</button>
          </li>
        ))}
      </ul>

      <h3>Viagens no periodo</h3>
      <ul className="frete-lista">
        {filtradas.map((c) => (
          <li key={c.id}>
            {c.data} | {placaPorId.get(c.placa) ?? c.placa} | {formatPtBrNumber(c.peso_bruto_kg)} kg bruto | {formatPtBrNumber(c.sacas)} sacas
            {Number.isFinite(valorSacaNum) ? ` | frete R$ ${formatPtBrNumber(c.sacas * fechamento.valorPorSaca)}` : ''}
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

  const nomeCaminhao = new Map(((refs.caminhoes as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))

  const filtered = cargas.filter((c) => {
    if (filters.dataInicio && c.data < filters.dataInicio) return false
    if (filters.dataFim && c.data > filters.dataFim) return false
    if (filters.produtorId && c.produtor_id !== filters.produtorId) return false
    if (filters.propriedadeId && c.propriedade_id !== filters.propriedadeId) return false
    if (filters.talhaoId && c.talhao_id !== filters.talhaoId) return false
    if (filters.variedadeId && c.variedade_id !== filters.variedadeId) return false
    if (filters.armazemId && c.armazem_id !== filters.armazemId) return false
    const placaTexto = placaLegivel(c.placa, nomeCaminhao.get(c.placa)).toLowerCase()
    if (filters.placa && !placaTexto.includes(filters.placa.toLowerCase())) return false
    return true
  }).sort((a, b) => `${b.data}T${b.created_at}`.localeCompare(`${a.data}T${a.created_at}`))

  const nomePropriedade = new Map(((refs.propriedades as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeTalhao = new Map(((refs.talhoes as Talhao[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeProdutor = new Map(((refs.produtores as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeVariedade = new Map(((refs.variedades as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))
  const nomeArmazem = new Map(((refs.armazens as BaseEntity[]) ?? []).map((i) => [i.id, i.nome]))

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
          tipo: delta > 0 ? 'entrada' : 'saida',
          armazemId: updated.armazem_id,
          sacas: Math.abs(delta),
          origem: 'carga',
          referenciaId: updated.id,
          motivo: 'Ajuste automatico por edicao de carga'
        })
      }
    } else {
      await aplicarSaldoEstoque(userId, armazemAntigo, -sacasAntigas)
      await aplicarSaldoEstoque(userId, updated.armazem_id, updated.sacas)
      await registrarMovimentoEstoque({
        userId,
        tipo: 'saida',
        armazemId: armazemAntigo,
        sacas: sacasAntigas,
        origem: 'carga',
        referenciaId: updated.id,
        motivo: 'Transferencia de armazem por edicao de carga'
      })
      await registrarMovimentoEstoque({
        userId,
        tipo: 'entrada',
        armazemId: updated.armazem_id,
        sacas: updated.sacas,
        origem: 'carga',
        referenciaId: updated.id,
        motivo: 'Transferencia de armazem por edicao de carga'
      })
    }
    await runSync()
    setEditId('')
    onSaved()
    onNotify('success', 'Carga atualizada com sucesso.')
    await registrarAuditoria(userId, 'carga_editada', `Carga ${updated.id} atualizada`)
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
        tipo: 'saida',
        armazemId: existing.armazem_id,
        sacas: existing.sacas,
        origem: 'carga',
        referenciaId: existing.id,
        motivo: 'Ajuste automatico por exclusao de carga'
      })
    }
    await runSync()
    setCargas((prev) => prev.filter((c) => c.id !== cargaId))
    if (editId === cargaId) setEditId('')
    onSaved()
    onNotify('success', 'Carga apagada com sucesso.')
    await registrarAuditoria(userId, 'carga_excluida', `Carga ${cargaId} removida`)
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
            {c.data} | Placa: {placaLegivel(c.placa, nomeCaminhao.get(c.placa))} | Propriedade: {nomePropriedade.get(c.propriedade_id) ?? '-'} | Talhao: {nomeTalhao.get(c.talhao_id) ?? '-'} | Produtor: {nomeProdutor.get(c.produtor_id) ?? '-'} | Variedade: {nomeVariedade.get(c.variedade_id) ?? '-'} | Armazem: {nomeArmazem.get(c.armazem_id) ?? '-'} | Liquido: {formatPtBrNumber(c.peso_liquido_kg)} kg | Bruto: {formatPtBrNumber(c.peso_bruto_kg)} kg | Status: {statusSyncLegivel(c.sync_status, pendingIds.has(c.id))}
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
