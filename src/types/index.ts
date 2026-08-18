export type DSLAction = 
  | 'fill' 
  | 'click' 
  | 'select' 
  | 'check' 
  | 'uncheck' 
  | 'upload'
  | 'assert_text' 
  | 'assert_url' 
  | 'assert_visible' 
  | 'wait';

export interface StepOptions {
  timeout?: number;
  force?: boolean;
  iframeSelector?: string;
  exact?: boolean;
}

export interface DSLStep {
  step: number;
  action: DSLAction;
  targetLabel?: string;
  value?: string;
  expected?: string;
  description?: string;
  options?: StepOptions;
}

export interface DSLConfig {
  testSuite: string;
  targetUrl: string;
  framework?: 'playwright' | 'cypress' | 'selenium' | 'robotframework';
  language?: 'typescript' | 'javascript' | 'python' | 'robot';
  viewport?: {
    width: number;
    height: number;
  };
  steps: DSLStep[];
}

export interface DOMElementCandidate {
  index: number;
  tagName: string;
  id: string;
  name: string;
  testId: string;
  placeholder: string;
  ariaLabel: string;
  innerText: string;
  labelText: string;
  role: string;
  type: string;
  href?: string;
  value?: string;
  isVisible: boolean;
  isInIframe: boolean;
  iframeSelector?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type SelectorType = 
  | 'getByTestId' 
  | 'getByLabel' 
  | 'getByRole' 
  | 'getByPlaceholder' 
  | 'getByText' 
  | 'locator'
  | 'url';

export interface ScoredCandidate {
  candidate: DOMElementCandidate;
  score: number;
  matchReason: string;
}

export interface ResolvedStep {
  step: number;
  action: DSLAction;
  targetLabel?: string;
  value?: string;
  expected?: string;
  description?: string;
  selectorType: SelectorType;
  selectorValue: string;
  roleName?: string;
  matchScore: number;
  matchReason?: string;
  matchedCandidate?: DOMElementCandidate;
  candidatesRank?: ScoredCandidate[];
  warning?: string;
  options?: StepOptions;
}

export interface GenerationOptions {
  outPath?: string;
  dryRun?: boolean;
  formatCode?: boolean;
}

export interface GenerationResult {
  success: boolean;
  code: string;
  resolvedSteps: ResolvedStep[];
  warnings: string[];
  logs: string[];
  dryRunPassed?: boolean;
  dryRunError?: string;
}

export interface DryRunResult {
  success: boolean;
  error?: string;
  durationMs: number;
  selfHealed?: boolean;
  healedSteps?: {
    stepNumber: number;
    oldSelector: string;
    newSelector: string;
  }[];
}
