# Requirements Document

## Introduction

This feature extends the existing WebOS backend AI system with multi-agent delegation capabilities. The Main_Agent (current single agent) gains the ability to delegate tasks to independent Worker_Agents, each running with their own conversation context and full tool access. Workers execute asynchronously, report progress via the existing BroadcastSink event system, and are subject to configurable depth limits to control nesting. A three-layer conflict prevention strategy (prompt-level task splitting, file-level locking, per-worker working directories) ensures safe concurrent execution.

The system supports a mode switch between single-agent mode (current behavior, unchanged) and multi-agent mode (new delegation capabilities). Model configuration is managed via system settings API, decoupled from the AI chat interface to prepare for future frontend refactoring where the chat UI becomes a pure display layer.

## Glossary

- **Main_Agent**: The primary AI agent that communicates with the user, receives instructions, and orchestrates task delegation to Worker_Agents. Corresponds to the existing `Service.HandleChat` loop.
- **Worker_Agent**: An independently running AI agent spawned by the Main_Agent (or another Worker_Agent within depth limits) to execute a delegated task. Each Worker_Agent has its own conversation context, tool access, and model configuration.
- **Agent_Model**: A data model describing an available AI model for agent assignment, including a unique ID, provider reference, model name, human-readable description, weight (priority/preference hint), and max token limit.
- **Agent_Task**: A data model tracking the lifecycle of a delegated task, including task ID, parent agent ID, assigned model, status (pending/running/done/failed), input message, result, and timestamps.
- **Delegation_Depth**: An integer parameter controlling how many levels of agent nesting are permitted. depth=1 means Main_Agent can spawn Worker_Agents but Worker_Agents cannot spawn sub-workers.
- **Task_Registry**: An in-memory registry that tracks all active and completed Agent_Tasks, providing lookup by task ID and listing capabilities.
- **File_Lock_Manager**: A component that manages file-level write locks to prevent concurrent write conflicts between agents operating in parallel.
- **ToolRegistry**: The existing tool registration system (`ai.ToolRegistry`) that provides built-in tools (shell, read_file, write_file, edit_file, etc.) to agents.
- **BroadcastSink**: The existing event broadcasting system (`ai.BroadcastSink`) that forwards ChatSink events to all connected WebSocket clients.
- **Worker_Context**: The independent, temporary conversation context (system prompt + messages) maintained for a Worker_Agent during task execution, separate from the Main_Agent's conversation history.
- **Agent_Mode**: A system-level setting that determines whether the AI operates in single-agent mode (current behavior) or multi-agent mode (delegation enabled). Stored in system preferences.

## Requirements

### Requirement 1: Agent Mode Switch

**User Story:** As a system administrator, I want to switch between single-agent and multi-agent mode in system settings, so that I can enable delegation capabilities when needed without affecting the existing single-agent behavior.

#### Acceptance Criteria

1. THE System SHALL support an `agent_mode` preference with values "single" (default) and "multi"
2. WHEN agent_mode is "single", THE System SHALL behave exactly as the current implementation — no delegate_task tool, no agent-related events, no file locking overhead
3. WHEN agent_mode is "multi", THE System SHALL inject the delegate_task tool into the Main_Agent's ToolRegistry and enable all multi-agent features
4. THE agent_mode setting SHALL be readable and writable via the existing preferences API (config.get / config.set)
5. WHEN agent_mode changes, THE System SHALL take effect on the next conversation turn without requiring a restart

### Requirement 2: Agent Model Configuration

**User Story:** As a system administrator, I want to configure multiple AI models with metadata (ID, description, weight) via system settings API, so that the Main_Agent can intelligently select which model to assign for delegated tasks, and model management is decoupled from the chat interface.

#### Acceptance Criteria

1. THE Agent_Model SHALL store the following fields: id (string), providerId (string), modelName (string), description (string), weight (integer), maxTokens (integer)
2. WHEN the Main_Agent receives the list of available models, THE System SHALL include each Agent_Model's id and description so the Main_Agent can make informed delegation decisions
3. WHEN no Agent_Model entries are configured, THE System SHALL fall back to the active provider and model from the existing AIMultiConfig
4. THE Agent_Model configuration SHALL be persisted in the existing preferences storage under a dedicated key "agent_models"
5. THE System SHALL provide API endpoints for CRUD operations on Agent_Model entries via the existing preferences mechanism

