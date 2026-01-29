import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, it, expect } from "vitest"
import { createApi } from "./api"
import type { DashboardPayload, DashboardStore } from "./dashboard"
import type { PlanStep } from "../ingest/boulder"
import type { TimeSeriesPayload } from "../ingest/timeseries"

function mkStorageRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-dashboard-storage-"))
  fs.mkdirSync(path.join(root, "session"), { recursive: true })
  fs.mkdirSync(path.join(root, "message"), { recursive: true })
  fs.mkdirSync(path.join(root, "part"), { recursive: true })
  return root
}

function mkProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "omo-dashboard-project-"))
}

function writeSessionMeta(opts: {
  storageRoot: string
  projectId: string
  sessionId: string
  directory: string
  title?: string | null
  time: { created: number | null; updated: number | null }
  parentId?: string | null
}): void {
  const sessionDir = path.join(opts.storageRoot, "session", opts.projectId)
  fs.mkdirSync(sessionDir, { recursive: true })
  const meta: Record<string, unknown> = {
    id: opts.sessionId,
    projectID: opts.projectId,
    directory: opts.directory,
    time: opts.time,
  }
  if (typeof opts.title === "string") meta.title = opts.title
  if (opts.parentId) meta.parentID = opts.parentId
  fs.writeFileSync(path.join(sessionDir, `${opts.sessionId}.json`), JSON.stringify(meta), "utf8")
}

function writeMessageMeta(opts: {
  storageRoot: string
  sessionId: string
  messageId: string
  created?: number
}): void {
  const msgDir = path.join(opts.storageRoot, "message", opts.sessionId)
  fs.mkdirSync(msgDir, { recursive: true })
  const meta: Record<string, unknown> = {
    id: opts.messageId,
    sessionID: opts.sessionId,
    role: "assistant",
  }
  if (typeof opts.created === "number") {
    meta.time = { created: opts.created }
  }
  fs.writeFileSync(path.join(msgDir, `${opts.messageId}.json`), JSON.stringify(meta), "utf8")
}

function writeToolPart(opts: {
  storageRoot: string
  sessionId: string
  messageId: string
  callId: string
  tool: string
  state?: Record<string, unknown>
}): void {
  const partDir = path.join(opts.storageRoot, "part", opts.messageId)
  fs.mkdirSync(partDir, { recursive: true })
  fs.writeFileSync(
    path.join(partDir, `${opts.callId}.json`),
    JSON.stringify({
      id: `part_${opts.callId}`,
      sessionID: opts.sessionId,
      messageID: opts.messageId,
      type: "tool",
      callID: opts.callId,
      tool: opts.tool,
      state: opts.state ?? { status: "completed", input: {} },
    }),
    "utf8"
  )
}

const sensitiveKeys = ["prompt", "input", "output", "error", "state"]

function hasSensitiveKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) {
    return value.some((item) => hasSensitiveKeys(item))
  }
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeys.includes(key)) return true
    if (hasSensitiveKeys(child)) return true
  }
  return false
}

const createStore = (): DashboardStore => ({
  getSnapshot: (): DashboardPayload => ({
    mainSession: { agent: "x", currentModel: null, currentTool: "-", lastUpdatedLabel: "never", session: "s", statusPill: "idle" },
    planProgress: { name: "p", completed: 0, total: 0, path: "", statusPill: "not started", steps: [] as PlanStep[] },
    backgroundTasks: [],
    timeSeries: {
      windowMs: 0,
      bucketMs: 0,
      buckets: 0,
      anchorMs: 0,
      serverNowMs: 0,
      series: [{ id: "overall-main", label: "Overall", tone: "muted" as const, values: [] as number[] }],
    },
    raw: null,
  }),
} satisfies DashboardStore)

