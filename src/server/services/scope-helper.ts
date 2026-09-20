/*
 * tester-lab - Scoped locator resolution (US-36, extended).
 * Resolve a locator inside the smallest container that carries a unique marker
 * text. The container is a table row, a list item, or a form group (div /
 * section / fieldset) — whichever holds both the marker and the target. This
 * lets a step target one control among identical siblings (e.g. an anonymous
 * "Edit" button that repeats once per form field) by naming a nearby label.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { Page, Locator } from 'playwright';

/** Containers a scope may resolve to, narrowest kinds first is not required:
 *  filter({ has: target }) already discards containers without the target, and
 *  .last() then takes the deepest match in DOM order. */
const SCOPE_SELECTOR = 'tr, li, [role="row"], div, section, fieldset';

/**
 * Build a locator for `buildTarget`, scoped to the smallest element that
 * contains both `marker` text and that target. Returns a locator that resolves
 * to zero elements when no such container exists, so callers can report an
 * honest not-found.
 *
 * `buildTarget` receives a root and returns the target relative to it, so the
 * same expression resolves against the page (to find the container) and against
 * the chosen container (to return the final locator).
 */
export function scopeFor(
  page: Page,
  marker: string,
  buildTarget: (root: Page | Locator) => Locator
): Locator {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // A real table row is the strongest signal; try it first so table scoping is
  // byte-identical to the original behaviour.
  const rowByRole = page.getByRole('row', { name: new RegExp(escaped, 'i') });

  // Any container that carries the marker AND holds the target. filter({ has })
  // drops the page-wide ancestors (<form>, <body>) that also contain the marker
  // but only because they contain everything; .last() takes the deepest, i.e.
  // the smallest, container in DOM order.
  const targetForFilter = buildTarget(page);
  const container = page
    .locator(SCOPE_SELECTOR)
    .filter({ hasText: marker })
    .filter({ has: targetForFilter });

  // Prefer a genuine row; fall back to the deepest qualifying container.
  const root = rowByRole.or(container.last());
  return buildTarget(root.first());
}

/**
 * Count how many distinct containers match the marker, for the not-found /
 * not-unique verdicts. A row and a form container that both wrap the same
 * marker are the same scope, so this counts the resolved target instead.
 */
export async function countScoped(
  page: Page,
  marker: string,
  buildTarget: (root: Page | Locator) => Locator
): Promise<number> {
  return scopeFor(page, marker, buildTarget).count();
}
