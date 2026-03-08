# Implementation Plan: Multi-Agent Delegation

## Overview

Incrementally build multi-agent delegation into the existing WebOS backend. Start with data models and persistence, then core infrastructure (file locks, worker manager), then the delegate_task tool and worker execution loop, then event visibility and slash commands, and finally the frontend settings panel. Each step builds on the previous and is wired in before moving on.

## Tasks

- [ ] 1. Data models, database schema, and persistence layer
  - [ ] 1.1 Create Go structs and SQLite migration for agent_tasks
    - Add `AgentTask` and `AgentModel` structs to `internal/ai/types.go` (or a new `agent_types.go`)
    - Create SQLite migration adding the `agent_tasks` table with columns: task_id, parent_conversation_id, parent_agent_id, model_id, task_message, status, result, created_at, updated_at and index on parent_conversation_id
    - _Requirements: 10.1_

  - [ ] 1.2 Implement database CRUD operations for agent_tasks
    - Create `internal/database/agent_tasks.go` with functions: `CreateAgentTask`, `UpdateAgentTaskStatus`, `GetAgentTask`, `ListAgentTasksByConversation`, `DeleteAgentTasksByConversation`
    - `UpdateAgentTaskStatus` must enforce valid state transitions (pending→running, running→done, running→failed) and update `updated_at`
    - _Requirements: 10.2, 10.3, 10.4, 4.5_

  - [ ]* 1.3 Write property tests for AgentTask persistence (Properties 15, 16, 17)
    - **Property 15: AgentTask persistence round-trip** — insert and read back produces equivalent struct
    - **Validates: Requirements 10.1, 10.2**
    - **Property 16: AgentTask query by conversation filters correctly** — query returns only tasks for the target conversation
    - **Validates: Requirements 10.4**
    - **Property 17: AgentTask status update advances timestamp** — updated_at is >= previous value after update
    - **Validates: Requirements 10.3**

  - [ ]* 1.4 Write property test for AgentTask state machine (Property 6)
    - **Property 6: Agent task state machine validity** — only pending→running, running→done, running→failed transitions accepted
    - **Validates: Requirements 4.5, 5.3, 5.4**

  - [ ]* 1.5 Write property tests for AgentModel (Properties 2, 3)
    - **Property 2: AgentModel serialization round-trip** — JSON marshal/unmarshal preserves all fields
    - **Validates: Requirements 2.1, 2.4**
    - **Property 3: Agent model list includes id and description** — formatted model info contains every model's id and description
    - **Validates: Requirements 2.2**

- [ ] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. FileLockManager implementation
  - [ ] 3.1 Implement FileLockManager in `internal/ai/file_locks.go`
    - Implement `FileLockManager` struct with `sync.Mutex` guarding a `map[string]chan struct{}` (buffered size 1 per path)
    - `Acquire(ctx, path)` sends to the channel (blocks if held), with a 30-second `context.WithTimeout`
    - `Release(path)` receives from the channel
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [ ]* 3.2 Write property test for file lock mutual exclusion (Property 9)
    - **Property 9: File lock mutual exclusion** — if one agent holds the lock, a second concurrent acquire blocks until release or timeout; after release, acquire succeeds immediately
    - **Validates: Requirements 6.2, 6.5**
    - Include timeout edge case tests (30s timeout returns error)
    - _Requirements: 6.3, 6.4_

- [ ] 4. WorkerManager and worker execution loop
  - [ ] 4.1 Implement WorkerManager in `internal/ai/worker_manager.go`
    - Implement `WorkerManager` struct with `sync.Mutex`, `workers map[string]*WorkerHandle`, `fileLocks *FileLockManager`, and `broadcastFn`
    - Implement `SpawnWorker` — creates AgentTask (pending), launches goroutine, returns task_id immediately
    - Implement `GetTask`, `ListTasks`, `CancelAll`
    - `CancelAll(convID)` cancels all active worker contexts for a conversation
    - _Requirements: 3.2, 3.3, 5.1, 5.6_

  - [ ] 4.2 Implement worker execution loop in `internal/ai/worker_run.go`
    - Implement `runWorker(ctx, cfg, taskMsg, tools, sink, systemPrompt, maxRounds) (string, error)`
    - Simplified HandleChat loop: no conversation persistence, no context compression, no skill activation
    - On completion: update task status to "done" with final response
    - On error/panic: recover, update task status to "failed" with error message
    - On context cancellation: set status to "failed" with "cancelled" result
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.3, 9.4_

  - [ ] 4.3 Implement worker system prompt builder
    - Create function to build worker system prompt including: task description, working directory hint, current depth level, and SystemContext from parent Service
    - Reuse existing skills and system context
    - _Requirements: 9.1, 9.2, 6.6_

  - [ ]* 4.4 Write property tests for worker context and prompt (Properties 13, 14)
    - **Property 13: Worker system prompt contains required elements** — prompt includes task description, working directory hint, depth level, and SystemContext
    - **Validates: Requirements 9.1, 9.2, 6.6**
    - **Property 14: Worker initial context is minimal** — initial message list has exactly 2 messages (system + user)
    - **Validates: Requirements 3.5, 9.3**

  - [ ]* 4.5 Write property tests for worker lifecycle (Properties 5, 8, 12)
    - **Property 5: delegate_task creates a pending task** — valid invocation creates AgentTask with status "pending" and non-empty task_id
    - **Validates: Requirements 3.2**
    - **Property 8: Worker messages do not leak into main conversation** — parent conversation message count unchanged after worker execution
    - **Validates: Requirements 5.5, 9.4**
    - **Property 12: Depth propagation invariant** — sub-worker depth is exactly parent depth + 1
    - **Validates: Requirements 8.5**

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. AgentSink and event visibility
  - [ ] 6.1 Implement AgentSink wrapper in `internal/ai/agent_sink.go`
    - Implement `AgentSink` struct wrapping a parent `ChatSink` with an `agentId` field
    - Implement all `ChatSink` interface methods, delegating to parent with agentId context
    - Worker events use `OnSystemEvent` with type `"agent_event"` containing `{agentId, eventType, data}`
    - Main_Agent agentId is `"main"`, workers use `"worker-{taskID}"`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 6.2 Emit agent lifecycle events
    - Emit `agent_started` event (agentId, task_id, model_id) when worker begins execution
    - Emit `agent_finished` event (agentId, task_id, status, result summary) when worker completes
    - Wire into `WorkerManager.SpawnWorker` and `runWorker` completion
    - _Requirements: 7.4, 7.5_

  - [ ]* 6.3 Write property tests for AgentSink (Properties 10, 11)
    - **Property 10: Worker agentId uniqueness and format** — all agentIds unique, main is "main", workers derived from task_id
    - **Validates: Requirements 7.2, 7.3**
    - **Property 11: Worker lifecycle events** — exactly one agent_started and one agent_finished event per worker
    - **Validates: Requirements 7.4, 7.5**

