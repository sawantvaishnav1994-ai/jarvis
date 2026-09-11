# V1 V2 requirement register correction

The V2 document contains 168 V1 IDs, but many are assigned to the wrong subsystem. This register restores the actual V1 requirement wording and acceptance text. V2 section 21 is not usable as an implementation ownership map without this correction. No original document is overwritten.

Examples: FR-001 is conversation UI, FR-051 is knowledge ingestion, FR-061 is task lifecycle, FR-094 is speech adapters, FR-104 is device identity and FR-141 is policy evaluation.

All 168 V1 requirements and 24 V2 additions are now explicitly registered. MAPPED means an ownership mapping exists, not that the requirement is implemented or released. Existing development test results remain valid evidence for their tested scope; they are not automatically full-product acceptance.

| V1 IDs | Correct subsystem | V2 milestone alignment | Current review finding |
|---|---|---|---|
| FR-001–FR-009 | Interaction | J1/J3/J5 | Conversation and presence are incomplete product surfaces |
| FR-010–FR-018 | Identity and Trust | J0/J5 | Development identity tests exist; production and device evidence need review |
| FR-019–FR-027 | Conversation and Context | J1 | Conversation contracts exist; end-to-end product evidence needs review |
| FR-028–FR-038 | Models and Intelligence | J1/J3 | Local model adapter candidate; actual inference and quality benchmarks pending |
| FR-039–FR-050 | Memory | J1 | Memory contracts exist; full lifecycle UI and retrieval evaluation pending |
| FR-051–FR-060 | Knowledge | J1 | Ingestion and retrieval product integration pending |
| FR-061–FR-072 | Agents and Tasks | J2/J7 | Durable autonomous task execution product gate pending |
| FR-073–FR-084 | Tools | J2 | Governed development gateway exists; real connector qualification pending |
| FR-085–FR-093 | Events and Proactivity | J4 | Event foundation exists; proactive product workflows pending |
| FR-094–FR-103 | Voice and Vision | J3 | Mic preview exists; real ASR/TTS, vision and consent integration pending |
| FR-104–FR-113 | Devices | J5/J8 | Device control and hardware validation pending |
| FR-114–FR-121 | Digital Twin | J6 | Canonical world-state and spatial clients pending |
| FR-122–FR-128 | Simulation and Robotics | J6/J8 | Simulation, licensed integrations and hardware safety cases pending |
| FR-129–FR-140 | Security | J0+ | Development security evidence exists; production qualification pending |
| FR-141–FR-150 | Permissions and Approvals | J0/J2 | Development approval tests exist; product flows and release evidence pending |
| FR-151–FR-159 | Privacy and Data Control | J0/J1/J3 | Data controls exist; complete consent and capture integration pending |
| FR-160–FR-168 | Audit and Operations | J0+ | Development audit/recovery evidence exists; production isolation and drills pending |

## Existing V2 mapping for review

