/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * Recorder step reducer (AC-09.01).
 *
 * The injected recorder agent emits every captured action over several channels
 * at once (HTTP ingest, BroadcastChannel, postMessage) for reliability across
 * iframe / popup / bookmarklet contexts. When more than one channel reaches the
 * same app window (e.g. a same-origin proxied iframe delivers both postMessage
 * AND BroadcastChannel), a single action would otherwise be buffered twice.
 *
 * This pure reducer folds one incoming payload into the current buffer with two
 * rules, so the same logic is shared by every consumer and is unit-testable
 * without a browser:
 *
 *   1. De-duplicate by `stepId`: if a step with the same id is already in the
 *      buffer, ignore the new one. This covers duplicates from any channel and
 *      any action type (click/select/check/fill alike) — unlike the old
 *      consecutive-fill merge, which only collapsed repeated fills.
 *   2. Collapse consecutive `fill`s on the same field: a debounced input can
 *      emit several fills for one field; keep one, with the latest value.
 *
 * A payload without a `stepId` is still processed (back-compat), just without
 * id-based de-duplication. Invalid payloads are ignored. Never mutates input.
 */

export interface RecorderStepPayload {
  /** Unique id for this captured action, used to drop cross-channel duplicates. */
  stepId?: string;
  action: string;
  targetLabel?: string;
  value?: string;
  description?: string;
}

export interface RecorderStep {
  stepId?: string;
  action: string;
  targetLabel: string;
  value: string;
  description: string;
}

/**
 * Fold one incoming payload into the buffer, returning a NEW array. Pure; never
 * throws. See the module comment for the de-duplication and merge rules.
 */
export function reduceRecorderStep(
  buffer: RecorderStep[],
  payload: RecorderStepPayload | null | undefined
): RecorderStep[] {
  const current = Array.isArray(buffer) ? buffer : [];
  if (!payload || typeof payload.action !== 'string' || !payload.action) {
    return current.slice();
  }

  // Rule 1: id-based de-duplication across channels and action types.
  if (payload.stepId !== undefined && current.some((s) => s.stepId === payload.stepId)) {
    return current.slice();
  }

  const next = current.slice();
  const label = payload.targetLabel || 'Element';
  const value = payload.value || '';

  // Rule 2: collapse consecutive fills on the same field (keep latest value).
  const last = next[next.length - 1];
  if (last && last.action === 'fill' && payload.action === 'fill' && last.targetLabel === label) {
    next[next.length - 1] = {
      ...last,
      stepId: payload.stepId !== undefined ? payload.stepId : last.stepId,
      value,
      description: payload.description || `Type ${value} into ${label}`
    };
    return next;
  }

  next.push({
    stepId: payload.stepId,
    action: payload.action,
    targetLabel: label,
    value,
    description: payload.description || `${payload.action.toUpperCase()} on ${label}`
  });
  return next;
}
