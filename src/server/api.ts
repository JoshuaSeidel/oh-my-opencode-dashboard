import { Hono } from "hono"
import type { DashboardStore } from "./dashboard"
import { assertAllowedPath } from "../ingest/paths"
import { getMessageDir, getStorageRoots, readMainSessionMetas } from "../ingest/session"
import { deriveToolCalls, MAX_TOOL_CALL_MESSAGES, MAX_TOOL_CALLS } from "../ingest/tool-calls"

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

type SessionListItem = {
  id: string
  title: string | null
  createdAtMs: number
  updatedAtMs: number
}

export function createApi(opts: { store: DashboardStore; storageRoot: string; projectRoot: string }): Hono {
  const api = new Hono()

  api.get("/health", (c) => {
    return c.json({ ok: true })
  })

  api.get("/dashboard", (c) => {
    return c.json(opts.store.getSnapshot())
  })

  api.get("/sessions", (c) => {
    const storage = getStorageRoots(opts.storageRoot)
    try {
      assertAllowedPath({ candidatePath: storage.session, allowedRoots: [opts.storageRoot] })
    } catch {
      return c.json({ ok: true, sessions: [] })
    }

    const metas = readMainSessionMetas(storage.session, opts.projectRoot)
    const sessions: SessionListItem[] = metas
      .map((meta) => {
        const createdAtMs = Number.isFinite(meta.time?.created) ? meta.time.created : 0
        const updatedAtMs = Number.isFinite(meta.time?.updated) ? meta.time.updated : 0
        const trimmedTitle = typeof meta.title === "string" ? meta.title.trim() : ""
        const title = trimmedTitle ? trimmedTitle : null
        return {
          id: meta.id,
          title,
          createdAtMs,
          updatedAtMs,
        }
      })
      .sort((a, b) => {
        if (b.updatedAtMs !== a.updatedAtMs) return b.updatedAtMs - a.updatedAtMs
        if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs
        return b.id.localeCompare(a.id)
      })

    return c.json({ ok: true, sessions })
  })

  api.get("/tool-calls/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId")
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return c.json({ ok: false, sessionId, toolCalls: [] }, 400)
    }

    const storage = getStorageRoots(opts.storageRoot)
    const messageDir = getMessageDir(storage.message, sessionId)
    if (!messageDir) {
      return c.json({ ok: false, sessionId, toolCalls: [] }, 404)
    }

    assertAllowedPath({ candidatePath: messageDir, allowedRoots: [opts.storageRoot] })

    const { toolCalls, truncated } = deriveToolCalls({
      storage,
      sessionId,
      allowedRoots: [opts.storageRoot],
    })

    return c.json({
      ok: true,
      sessionId,
      toolCalls,
      caps: {
        maxMessages: MAX_TOOL_CALL_MESSAGES,
        maxToolCalls: MAX_TOOL_CALLS,
      },
      truncated,
    })
  })

  return api
}