| V1 ID | V1 requirement | V2 assigned subsystem | Correct subsystem |
|---|---|---|---|
| FR-001 | Support text conversations with streaming responses, attachments, structured actions, citations/trace summaries, and task status. | Identity & Core Trust | Interaction |
| FR-002 | Show when JARVIS is listening, thinking, retrieving memory, using knowledge, calling a tool, waiting for approval, executing, or encountering an error. | Identity & Core Trust | Interaction |
| FR-003 | Separate user-visible answer from internal execution records and sensitive chain-of-thought. | Identity & Core Trust | Interaction |
| FR-004 | Support voice turn-taking with interruption/barge-in and explicit microphone state. | Identity & Core Trust | Interaction |
| FR-005 | Support multi-device handoff of active conversations and tasks. | Identity & Core Trust | Interaction |
| FR-006 | Provide a global command surface for actions, approvals, search, memory, knowledge, activities, and settings. | Identity & Core Trust | Interaction |
| FR-007 | Expose the source of important context: current conversation, memory, knowledge, device/event, or tool result. | Identity & Core Trust | Interaction |
| FR-008 | Support wearable notifications and concise voice interactions with constrained context. | Identity & Core Trust | Interaction |
| FR-009 | Support future AR/spatial rendering of devices, objects, task state, and AI cues. | Identity & Core Trust | Interaction |
| FR-010 | Create one Root Owner identity during secure bootstrap. | Identity & Core Trust | Identity and Trust |
| FR-011 | Require strong authentication for sensitive access and step-up authentication for high-impact actions. | Identity & Core Trust | Identity and Trust |
| FR-012 | Register devices with unique keys, trust state, last-seen metadata, and revocation. | Identity & Core Trust | Identity and Trust |
| FR-013 | Support short-lived sessions with rotation, revocation, and device binding. | Conversation & Context | Identity and Trust |
| FR-014 | Separate human identity, agent identity, service identity, and device identity. | Conversation & Context | Identity and Trust |
| FR-015 | Support trusted secondary users with explicit permission sets. | Conversation & Context | Identity and Trust |
| FR-016 | Support presence signals such as voice/face/device context only as additional trust factors, not sole authorization for critical actions. | Conversation & Context | Identity and Trust |
| FR-017 | Provide emergency recovery codes/keys with secure rotation and revocation. | Conversation & Context | Identity and Trust |
| FR-018 | Support context-aware trust scoring based on device, network, recent auth, location class, and anomaly signals. | Conversation & Context | Identity and Trust |
| FR-019 | Assign stable IDs to conversations, messages, tasks, attachments, and references. | Conversation & Context | Conversation and Context |
| FR-020 | Build a context package from explicit user input plus policy-approved memory/knowledge/task/world-state retrieval. | Conversation & Context | Conversation and Context |
| FR-021 | Prevent cross-user and cross-project context leakage. | Conversation & Context | Conversation and Context |
| FR-022 | Summarize long conversations into structured checkpoints while preserving source links. | Conversation & Context | Conversation and Context |
| FR-023 | Support task threads that outlive a single chat response. | Conversation & Context | Conversation and Context |
| FR-024 | Allow the user to pin, exclude, correct, or forget contextual items. | Conversation & Context | Conversation and Context |
| FR-025 | Represent uncertainty and missing context explicitly. | Models & Reasoning | Conversation and Context |
| FR-026 | Support shared project contexts with policy-controlled collaborators. | Models & Reasoning | Conversation and Context |
| FR-027 | Support multimodal references to screen regions, images, files, devices, and digital-twin entities. | Models & Reasoning | Conversation and Context |
| FR-028 | Maintain a model registry describing provider, model, modality, context limit, capabilities, location, cost class, latency class, and policy restrictions. | Models & Reasoning | Models and Intelligence |
| FR-029 | Expose a provider-neutral request/response contract for chat/reasoning, embeddings, vision, speech, and structured output. | Models & Reasoning | Models and Intelligence |
| FR-030 | Support model failover and controlled degradation when a provider is unavailable. | Models & Reasoning | Models and Intelligence |
| FR-031 | Apply data-classification rules before sending context to remote models. | Models & Reasoning | Models and Intelligence |
| FR-032 | Route by task type, quality requirement, latency, cost, privacy, modality, and tool/structured-output capability. | Models & Reasoning | Models and Intelligence |
| FR-033 | Support local inference for selected models and offline fallback. | Models & Reasoning | Models and Intelligence |
| FR-034 | Use specialized models for vision, speech, reranking, embeddings, code, or fast classification when beneficial. | Models & Reasoning | Models and Intelligence |
| FR-035 | Enforce per-task token, time, tool-call, and cost budgets. | Models & Reasoning | Models and Intelligence |
| FR-036 | Support evaluator/critic passes for high-consequence outputs without allowing critics to bypass policy. | Models & Reasoning | Models and Intelligence |
| FR-037 | Support policy-controlled ensembles or multi-model debate for selected tasks. | Models & Reasoning | Models and Intelligence |
| FR-038 | Maintain model quality and safety benchmarks by task class. | Models & Reasoning | Models and Intelligence |
| FR-039 | Store memories as typed objects rather than raw unstructured chat copies. | Memory | Memory |
| FR-040 | Support working, episodic, semantic/personal, preference, procedural, relationship, project, and event memory categories. | Memory | Memory |
| FR-041 | Keep original source links/provenance for generated memory. | Memory | Memory |
| FR-042 | Support explicit remember, correct, supersede, forget, export, and retention expiration operations. | Memory | Memory |
| FR-043 | Prevent low-confidence inference from becoming high-confidence personal fact silently. | Memory | Memory |
| FR-044 | Use embeddings and graph relationships for semantic/relational retrieval. | Memory | Memory |
| FR-045 | Store memory edges among people, projects, decisions, places, devices, goals, and events. | Memory | Memory |
| FR-046 | Apply sensitivity labels and memory-level access policies. | Memory | Memory |
| FR-047 | Rank retrieval by relevance, recency, confidence, importance, scope, and task fit. | Memory | Memory |
| FR-048 | Detect contradictions and preserve version history rather than destructively overwriting facts. | Memory | Memory |
| FR-049 | Support memory consolidation jobs that summarize repeated low-level events into higher-level stable memories. | Memory | Memory |
| FR-050 | Provide a user-visible Memory Graph, Memory Tree, and Memory Detail view. | Memory | Memory |
| FR-051 | Ingest files and text with stable document IDs, source metadata, checksums, versions, and access scopes. | Memory | Knowledge |
| FR-052 | Chunk/index content for hybrid lexical + vector retrieval with metadata filters. | Memory | Knowledge |
| FR-053 | Return source references/citations for knowledge-derived claims. | Memory | Knowledge |
| FR-054 | Enforce document-level permissions before retrieval. | Memory | Knowledge |
| FR-055 | Support webpages, repositories, notes, manuals, structured records, and selected connected services. | Memory | Knowledge |
| FR-056 | Track freshness, expiry, and re-index status. | Memory | Knowledge |
| FR-057 | Support reranking and query rewriting. | Knowledge | Knowledge |
| FR-058 | Support entity extraction and knowledge graph links where useful. | Knowledge | Knowledge |
| FR-059 | Support domain-specific indexes and retrieval policies. | Knowledge | Knowledge |
| FR-060 | Provide knowledge browsing, source management, and ingestion status UI. | Knowledge | Knowledge |
| FR-061 | Represent tasks with objective, owner, scope, status, priority, inputs, outputs, policy, budget, and deadlines if provided. | Knowledge | Agents and Tasks |
| FR-062 | Create explicit plans for multi-step execution with checkpoints. | Knowledge | Agents and Tasks |
| FR-063 | Execute steps idempotently where possible and avoid duplicate irreversible actions on retry. | Knowledge | Agents and Tasks |
| FR-064 | Persist task/agent state independently from model context. | Knowledge | Agents and Tasks |
| FR-065 | Stop on permission denial, invalid identity, policy conflict, or emergency stop. | Knowledge | Agents and Tasks |
| FR-066 | Support specialized agents with fixed role, tools, memory scope, policies, and budgets. | Knowledge | Agents and Tasks |
| FR-067 | Support delegation from orchestrator to agents without authority amplification. | Knowledge | Agents and Tasks |
| FR-068 | Use verifier/evaluator steps for tasks where correctness can be checked. | Knowledge | Agents and Tasks |
| FR-069 | Support pause, resume, cancel, retry, rollback, and manual takeover. | Agents | Agents and Tasks |
| FR-070 | Track intermediate artifacts and evidence. | Agents | Agents and Tasks |
| FR-071 | Support parallelizable sub-tasks with concurrency limits. | Agents | Agents and Tasks |
| FR-072 | Support learned task templates only after human review and versioning. | Agents | Agents and Tasks |
| FR-073 | Register every tool with name, version, input/output schema, risk class, required permissions, timeout, idempotency, and audit policy. | Agents | Tools |
| FR-074 | Validate structured inputs before invocation. | Agents | Tools |
| FR-075 | Run tools under least-privilege credentials and isolated service identities. | Agents | Tools |
| FR-076 | Classify actions as read, reversible write, irreversible/high-impact, financial/legal, security-critical, or physical. | Agents | Tools |
| FR-077 | Capture invocation, parameters (with secret redaction), principal, approvals, timestamps, result, and error. | Tools | Tools |
| FR-078 | Protect against prompt injection from tool outputs and retrieved external content. | Tools | Tools |
| FR-079 | Support transactional/rollback behavior where integration allows it. | Tools | Tools |
| FR-080 | Support tool health, rate limits, quotas, and circuit breakers. | Tools | Tools |
| FR-081 | Support human preview for high-impact generated payloads. | Tools | Tools |
| FR-082 | Support connection lifecycle: connect, inspect scopes, rotate credentials, revoke, disconnect. | Tools | Tools |
| FR-083 | Support sandboxed code/computer-use environments. | Tools | Tools |
| FR-084 | Support tool composition into versioned workflows. | Tools | Tools |
| FR-085 | Define a normalized event envelope with ID, source, type, timestamp, subject, payload, sensitivity, and correlation ID. | Events & Automation | Events and Proactivity |
| FR-086 | Separate event detection from action authorization. | Events & Automation | Events and Proactivity |
| FR-087 | Support schedules, webhooks, service events, task events, and device/sensor events. | Events & Automation | Events and Proactivity |
| FR-088 | Support condition watchers with cooldown, deduplication, threshold/hysteresis, and notification policies. | Events & Automation | Events and Proactivity |
| FR-089 | Persist durable event/task state for important automations. | Events & Automation | Events and Proactivity |
| FR-090 | Support quiet hours, channel preferences, urgency, escalation, and acknowledgement. | Events & Automation | Events and Proactivity |
| FR-091 | Support proactive suggestions without execution. | Events & Automation | Events and Proactivity |
| FR-092 | Correlate multiple events into higher-level situations. | Events & Automation | Events and Proactivity |
| FR-093 | Support simulation/dry-run of automation rules before activation. | Events & Automation | Events and Proactivity |
| FR-094 | Support speech-to-text and text-to-speech through provider-neutral adapters. | Events & Automation | Voice and Vision |
| FR-095 | Expose explicit microphone/camera state and permissions. | Events & Automation | Voice and Vision |
| FR-096 | Support wake-word or push-to-talk modes with configurable privacy behavior. | Events & Automation | Voice and Vision |
| FR-097 | Support speaker recognition as a contextual factor, not sole high-risk authentication. | Voice & Vision | Voice and Vision |
| FR-098 | Support image/screen understanding with object/text/scene references. | Voice & Vision | Voice and Vision |
| FR-099 | Support visual OCR and structured extraction with provenance. | Voice & Vision | Voice and Vision |
| FR-100 | Support multi-camera/device sensor fusion for defined environments. | Voice & Vision | Voice and Vision |
| FR-101 | Support optional face recognition only under explicit consent and legal/privacy rules. | Voice & Vision | Voice and Vision |
| FR-102 | Support interruption, barge-in, and low-latency response for voice mode. | Voice & Vision | Voice and Vision |
| FR-103 | Support depth/LiDAR/pose inputs for future spatial/robotic use. | Voice & Vision | Voice and Vision |
| FR-104 | Represent each device with unique identity, owner, capabilities, trust state, firmware/software metadata, and command/event schemas. | Voice & Vision | Devices |
| FR-105 | Use authenticated, encrypted communication for device control where supported. | Voice & Vision | Devices |
| FR-106 | Define safe default state and command timeout behavior for actuators. | Voice & Vision | Devices |
| FR-107 | Support local device gateways for protocols such as Matter/MQTT/REST or vendor APIs. | Voice & Vision | Devices |
| FR-108 | Expose device state, last update, health, and pending command state. | Voice & Vision | Devices |
| FR-109 | Classify device commands by risk and require appropriate approval. | Devices & Digital Twin | Devices |
| FR-110 | Support room/zone grouping and routines. | Devices & Digital Twin | Devices |
| FR-111 | Support sensor streams with retention/downsampling rules. | Devices & Digital Twin | Devices |
| FR-112 | Support anomaly detection for device health and state. | Devices & Digital Twin | Devices |
| FR-113 | Support narrow robotic devices only through dedicated safety controller and interlocks. | Devices & Digital Twin | Devices |
| FR-114 | Represent entities with type, identity, attributes, relationships, location/containment, state, source, and confidence. | Devices & Digital Twin | Digital Twin |
| FR-115 | Separate observed state, inferred state, desired state, and commanded state. | Devices & Digital Twin | Digital Twin |
| FR-116 | Merge observations from devices, user statements, tools, and sensors using source/confidence rules. | Devices & Digital Twin | Digital Twin |
| FR-117 | Support spatial hierarchy: site -> building -> floor -> room -> zone -> device/object. | Devices & Digital Twin | Digital Twin |
| FR-118 | Support temporal state/history for important entities. | Devices & Digital Twin | Digital Twin |
| FR-119 | Support geospatial/spatial references where useful. | Devices & Digital Twin | Digital Twin |
| FR-120 | Expose a query API to agents/tools without granting them raw unrestricted telemetry. | Devices & Digital Twin | Digital Twin |
| FR-121 | Support 2D/3D visualization and future AR anchoring. | Simulation & Robotics | Digital Twin |
| FR-122 | Support simulation tools as typed tools with versioned inputs/outputs and reproducibility metadata. | Simulation & Robotics | Simulation and Robotics |
| FR-123 | Track experiments, hypotheses, parameters, results, comparisons, and conclusions. | Simulation & Robotics | Simulation and Robotics |
| FR-124 | Support optimization loops with explicit search space, objective, constraints, and budget. | Simulation & Robotics | Simulation and Robotics |
| FR-125 | Support CAD/CAE/physics tool adapters where licensed/available. | Simulation & Robotics | Simulation and Robotics |
| FR-126 | For robotics, separate high-level task planning from deterministic motion/control stack. | Simulation & Robotics | Simulation and Robotics |
| FR-127 | Require simulation, workspace constraints, collision checks, e-stop, and human override for physical motion. | Simulation & Robotics | Simulation and Robotics |
| FR-128 | Record robot mission, commands, sensor state, safety events, and operator interventions. | Simulation & Robotics | Simulation and Robotics |
| FR-129 | Encrypt data in transit and sensitive data at rest. | Security & Permissions | Security |
| FR-130 | Use envelope encryption / KMS or equivalent for high-value keys and secrets. | Security & Permissions | Security |
| FR-131 | Maintain a secrets vault or secure secret-provider abstraction. | Security & Permissions | Security |
| FR-132 | Use least-privilege service accounts and network segmentation. | Security & Permissions | Security |
| FR-133 | Protect against prompt injection, indirect prompt injection, tool-result poisoning, and retrieval poisoning. | Security & Permissions | Security |
| FR-134 | Apply dependency, container, source, and secret scanning in CI. | Security & Permissions | Security |
| FR-135 | Implement rate limiting, abuse controls, replay protection, and request integrity for privileged APIs. | Security & Permissions | Security |
| FR-136 | Maintain secure backups and tested restore procedures. | Security & Permissions | Security |
| FR-137 | Support security event monitoring and anomaly alerts. | Security & Permissions | Security |
| FR-138 | Maintain a documented threat model and update it for each major capability. | Security & Permissions | Security |
| FR-139 | Support key rotation and credential revocation without full system rebuild. | Security & Permissions | Security |
| FR-140 | Support hardware-backed keys/secure enclave/TPM where available. | Security & Permissions | Security |
| FR-141 | Use explicit policy evaluation before every consequential tool/device action. | Security & Permissions | Permissions and Approvals |
| FR-142 | Policy inputs include principal, device/session trust, action/tool, target resource, data sensitivity, risk class, task scope, and recent approval. | Security & Permissions | Permissions and Approvals |
| FR-143 | Support allow, deny, require approval, require step-up authentication, and allow-with-constraints decisions. | Security & Permissions | Permissions and Approvals |
| FR-144 | Approval requests show exact action, target, scope, material parameters, and expected effect. | Security & Permissions | Permissions and Approvals |
| FR-145 | Approval tokens are scoped, time-limited, single-use or bounded-use, and non-transferable. | Security & Permissions | Permissions and Approvals |
| FR-146 | Support persistent user policies such as always allow low-risk read access to a specific project. | Security & Permissions | Permissions and Approvals |
| FR-147 | Support budgets/limits: spend, rows changed, files affected, recipients, environments, device ranges, time windows. | Privacy & Data Control | Permissions and Approvals |
| FR-148 | Support policy simulation before activation. | Privacy & Data Control | Permissions and Approvals |
| FR-149 | Log policy decision reason and policy version. | Privacy & Data Control | Permissions and Approvals |
| FR-150 | Support risk-adaptive step-up based on anomaly/context. | Privacy & Data Control | Permissions and Approvals |
| FR-151 | Classify data by sensitivity and allowed processing locations/providers. | Privacy & Data Control | Privacy and Data Control |
| FR-152 | Provide explicit retention policies for conversations, memory, knowledge, sensor data, tool logs, and audit. | Privacy & Data Control | Privacy and Data Control |
| FR-153 | Support export of user data in documented portable formats. | Privacy & Data Control | Privacy and Data Control |
| FR-154 | Support deletion/forgetting workflows consistent with security/audit/legal constraints. | Privacy & Data Control | Privacy and Data Control |
| FR-155 | Maintain consent records for microphones, cameras, face/voice templates, connected accounts, and shared contexts. | Privacy & Data Control | Privacy and Data Control |
| FR-156 | Separate raw sensor/media retention from derived metadata. | Privacy & Data Control | Privacy and Data Control |
| FR-157 | Provide provider disclosure for remote model/tool processing. | Privacy & Data Control | Privacy and Data Control |
| FR-158 | Minimize data sent to models/tools by retrieving only necessary context. | Privacy & Data Control | Privacy and Data Control |
| FR-159 | Support privacy zones and device/location-specific capture policies. | Audit & Operations | Privacy and Data Control |
| FR-160 | Record immutable/append-only audit events for auth, policy, approvals, tool calls, device commands, memory changes, administrative changes, and emergency actions. | Audit & Operations | Audit and Operations |
| FR-161 | Store correlation IDs linking user/event -> model run -> plan -> policy -> tool/device -> result. | Audit & Operations | Audit and Operations |
| FR-162 | Provide an emergency stop that can halt agents, automations, tool execution, and device commands independent of model reasoning. | Audit & Operations | Audit and Operations |
| FR-163 | Provide safe-mode startup after severe incident. | Audit & Operations | Audit and Operations |
| FR-164 | Support revocation of all sessions/integrations/devices from root owner control. | Audit & Operations | Audit and Operations |
| FR-165 | Provide human-readable activity history with filters by agent/tool/device/project/risk. | Audit & Operations | Audit and Operations |
| FR-166 | Provide audit export for incident review. | Audit & Operations | Audit and Operations |
| FR-167 | Maintain backup/restore actions in audit. | Audit & Operations | Audit and Operations |
| FR-168 | Support cryptographic chaining/signing or external immutable storage for high-assurance deployments. | Audit & Operations | Audit and Operations |
