    let steps = [];
    let isGeneratingScript = false;
    let latestGeneratedCode = '';

    function loadSampleScenario() {
      document.getElementById('testSuite').value = 'Standard Web Login Verification';
      document.getElementById('targetUrl').value = 'https://the-internet.herokuapp.com/login';
      steps = [
        { action: 'fill', targetLabel: 'Username', value: 'tomsmith', description: 'Isi kolom username' },
        { action: 'fill', targetLabel: 'Password', value: 'SuperSecretPassword!', description: 'Isi kolom password' },
        { action: 'click', targetLabel: 'Login', value: '', description: 'Klik tombol login' },
        { action: 'assert_url', targetLabel: '', value: '/secure', description: 'Verifikasi URL beralih ke secure area' }
      ];
      renderSteps();
    }

    function handleImportSpec(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const specContent = e.target.result;
          if (!specContent || !specContent.trim()) {
            Swal.fire({ icon: 'warning', title: 'Empty File', text: 'The uploaded spec file is empty.', confirmButtonColor: '#005bbf' });
            return;
          }

          latestGeneratedCode = specContent;
          const codeOutput = document.getElementById('codeOutput');
          if (codeOutput) codeOutput.textContent = specContent;

          // Set language selection based on extension
          const langSelect = document.getElementById('language');
          if (langSelect) {
            if (file.name.endsWith('.js')) {
              langSelect.value = 'javascript';
            } else {
              langSelect.value = 'typescript';
            }
          }

          const statusBadgeContainer = document.getElementById('statusBadgeContainer');
          if (statusBadgeContainer) {
            statusBadgeContainer.innerHTML = '<span class="status-chip chip-pass">Spec File Loaded</span>';
          }

          Swal.fire({
            icon: 'success',
            title: 'Spec File Loaded',
            text: `Successfully imported "${file.name}". Click "Run Script Now" to execute.`,
            timer: 2500,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });
        } catch (err) {
          Swal.fire({ icon: 'error', title: 'Import Failed', text: 'Failed to read spec file: ' + err.message, confirmButtonColor: '#005bbf' });
        }
      };
      reader.readAsText(file);

      // Reset input value to allow importing the same file again
      event.target.value = '';
    }

    function handleImportFlow(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = JSON.parse(e.target.result);

          if (data.testSuite) document.getElementById('testSuite').value = data.testSuite;
          if (data.targetUrl) document.getElementById('targetUrl').value = data.targetUrl;
          if (data.framework) {
            document.getElementById('framework').value = data.framework;
            onFrameworkChange(); // update language options
          }
          if (data.language) {
            // Need a tiny timeout because onFrameworkChange modifies the DOM options
            setTimeout(() => {
              document.getElementById('language').value = data.language;
            }, 10);
          }

          if (Array.isArray(data.steps)) {
            steps = data.steps.map(s => ({
              action: s.action || 'fill',
              targetLabel: s.targetLabel || '',
              // map expected to value for assert actions
              value: s.value !== undefined ? s.value : (s.expected !== undefined ? s.expected : ''),
              description: s.description || ''
            }));
            renderSteps();
          }
        } catch (err) {
          Swal.fire({ icon: 'error', title: 'Import Failed', text: 'Failed to parse JSON file: ' + err.message, confirmButtonColor: '#005bbf' });
        }
      };
      reader.readAsText(file);

      // Reset input value to allow importing the same file again
      event.target.value = '';
    }

    function addStep() {
      steps.push({ action: 'fill', targetLabel: '', value: '', description: '' });
      renderSteps();
    }

    function removeStep(index) {
      steps.splice(index, 1);
      renderSteps();
    }

    let dragSrcIndex = null;

    function handleDragStart(e, index) {
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
      e.currentTarget.classList.add('dragging');
    }

    function handleDragOver(e, index) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return false;
    }

    function handleDragEnter(e, index) {
      if (index !== dragSrcIndex) {
        e.currentTarget.classList.add('drag-over');
      }
    }

    function handleDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    function handleDrop(e, targetIndex) {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');

      if (dragSrcIndex !== null && dragSrcIndex !== targetIndex) {
        const draggedItem = steps.splice(dragSrcIndex, 1)[0];
        steps.splice(targetIndex, 0, draggedItem);
        renderSteps();
      }
      return false;
    }

    function handleDragEnd(e) {
      e.currentTarget.classList.remove('dragging');
      document.querySelectorAll('.step-item').forEach(item => {
        item.classList.remove('drag-over');
        item.classList.remove('dragging');
      });
    }

    function updateStep(index, field, val) {
      steps[index][field] = val;
    }

    function renderSteps() {
      const container = document.getElementById('stepList');
      const badge = document.getElementById('stepCountBadge');
      container.innerHTML = '';
      if (badge) {
        badge.textContent = steps.length + (steps.length === 1 ? ' STEP' : ' STEPS');
      }

      steps.forEach((step, idx) => {
        const item = document.createElement('div');
        item.className = 'step-item';
        item.draggable = true;
        item.setAttribute('ondragstart', `handleDragStart(event, ${idx})`);
        item.setAttribute('ondragover', `handleDragOver(event, ${idx})`);
        item.setAttribute('ondragenter', `handleDragEnter(event, ${idx})`);
        item.setAttribute('ondragleave', `handleDragLeave(event)`);
        item.setAttribute('ondrop', `handleDrop(event, ${idx})`);
        item.setAttribute('ondragend', `handleDragEnd(event)`);

        item.innerHTML = `
          <div class="step-row-top">
            <div class="drag-handle" title="Klik & seret untuk memindahkan posisi step">⠿</div>
            <div class="step-num">${idx + 1}</div>
            <select onchange="updateStep(${idx}, 'action', this.value); renderSteps();" style="width: 150px;">
              <option value="fill" ${step.action === 'fill' ? 'selected' : ''}>Fill Input</option>
              <option value="click" ${step.action === 'click' ? 'selected' : ''}>Click Element</option>
              <option value="select" ${step.action === 'select' ? 'selected' : ''}>Select Option</option>
              <option value="upload" ${step.action === 'upload' ? 'selected' : ''}>Upload File</option>
              <option value="check" ${step.action === 'check' ? 'selected' : ''}>Check</option>
              <option value="uncheck" ${step.action === 'uncheck' ? 'selected' : ''}>Uncheck</option>
              <option value="assert_url" ${step.action === 'assert_url' ? 'selected' : ''}>Assert URL</option>
              <option value="assert_text" ${step.action === 'assert_text' ? 'selected' : ''}>Assert Text</option>
              <option value="assert_visible" ${step.action === 'assert_visible' ? 'selected' : ''}>Assert Visible</option>
              <option value="wait" ${step.action === 'wait' ? 'selected' : ''}>Wait Delay</option>
            </select>
            <button class="btn-remove" onclick="removeStep(${idx})">Remove</button>
          </div>

          <div class="grid-2">
            ${step.action !== 'assert_url' && step.action !== 'wait' ? `
            <div class="form-group">
              <label>Target Element Label / ID</label>
              <input type="text" value="${step.targetLabel || ''}" placeholder="${step.action === 'upload' ? 'e.g. Upload KTP / Document' : 'e.g. Email / Username'}" onchange="updateStep(${idx}, 'targetLabel', this.value)">
            </div>` : ''}

            ${step.action === 'fill' || step.action === 'select' || step.action === 'upload' || step.action === 'assert_url' || step.action === 'assert_text' || step.action === 'wait' ? `
            <div class="form-group">
              <label>${step.action === 'assert_url' ? 'Expected URL Path' : step.action === 'assert_text' ? 'Expected Text' : step.action === 'wait' ? 'Delay (ms)' : step.action === 'upload' ? 'File Path to Attach' : 'Input Value'}</label>
              <input type="text" value="${step.value || ''}" placeholder="${step.action === 'upload' ? 'e.g. fixtures/ktp.pdf' : 'e.g. user@example.com'}" onchange="updateStep(${idx}, 'value', this.value)">
            </div>` : ''}
          </div>

          <div class="form-group">
            <label>Description (Optional)</label>
            <input type="text" value="${step.description || ''}" placeholder="Description of step action..." onchange="updateStep(${idx}, 'description', this.value)">
          </div>
        `;
        container.appendChild(item);
      });
    }

    function onFrameworkChange() {
      const fw = document.getElementById('framework').value;
      const langSelect = document.getElementById('language');
      const badge = document.querySelector('.badge-tag');

      if (fw === 'playwright') {
        langSelect.innerHTML = `
          <option value="typescript">TypeScript (.spec.ts)</option>
          <option value="javascript">JavaScript (.spec.js)</option>
        `;
        if (badge) badge.textContent = 'Playwright Engine';
      } else if (fw === 'cypress') {
        langSelect.innerHTML = `
          <option value="javascript">JavaScript (cy.js)</option>
        `;
        if (badge) badge.textContent = 'Cypress Engine';
      } else if (fw === 'selenium') {
        langSelect.innerHTML = `
          <option value="python">Python (selenium.py)</option>
        `;
        if (badge) badge.textContent = 'Selenium Engine';
      } else if (fw === 'robotframework') {
        langSelect.innerHTML = `
          <option value="robot">Robot Framework (.robot)</option>
        `;
        if (badge) badge.textContent = 'Robot Engine';
      }
    }

    async function generateScript() {
      const btn = document.getElementById('btnGenerate');
      const loader = document.getElementById('btnLoader');
      const codeOutput = document.getElementById('codeOutput');
      const summarySection = document.getElementById('summarySection');
      const summaryTableBody = document.getElementById('summaryTableBody');
      const statusBadgeContainer = document.getElementById('statusBadgeContainer');
      const consoleTitle = document.getElementById('consoleTitle');

      // 1. AUTO-CLEAN PREVIOUS RESULTS IMMEDIATELY
      summarySection.style.display = 'none';
      summaryTableBody.innerHTML = '';
      statusBadgeContainer.innerHTML = '<span class="status-chip" style="background: var(--soft-stone); color: var(--slate); border: 1px solid var(--hairline);">Processing...</span>';

      const dslPayload = {
        testSuite: document.getElementById('testSuite').value || 'Automated Test Suite',
        targetUrl: document.getElementById('targetUrl').value,
        framework: document.getElementById('framework').value,
        language: document.getElementById('language').value,
        steps: steps.map((s, i) => {
          const stepObj = {
            step: i + 1,
            action: s.action,
            description: s.description
          };
          if (s.targetLabel) stepObj.targetLabel = s.targetLabel;
          if (s.action === 'fill' || s.action === 'select' || s.action === 'upload') stepObj.value = s.value;
          if (s.action === 'assert_url') stepObj.expected = s.value;
          if (s.action === 'assert_text') {
            stepObj.expected = s.value;
            stepObj.targetLabel = s.targetLabel;
          }
          if (s.action === 'wait') stepObj.value = s.value;
          return stepObj;
        })
      };

      if (!authToken) {
        openAuthModal('login');
        Swal.fire({ icon: 'warning', title: 'Authentication Required', text: 'Please sign in to generate test scripts.', confirmButtonColor: '#005bbf' });
        return;
      }

      btn.disabled = true;
      loader.style.display = 'inline-block';
      isGeneratingScript = true;
      latestGeneratedCode = '';

      const btnRunTest = document.getElementById('btnRunTest');
      if (btnRunTest) btnRunTest.disabled = true;

      // 2. REALTIME MONITORING PROCESS DISPLAY
      const targetUrlVal = dslPayload.targetUrl;
      const isDryRun = document.getElementById('dryRun').checked;

      if (consoleTitle) consoleTitle.textContent = 'REALTIME BACKGROUND MONITOR';

      codeOutput.textContent =
        `[1/4] INITIALIZING GENERATION PIPELINE...
[2/4] CRAWLER: Navigating to ${targetUrlVal} & inspecting state transition DOM elements...
[3/4] HEURISTIC MATCHER: Scoring candidates & ranking Playwright selectors...
[4/4] ${isDryRun ? 'DRY-RUN ENGINE: Executing headless Playwright test verification...' : 'GENERATOR: Emitting final code output...'}`;

      let currentStep = 2;
      const progressTimer = setInterval(() => {
        if (currentStep === 2) {
          codeOutput.textContent =
            `[1/4] INITIALIZING PIPELINE... [DONE]
[2/4] CRAWLER: Navigating to ${targetUrlVal} & evaluating interactive DOM elements... [ACTIVE]
[3/4] HEURISTIC MATCHER: Scoring candidates... [PENDING]
[4/4] GENERATOR: Emitting script & Dry-Run... [PENDING]`;
          currentStep = 3;
        } else if (currentStep === 3) {
          codeOutput.textContent =
            `[1/4] INITIALIZING PIPELINE... [DONE]
[2/4] CRAWLER: Candidate extraction complete. [DONE]
[3/4] HEURISTIC MATCHER: Calculating scores & choosing optimal Playwright locators... [ACTIVE]
[4/4] GENERATOR: ${isDryRun ? 'Executing Playwright Headless Dry-Run...' : 'Formatting code string via Handlebars & Prettier...'} [ACTIVE]`;
          currentStep = 4;
        }
      }, 1200);

      try {
        const response = await fetch('/api/v1/generate-script', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            dsl: dslPayload,
            dryRun: isDryRun
          })
        });

        clearInterval(progressTimer);
        const data = await response.json();

        if (consoleTitle) consoleTitle.textContent = 'PLAYWRIGHT TEST OUTPUT CONSOLE';

        if (!data.success) {
          statusBadgeContainer.innerHTML = '<span class="status-chip chip-fail">Generation Failed</span>';
          Swal.fire({ icon: 'error', title: 'Generation Failed', text: (data.errors ? data.errors.join(', ') : data.error), confirmButtonColor: '#005bbf' });
          codeOutput.textContent = '// Generation failed.\n' + (data.errors ? data.errors.join('\n') : data.error);
          return;
        }

        latestGeneratedCode = data.code;
        codeOutput.textContent = data.code;

        // Render Summary Table with Fresh Results
        summarySection.style.display = 'block';
        summaryTableBody.innerHTML = '';

        data.resolvedSteps.forEach((s) => {
          const tr = document.createElement('tr');
          const isPassScore = s.matchScore >= 80;
          tr.innerHTML = `
            <td><span style="font-family: var(--font-mono); font-weight: 500;">Step ${s.step}</span></td>
            <td><span style="font-family: var(--font-mono); color: var(--action-blue);">${s.action}</span></td>
            <td><span style="font-family: var(--font-mono);">${s.selectorType}('${s.selectorValue}')</span></td>
            <td><span style="font-weight: 600; color: ${isPassScore ? 'var(--deep-green)' : 'var(--coral)'};">${s.matchScore}</span></td>
          `;
          summaryTableBody.appendChild(tr);
        });

        // Render Status Badge
        if (isDryRun) {
          if (data.dryRunPassed) {
            statusBadgeContainer.innerHTML = '<span class="status-chip chip-pass">Dry-Run Passed</span>';
          } else {
            statusBadgeContainer.innerHTML = '<span class="status-chip chip-fail">Dry-Run Failed</span>';
          }
        } else {
          statusBadgeContainer.innerHTML = '<span class="status-chip chip-pass">Script Generated</span>';
        }

      } catch (err) {
        clearInterval(progressTimer);
        if (consoleTitle) consoleTitle.textContent = 'PLAYWRIGHT TEST OUTPUT CONSOLE';
        statusBadgeContainer.innerHTML = '<span class="status-chip chip-fail">Connection Error</span>';
        Swal.fire({ icon: 'error', title: 'Connection Error', text: 'Failed to connect to API server: ' + err.message, confirmButtonColor: '#005bbf' });
      } finally {
        isGeneratingScript = false;
        btn.disabled = false;
        loader.style.display = 'none';
        if (btnRunTest) btnRunTest.disabled = false;
      }
    }

    function copyCode() {
      const code = document.getElementById('codeOutput').textContent;
      navigator.clipboard.writeText(code).then(() => {
        Swal.fire({ icon: 'success', title: 'Copied!', text: 'Generated code copied to clipboard!', timer: 2000, showConfirmButton: false, toast: true, position: 'top-end' });
      });
    }

    function downloadCode() {
      const code = document.getElementById('codeOutput').textContent;
      const lang = document.getElementById('language').value;
      const filename = `test-spec.${lang === 'javascript' ? 'spec.js' : 'spec.ts'}`;

      const blob = new Blob([code], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    }

    async function runGeneratedTest() {
      const btn = document.getElementById('btnRunTest');
      const terminalOutput = document.getElementById('terminalOutput');
      const terminalTitle = document.getElementById('terminalTitle');
      const mode = document.getElementById('runMode').value;
      const language = document.getElementById('language').value;

      if (!authToken) {
        openAuthModal('login');
        Swal.fire({ icon: 'warning', title: 'Authentication Required', text: 'Please sign in to execute tests.', confirmButtonColor: '#005bbf' });
        return;
      }

      if (isGeneratingScript) {
        Swal.fire({
          icon: 'warning',
          title: 'Generation in Progress',
          text: 'Please wait until script generation finishes before running the test.',
          confirmButtonColor: '#005bbf'
        });
        return;
      }

      const code = latestGeneratedCode;

      if (!code || !code.trim() || code.startsWith('//') || code.includes('[1/4] INITIALIZING')) {
        Swal.fire({
          icon: 'warning',
          title: 'No Valid Script Found',
          text: 'Please generate a valid test script first before running.',
          confirmButtonColor: '#005bbf'
        });
        return;
      }

      btn.disabled = true;
      terminalTitle.textContent = `CLI Terminal Output [Running ${mode.toUpperCase()}...]`;
      terminalOutput.style.color = '#60a5fa';
      terminalOutput.textContent = `[TERMINAL] Initiating Playwright Test Runner...\n[TERMINAL] Mode: ${mode.toUpperCase()}\n[TERMINAL] Environment: Node.js / Playwright\n[TERMINAL] Executing script...\n`;

      try {
        const response = await fetch('/api/v1/run-test', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            code,
            mode,
            language
          })
        });

        const data = await response.json();

        if (data.success) {
          terminalTitle.textContent = `CLI Terminal Output [PASS - ${data.durationMs}ms]`;
          terminalOutput.style.color = '#34d399';
          terminalOutput.textContent = `[PASS] Test Execution Completed Successfully (${data.durationMs}ms)\n\n${data.logs}`;
        } else {
          terminalTitle.textContent = `CLI Terminal Output [FAIL - ${data.durationMs}ms]`;
          terminalOutput.style.color = '#f87171';
          terminalOutput.textContent = `[FAIL] Test Execution Failed (${data.durationMs}ms)\n\n${data.logs || data.error}`;
        }

        if (data.videoUrl) {
          const videoContainer = document.getElementById('videoContainer');
          const videoPlayer = document.getElementById('videoPlayer');
          if (videoContainer && videoPlayer) {
            videoPlayer.src = data.videoUrl;
            videoContainer.style.display = 'block';
          }
        }
      } catch (err) {
        terminalTitle.textContent = 'CLI Terminal Output [ERROR]';
        terminalOutput.style.color = '#f87171';
        terminalOutput.textContent = `[ERROR] Failed to communicate with runner service: ${err.message}`;
      } finally {
        btn.disabled = false;
      }
    }

    // Auth & User Session State
    let authToken = localStorage.getItem('tester_jwt_token') || '';
    let currentUser = null;

    function getAuthHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      return headers;
    }

    async function checkAuthSession() {
      const topBar = document.getElementById('topAnnouncementBar');
      const header = document.getElementById('appHeader');
      const authUserBar = document.getElementById('authUserBar');
      const unauthView = document.getElementById('unauthLoginView');
      const mainApp = document.getElementById('mainAppContainer');

      if (!authToken) {
        renderLoggedOutBar();
        if (topBar) topBar.style.display = 'none';
        if (header) header.style.display = 'none';
        if (unauthView) unauthView.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
        return;
      }

      try {
        const response = await fetch('/api/v1/auth/me', {
          headers: getAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
          currentUser = data.user;
          renderLoggedInBar();
          if (topBar) topBar.style.display = 'flex';
          if (header) header.style.display = 'flex';
          if (unauthView) unauthView.style.display = 'none';
          if (mainApp) mainApp.style.display = 'grid';
        } else {
          authToken = '';
          localStorage.removeItem('tester_jwt_token');
          renderLoggedOutBar();
          if (topBar) topBar.style.display = 'none';
          if (header) header.style.display = 'none';
          if (unauthView) unauthView.style.display = 'flex';
          if (mainApp) mainApp.style.display = 'none';
        }
      } catch (err) {
        renderLoggedOutBar();
        if (topBar) topBar.style.display = 'none';
        if (header) header.style.display = 'none';
        if (unauthView) unauthView.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
      }
    }

    function showRegisterSection() {
      const loginSec = document.getElementById('heroLoginSection');
      const regSec = document.getElementById('heroRegisterSection');
      if (loginSec) loginSec.style.display = 'none';
      if (regSec) regSec.style.display = 'block';
    }

    function showLoginSection() {
      const loginSec = document.getElementById('heroLoginSection');
      const regSec = document.getElementById('heroRegisterSection');
      if (loginSec) loginSec.style.display = 'block';
      if (regSec) regSec.style.display = 'none';
    }

    function renderLoggedOutBar() {
      const authUserBar = document.getElementById('authUserBar');
      if (!authUserBar) return;
      authUserBar.innerHTML = '';
    }

    function togglePasswordVisibility(inputId, btn) {
      const input = document.getElementById(inputId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      } else {
        input.type = 'password';
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      }
    }

    function renderLoggedInBar() {
      const authUserBar = document.getElementById('authUserBar');
      if (!authUserBar || !currentUser) return;

      let adminBtn = '';
      if (currentUser.role === 'admin') {
        adminBtn = `<a href="/admin" class="btn-pill-outline" style="border-color: #39ff14; color: #39ff14; text-decoration: none; font-weight: 600;">Admin Console</a>`;
      }

      authUserBar.innerHTML = `
        <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--ink); background: var(--soft-stone); padding: 6px 14px; border-radius: 9999px; border: 1px solid var(--hairline);">
          ${currentUser.username}
        </span>
        ${adminBtn}
        <button type="button" class="btn-pill-outline" onclick="handleLogout()">Sign Out</button>
      `;
    }

    function openAuthModal(tab = 'login') {
      const modal = document.getElementById('authModal');
      if (modal) modal.style.display = 'flex';
      switchAuthTab(tab);
    }

    function closeAuthModal() {
      const modal = document.getElementById('authModal');
      if (modal) modal.style.display = 'none';
    }

    function switchAuthTab(tab) {
      const tabLoginBtn = document.getElementById('tabLoginBtn');
      const tabRegisterBtn = document.getElementById('tabRegisterBtn');
      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      const authModalTitle = document.getElementById('authModalTitle');

      if (tab === 'login') {
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        authModalTitle.textContent = 'Sign In to Tester Lab';
      } else {
        tabRegisterBtn.classList.add('active');
        tabLoginBtn.classList.remove('active');
        registerForm.style.display = 'flex';
        loginForm.style.display = 'none';
        authModalTitle.textContent = 'Request Account Registration';
      }
    }

    function switchHeroAuthTab(tab) {
      const heroTabLoginBtn = document.getElementById('heroTabLoginBtn');
      const heroTabRegisterBtn = document.getElementById('heroTabRegisterBtn');
      const heroLoginForm = document.getElementById('heroLoginForm');
      const heroRegisterForm = document.getElementById('heroRegisterForm');

      if (tab === 'login') {
        heroTabLoginBtn.classList.add('active');
        heroTabRegisterBtn.classList.remove('active');
        heroLoginForm.style.display = 'flex';
        heroRegisterForm.style.display = 'none';
      } else {
        heroTabRegisterBtn.classList.add('active');
        heroTabLoginBtn.classList.remove('active');
        heroRegisterForm.style.display = 'flex';
        heroLoginForm.style.display = 'none';
      }
    }

    async function handleHeroLoginSubmit(event) {
      event.preventDefault();
      const username = document.getElementById('heroLoginUsername').value;
      const password = document.getElementById('heroLoginPassword').value;

      try {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (!data.success) {
          Swal.fire({ icon: 'error', title: 'Login Failed', text: data.error, confirmButtonColor: '#005bbf' });
          return;
        }

        authToken = data.token;
        localStorage.setItem('tester_jwt_token', authToken);
        currentUser = data.user;
        renderLoggedInBar();
        checkAuthSession();

        Swal.fire({
          icon: 'success',
          title: `Welcome, ${currentUser.username}!`,
          text: 'Authentication successful.',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Connection Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    async function handleHeroRegisterSubmit(event) {
      event.preventDefault();
      const username = document.getElementById('heroRegUsername').value;
      const email = document.getElementById('heroRegEmail').value;
      const password = document.getElementById('heroRegPassword').value;

      try {
        const response = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        const data = await response.json();

        if (!data.success) {
          Swal.fire({ icon: 'error', title: 'Registration Failed', text: data.error, confirmButtonColor: '#005bbf' });
          return;
        }

        Swal.fire({
          icon: 'info',
          title: 'Request Submitted',
          text: 'Your registration request has been submitted. Please wait for an Administrator to approve your account before logging in.',
          confirmButtonColor: '#005bbf'
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Connection Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    async function handleLoginSubmit(event) {
      event.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;

      try {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (!data.success) {
          Swal.fire({ icon: 'error', title: 'Login Failed', text: data.error, confirmButtonColor: '#005bbf' });
          return;
        }

        authToken = data.token;
        localStorage.setItem('tester_jwt_token', authToken);
        currentUser = data.user;
        renderLoggedInBar();
        closeAuthModal();

        Swal.fire({
          icon: 'success',
          title: `Welcome, ${currentUser.username}!`,
          text: 'Authentication successful.',
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Connection Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    async function handleRegisterSubmit(event) {
      event.preventDefault();
      const username = document.getElementById('regUsername').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;

      try {
        const response = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        const data = await response.json();

        if (!data.success) {
          Swal.fire({ icon: 'error', title: 'Registration Failed', text: data.error, confirmButtonColor: '#005bbf' });
          return;
        }

        closeAuthModal();
        Swal.fire({
          icon: 'info',
          title: 'Request Submitted',
          text: 'Your registration request has been submitted. Please wait for an Administrator to approve your account before logging in.',
          confirmButtonColor: '#005bbf'
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Connection Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    function handleLogout() {
      authToken = '';
      currentUser = null;
      localStorage.removeItem('tester_jwt_token');
      checkAuthSession();
      Swal.fire({
        icon: 'info',
        title: 'Signed Out',
        text: 'You have been signed out successfully.',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    }

    async function openAdminModal() {
      const modal = document.getElementById('adminModal');
      if (modal) modal.style.display = 'flex';
      await loadAdminUsers();
    }

    function closeAdminModal() {
      const modal = document.getElementById('adminModal');
      if (modal) modal.style.display = 'none';
    }

    async function loadAdminUsers() {
      const tbody = document.getElementById('adminUserTableBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading registration requests...</td></tr>';

      try {
        const response = await fetch('/api/v1/admin/users', {
          headers: getAuthHeaders()
        });
        const data = await response.json();

        if (!data.success) {
          tbody.innerHTML = `<tr><td colspan="6" style="color:var(--coral); text-align:center;">${data.error}</td></tr>`;
          return;
        }

        tbody.innerHTML = '';
        if (data.users.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No registration requests found.</td></tr>';
          return;
        }

        data.users.forEach((u) => {
          const tr = document.createElement('tr');
          const statusColor = u.status === 'approved' ? 'var(--deep-green)' : (u.status === 'rejected' ? 'var(--coral)' : '#d97706');
          
          let actionBtns = '';
          if (u.status === 'pending') {
            actionBtns = `
              <button class="btn-pill-outline" onclick="approveUser('${u.id}')" style="border-color:#16a34a; color:#16a34a; padding:3px 8px; font-size:11px;">Approve</button>
              <button class="btn-pill-outline" onclick="rejectUser('${u.id}')" style="border-color:#dc2626; color:#dc2626; padding:3px 8px; font-size:11px;">Reject</button>
            `;
          } else if (u.status === 'rejected') {
            actionBtns = `
              <button class="btn-pill-outline" onclick="approveUser('${u.id}')" style="border-color:#16a34a; color:#16a34a; padding:3px 8px; font-size:11px;">Approve</button>
            `;
          } else {
            actionBtns = `<span style="font-size:11px; color:var(--body-muted);">Approved</span>`;
          }

          if (u.username !== 'admin') {
            actionBtns += ` <button class="btn-pill-outline" onclick="deleteUserAccount('${u.id}')" style="padding:3px 8px; font-size:11px;">Delete</button>`;
          }

          tr.innerHTML = `
            <td><strong>${u.username}</strong></td>
            <td>${u.email}</td>
            <td><span style="font-family:var(--font-mono); font-size:11px;">${u.role}</span></td>
            <td><span style="font-weight:600; color:${statusColor}; text-transform:uppercase; font-size:11px;">${u.status}</span></td>
            <td><span style="font-size:11px;">${new Date(u.createdAt).toLocaleString()}</span></td>
            <td>${actionBtns}</td>
          `;
          tbody.appendChild(tr);
        });
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:var(--coral); text-align:center;">Failed to load users: ${err.message}</td></tr>`;
      }
    }

    async function approveUser(id) {
      try {
        const response = await fetch(`/api/v1/admin/users/${id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire({ icon: 'success', title: 'User Approved', text: data.message, timer: 1800, showConfirmButton: false, toast: true, position: 'top-end' });
          await loadAdminUsers();
        } else {
          Swal.fire({ icon: 'error', title: 'Action Failed', text: data.error, confirmButtonColor: '#005bbf' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    async function rejectUser(id) {
      try {
        const response = await fetch(`/api/v1/admin/users/${id}/reject`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire({ icon: 'info', title: 'User Rejected', text: data.message, timer: 1800, showConfirmButton: false, toast: true, position: 'top-end' });
          await loadAdminUsers();
        } else {
          Swal.fire({ icon: 'error', title: 'Action Failed', text: data.error, confirmButtonColor: '#005bbf' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    async function deleteUserAccount(id) {
      if (!confirm('Are you sure you want to delete this user account?')) return;
      try {
        const response = await fetch(`/api/v1/admin/users/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire({ icon: 'success', title: 'User Deleted', text: data.message, timer: 1800, showConfirmButton: false, toast: true, position: 'top-end' });
          await loadAdminUsers();
        } else {
          Swal.fire({ icon: 'error', title: 'Action Failed', text: data.error, confirmButtonColor: '#005bbf' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    // Initialize on page load
    loadSampleScenario();
    checkAuthSession();
