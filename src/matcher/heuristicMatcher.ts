import levenshtein from 'fast-levenshtein';
import { 
  DOMElementCandidate, 
  DSLStep, 
  ResolvedStep, 
  ScoredCandidate, 
  SelectorType 
} from '../types/index.js';

export class HeuristicMatcher {
  /**
   * Match a single DSL step against extracted DOM element candidates
   */
  public matchStep(step: DSLStep, candidates: DOMElementCandidate[], currentUrl?: string): ResolvedStep {
    // Special step actions that do not target specific DOM elements directly
    if (step.action === 'assert_url') {
      const rawUrl = step.expected || step.value || '';
      let matchScore = 100;
      let matchReason = 'URL Assertion Spec';
      let warning: string | undefined;

      if (currentUrl && rawUrl) {
        const normalizedCurrent = currentUrl.toLowerCase();
        const normalizedExpected = rawUrl.toLowerCase();

        const matches = normalizedCurrent.includes(normalizedExpected) || 
                        new RegExp(rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(currentUrl);

        if (!matches) {
          matchScore = 0;
          matchReason = `URL Transition Mismatch: Page is at '${currentUrl}'`;
          warning = `URL Assertion Failed (Score 0): Page remained at '${currentUrl}' and did not reach expected URL '${rawUrl}' (likely because prior step failed).`;
        } else {
          matchReason = `URL Verified: Page URL matches expected '${rawUrl}'`;
        }
      }

      return {
        step: step.step,
        action: step.action,
        expected: step.expected,
        description: step.description,
        selectorType: 'url',
        selectorValue: rawUrl,
        matchScore,
        matchReason,
        warning,
        options: step.options
      };
    }

    if (step.action === 'wait') {
      return {
        step: step.step,
        action: step.action,
        value: step.value,
        description: step.description,
        selectorType: 'locator',
        selectorValue: step.value || '1000',
        matchScore: 100,
        matchReason: 'Wait Action',
        options: step.options
      };
    }

    const targetLabel = (step.targetLabel || step.expected || '').trim();
    if (!targetLabel) {
      return {
        step: step.step,
        action: step.action,
        value: step.value,
        expected: step.expected,
        description: step.description,
        selectorType: 'locator',
        selectorValue: 'body',
        matchScore: 0,
        warning: 'No target label specified for step',
        options: step.options
      };
    }

    const normalizedTarget = targetLabel.toLowerCase();

    // Score all candidates
    const scoredCandidates: ScoredCandidate[] = candidates.map(cand => {
      const { score, reason } = this.calculateScore(cand, normalizedTarget, step.action);
      return {
        candidate: cand,
        score,
        matchReason: reason
      };
    });

    // Sort candidates descending by score, then by visual position (top-left first)
    scoredCandidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const posA = (a.candidate.boundingBox?.y || 0) * 1000 + (a.candidate.boundingBox?.x || 0);
      const posB = (b.candidate.boundingBox?.y || 0) * 1000 + (b.candidate.boundingBox?.x || 0);
      return posA - posB;
    });

    const topMatch = scoredCandidates[0];
    let warning: string | undefined;

    // Check for ambiguity (multiple top candidates with the same highest score)
    if (scoredCandidates.length > 1 && scoredCandidates[1].score === topMatch?.score && topMatch.score > 0) {
      warning = `Ambiguous Element Detected: Multiple candidates matched '${targetLabel}' with score ${topMatch.score}. Selected top-left element <${topMatch.candidate.tagName}>.`;
    }

    if (!topMatch || topMatch.score <= 0) {
      warning = `Low match score (0) for target: '${targetLabel}'. Using fallback text locator.`;
      return {
        step: step.step,
        action: step.action,
        targetLabel: step.targetLabel,
        value: step.value,
        expected: step.expected,
        description: step.description,
        selectorType: 'locator',
        selectorValue: `text="${targetLabel}"`,
        matchScore: 0,
        warning,
        options: step.options
      };
    }