describe('API Routes', () => {
  it('should return health check', async () => {
    const storageRoot = mkStorageRoot()
    const projectRoot = mkProjectRoot()
    const store = createStore()
    const api = createApi({ store, storageRoot, projectRoot })

    const res = await api.request("/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('should return dashboard data without sensitive keys', async () => {
    const storageRoot = mkStorageRoot()
    const projectRoot = mkProjectRoot()
    const store = createStore()
    const api = createApi({ store, storageRoot, projectRoot })

    const res = await api.request("/dashboard")
    expect(res.status).toBe(200)
    
    const data = await res.json()
    
    expect(data).toHaveProperty("mainSession")
    expect(data).toHaveProperty("planProgress")
    expect(data).toHaveProperty("backgroundTasks")
    expect(data).toHaveProperty("timeSeries")
    expect(data).toHaveProperty("raw")
    
    expect(hasSensitiveKeys(data)).toBe(false)
  })

  it('should reject invalid session IDs', async () => {
    const storageRoot = mkStorageRoot()
    const projectRoot = mkProjectRoot()
    const store = createStore()
    const api = createApi({ store, storageRoot, projectRoot })

    const res = await api.request("/tool-calls/not_valid!")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, sessionId: "not_valid!", toolCalls: [] })
  })

  it('should return 404 for missing sessions', async () => {
    const storageRoot = mkStorageRoot()
    const projectRoot = mkProjectRoot()
    const store = createStore()
    const api = createApi({ store, storageRoot, projectRoot })

    const res = await api.request("/tool-calls/ses_missing")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, sessionId: "ses_missing", toolCalls: [] })
  })

  it('should return empty tool calls for existing sessions', async () => {
    const storageRoot = mkStorageRoot()
    const projectRoot = mkProjectRoot()
    writeMessageMeta({ storageRoot, sessionId: "ses_empty", messageId: "msg_1", created: 1000 })
    const store = createStore()
    const api = createApi({ store, storageRoot, projectRoot })

    const res = await api.request("/tool-calls/ses_empty")
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.sessionId).toBe("ses_empty")
    expect(data.toolCalls).toEqual([])
    expect(data.caps).toEqual({ maxMessages: 200, maxToolCalls: 300 })
    expect(data.truncated).toBe(false)
    expect(hasSensitiveKeys(data)).toBe(false)
  })

  it('should redact tool call payload fields', async () => {
    const storageRoot = mkStorageRoot()
    const projectRoot = mkProjectRoot()
    writeMessageMeta({ storageRoot, sessionId: "ses_redact", messageId: "msg_1", created: 1000 })
    writeToolPart({
      storageRoot,
      sessionId: "ses_redact",
      messageId: "msg_1",
      callId: "call_1",
      tool: "bash",
      state: {
        status: "completed",
        input: { prompt: "SECRET", nested: { output: "HIDDEN" } },
        output: "NOPE",
        error: "NOPE",
      },
    })
    const store = createStore()
    const api = createApi({ store, storageRoot, projectRoot })

    const res = await api.request("/tool-calls/ses_redact")
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.toolCalls.length).toBe(1)
    expect(hasSensitiveKeys(data)).toBe(false)
  })

  it('should return normalized sessions sorted deterministically', async () => {
    const storageRoot = mkStorageRoot()
    const projectRoot = mkProjectRoot()
    const otherProjectRoot = mkProjectRoot()
    const store = createStore()

    writeSessionMeta({
      storageRoot,
      projectId: "proj_alpha",
      sessionId: "ses_d",
      directory: projectRoot,
      title: "  Delta ",
      time: { created: 5, updated: 100 },
    })
    writeSessionMeta({
      storageRoot,
      projectId: "proj_alpha",
      sessionId: "ses_c",
      directory: projectRoot,
      title: "C",
      time: { created: 20, updated: 50 },
    })
    writeSessionMeta({
      storageRoot,
      projectId: "proj_alpha",
      sessionId: "ses_b",
      directory: projectRoot,
      title: "   ",
      time: { created: 20, updated: 50 },
    })
    writeSessionMeta({
      storageRoot,
      projectId: "proj_alpha",
      sessionId: "ses_a",
      directory: projectRoot,
      title: " Alpha ",
      time: { created: 10, updated: 50 },
    })
    writeSessionMeta({
      storageRoot,
      projectId: "proj_alpha",
      sessionId: "ses_z",
      directory: projectRoot,
      time: { created: null, updated: null },
    })
    writeSessionMeta({
      storageRoot,
      projectId: "proj_other",
      sessionId: "ses_other",
      directory: otherProjectRoot,
      title: "Other",
      time: { created: 1, updated: 999 },
    })

    const api = createApi({ store, storageRoot, projectRoot })
    const res = await api.request("/sessions")
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.sessions).toEqual([
      { id: "ses_d", title: "Delta", createdAtMs: 5, updatedAtMs: 100 },
      { id: "ses_c", title: "C", createdAtMs: 20, updatedAtMs: 50 },
      { id: "ses_b", title: null, createdAtMs: 20, updatedAtMs: 50 },
      { id: "ses_a", title: "Alpha", createdAtMs: 10, updatedAtMs: 50 },
      { id: "ses_z", title: null, createdAtMs: 0, updatedAtMs: 0 },
    ])
  })

  it('should return empty sessions when storage is missing', async () => {
    const storageRoot = path.join(os.tmpdir(), `omo-dashboard-storage-missing-${Date.now()}`)
    const projectRoot = mkProjectRoot()
    const store = createStore()
    const api = createApi({ store, storageRoot, projectRoot })

    const res = await api.request("/sessions")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sessions: [] })
  })
})