### Requirement 3: Task Delegation Tool

**User Story:** As the Main_Agent, I want a `delegate_task` tool that spawns a Worker_Agent with a specified model and task message, so that I can offload work to independent agents.

#### Acceptance Criteria

1. THE ToolRegistry SHALL provide a `delegate_task` tool with parameters: model_id (string, required), task (string, required)
2. WHEN the `delegate_task` tool is invoked, THE System SHALL create an Agent_Task record with status "pending" and return the task_id immediately without blocking the Main_Agent
3. WHEN the `delegate_task` tool is invoked, THE System SHALL spawn a new Worker_Agent goroutine that runs an independent HandleChat-equivalent loop using the specified model
4. WHEN the `delegate_task` tool is invoked with an invalid model_id, THE System SHALL return an error message indicating the model was not found
5. THE Worker_Agent SHALL receive the task message as its initial user message within a fresh Worker_Context
6. THE Worker_Agent SHALL have access to all tools from the ToolRegistry that the spawning agent has access to, except as restricted by Delegation_Depth

### Requirement 4: Task Status via Slash Command

**User Story:** As the Main_Agent or user, I want to check delegated task status via the `/agents` slash command, so that both AI (via system_manage tool) and users (via direct input) can monitor worker progress using the existing command system.

#### Acceptance Criteria

1. THE System SHALL register an `/agents` slash command that lists all Agent_Tasks for the current conversation, showing task_id, model_id, status, and result summary
2. THE `/agents` slash command SHALL accept an optional task_id argument to query a specific task's detailed status and result
3. WHEN the Main_Agent needs to check task status, IT SHALL invoke the existing `system_manage` tool with command="agents" and optionally args=task_id
4. WHEN a user types `/agents` directly, THE System SHALL display the same task status information
5. THE Agent_Task status SHALL transition through the following states: pending → running → done or failed

### Requirement 5: Asynchronous Worker Execution

**User Story:** As a user, I want Worker_Agents to run independently and concurrently, so that multiple tasks can be processed in parallel without blocking the Main_Agent.

#### Acceptance Criteria

1. WHEN a Worker_Agent is spawned, THE System SHALL execute the Worker_Agent in a separate goroutine with its own context.Context
2. WHILE a Worker_Agent is running, THE Main_Agent SHALL remain free to continue its own conversation loop and delegate additional tasks
3. WHEN a Worker_Agent completes its task (no more tool calls, final assistant response), THE System SHALL update the Agent_Task status to "done" and store the final response as the result
4. IF a Worker_Agent encounters an unrecoverable error, THEN THE System SHALL update the Agent_Task status to "failed" and store the error description as the result
5. THE Worker_Agent's messages SHALL be stored in the Worker_Context only and SHALL NOT be inserted into the Main_Agent's ai_messages conversation history
6. WHEN the parent conversation is cancelled or deleted, THE System SHALL cancel all active Worker_Agents associated with that conversation

### Requirement 6: Concurrent Conflict Prevention

**User Story:** As a developer, I want a three-layer conflict prevention strategy, so that multiple agents working in parallel do not corrupt shared files or produce conflicting changes.

#### Acceptance Criteria

1. THE Main_Agent's system prompt SHALL include instructions to split delegated tasks clearly to minimize overlapping file operations (prompt-level prevention)
2. WHEN a Worker_Agent or Main_Agent invokes write_file or edit_file, THE File_Lock_Manager SHALL acquire an exclusive lock on the target file path before executing the write operation
3. IF a file lock cannot be acquired because another agent holds the lock, THEN THE File_Lock_Manager SHALL block until the lock is released or a timeout of 30 seconds is reached
4. IF the file lock acquisition times out, THEN THE System SHALL return an error to the requesting agent indicating the file is locked by another agent
5. WHEN the write_file or edit_file operation completes (success or failure), THE File_Lock_Manager SHALL release the lock on the target file path
6. THE System SHALL assign each Worker_Agent a logical working directory hint in its system prompt to encourage file operation isolation

### Requirement 7: Frontend Event Visibility