    const bestCandidate = topMatch.candidate;
    const { selectorType, selectorValue, roleName } = this.determineSelector(bestCandidate, normalizedTarget, step.action);

    // Auto-correct action if it's incompatible with the resolved DOM tag
    let correctedAction = step.action;
    if (correctedAction === 'select' && bestCandidate.tagName !== 'select') {
      correctedAction = 'fill';
      warning = (warning ? warning + ' | ' : '') + `Auto-corrected action from 'select' to 'fill' because target element is <${bestCandidate.tagName}>`;
    }

    return {
      step: step.step,
      action: correctedAction,
      targetLabel: step.targetLabel,
      value: step.value,
      expected: step.expected,
      description: step.description,
      selectorType,
      selectorValue,
      roleName,
      matchScore: topMatch.score,
      matchReason: topMatch.matchReason,
      matchedCandidate: bestCandidate,
      candidatesRank: scoredCandidates.slice(0, 5),
      warning,
      options: step.options
    };
  }

  /**
   * Deterministic scoring matrix implementation with Tag Suitability Filtering
   */
  private calculateScore(
    cand: DOMElementCandidate, 
    target: string, 
    action: string
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    // Tag suitability check based on action
    const isTextFillableInput = 
      (['input', 'textarea', 'select'].includes(cand.tagName) && !['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file'].includes(cand.type || '')) || 
      ['textbox', 'combobox', 'searchbox', 'spinbutton'].includes(cand.role);
    const isClickableType = ['button', 'a', 'input'].includes(cand.tagName) || ['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab'].includes(cand.role);

    // Rule: Action 'fill' or 'select' MUST target text fillable input elements. Disallow links/buttons/checkboxes/static labels.
    if (['fill', 'select'].includes(action) && !isTextFillableInput) {
      return { score: 0, reason: 'Incompatible Tag: Cannot perform fill on non-input or checkbox/radio element' };
    }

    // Rule: Action 'click' prefers clickable elements over static divs/labels if text is identical
    if (action === 'click' && !isClickableType && ['div', 'span', 'p', 'label'].includes(cand.tagName)) {
      // Allow if element has onclick or role, otherwise penalize
      if (!cand.role && !cand.testId && !cand.id) {
        score -= 20;
      }
    }

    const testId = cand.testId.toLowerCase();
    const labelText = cand.labelText.toLowerCase();
    const placeholder = cand.placeholder.toLowerCase();
    const ariaLabel = cand.ariaLabel.toLowerCase();
    const innerText = cand.innerText.toLowerCase();
    const id = cand.id.toLowerCase();
    const name = cand.name.toLowerCase();

    // Rule 1: Direct Test ID Match (Score: 100)
    if (testId && (testId === target || testId.replace(/[-_]/g, '') === target.replace(/[-_\s]/g, ''))) {
      score += 100;
      reasons.push('Direct Test ID Match');
      return { score, reason: reasons.join(', ') };
    }

    // Rule 2: Associated Label Match
    if (labelText) {
      if (labelText === target) {
        score += 90;
        reasons.push('Exact Associated Label Match');
      } else if (labelText.includes(target) || target.includes(labelText)) {
        score += 75;
        reasons.push('Partial Associated Label Match');
      }
    }

    // Rule 3: Accessibility Role & Name Match
    if (cand.role && (innerText || ariaLabel)) {
      const accName = ariaLabel || innerText;
      if (accName === target) {
        score += 88;
        reasons.push(`Exact ARIA Role (${cand.role}) & Name Match`);
      } else if (accName.includes(target) || target.includes(accName)) {
        score += 70;
        reasons.push(`Partial ARIA Role (${cand.role}) & Name Match`);
      }
    }

    // Rule 4: InnerText / Visual Text Match
    // We evaluate this BEFORE Rule 5 so exact InnerText beats partial Aria/Placeholder
    if (innerText) {
      if (innerText === target) {
        score += 85;
        reasons.push('Exact InnerText Match');
      } else if (innerText.includes(target)) {
        score += 60;
        reasons.push('Partial InnerText Match');
      }
    }

    // Rule 5: Placeholder or Aria-Label Match (Standalone)
    if (placeholder) {
      if (placeholder === target) {
         score += 80;
         reasons.push('Exact Placeholder Match');
      } else if (placeholder.includes(target)) {
         score += 65;
         reasons.push('Partial Placeholder Match');
      }
    }
    if (ariaLabel) {
      if (ariaLabel === target) {
         score += 80;
         reasons.push('Exact Aria-Label Match');
      } else if (ariaLabel.includes(target)) {
         score += 65;
         reasons.push('Partial Aria-Label Match');
      }
    }

    // Secondary attribute checks: ID & Name
    if (score < 60 && (id || name)) {
      if (id === target || id.replace(/[-_]/g, '') === target.replace(/[-_\s]/g, '')) {
        score += 60;
        reasons.push('Exact ID Match');
      } else if (name === target || name.replace(/[-_]/g, '') === target.replace(/[-_\s]/g, '')) {
        score += 55;
        reasons.push('Exact Name Attribute Match');
      }
    }

    // Rule 6: Levenshtein Fuzzy Match (Score: 30 - 50)
    if (score <= 0 && (innerText || labelText || placeholder)) {
      const compareText = labelText || innerText || placeholder;
      if (compareText.length > 2 && target.length > 2) {
        const dist = levenshtein.get(target, compareText);
        const maxLen = Math.max(target.length, compareText.length);
        const similarity = 1 - dist / maxLen;
        if (similarity >= 0.6) {
          const fuzzyScore = Math.floor(similarity * 50);
          score += fuzzyScore;
          reasons.push(`Fuzzy Levenshtein Match (${Math.round(similarity * 100)}% similarity)`);
        }
      }
    }

    // Action-based relevance bonus
    if (score > 0) {
      if (action === 'click' && ['button', 'a'].includes(cand.tagName)) {
        score += 5;
      }
      if (action === 'fill' && isTextFillableInput) {
        score += 5;
      }
      if (action === 'upload' && (cand.type === 'file' || cand.tagName === 'input')) {
        score += 15;
      }
    }

    return { score: Math.max(0, score), reason: reasons.length ? reasons.join(', ') : 'No Match' };
  }

  /**
   * Determine Playwright selector strategy based on winning candidate metadata
   */
  private determineSelector(
    cand: DOMElementCandidate,
    target: string,
    action: string
  ): { selectorType: SelectorType; selectorValue: string; roleName?: string } {
    if (cand.testId) {
      return {
        selectorType: 'getByTestId',
        selectorValue: cand.testId
      };
    }

    if (cand.labelText) {
      return {
        selectorType: 'getByLabel',
        selectorValue: cand.labelText.trim()
      };
    }

    if (cand.placeholder) {
      return {
        selectorType: 'getByPlaceholder',
        selectorValue: cand.placeholder.trim()
      };
    }

    if (cand.id) {
      return {
        selectorType: 'locator',
        selectorValue: `#${cand.id}`
      };
    }

    if (cand.role && (cand.innerText || cand.ariaLabel)) {
      const raw = cand.ariaLabel || cand.innerText;
      const cleanName = raw.replace(/[\uE000-\uF8FF\u2000-\u206F]/g, '').trim();
      return {
        selectorType: 'getByRole',
        selectorValue: cand.role,
        roleName: cleanName || target
      };
    }

    if (cand.name) {
      return {
        selectorType: 'locator',
        selectorValue: `[name="${cand.name}"]`
      };
    }

    if (cand.innerText) {
      const cleanText = cand.innerText.replace(/[\uE000-\uF8FF\u2000-\u206F]/g, '').trim();
      return {
        selectorType: 'getByText',
        selectorValue: cleanText || target
      };
    }

    return {
      selectorType: 'locator',
      selectorValue: `text="${target}"`
    };
  }
}