- [ ] 7. delegate_task tool and mode-aware tool registration
  - [ ] 7.1 Implement delegate_task tool in `internal/ai/tool_delegate.go`
    - Define tool schema with parameters: model_id (string, required), task (string, required)
    - Executor validates model_id against configured agent_models from preferences
    - On valid model_id: calls `WorkerManager.SpawnWorker()`, returns `{task_id, status: "pending", message}` immediately
    - On invalid model_id: returns error `"model not found: {model_id}"`
    - On no agent_models configured: fall back to active provider/model from AIMultiConfig
    - _Requirements: 3.1, 3.2, 3.4, 2.3_

  - [ ] 7.2 Modify `buildAllTools()` in `service.go` for mode-aware tool injection
    - Read `agent_mode` preference at each conversation turn
    - When `agent_mode == "multi"` and `currentDepth < maxDepth`: include `delegate_task` in tool list
    - When `agent_mode == "single"`: standard tools only, no file locking overhead
    - _Requirements: 1.2, 1.3, 1.5, 8.2, 8.3, 8.4_

  - [ ] 7.3 Wrap write_file and edit_file executors with file lock acquisition
    - In multi-agent mode, wrap existing `registerWriteFile()` and `registerEditFile()` to call `FileLockManager.Acquire/Release`
    - `FileLockManager` is nil in single-agent mode (no-op check)
    - _Requirements: 6.2, 6.5_

  - [ ]* 7.4 Write property tests for tool availability (Properties 1, 4)
    - **Property 1: Agent mode determines delegate_task tool availability** — tool present iff mode=="multi" && depth < maxDepth
    - **Validates: Requirements 1.2, 1.3, 8.2, 8.3, 8.4**
    - **Property 4: Invalid model_id produces error** — non-existent model_id returns error
    - **Validates: Requirements 3.4**

- [ ] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. /agents slash command and system prompt updates
  - [ ] 9.1 Register /agents slash command in `internal/service/commands.go`
    - `/agents` lists all AgentTasks for current conversation (task_id, model_id, status, result summary)
    - `/agents <taskID>` shows detailed status of a specific task
    - Accessible by Main_Agent via `system_manage` tool with command="agents"
    - Accessible by user via direct `/agents` input
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 9.2 Update Main_Agent system prompt for multi-agent mode
    - When agent_mode is "multi", include instructions to split delegated tasks to minimize overlapping file operations
    - Include available Agent_Model ids and descriptions in the prompt context
    - _Requirements: 6.1, 2.2_

  - [ ]* 9.3 Write property test for /agents command (Property 7)
    - **Property 7: /agents command lists all conversation tasks** — output contains every task's task_id, model_id, and status
    - **Validates: Requirements 4.1, 4.2**

- [ ] 10. Wire WorkerManager into Service and conversation lifecycle
  - [ ] 10.1 Initialize WorkerManager in Service and wire into HandleChat
    - Create `WorkerManager` instance in `Service` initialization
    - Pass `WorkerManager` to `delegate_task` tool executor
    - Pass `FileLockManager` to write_file/edit_file wrappers
    - Track `currentDepth` (0 for Main_Agent) and `maxDepth` from preferences
    - _Requirements: 1.3, 5.1, 8.1, 8.5_

  - [ ] 10.2 Wire conversation cleanup to cancel workers and delete tasks
    - In `Service.DeleteConversation()`: call `WorkerManager.CancelAll(convID)` then `database.DeleteAgentTasksByConversation(convID)`
    - _Requirements: 5.6_

- [ ] 11. AI Assistant Settings Panel (Phase 1 Frontend)
  - [ ] 11.1 Add agent_mode toggle to AI assistant settings panel
    - Add toggle switch for agent_mode ("single" / "multi")
    - Read/write via existing config.get / config.set WebSocket messages
    - _Requirements: 11.1, 11.4_

  - [ ] 11.2 Add agent model configuration section
    - When agent_mode is "multi", display section to add/edit/remove AgentModel entries (id, provider, model, description, weight)
    - Hide when agent_mode is "single"
    - _Requirements: 11.2, 11.5_

  - [ ] 11.3 Add maxDepth input to settings panel
    - Number input for maxDepth (default 1), visible only when agent_mode is "multi"
    - Read/write via config.get / config.set
    - Existing provider/model configuration remains unchanged
    - _Requirements: 11.3, 11.5, 11.6_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `pgregory.net/rapid` with minimum 100 iterations per property
- Database tests use in-memory SQLite
- All new Go files live in `internal/ai/` except database operations (`internal/database/`) and commands (`internal/service/`)