**User Story:** As a frontend user, I want to see Worker_Agent tool calls and progress in the UI, so that I can monitor what all agents are doing.

#### Acceptance Criteria

1. WHEN a Worker_Agent emits a ChatSink event (OnDelta, OnToolCall, OnToolResult, OnShellOutput, etc.), THE BroadcastSink SHALL forward the event to all connected WebSocket clients
2. THE System SHALL include an agentId field in all ChatSink events emitted by Worker_Agents, so the frontend can distinguish which agent produced the event
3. THE agentId for the Main_Agent SHALL be "main", and each Worker_Agent SHALL have a unique agentId derived from its Agent_Task task_id
4. WHEN a Worker_Agent starts execution, THE System SHALL emit a system event of type "agent_started" containing the agentId, task_id, and model_id
5. WHEN a Worker_Agent finishes execution, THE System SHALL emit a system event of type "agent_finished" containing the agentId, task_id, status, and a summary of the result

### Requirement 8: Delegation Depth Control

**User Story:** As a system designer, I want to control the maximum nesting depth of agent delegation, so that the system does not spawn unbounded chains of sub-agents.

#### Acceptance Criteria

1. THE System SHALL support a maxDepth configuration parameter with a default value of 1
2. WHEN maxDepth is 1, THE Main_Agent SHALL be able to delegate to Worker_Agents, but Worker_Agents SHALL NOT receive the delegate_task tool
3. WHEN maxDepth is greater than 1, THE Worker_Agent at depth N (where N < maxDepth) SHALL receive the delegate_task tool and be able to spawn sub-Worker_Agents at depth N+1
4. WHEN a Worker_Agent is at the maximum allowed depth, THE System SHALL exclude the delegate_task tool from that Worker_Agent's ToolRegistry
5. THE current depth value SHALL be tracked per Worker_Agent and passed to any sub-Worker_Agents as currentDepth + 1

### Requirement 9: Worker Agent System Prompt and Context

**User Story:** As a Worker_Agent, I want a focused system prompt and clean context, so that I can execute my assigned task efficiently without irrelevant conversation history.

#### Acceptance Criteria

1. THE Worker_Agent SHALL receive a system prompt that includes: the task description, available tool descriptions, the assigned working directory hint, and the current depth level
2. THE Worker_Agent's system prompt SHALL reuse the existing skills and system context (SystemContext) from the Main_Agent's Service
3. THE Worker_Agent SHALL start with an empty message history containing only the system prompt and the task message as the first user message
4. WHEN the Worker_Agent completes, THE System SHALL discard the Worker_Context messages (they are not persisted to the database)

### Requirement 10: Agent Task Data Persistence

**User Story:** As a system operator, I want Agent_Task records to be queryable, so that I can review delegation history and debug issues.

#### Acceptance Criteria

1. THE Agent_Task SHALL store the following fields: task_id (string), parent_conversation_id (string), parent_agent_id (string), model_id (string), task_message (text), status (string), result (text), created_at (integer), updated_at (integer)
2. WHEN an Agent_Task is created, THE System SHALL persist the record to the SQLite database
3. WHEN an Agent_Task's status changes, THE System SHALL update the record in the database and update the updated_at timestamp
4. THE System SHALL provide a query interface to list all Agent_Tasks for a given parent_conversation_id


### Requirement 11: AI Assistant Settings Panel (Phase 1 Frontend)

**User Story:** As a user, I want to configure agent mode, agent models, and delegation depth directly in the existing AI assistant settings panel, so that I can manage multi-agent features without a separate system settings page in this phase.

#### Acceptance Criteria

1. THE AI assistant settings panel SHALL include a toggle switch for agent_mode ("single" / "multi")
2. WHEN agent_mode is set to "multi", THE settings panel SHALL display an agent model configuration section where users can add, edit, and remove Agent_Model entries (id, provider, model, description, weight)
3. THE settings panel SHALL include a maxDepth number input (default 1) visible only when agent_mode is "multi"
4. THE settings panel SHALL read and write these configurations via the existing config.get / config.set WebSocket messages
5. WHEN agent_mode is "single", THE agent model and depth settings SHALL be hidden to keep the UI clean
6. THE existing provider and model configuration in the AI assistant SHALL remain unchanged and continue to control the Main_Agent's model selection
