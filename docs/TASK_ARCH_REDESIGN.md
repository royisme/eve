# TASK: Eve Architecture Redesign Execution Plan

Status: draft
Owner: Sisyphus
Last Updated: 2026-01-20

## Overview

This plan breaks the architecture redesign into independent tasks. Each task is executed on its own branch.

## Task 1: Config + Schema Foundation

Branch: feat/config-schema

Scope:
- Define EveConfig TypeBox schema
- Generate schema.json from TypeBox (no manual edits)
- Load and validate ~/.config/eve/eve.json
- Fail fast on invalid config

Exit Criteria:
- Config validation runs at startup
- Invalid config exits with code 1 and clear error paths

## Task 2: Provider + Model Resolver

Branch: feat/provider-model-resolver

Scope:
- Provider registry
- Model alias resolver
- Fallback chain resolution

Exit Criteria:
- Model alias resolves to provider + model id
- Fallback chain is enforced in resolution

## Task 3: Agent Rooms

Branch: feat/agent-rooms

Scope:
- Scan agents/*/agent.json
- Inherit defaults from eve.json
- Initialize agents with resolved models
- Enforce agent naming (flat only)

Exit Criteria:
- Agents load from filesystem
- Defaults are applied correctly

## Task 4: Routing Engine

Branch: feat/routing-engine

Scope:
- module:task routing patterns
- Priority-based conflict resolution
- Keyword fallback routing

Exit Criteria:
- Deterministic routing for task tags
- Conflicts resolved by priority

## Task 5: Eve Orchestrator Core

Branch: feat/eve-orchestrator

Scope:
- Intent classification (LLM first, rules fallback)
- Task decomposition + parallel dispatch
- Aggregation (merge/rank/vote)
- Fallback behavior

Exit Criteria:
- Multi-task requests can be planned and dispatched
- Aggregation returns single response

## Task 6: CLI Command Restructure

Branch: feat/cli-structure

Scope:
- CLI commands migrate to eve <module> <task>
- Remove legacy compatibility shims

Exit Criteria:
- CLI reflects new structure across all modules

## Task 7: Jobs Migration

Branch: feat/jobs-migration

Scope:
- Rename jobs tools to module:task format
- Add jobs metadata (intents + keywords)
- Migrate jobs schema to capabilities/jobs/jobs.db

Exit Criteria:
- Jobs tasks run through orchestrator
- Jobs data stored in jobs-prefixed tables

## Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
