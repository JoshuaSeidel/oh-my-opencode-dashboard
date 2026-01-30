import { describe, it, expect } from "vitest"
import { toDashboardPayload } from "./App"

describe('toDashboardPayload', () => {
  it('should preserve planProgress.steps from server JSON', () => {
    // #given: server JSON with planProgress.steps
    const serverJson = {
      mainSession: {
        agent: "sisyphus",
        currentTool: "dashboard_start",
        currentModel: "anthropic/claude-opus-4-5",
        lastUpdatedLabel: "just now",
        session: "test-session",
        statusPill: "busy",
      },
      planProgress: {
        name: "test-plan",
        completed: 2,
        total: 4,
        path: "/tmp/test-plan.md",
        statusPill: "in progress",
        steps: [
          { checked: true, text: "First completed task" },
          { checked: true, text: "Second completed task" },
          { checked: false, text: "Third pending task" },
          { checked: false, text: "Fourth pending task" },
        ],
      },
      backgroundTasks: [],
      timeSeries: {
        windowMs: 300000,
        buckets: 150,
        bucketMs: 2000,
        anchorMs: 1640995200000,
        serverNowMs: 1640995500000,
        series: [
          {
            id: "overall-main",
            label: "Overall",
            tone: "muted",
            values: new Array(150).fill(0),
          },
        ],
      },
    }

    // #when: converting to dashboard payload
    const payload = toDashboardPayload(serverJson)

    // #then: planProgress.steps should be preserved with correct structure
    expect(payload.planProgress.steps).toBeDefined()
    expect(payload.planProgress.steps).toEqual([
      { checked: true, text: "First completed task" },
      { checked: true, text: "Second completed task" },
      { checked: false, text: "Third pending task" },
      { checked: false, text: "Fourth pending task" },
    ])
  })

  it('should handle missing or malformed planProgress.steps defensively', () => {
    // #given: server JSON with malformed planProgress.steps
    const serverJson = {
      mainSession: {
        agent: "sisyphus",
        currentTool: "dashboard_start",
        currentModel: "anthropic/claude-opus-4-5",
        lastUpdatedLabel: "just now",
        session: "test-session",
        statusPill: "busy",
      },
      planProgress: {
        name: "test-plan",
        completed: 0,
        total: 0,
        path: "/tmp/test-plan.md",
        statusPill: "not started",
        steps: [
          { checked: true, text: "Valid step" },
          { checked: false }, // missing text
          { text: "Missing checked" }, // missing checked
          "invalid string", // wrong type
          null, // null value
          { checked: "not-boolean", text: "Invalid checked type" }, // wrong checked type
        ],
      },
      backgroundTasks: [],
      timeSeries: {
        windowMs: 300000,
        buckets: 150,
        bucketMs: 2000,
        anchorMs: 1640995200000,
        serverNowMs: 1640995500000,
        series: [
          {
            id: "overall-main",
            label: "Overall",
            tone: "muted",
            values: new Array(150).fill(0),
          },
        ],
      },
    }

    // #when: converting to dashboard payload
    const payload = toDashboardPayload(serverJson)

    // #then: should only include valid steps, ignore malformed ones
    expect(payload.planProgress.steps).toEqual([
      { checked: true, text: "Valid step" },
      { checked: false, text: "Missing checked" }, // default checked to false
      { checked: false, text: "Invalid checked type" }, // default checked to false for invalid boolean
    ])
  })

  it('should handle non-array planProgress.steps', () => {
    // #given: server JSON with non-array planProgress.steps
    const serverJson = {
      mainSession: {
        agent: "sisyphus",
        currentTool: "dashboard_start",
        currentModel: "anthropic/claude-opus-4-5",
        lastUpdatedLabel: "just now",
        session: "test-session",
        statusPill: "busy",
      },
      planProgress: {
        name: "test-plan",
        completed: 0,
        total: 0,
        path: "/tmp/test-plan.md",
        statusPill: "not started",
        steps: "not an array",
      },
      backgroundTasks: [],
      timeSeries: {
        windowMs: 300000,
        buckets: 150,
        bucketMs: 2000,
        anchorMs: 1640995200000,
        serverNowMs: 1640995500000,
        series: [
          {
            id: "overall-main",
            label: "Overall",
            tone: "muted",
            values: new Array(150).fill(0),
          },
        ],
      },
    }

    // #when: converting to dashboard payload
    const payload = toDashboardPayload(serverJson)

    // #then: should handle non-array steps gracefully
    expect(payload.planProgress.steps).toEqual([])
  })

  it('should parse mainSession.sessionId from camel or snake keys', () => {
    // #given: server JSON with main session id in camel and snake case
    const camelJson = {
      mainSession: {
        agent: "sisyphus",
        currentTool: "dashboard_start",
        currentModel: "anthropic/claude-opus-4-5",
        lastUpdatedLabel: "just now",
        session: "test-session",
        sessionId: "ses_main",
        statusPill: "busy",
      },
    }

    const snakeJson = {
      main_session: {
        agent: "sisyphus",
        current_tool: "dashboard_start",
        current_model: "anthropic/claude-opus-4-5",
        last_updated: "just now",
        session: "test-session",
        session_id: "ses_snake",
        status: "busy",
      },
    }

    // #when: converting to dashboard payload
    const camelPayload = toDashboardPayload(camelJson)
    const snakePayload = toDashboardPayload(snakeJson)

    // #then: sessionId should be preserved
    expect(camelPayload.mainSession.sessionId).toBe("ses_main")
    expect(snakePayload.mainSession.sessionId).toBe("ses_snake")
  })

  it('should preserve mainSessionTasks from server JSON', () => {
    // #given: server JSON with mainSessionTasks
    const serverJson = {
      mainSession: {
        agent: "sisyphus",
        currentTool: "dashboard_start",
        currentModel: "anthropic/claude-opus-4-5",
        lastUpdatedLabel: "just now",
        session: "test-session",
        sessionId: "ses_main",
        statusPill: "busy",
      },
      planProgress: {
        name: "test-plan",
        completed: 0,
        total: 0,
        path: "/tmp/test-plan.md",
        statusPill: "not started",
        steps: [],
      },
      mainSessionTasks: [
        {
          id: "main-session",
          description: "Main session",
          subline: "ses_main",
          agent: "sisyphus",
          lastModel: "anthropic/claude-opus-4-5",
          sessionId: "ses_main",
          status: "running",
          toolCalls: 3,
          lastTool: "delegate_task",
          timeline: "2026-01-01T00:00:00Z: 2m",
        },
      ],
      backgroundTasks: [],
      timeSeries: {
        windowMs: 300000,
        buckets: 150,
        bucketMs: 2000,
        anchorMs: 1640995200000,
        serverNowMs: 1640995500000,
        series: [
          {
            id: "overall-main",
            label: "Overall",
            tone: "muted",
            values: new Array(150).fill(0),
          },
        ],
      },
    }

    // #when
    const payload = toDashboardPayload(serverJson)

    // #then
    expect(payload.mainSessionTasks).toEqual([
      {
        id: "main-session",
        description: "Main session",
        subline: "ses_main",
        agent: "sisyphus",
        lastModel: "anthropic/claude-opus-4-5",
        sessionId: "ses_main",
        status: "running",
        toolCalls: 3,
        lastTool: "delegate_task",
        timeline: "2026-01-01T00:00:00Z: 2m",
      },
    ])
  })
})
