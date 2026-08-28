"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeuristicMatcher = void 0;
const scoring_engine_js_1 = require("./scoring-engine.js");
const selector_resolver_js_1 = require("./selector-resolver.js");
class HeuristicMatcher {
    /**
     * Match a single DSL step against extracted DOM element candidates
     */
    matchStep(step, candidates, currentUrl) {
        // Special step actions that do not target specific DOM elements directly
        if (step.action === 'assert_url') {
            const rawUrl = step.expected || step.value || '';
            let matchScore = 100;
            let matchReason = 'URL Assertion Spec';
            let warning;
            if (currentUrl && rawUrl) {
                const normalizedCurrent = currentUrl.toLowerCase();
                const normalizedExpected = rawUrl.toLowerCase();
                const matches = normalizedCurrent.includes(normalizedExpected) ||
                    new RegExp(rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(currentUrl);
                if (!matches) {
                    matchScore = 0;
                    matchReason = `URL Transition Mismatch: Page is at '${currentUrl}'`;
                    warning = `URL Assertion Failed (Score 0): Page remained at '${currentUrl}' and did not reach expected URL '${rawUrl}' (likely because prior step failed).`;
                }
                else {
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
        const scoredCandidates = candidates.map(cand => {
            const { score, reason } = (0, scoring_engine_js_1.calculateScore)(cand, normalizedTarget, step.action);
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
        let warning;
        // Check for ambiguity (multiple top candidates with the same highest score)
        if (scoredCandidates.length > 1 && topMatch && scoredCandidates[1] && scoredCandidates[1].score === topMatch.score && topMatch.score > 0) {
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
        const { selectorType, selectorValue, roleName } = (0, selector_resolver_js_1.determineSelector)(bestCandidate, normalizedTarget, step.action);
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
}
exports.HeuristicMatcher = HeuristicMatcher;
