"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateScore = calculateScore;
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
/**
 * Deterministic scoring matrix implementation with Tag Suitability Filtering
 */
function calculateScore(cand, target, action) {
    let score = 0;
    const reasons = [];
    // Tag suitability check based on action
    const isTextFillableInput = (['input', 'textarea', 'select'].includes(cand.tagName) && !['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file'].includes(cand.type || '')) ||
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
    // Rule 1: Direct Test ID Match (Score: 100) — immediate return, highest priority
    if (testId && (testId === target || testId.replace(/[-_]/g, '') === target.replace(/[-_\s]/g, ''))) {
        score += 100;
        reasons.push('Direct Test ID Match');
        return { score, reason: reasons.join(', ') };
    }
    // Use a primary score tracker to prevent cumulative inflation.
    // Only the BEST matching attribute wins (label vs aria vs innerText vs placeholder).
    let primaryScore = 0;
    let primaryReason = '';
    // Rule 2: Associated Label Match
    if (labelText) {
        if (labelText === target) {
            if (90 > primaryScore) {
                primaryScore = 90;
                primaryReason = 'Exact Associated Label Match';
            }
        }
        else if ((labelText.includes(target) || target.includes(labelText)) && labelText.length > 3 && target.length > 3) {
            // Prevent tiny strings from falsely matching huge strings
            const ratio = Math.min(labelText.length, target.length) / Math.max(labelText.length, target.length);
            if (ratio > 0.4 && 75 > primaryScore) {
                primaryScore = 75;
                primaryReason = 'Partial Associated Label Match';
            }
        }
    }
    // Rule 3: Accessibility Role & Name Match
    if (cand.role && (innerText || ariaLabel)) {
        const accName = ariaLabel || innerText;
        if (accName === target) {
            if (88 > primaryScore) {
                primaryScore = 88;
                primaryReason = `Exact ARIA Role (${cand.role}) & Name Match`;
            }
        }
        else if ((accName.includes(target) || target.includes(accName)) && accName.length > 3 && target.length > 3) {
            const ratio = Math.min(accName.length, target.length) / Math.max(accName.length, target.length);
            if (ratio > 0.4 && 70 > primaryScore) {
                primaryScore = 70;
                primaryReason = `Partial ARIA Role (${cand.role}) & Name Match`;
            }
        }
    }
    // Rule 4: InnerText / Visual Text Match
    if (innerText) {
        if (innerText === target) {
            if (85 > primaryScore) {
                primaryScore = 85;
                primaryReason = 'Exact InnerText Match';
            }
        }
        else if (innerText.includes(target) && innerText.length > 3 && target.length > 3) {
            const ratio = Math.min(innerText.length, target.length) / Math.max(innerText.length, target.length);
            if (ratio > 0.3 && 60 > primaryScore) {
                primaryScore = 60;
                primaryReason = 'Partial InnerText Match';
            }
        }
    }
    // Rule 5: Placeholder or Aria-Label Match (Standalone)
    if (placeholder) {
        if (placeholder === target) {
            if (80 > primaryScore) {
                primaryScore = 80;
                primaryReason = 'Exact Placeholder Match';
            }
        }
        else if (placeholder.includes(target) && placeholder.length > 3 && target.length > 3) {
            const ratio = Math.min(placeholder.length, target.length) / Math.max(placeholder.length, target.length);
            if (ratio > 0.4 && 65 > primaryScore) {
                primaryScore = 65;
                primaryReason = 'Partial Placeholder Match';
            }
        }
    }
    if (ariaLabel) {
        if (ariaLabel === target) {
            if (80 > primaryScore) {
                primaryScore = 80;
                primaryReason = 'Exact Aria-Label Match';
            }
        }
        else if (ariaLabel.includes(target) && ariaLabel.length > 3 && target.length > 3) {
            const ratio = Math.min(ariaLabel.length, target.length) / Math.max(ariaLabel.length, target.length);
            if (ratio > 0.4 && 65 > primaryScore) {
                primaryScore = 65;
                primaryReason = 'Partial Aria-Label Match';
            }
        }
    }
    if (primaryScore > 0) {
        score += primaryScore;
        reasons.push(primaryReason);
    }
    // Secondary attribute checks: ID & Name (only if primary didn't score well enough)
    if (score < 60 && (id || name)) {
        if (id === target || id.replace(/[-_]/g, '') === target.replace(/[-_\s]/g, '')) {
            score += 60;
            reasons.push('Exact ID Match');
        }
        else if (name === target || name.replace(/[-_]/g, '') === target.replace(/[-_\s]/g, '')) {
            score += 55;
            reasons.push('Exact Name Attribute Match');
        }
    }
    // Token-based matching (Bag of Words) for robust cross-language or attribute matches
    // This helps match "Date Order" with "order_date" or "Tanggal Order"
    if (score < 50) {
        const tokenize = (s) => Array.from(new Set(s.toLowerCase().split(/[^a-z0-9]+/))).filter(Boolean).sort().join(' ');
        const targetToken = tokenize(target);
        if (targetToken.length > 0) {
            if (tokenize(labelText) === targetToken || tokenize(placeholder) === targetToken) {
                score += 65;
                reasons.push('Exact Token Match on Label/Placeholder');
            }
            else if (tokenize(name) === targetToken || tokenize(id) === targetToken) {
                score += 60;
                reasons.push('Exact Token Match on Name/ID');
            }
            else if (tokenize(labelText).includes(targetToken) || tokenize(name).includes(targetToken)) {
                score += 45;
                reasons.push('Partial Token Match');
            }
        }
    }
    // Rule 6: Levenshtein Fuzzy Match (Score: 30 - 50)
    if (score <= 0 && (innerText || labelText || placeholder)) {
        const compareText = labelText || innerText || placeholder;
        if (compareText.length > 2 && target.length > 2) {
            const dist = fast_levenshtein_1.default.get(target, compareText);
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
        if (['assert_text', 'assert_visible'].includes(action) && !isTextFillableInput && !isClickableType) {
            score += 15; // Bonus for pure text nodes (h1, p, span, label) for assertions
        }
    }
    return { score: Math.max(0, score), reason: reasons.length ? reasons.join(', ') : 'No Match' };
}
