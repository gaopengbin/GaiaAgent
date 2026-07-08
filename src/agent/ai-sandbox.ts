import { invoke } from '@tauri-apps/api/core'

export type AiSandboxTarget = 'model-settings' | 'mcp-servers'

export interface AiSandboxCapability {
  target: AiSandboxTarget
  label: string
  description: string
  path: string
  operations: string[]
  requiresUserApproval: boolean
}

export interface AiSandboxValidation {
  ok: boolean
  messages: string[]
}

export type AiSandboxPatchStatus = 'prepared' | 'applied' | 'discarded'

export interface AiSandboxPatch {
  id: string
  target: AiSandboxTarget
  status: AiSandboxPatchStatus
  reason?: string | null
  targetPath: string
  sandboxPath: string
  backupPath?: string | null
  createdAtMs: number
  appliedAtMs?: number | null
  current: unknown
  proposed: unknown
  changedPaths: string[]
  validation: AiSandboxValidation
}

export interface AiSandboxApplyResult {
  patch: AiSandboxPatch
  appliedPath: string
  backupPath?: string | null
}

export function listAiSandboxCapabilities() {
  return invoke<AiSandboxCapability[]>('ai_sandbox_capabilities')
}

export function readAiSandboxTarget(target: AiSandboxTarget) {
  return invoke<unknown>('ai_sandbox_read_target', { target })
}

export function prepareAiSandboxPatch(input: {
  target: AiSandboxTarget
  proposed: unknown
  reason?: string
}) {
  return invoke<AiSandboxPatch>('ai_sandbox_prepare_patch', { request: input })
}

export function applyAiSandboxPatch(patchId: string) {
  return invoke<AiSandboxApplyResult>('ai_sandbox_apply_patch', { patchId })
}

export function discardAiSandboxPatch(patchId: string) {
  return invoke<AiSandboxPatch>('ai_sandbox_discard_patch', { patchId })
}
