    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
      });
    }

    function showSnackbar(opts, secondArg, thirdArg) {
      let message = '';
      let title = '';
      let type = 'info';
      let duration = 3500;

      if (typeof opts === 'string') {
        message = opts;
        if (secondArg) type = secondArg;
        if (thirdArg) title = thirdArg;
      } else if (typeof opts === 'object' && opts !== null) {
        message = opts.message || opts.text || '';
        title = opts.title || '';
        type = opts.type || opts.icon || 'info';
        duration = opts.duration || opts.timer || 3500;
      }

      let container = document.getElementById('snackbarContainer');
      if (!container) {
        container = document.createElement('div');
        container.id = 'snackbarContainer';
        document.body.appendChild(container);
      }

      const snackbar = document.createElement('div');
      snackbar.className = `snackbar snackbar-${type}`;

      let iconSvg = '';
      if (type === 'success') {
        iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      } else if (type === 'error') {
        iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
      } else if (type === 'warning') {
        iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
      } else {
        iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
      }

      const titleHtml = title ? `<div class="snackbar-title">${escapeHtml(title)}</div>` : '';
      const messageHtml = message ? `<div class="snackbar-message">${escapeHtml(message)}</div>` : '';

      snackbar.innerHTML = `
        <div class="snackbar-icon-wrapper">${iconSvg}</div>
        <div class="snackbar-content">
          ${titleHtml}
          ${messageHtml}
        </div>
        <button type="button" class="snackbar-close" aria-label="Close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;

      container.appendChild(snackbar);

      requestAnimationFrame(() => {
        snackbar.classList.add('show');
      });

      const timer = setTimeout(() => {
        dismissSnackbar(snackbar);
      }, duration);

      const closeBtn = snackbar.querySelector('.snackbar-close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          clearTimeout(timer);
          dismissSnackbar(snackbar);
        };
      }

      function dismissSnackbar(el) {
        el.classList.remove('show');
        el.classList.add('hide');
        setTimeout(() => {
          if (el.parentElement) el.parentElement.removeChild(el);
        }, 280);
      }
    }
    window.showSnackbar = showSnackbar;

    let steps = [];
    let isGeneratingScript = false;
    let latestGeneratedCode = '';
    let currentHistoryId = null;
    let currentViewedHistory = null;
    let appConfig = null;
    let userFolders = []; // Projects
    let userProjects = userFolders; // Alias
    let currentProjectSuites = [];
    let projectSuitesCache = new Map();

    /**
     * Load the current user's projects and populate the builder's project selector.
     * Keeps the current selection if it still exists.
     */
    async function loadFolders() {
      const select = document.getElementById('folderSelect');
      if (!select || !authToken) return;
      const previous = select.value;
      try {
        const res = await fetch('/api/v1/projects', { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) return;
        userFolders = data.projects || data.folders || [];
        userProjects = userFolders;
        select.innerHTML = '<option value="">Select a project first...</option>' +
          userFolders.map(f =>
            '<option value="' + f.id + '">' + escapeHtml(f.name) + ' (' + (f.scenarioCount || 0) + ')</option>'
          ).join('');
        if (previous && userFolders.some(f => f.id === previous)) {
          select.value = previous;
        }
        await onProjectChange();
      } catch (err) {
        // Non-fatal: leave the selector as-is.
      }
    }
    window.loadProjects = loadFolders;

    async function onProjectChange() {
      const folderSelect = document.getElementById('folderSelect');
      const suiteSelect = document.getElementById('suiteSelect');
      const btnNewSuite = document.getElementById('btnNewSuite');
      if (!folderSelect || !suiteSelect) return;
      const projectId = folderSelect.value;
      if (!projectId) {
        suiteSelect.disabled = true;
        if (btnNewSuite) btnNewSuite.disabled = true;
        suiteSelect.innerHTML = '<option value="">Select a project first...</option>';
        currentProjectSuites = [];
        return;
      }
      suiteSelect.disabled = false;
      if (btnNewSuite) btnNewSuite.disabled = false;
      await loadSuites(projectId);
    }
    window.onProjectChange = onProjectChange;

    async function loadSuites(projectId, preselectedSuiteId) {
      const suiteSelect = document.getElementById('suiteSelect');
      if (!suiteSelect) return;
      const previous = preselectedSuiteId || suiteSelect.value;
      suiteSelect.innerHTML = '<option value="">Loading suites...</option>';
      try {
        const res = await fetch('/api/v1/suites?projectId=' + encodeURIComponent(projectId), { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
          suiteSelect.innerHTML = '<option value="">Failed to load suites</option>';
          return;
        }
        currentProjectSuites = data.suites || [];
        projectSuitesCache.set(projectId, currentProjectSuites);
        if (currentProjectSuites.length === 0) {
          suiteSelect.innerHTML = '<option value="">No suites yet — click + New Suite</option>';
        } else {
          suiteSelect.innerHTML = '<option value="">Select a suite...</option>' +
            currentProjectSuites.map(s =>
              '<option value="' + s.id + '">' + escapeHtml(s.name) + ' (' + (s.scenarioCount || 0) + ')</option>'
            ).join('');
          if (previous && currentProjectSuites.some(s => s.id === previous)) {
            suiteSelect.value = previous;
          } else if (currentProjectSuites.length === 1) {
            suiteSelect.value = currentProjectSuites[0].id;
          }
        }
      } catch (err) {
        suiteSelect.innerHTML = '<option value="">Failed to load suites</option>';
      }
    }
    window.loadSuites = loadSuites;

    function openCreateFolderModal() {
      if (!authToken) {
        showSnackbar({ type: 'warning', title: 'Authentication Required', message: 'Please sign in first.' });
        return;
      }
      const modal = document.getElementById('createFolderModal');
      document.getElementById('newFolderName').value = '';
      document.getElementById('newFolderDesc').value = '';
      if (modal) modal.style.display = 'flex';
      setTimeout(() => { const n = document.getElementById('newFolderName'); if (n) n.focus(); }, 50);
    }
    window.openCreateFolderModal = openCreateFolderModal;
    window.openCreateProjectModal = openCreateFolderModal;

    function closeCreateFolderModal() {
      const modal = document.getElementById('createFolderModal');
      if (modal) modal.style.display = 'none';
    }
    window.closeCreateFolderModal = closeCreateFolderModal;
    window.closeCreateProjectModal = closeCreateFolderModal;

    async function submitCreateFolder(event) {
      event.preventDefault();
      const name = document.getElementById('newFolderName').value.trim();
      const description = document.getElementById('newFolderDesc').value.trim();
      if (!name) return;
      const btn = document.getElementById('btnSubmitFolder');
      if (btn) btn.disabled = true;
      try {
        const res = await fetch('/api/v1/projects', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name, description })
        });
        const data = await res.json();
        const project = data.project || data.folder;
        if (data.success && project) {
          await loadFolders();
          const select = document.getElementById('folderSelect');
          if (select) {
            select.value = project.id;
            await onProjectChange();
          }
          resetGeneratedState();
          closeCreateFolderModal();
          showSnackbar({ type: 'success', title: 'Project Created', message: 'Project "' + project.name + '" is ready. Next, create a Test Suite!' });
          // Open create suite modal right away to guide the user smoothly
          setTimeout(() => {
            openCreateSuiteModal(project.id);
          }, 350);
        } else {
          showSnackbar({ type: 'error', title: 'Could Not Create Project', message: data.error || 'Unknown error.' });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not create project.' });
      } finally {
        if (btn) btn.disabled = false;
      }
    }
    window.submitCreateFolder = submitCreateFolder;
    window.submitCreateProject = submitCreateFolder;

    let modalTargetProjectId = null;
    function openCreateSuiteModal(targetProjectId, event) {
      if (event) event.stopPropagation();
      if (!authToken) {
        showSnackbar({ type: 'warning', title: 'Authentication Required', message: 'Please sign in first.' });
        return;
      }
      const folderSelect = document.getElementById('folderSelect');
      const projectId = targetProjectId || (folderSelect ? folderSelect.value : '');
      if (!projectId) {
        showSnackbar({ type: 'warning', title: 'Project Required', message: 'Please select or create a project first.' });
        openCreateFolderModal();
        return;
      }
      modalTargetProjectId = projectId;
      const project = userFolders.find(p => p.id === projectId);
      const targetLabel = document.getElementById('modalTargetProjectName');
      if (targetLabel) targetLabel.textContent = project ? project.name : 'Selected Project';
      
      const modal = document.getElementById('createSuiteModal');
      document.getElementById('newSuiteName').value = '';
      document.getElementById('newSuiteDesc').value = '';
      if (modal) modal.style.display = 'flex';
      setTimeout(() => { const n = document.getElementById('newSuiteName'); if (n) n.focus(); }, 50);
    }
    window.openCreateSuiteModal = openCreateSuiteModal;

    function closeCreateSuiteModal() {
      const modal = document.getElementById('createSuiteModal');
      if (modal) modal.style.display = 'none';
      modalTargetProjectId = null;
    }
    window.closeCreateSuiteModal = closeCreateSuiteModal;

    async function submitCreateSuite(event) {
      event.preventDefault();
      const folderSelect = document.getElementById('folderSelect');
      const projectId = modalTargetProjectId || (folderSelect ? folderSelect.value : '');
      if (!projectId) {
        showSnackbar({ type: 'warning', title: 'Project Required', message: 'Please select or create a project first.' });
        return;
      }
      const name = document.getElementById('newSuiteName').value.trim();
      const description = document.getElementById('newSuiteDesc').value.trim();
      if (!name) return;
      const btn = document.getElementById('btnSubmitSuite');
      if (btn) btn.disabled = true;
      try {
        const res = await fetch('/api/v1/suites', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ projectId, name, description })
        });
        const data = await res.json();
        if (data.success && data.suite) {
          closeCreateSuiteModal();
          // Update builder dropdown if currently selected project matches
          if (folderSelect && folderSelect.value === projectId) {
            await loadSuites(projectId, data.suite.id);
          }
          await loadAllProjectSuites();
          renderFolderTree();
          showSnackbar({ type: 'success', title: 'Suite Created', message: 'Suite "' + data.suite.name + '" is ready.' });
        } else {
          showSnackbar({ type: 'error', title: 'Could Not Create Suite', message: data.error || 'Unknown error.' });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not create suite.' });
      } finally {
        if (btn) btn.disabled = false;
      }
    }
    window.submitCreateSuite = submitCreateSuite;

    // True when the current builder state was loaded from a Flow History record.
    // A run in this state is treated as repeated work and saved as a NEW history
    // record instead of overwriting the loaded one.
    let isHistoryReplay = false;
    // Resolved steps carried over from the loaded history record, so the new
    // replay record keeps the original matching scores for display.
    let replaySourceResolvedSteps = [];

    /**
     * Build the DSL payload from the current Scenario Builder state.
     * Shared by Generate Script and by the "run from history" path so both
     * produce an identical DSL shape.
     */
    function buildDslPayload() {
      return {
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
    }

    /**
     * Option B: allow user to edit the generated code inline (change value / targetUrl)
     * and run it directly, without regenerating from the DSL.
     * When enabled=true the #codeOutput box becomes contenteditable and the hint is shown.
     */
    function setCodeEditable(enabled) {
      const codeOutput = document.getElementById('codeOutput');
      const codeEditHint = document.getElementById('codeEditHint');
      if (codeOutput) {
        codeOutput.setAttribute('contenteditable', enabled ? 'true' : 'false');
        codeOutput.setAttribute('data-editable', enabled ? 'true' : 'false');
      }
      if (codeEditHint) codeEditHint.style.display = enabled ? 'flex' : 'none';
    }

    /**
     * Returns the code currently shown in the editable box (user edits included).
     * Falls back to the last generated snapshot if the box is empty.
     */
    function getEditableCode() {
      const codeOutput = document.getElementById('codeOutput');
      const boxCode = codeOutput ? codeOutput.textContent : '';
      if (boxCode && boxCode.trim()) return boxCode;
      return latestGeneratedCode;
    }

    function toggleSummaryTable() {
      const container = document.getElementById('summaryTableContainer');
      const btn = document.getElementById('btnToggleTable');
      if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.innerText = 'Collapse';
      } else {
        container.style.display = 'none';
        btn.innerText = 'Expand';
      }
    }

    function toggleCodeContainer() {
      const container = document.getElementById('generatedCodeContainer');
      const btn = document.getElementById('btnToggleCode');
      if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.innerText = 'Collapse';
      } else {
        container.style.display = 'none';
        btn.innerText = 'Expand';
      }
    }

    function openFeedbackModal() {
      document.getElementById('feedbackModal').style.display = 'flex';
      document.getElementById('feedbackDetails').value = '';
      document.getElementById('feedbackAttachment').value = '';
    }

    function closeFeedbackModal() {
      document.getElementById('feedbackModal').style.display = 'none';
    }

    async function submitFeedback() {
      const type = document.getElementById('feedbackType').value;
      const details = document.getElementById('feedbackDetails').value.trim();
      const attachmentInput = document.getElementById('feedbackAttachment');
      
      if (!details) {
        showSnackbar({ type: 'warning', title: 'Missing Details', message: 'Please provide feedback details.' });
        return;
      }
      
      const file = attachmentInput.files[0];
      let fileBase64 = null;
      let filename = null;
      
      if (file) {
        // Validate size (client-side)
        if (file.size > 5242880) { // 5MB
          showSnackbar({ type: 'error', title: 'File Too Large', message: 'Attachment exceeds 5MB limit.' });
          return;
        }
        
        // Validate extension (client-side)
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
          showSnackbar({ type: 'error', title: 'Invalid Format', message: 'Only PNG, JPG, JPEG, and BMP are allowed.' });
          return;
        }
        
        // Read file as Base64
        fileBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
          reader.readAsDataURL(file);
        });
        filename = file.name;
      }
      
      const btnSubmit = document.getElementById('btnSubmitFeedback');
      const loader = document.getElementById('feedbackLoader');
      btnSubmit.disabled = true;
      loader.style.display = 'inline-block';
      
      try {
        const response = await fetch('/api/v1/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, details, fileBase64, filename })
        });
        
        const data = await response.json();
        
        if (data.success) {
          closeFeedbackModal();
          showSnackbar({ type: 'success', title: 'Feedback Submitted', message: 'Thank you for your feedback!' });
        } else {
          showSnackbar({ type: 'error', title: 'Submission Failed', message: data.error || 'Unknown error occurred.' });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not connect to server.' });
      } finally {
        btnSubmit.disabled = false;
        loader.style.display = 'none';
      }
    }

    function parseSpecToSteps(code) {
      const parsedSteps = [];
      const lines = code.split('\n');
      
      let currentStep = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        const stepMatch = line.match(/\/\/\s*Step\s*\d+:\s*(.*)/i);
        if (stepMatch) {
          currentStep = {
            action: 'fill',
            targetLabel: '',
            value: '',
            description: stepMatch[1].trim()
          };
          
          const descMatch = currentStep.description.match(/^([a-z_]+)\s*->\s*(.*)/i);
          if (descMatch) {
            currentStep.action = descMatch[1].toLowerCase();
            currentStep.targetLabel = descMatch[2].trim();
          }
          continue;
        }
        
        if (currentStep) {
          if (line.includes('maestro.interact') || line.includes('legacyAction')) {
            const argsMatch = line.match(/'([^'\\]*(?:\\.[^'\\]*)*)'/g);
            if (argsMatch && argsMatch.length > 0) {
               const cleanedArgs = argsMatch.map(s => s.replace(/^'|'$/g, ''));
               if (!currentStep.targetLabel && cleanedArgs.length > 0) {
                 currentStep.targetLabel = cleanedArgs[0];
               }
               if (cleanedArgs.length > 1) {
                 // Try to guess if it's an action name like 'fill', 'click'
                 const actionIdx = cleanedArgs.findIndex(a => ['fill', 'click', 'select', 'check'].includes(a));
                 if (actionIdx !== -1) currentStep.action = cleanedArgs[actionIdx];
                 
                 // Usually the last arg is the value if it's a fill/select
                 if (currentStep.action === 'fill' || currentStep.action === 'select') {
                   currentStep.value = cleanedArgs[cleanedArgs.length - 1];
                 }
               }
            }
            parsedSteps.push(currentStep);
            currentStep = null;
          } else if (line.includes('page.waitForTimeout(')) {
            const timeoutMatch = line.match(/waitForTimeout\((\d+)\)/);
            if (timeoutMatch) {
              currentStep.action = 'wait';
              currentStep.value = timeoutMatch[1];
            }
            parsedSteps.push(currentStep);
            currentStep = null;
          } else if (line.includes('expect(')) {
            currentStep.action = line.includes('toHaveURL') ? 'assert_url' : 'assert_text';
            const valMatch = line.match(/'([^']*)'/);
            if (valMatch) currentStep.value = valMatch[1];
            parsedSteps.push(currentStep);
            currentStep = null;
          }
        }
      }
      return parsedSteps;
    }

    function extractCallArgs(line, methodName) {
      const idx = line.indexOf(methodName + '(');
      if (idx === -1) return null;
      let start = idx + methodName.length + 1;
      let depth = 1;
      let inSingleQuote = false;
      let inDoubleQuote = false;
      let escaped = false;
      let args = [];
      let currentArg = '';

      for (let i = start; i < line.length; i++) {
        const char = line[i];

        if (escaped) {
          currentArg += char;
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          currentArg += char;
          continue;
        }

        if (char === "'" && !inDoubleQuote) {
          inSingleQuote = !inSingleQuote;
          currentArg += char;
          continue;
        }

        if (char === '"' && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
          currentArg += char;
          continue;
        }

        if (!inSingleQuote && !inDoubleQuote) {
          if (char === '(') {
            depth++;
          } else if (char === ')') {
            depth--;
            if (depth === 0) {
              args.push(currentArg.trim());
              return args;
            }
          } else if (char === ',' && depth === 1) {
            args.push(currentArg.trim());
            currentArg = '';
            continue;
          }
        }

        currentArg += char;
      }
      if (currentArg.trim()) args.push(currentArg.trim());
      return args;
    }

    function parseGroovyToSteps(code, rsResolver) {
      if (!code || typeof code !== 'string') return [];
      const parsedSteps = [];
      
      // Normalize multiline statements (e.g. arguments split across lines)
      const rawLines = code.split('\n');
      const lines = [];
      let buffer = '';

      for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i];
        const trimmed = raw.trim();
        if (!trimmed) continue;

        if (buffer) {
          buffer += ' ' + trimmed;
        } else {
          buffer = trimmed;
        }

        // Count unquoted parens to detect if statement continues
        let inSQ = false, inDQ = false, esc = false, openParens = 0;
        for (let j = 0; j < buffer.length; j++) {
          const c = buffer[j];
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === "'" && !inDQ) inSQ = !inSQ;
          if (c === '"' && !inSQ) inDQ = !inDQ;
          if (!inSQ && !inDQ) {
            if (c === '(') openParens++;
            if (c === ')') openParens--;
          }
        }

        if (openParens <= 0 || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          lines.push(buffer);
          buffer = '';
        }
      }
      if (buffer) lines.push(buffer);

      let currentDescription = '';

      function unquote(str) {
        if (!str) return '';
        const trimmed = str.trim();
        if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
          return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
        }
        return trimmed;
      }

      function cleanObjectName(rawName) {
        if (!rawName) return '';
        return rawName.replace(/^(?:input|button|btn|div|span|select|a|link|label|textarea|img|table)_/i, '');
      }

      function extractTarget(expr) {
        if (!expr) return '';
        let m = expr.match(/@data-testid=['"]([^'"]+)['"]/);
        if (m) return m[1];

        m = expr.match(/\/\/label\[contains\(\.,\s*['"]([^'"]+)['"]\)/);
        if (m) return m[1];

        m = expr.match(/@placeholder=['"]([^'"]+)['"]/);
        if (m) return m[1];

        m = expr.match(/\/\/(?:button|a)\[contains\(\.,\s*['"]([^'"]+)['"]\)/);
        if (m) return m[1];

        m = expr.match(/contains\(text\(\),\s*['"]([^'"]+)['"]\)/);
        if (m) return m[1];

        m = expr.match(/makeTestObject\s*\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/);
        if (m) {
          let sel = unquote(m[1]);
          if (sel.startsWith('//') || sel.startsWith('/*')) {
            const sub = extractTarget(sel);
            if (sub && sub !== sel) return sub;
          }
          return sel;
        }

        m = expr.match(/findTestObject\s*\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/);
        if (m) {
          const objPath = unquote(m[1]);
          // If a .rs resolver is available, prefer the real selector from the
          // Object Repository over the bare object name.
          if (typeof rsResolver === 'function') {
            const sel = rsResolver(objPath);
            if (sel && sel.value) return sel.value;
          }
          const parts = objPath.split('/');
          return cleanObjectName(parts[parts.length - 1]);
        }

        m = expr.match(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/);
        if (m) {
          return cleanObjectName(unquote(m[1]));
        }

        return cleanObjectName(expr.trim());
      }

      // Drop trailing FailureHandling.* / GlobalVariable-only timeout args so
      // argument positions match the Tester Lab dialect (target, value, ...).
      function stripNoiseArgs(args) {
        if (!args) return args;
        return args.filter(a => !/^FailureHandling\./.test(a.trim()));
      }

      // A value that is not string-literal and not numeric is a Groovy variable
      // (e.g. fixed_summary, GlobalVariable.x). Return the raw token so the
      // caller can flag it for manual attention instead of importing it as text.
      function isUnquotedExpr(arg) {
        if (arg == null) return false;
        const t = arg.trim();
        if (!t) return false;
        if (/^'(?:[^'\\]|\\.)*'$/.test(t) || /^"(?:[^"\\]|\\.)*"$/.test(t)) return false; // string literal
        if (/^-?\d+(\.\d+)?$/.test(t)) return false; // number
        return true;
      }

      let helperBraceDepth = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (helperBraceDepth > 0) {
          for (const char of line) {
            if (char === '{') helperBraceDepth++;
            else if (char === '}') helperBraceDepth--;
          }
          continue;
        }

        if (line.includes('TestObject makeTestObject') || line.includes('boolean waitForUrl')) {
          helperBraceDepth = 1;
          continue;
        }

        const stepCommentMatch = line.match(/\/\/\s*Step\s*\d+\s*:\s*(.*)/i);
        if (stepCommentMatch) {
          currentDescription = stepCommentMatch[1].trim();
          continue;
        }

        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
          continue;
        }

        if (
          line.includes('WebUI.openBrowser') ||
          line.includes('WebUI.maximizeWindow') ||
          line.includes('WebUI.waitForPageLoad') ||
          line.includes('WebUI.closeBrowser') ||
          line.includes('WebUI.navigateToUrl') ||
          line.startsWith('waitForUrl(')
        ) {
          continue;
        }

        let stepObj = null;

        if (line.includes('WebUI.setText') || line.includes('WebUI.sendKeys') || line.includes('WebUI.setEncryptedText')) {
          const method = line.includes('WebUI.setEncryptedText') ? 'WebUI.setEncryptedText' :
                         line.includes('WebUI.setText') ? 'WebUI.setText' : 'WebUI.sendKeys';
          const args = stripNoiseArgs(extractCallArgs(line, method));
          if (args && args.length >= 2) {
            const target = extractTarget(args[0]);
            const rawValue = args[1];
            stepObj = {
              action: 'fill',
              targetLabel: target,
              value: unquote(rawValue),
              description: currentDescription || `Fill ${target}`
            };
            if (isUnquotedExpr(rawValue)) {
              stepObj.warning = `Value is a Groovy variable "${rawValue.trim()}" — set the actual value manually.`;
            }
          }
        } else if (line.includes('WebUI.selectOption')) {
          const method = line.includes('selectOptionByLabel') ? 'WebUI.selectOptionByLabel' :
                         line.includes('selectOptionByValue') ? 'WebUI.selectOptionByValue' : 'WebUI.selectOptionByIndex';
          const args = stripNoiseArgs(extractCallArgs(line, method));
          if (args && args.length >= 2) {
            const target = extractTarget(args[0]);
            stepObj = {
              action: 'select',
              targetLabel: target,
              value: unquote(args[1]),
              description: currentDescription || `Select ${target}`
            };
          }
        } else if (line.includes('WebUI.click') || line.includes('WebUI.doubleClick') || line.includes('WebUI.rightClick')) {
          let method = 'WebUI.click';
          if (line.includes('WebUI.doubleClick')) method = 'WebUI.doubleClick';
          else if (line.includes('WebUI.rightClick')) method = 'WebUI.rightClick';

          const args = stripNoiseArgs(extractCallArgs(line, method));
          if (args && args.length >= 1) {
            const target = extractTarget(args[0]);
            stepObj = {
              action: 'click',
              targetLabel: target,
              value: '',
              description: currentDescription || `Click ${target}`
            };
          }
        } else if (line.includes('WebUI.check')) {
          const args = stripNoiseArgs(extractCallArgs(line, 'WebUI.check'));
          if (args && args.length >= 1) {
            const target = extractTarget(args[0]);
            stepObj = {
              action: 'check',
              targetLabel: target,
              value: '',
              description: currentDescription || `Check ${target}`
            };
          }
        } else if (line.includes('WebUI.uncheck')) {
          const args = stripNoiseArgs(extractCallArgs(line, 'WebUI.uncheck'));
          if (args && args.length >= 1) {
            const target = extractTarget(args[0]);
            stepObj = {
              action: 'uncheck',
              targetLabel: target,
              value: '',
              description: currentDescription || `Uncheck ${target}`
            };
          }
        } else if (line.includes('WebUI.uploadFile')) {
          const args = stripNoiseArgs(extractCallArgs(line, 'WebUI.uploadFile'));
          if (args && args.length >= 2) {
            const target = extractTarget(args[0]);
            stepObj = {
              action: 'upload',
              targetLabel: target,
              value: unquote(args[1]),
              description: currentDescription || `Upload file to ${target}`
            };
          }
        } else if (line.includes('WebUI.verifyMatch') && line.includes('WebUI.getUrl()')) {
          const args = extractCallArgs(line, 'WebUI.verifyMatch');
          let urlVal = '';
          if (args && args.length >= 2) {
            const patternArg = args[1];
            const concatMatch = patternArg.match(/'\.\*'\s*\+\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\+\s*'\.\*'/);
            if (concatMatch) {
              urlVal = unquote(concatMatch[1]);
            } else {
              urlVal = unquote(patternArg).replace(/^\.\*|\.\*$/g, '');
            }
          }
          stepObj = {
            action: 'assert_url',
            targetLabel: '',
            value: urlVal,
            description: currentDescription || `Verify URL contains ${urlVal}`
          };
        } else if (line.includes('WebUI.verifyTextPresent')) {
          const args = stripNoiseArgs(extractCallArgs(line, 'WebUI.verifyTextPresent'));
          const txt = (args && args.length >= 1) ? unquote(args[0]) : '';
          stepObj = {
            action: 'assert_text',
            targetLabel: '',
            value: txt,
            description: currentDescription || `Verify text "${txt}"`
          };
        } else if (line.includes('WebUI.verifyElementText') || line.includes('WebUI.getText')) {
          // verifyElementText(obj, 'expected') -> assert_text; the object identifies
          // where, but Tester Lab's assert_text matches on the expected text.
          const method = line.includes('WebUI.verifyElementText') ? 'WebUI.verifyElementText' : 'WebUI.getText';
          const args = stripNoiseArgs(extractCallArgs(line, method));
          const txt = (args && args.length >= 2) ? unquote(args[1]) : '';
          stepObj = {
            action: 'assert_text',
            targetLabel: '',
            value: txt,
            description: currentDescription || `Verify text "${txt}"`
          };
        } else if (
          line.includes('WebUI.verifyElementPresent') ||
          line.includes('WebUI.verifyElementVisible') ||
          line.includes('WebUI.verifyElementClickable') ||
          line.includes('WebUI.waitForElementPresent') ||
          line.includes('WebUI.waitForElementVisible') ||
          line.includes('WebUI.waitForElementClickable')
        ) {
          let method = 'WebUI.verifyElementPresent';
          if (line.includes('WebUI.waitForElementClickable')) method = 'WebUI.waitForElementClickable';
          else if (line.includes('WebUI.waitForElementVisible')) method = 'WebUI.waitForElementVisible';
          else if (line.includes('WebUI.waitForElementPresent')) method = 'WebUI.waitForElementPresent';
          else if (line.includes('WebUI.verifyElementClickable')) method = 'WebUI.verifyElementClickable';
          else if (line.includes('WebUI.verifyElementVisible')) method = 'WebUI.verifyElementVisible';

          const args = stripNoiseArgs(extractCallArgs(line, method));
          const target = (args && args.length >= 1) ? extractTarget(args[0]) : '';
          stepObj = {
            action: 'assert_visible',
            targetLabel: target,
            value: '',
            description: currentDescription || `Verify ${target} is visible`
          };
        } else if (line.includes('WebUI.delay')) {
          const args = stripNoiseArgs(extractCallArgs(line, 'WebUI.delay'));
          let msVal = '1000';
          if (args && args.length >= 1) {
            const sec = parseFloat(args[0]);
            msVal = sec < 100 ? String(Math.round(sec * 1000)) : String(Math.round(sec));
          }
          stepObj = {
            action: 'wait',
            targetLabel: '',
            value: msVal,
            description: currentDescription || `Wait ${msVal}ms`
          };
        } else if (
          line.includes('WebUI.callTestCase') ||
          line.startsWith('CustomKeywords.') ||
          line.includes('CustomKeywords.')
        ) {
          // Constructs with no DSL equivalent: keep a visible placeholder so the
          // step is never silently dropped, and flag it for manual attention.
          const kind = line.includes('WebUI.callTestCase') ? 'callTestCase' : 'CustomKeywords';
          const snippet = line.length > 120 ? line.slice(0, 117) + '...' : line;
          stepObj = {
            action: 'wait',
            targetLabel: '',
            value: '0',
            description: currentDescription || `[UNSUPPORTED] ${kind}`,
            warning: `Unsupported Katalon construct (${kind}) — review manually: ${snippet}`
          };
        }

        if (stepObj) {
          const descMatch = stepObj.description.match(/^([a-z_]+)\s*->\s*(.*)/i);
          if (descMatch) {
            stepObj.action = descMatch[1].toLowerCase();
            if (!stepObj.targetLabel) stepObj.targetLabel = descMatch[2].trim();
          }
          parsedSteps.push(stepObj);
          currentDescription = '';
        }
      }

      return parsedSteps;
    }

    // Build a one-line summary of imported steps that need manual attention
    // (unsupported constructs, Groovy-variable values). Returns null when clean,
    // so the caller can skip the extra notification entirely.
    function summarizeImportWarnings(parsedSteps) {
      if (!Array.isArray(parsedSteps)) return null;
      const flagged = parsedSteps.filter(function (s) { return s && s.warning; });
      if (flagged.length === 0) return null;
      return flagged.length + (flagged.length === 1 ? ' step needs' : ' steps need') +
        ' manual attention (unsupported Katalon construct or variable value).';
    }

    // Parse one Object Repository .rs XML string into a semantic selector for
    // Tester Lab. Priority (property name, NOT Katalon's isSelected flag):
    // placeholder -> id -> name -> text -> xpath. Returns null when nothing
    // usable is present. Tolerant of malformed/empty input (never throws).
    function parseRsSelector(xmlString) {
      if (!xmlString || typeof xmlString !== 'string') return null;

      // Extract every <webElementProperties> block's name/value/isSelected via
      // regex so the same logic runs in the browser and in headless tests.
      const props = [];
      const blockRe = /<webElementProperties\b[\s\S]*?<\/webElementProperties>/gi;
      const blocks = xmlString.match(blockRe) || [];
      for (const b of blocks) {
        const nameM = b.match(/<name>\s*([\s\S]*?)\s*<\/name>/i);
        const valM = b.match(/<value>\s*([\s\S]*?)\s*<\/value>/i);
        const selM = b.match(/<isSelected>\s*([\s\S]*?)\s*<\/isSelected>/i);
        if (!nameM) continue;
        props.push({
          name: nameM[1].trim().toLowerCase(),
          value: valM ? valM[1].trim() : '',
          isSelected: selM ? /true/i.test(selM[1]) : false
        });
      }
      if (props.length === 0) return null;

      // Pick the best-valued, prefer isSelected as a tie-breaker for duplicates.
      function pick(propName) {
        const matches = props.filter(p => p.name === propName && p.value);
        if (matches.length === 0) return null;
        const sel = matches.find(p => p.isSelected);
        return (sel || matches[0]).value;
      }

      const placeholder = pick('placeholder');
      if (placeholder) return { kind: 'getByPlaceholder', value: placeholder };

      const id = pick('id');
      if (id) return { kind: 'css', value: '#' + id };

      const name = pick('name');
      if (name) return { kind: 'css', value: '[name="' + name + '"]' };

      const text = pick('text');
      if (text) return { kind: 'getByText', value: text };

      const xpath = pick('xpath');
      if (xpath) {
        // Katalon stores xpath sometimes as id("x"); normalize to real XPath.
        const idFuncM = xpath.match(/^id\(\s*["']([^"']+)["']\s*\)$/);
        if (idFuncM) return { kind: 'xpath', value: "//*[@id='" + idFuncM[1] + "']" };
        return { kind: 'xpath', value: xpath };
      }

      return null;
    }

    // Build an index from Object Repository .rs entries: normalized object path
    // (no "Object Repository/" prefix, no ".rs" suffix) -> raw XML string.
    // Non-.rs entries are ignored.
    function buildRsIndex(entries) {
      const index = new Map();
      if (!Array.isArray(entries)) return index;
      for (const e of entries) {
        if (!e || typeof e.path !== 'string') continue;
        if (!/\.rs$/i.test(e.path)) continue;
        let key = e.path.replace(/\\/g, '/');
        key = key.replace(/^.*?Object Repository\//i, '');
        key = key.replace(/\.rs$/i, '');
        index.set(key, e.content);
      }
      return index;
    }

    // Build a resolver: findTestObject('path') -> semantic selector | null.
    // Tries an exact index hit first, then a suffix match on the last segment,
    // so a script path that omits leading folders still resolves.
    function makeRsResolver(rsIndex) {
      if (!rsIndex || typeof rsIndex.get !== 'function' || typeof rsIndex.entries !== 'function') {
        return function () { return null; };
      }
      return function (objectPath) {
        if (!objectPath) return null;
        const norm = String(objectPath).replace(/\\/g, '/').replace(/\.rs$/i, '');
        let xml = rsIndex.get(norm);
        if (!xml) {
          const last = norm.split('/').pop();
          for (const [k, v] of rsIndex.entries()) {
            if (k === last || k.endsWith('/' + last)) { xml = v; break; }
          }
        }
        return xml ? parseRsSelector(xml) : null;
      };
    }

    function loadSampleScenario() {
      if (appConfig && appConfig.sampleSteps && appConfig.sampleSteps.length > 0) {
        document.getElementById('testSuite').value = appConfig.sampleTestSuite || '';
        document.getElementById('targetUrl').value = appConfig.sampleTargetUrl || '';
        steps = JSON.parse(JSON.stringify(appConfig.sampleSteps));
        renderSteps();
      } else {
        showSnackbar({
          type: 'warning',
          title: 'No Sample Configuration',
          message: 'Admin has not configured the sample scenario yet. Please contact administrator.'
        });
      }
    }

    function handleImportFile(event) {
      const file = event.target.files[0];
      if (!file) return;

      // A .zip is a binary Katalon project — handle it before the text reader.
      if (file.name.toLowerCase().endsWith('.zip')) {
        handleKatalonZipImport(file).catch(function (err) {
          console.error('Katalon zip import failed:', err);
          showSnackbar({ type: 'error', title: 'Import Failed', message: 'Could not read the Katalon project zip.' });
        });
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const content = e.target.result;
          const fileName = file.name.toLowerCase();

          if (fileName.endsWith('.json') || fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            // Flow import logic
            let data;
            if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
              data = jsyaml.load(content);
            } else {
              data = JSON.parse(content);
            }

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
            
            showSnackbar({
              type: 'success',
              title: 'Flow File Loaded',
              message: `Successfully imported "${file.name}".`
            });

          } else if (fileName.endsWith('.groovy')) {
            // AC-11.12 to AC-11.16: Katalon Groovy import logic
            if (!content || !content.trim()) {
              showSnackbar({ type: 'warning', title: 'Empty File', message: 'The uploaded spec file is empty.' });
              return;
            }
            applyKatalonImport(content, file.name);

          } else {
            // Spec import logic (.spec.ts, .spec.js, .ts, .js)
            if (!content || !content.trim()) {
              showSnackbar({ type: 'warning', title: 'Empty File', message: 'The uploaded spec file is empty.' });
              return;
            }

            // Attempt to parse back the UI steps
            const parsedSteps = parseSpecToSteps(content);
            if (parsedSteps.length > 0) {
              steps = parsedSteps;
              renderSteps(true);
            }

            resetTerminalOutput();
            latestGeneratedCode = content;
            const generatedCodeCard = document.getElementById('generatedCodeCard');
            if (generatedCodeCard) generatedCodeCard.style.display = 'flex';
            const codeOutput = document.getElementById('codeOutput');
            if (codeOutput) codeOutput.textContent = content;
            setCodeEditable(true);

            showSnackbar({
              type: 'success',
              title: 'Spec File Loaded',
              message: `Successfully imported "${file.name}". Click "Run Script Now" to execute.`
            });

            // Attempt to extract Test Suite Name
            const testSuiteMatch = content.match(/test\(['"](.*?)['"]/) || content.match(/describe\(['"](.*?)['"]/);
            if (testSuiteMatch) {
              const suiteInput = document.getElementById('testSuite');
              if (suiteInput) suiteInput.value = testSuiteMatch[1];
            }

            // Attempt to extract Target URL
            const targetUrlMatch = content.match(/page\.goto\(['"](.*?)['"]\)/) || content.match(/cy\.visit\(['"](.*?)['"]\)/);
            if (targetUrlMatch) {
              const urlInput = document.getElementById('targetUrl');
              if (urlInput) urlInput.value = targetUrlMatch[1];
            }

            // Set language selection based on extension
            const langSelect = document.getElementById('language');
            if (langSelect) {
              if (fileName.endsWith('.js')) {
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

            // Enable actions
            const btnCopyCode = document.getElementById('btnCopyCode');
            const btnDownloadCode = document.getElementById('btnDownloadCode');
            const btnRunTest = document.getElementById('btnRunTest');
            if (btnCopyCode) btnCopyCode.disabled = false;
            if (btnDownloadCode) btnDownloadCode.disabled = false;
            if (btnRunTest) btnRunTest.disabled = false;
          }

        } catch (err) {
          Swal.fire({ icon: 'error', title: 'Import Failed', text: 'Failed to read/parse file: ' + err.message, confirmButtonColor: '#005bbf' });
        }
      };
      reader.readAsText(file);

      // Reset input value to allow importing the same file again
      event.target.value = '';
    }

    // Apply a parsed Katalon .groovy script to the Scenario Builder + editor.
    // Shared by the single-file .groovy path and the .zip project path; the
    // optional rsResolver lets the zip path substitute real Object Repository
    // selectors. displayName is what the notifications show.
    function applyKatalonImport(content, displayName, rsResolver) {
      const fwSelect = document.getElementById('framework');
      if (fwSelect) {
        fwSelect.value = 'katalon';
        onFrameworkChange();
      }
      setTimeout(() => {
        const langSelect = document.getElementById('language');
        if (langSelect) langSelect.value = 'groovy';
      }, 10);

      const katalonSuiteMatch = content.match(/Katalon Studio Test Case:\s*(.+)/);
      const suiteInput = document.getElementById('testSuite');
      if (suiteInput) {
        if (katalonSuiteMatch) {
          suiteInput.value = katalonSuiteMatch[1].trim();
        } else if (displayName) {
          suiteInput.value = displayName.replace(/\.groovy$/i, '');
        }
      }

      const katalonUrlMatch = content.match(/WebUI\.navigateToUrl\(['"](.+?)['"]\)/) ||
                              content.match(/WebUI\.openBrowser\(['"](https?:\/\/.+?)['"]\)/);
      if (katalonUrlMatch) {
        const urlInput = document.getElementById('targetUrl');
        if (urlInput) urlInput.value = katalonUrlMatch[1];
      }

      const parsedSteps = parseGroovyToSteps(content, rsResolver);
      if (parsedSteps.length > 0) {
        steps = parsedSteps;
        renderSteps(true);
      }
      const importWarning = summarizeImportWarnings(parsedSteps);

      resetTerminalOutput();
      latestGeneratedCode = content;
      const generatedCodeCard = document.getElementById('generatedCodeCard');
      if (generatedCodeCard) generatedCodeCard.style.display = 'flex';
      const codeOutput = document.getElementById('codeOutput');
      if (codeOutput) codeOutput.textContent = content;
      setCodeEditable(true);

      const okMsg = `Successfully imported "${displayName}".`;
      const warnMsg = `Imported "${displayName}". ${importWarning}`;
      showSnackbar({
        type: importWarning ? 'warning' : 'success',
        title: 'Katalon File Loaded',
        message: importWarning ? warnMsg : okMsg
      });

      const statusBadgeContainer = document.getElementById('statusBadgeContainer');
      if (statusBadgeContainer) {
        statusBadgeContainer.innerHTML = '<span class="status-chip chip-pass">Katalon File Loaded</span>';
      }

      Swal.fire({
        icon: importWarning ? 'warning' : 'success',
        title: 'Katalon File Loaded',
        text: importWarning ? warnMsg : okMsg,
        timer: importWarning ? 4500 : 2500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });

      const btnCopyCode = document.getElementById('btnCopyCode');
      const btnDownloadCode = document.getElementById('btnDownloadCode');
      const btnRunTest = document.getElementById('btnRunTest');
      if (btnCopyCode) btnCopyCode.disabled = false;
      if (btnDownloadCode) btnDownloadCode.disabled = false;
      if (btnRunTest) btnRunTest.disabled = false;
    }

    // Import a zipped Katalon project: unzip, index Object Repository .rs files,
    // let the user pick one test case, then apply it with a .rs-backed resolver.
    async function handleKatalonZipImport(file) {
      if (typeof JSZip === 'undefined') {
        showSnackbar({ type: 'error', title: 'Import Failed', message: 'Zip support failed to load. Check your connection and retry.' });
        return;
      }

      const zip = await JSZip.loadAsync(file);

      // Collect test cases (.groovy under Test Cases/) and .rs entries.
      const testCasePaths = [];
      const rsEntries = [];
      zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        const p = relativePath.replace(/\\/g, '/');
        if (/(^|\/)Test Cases\/.+\.groovy$/i.test(p)) testCasePaths.push(relativePath);
        else if (/\.rs$/i.test(p)) rsEntries.push(relativePath);
      });

      if (testCasePaths.length === 0) {
        showSnackbar({ type: 'error', title: 'Not a Katalon Project', message: 'No test cases found under a "Test Cases" folder in the zip.' });
        return;
      }

      // Build the .rs index from the zip contents.
      const rsPairs = [];
      for (const rsPath of rsEntries) {
        const xml = await zip.file(rsPath).async('string');
        rsPairs.push({ path: rsPath, content: xml });
      }
      const rsResolver = makeRsResolver(buildRsIndex(rsPairs));

      // Let the user pick one test case when there is more than one.
      let chosen = testCasePaths[0];
      if (testCasePaths.length > 1) {
        const options = {};
        testCasePaths.forEach((p) => { options[p] = p.replace(/^.*Test Cases\//i, '').replace(/\.groovy$/i, ''); });
        const res = await Swal.fire({
          title: 'Pilih Test Case',
          input: 'select',
          inputOptions: options,
          inputPlaceholder: 'Pilih satu test case',
          showCancelButton: true,
          confirmButtonText: 'Import',
          confirmButtonColor: '#005bbf'
        });
        if (!res.isConfirmed || !res.value) return;
        chosen = res.value;
      }

      const groovy = await zip.file(chosen).async('string');
      if (!groovy || !groovy.trim()) {
        showSnackbar({ type: 'warning', title: 'Empty Test Case', message: 'The selected test case is empty.' });
        return;
      }
      const displayName = chosen.replace(/^.*\//, '');
      applyKatalonImport(groovy, displayName, rsResolver);
    }

    function resetGeneratedState() {
      latestGeneratedCode = ''; // Ensure memory is cleared
      const generatedCodeCard = document.getElementById('generatedCodeCard');
      const codeOutput = document.getElementById('codeOutput');
      const summarySection = document.getElementById('summarySection');
      const statusBadgeContainer = document.getElementById('statusBadgeContainer');
      
      if (generatedCodeCard) generatedCodeCard.style.display = 'none';
      if (codeOutput) codeOutput.textContent = '';
      setCodeEditable(false);
      if (summarySection) summarySection.style.display = 'none';
      if (statusBadgeContainer) statusBadgeContainer.innerHTML = '';
      
      const btnCopyCode = document.getElementById('btnCopyCode');
      const btnDownloadCode = document.getElementById('btnDownloadCode');
      const btnRunTest = document.getElementById('btnRunTest');
      if (btnCopyCode) btnCopyCode.disabled = true;
      if (btnDownloadCode) btnDownloadCode.disabled = true;
      if (btnRunTest) btnRunTest.disabled = true;

      // Reset Terminal
      const terminalOutput = document.getElementById('terminalOutput');
      const terminalTitle = document.getElementById('terminalTitle');
      const cliTerminalCard = document.getElementById('cliTerminalCard');
      
      if (terminalOutput) terminalOutput.textContent = "// Terminal ready. Click 'Run Script Now' to execute the generated Playwright test script directly in the terminal...";
      if (terminalOutput) terminalOutput.style.color = '#34d399';
      if (terminalTitle) terminalTitle.textContent = 'CLI Terminal Output';
      if (cliTerminalCard) cliTerminalCard.classList.remove('highlight-red');

      // Reset Video Recording
      const videoContainer = document.getElementById('videoContainer');
      const videoPlayer = document.getElementById('videoPlayer');
      if (videoContainer) videoContainer.style.display = 'none';
      if (videoPlayer) videoPlayer.src = '';
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
      resetGeneratedState();
    }

    function moveStepUp(index) {
      if (index > 0) {
        const temp = steps[index];
        steps[index] = steps[index - 1];
        steps[index - 1] = temp;
        renderSteps();
      }
    }

    function moveStepDown(index) {
      if (index < steps.length - 1) {
        const temp = steps[index];
        steps[index] = steps[index + 1];
        steps[index + 1] = temp;
        renderSteps();
      }
    }

    function renderSteps(skipReset = false) {
      if (!skipReset) resetGeneratedState();
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
            <div style="display: flex; gap: 4px; margin-left: auto;">
              <button class="btn-pill-outline" onclick="moveStepUp(${idx})" ${idx === 0 ? 'disabled' : ''} title="Move Up" style="padding: 4px 8px;">↑</button>
              <button class="btn-pill-outline" onclick="moveStepDown(${idx})" ${idx === steps.length - 1 ? 'disabled' : ''} title="Move Down" style="padding: 4px 8px;">↓</button>
              <button class="btn-remove" onclick="removeStep(${idx})">Remove</button>
            </div>
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
          <option value="python">Python (.py)</option>
          <option value="java">Java (TestNG .java)</option>
        `;
        if (badge) badge.textContent = 'Selenium Engine';
      } else if (fw === 'robotframework') {
        langSelect.innerHTML = `
          <option value="robot">Robot Framework (.robot)</option>
        `;
        if (badge) badge.textContent = 'Robot Engine';
      } else if (fw === 'katalon') {
        langSelect.innerHTML = `
          <option value="groovy">Groovy (.groovy)</option>
        `;
        if (badge) badge.textContent = 'Katalon Engine';
      }
      updateOutputLabels();
      resetTerminalOutput();
    }

    // File extension for the generated code, keyed by the selected language.
    // Single source of truth shared by the export label and the download name.
    function codeExtForLanguage(lang) {
      const map = {
        javascript: 'spec.js',
        typescript: 'spec.ts',
        python: 'py',
        java: 'java',
        robot: 'robot',
        groovy: 'groovy'
      };
      return map[lang] || 'spec.ts';
    }

    // Human-readable framework name for output titles.
    function frameworkDisplayName(fw) {
      const map = {
        playwright: 'Playwright',
        cypress: 'Cypress',
        selenium: 'Selenium',
        robotframework: 'Robot Framework',
        katalon: 'Katalon'
      };
      return map[fw] || 'Test';
    }

    // Keep the output-area labels in sync with the chosen framework/language:
    // the card title, the export dropdown's "Code" option, and the console title.
    function updateOutputLabels() {
      const fw = (document.getElementById('framework') || {}).value || 'playwright';
      const lang = (document.getElementById('language') || {}).value || 'typescript';
      const fwName = frameworkDisplayName(fw);

      const cardTitle = document.getElementById('generatedCodeTitle');
      if (cardTitle) cardTitle.textContent = 'Generated ' + fwName + ' Code';

      const codeOption = document.querySelector('#exportFormat option[value="code"]');
      if (codeOption) codeOption.textContent = 'Code (.' + codeExtForLanguage(lang) + ')';

      const consoleTitle = document.getElementById('consoleTitle');
      if (consoleTitle && !isGeneratingScript) {
        consoleTitle.textContent = fwName + ' Code Spec';
      }
    }
    window.updateOutputLabels = updateOutputLabels;

    function resetTerminalOutput() {
      const terminalTitle = document.getElementById('terminalTitle');
      const terminalOutput = document.getElementById('terminalOutput');
      const videoContainer = document.getElementById('videoContainer');
      const videoPlayer = document.getElementById('videoPlayer');
      const fw = (document.getElementById('framework') || {}).value || 'playwright';
      const lang = (document.getElementById('language') || {}).value || 'typescript';
      const fwName = frameworkDisplayName(fw);

      if (terminalTitle) terminalTitle.textContent = 'CLI Terminal Output';
      if (terminalOutput) {
        if (fw !== 'playwright') {
          terminalOutput.textContent = `// [INFO]: Only Playwright scripts are executed on the server.\n// ${fwName} script (.${codeExtForLanguage(lang)}) can be downloaded to run independently in your ${fwName} environment.`;
          terminalOutput.style.color = '#94a3b8';
        } else {
          terminalOutput.textContent = "// Terminal ready. Click 'Run Script Now' to execute the generated Playwright test script directly in the terminal...";
          terminalOutput.style.color = '#34d399';
        }
      }
      if (videoContainer) videoContainer.style.display = 'none';
      if (videoPlayer) videoPlayer.src = '';
    }

    async function generateScript() {
      const btn = document.getElementById('btnGenerate');
      const loader = document.getElementById('btnLoader');
      const codeOutput = document.getElementById('codeOutput');
      const summarySection = document.getElementById('summarySection');
      const summaryTableBody = document.getElementById('summaryTableBody');
      const statusBadgeContainer = document.getElementById('statusBadgeContainer');
      const consoleTitle = document.getElementById('consoleTitle');

      // 0. FRONTEND SUITE NAME & TARGET URL VALIDATION
      const testSuiteInput = document.getElementById('testSuite');
      const testSuite = testSuiteInput ? testSuiteInput.value.trim() : '';
      if (!testSuite) {
        showSnackbar({
          type: 'warning',
          title: 'Test Suite Name Required',
          message: 'Please enter a Test Suite Name before generating the script.'
        });
        if (testSuiteInput) {
          testSuiteInput.focus();
          testSuiteInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      const targetUrlInput = document.getElementById('targetUrl');
      const targetUrl = targetUrlInput ? targetUrlInput.value.trim() : '';
      if (!targetUrl) {
        showSnackbar({
          type: 'warning',
          title: 'Target URL Required',
          message: 'Please enter a Target Web Application URL before generating the script.'
        });
        if (targetUrlInput) {
          targetUrlInput.focus();
          targetUrlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      if (steps.length === 0) {
        showSnackbar({
          type: 'warning',
          title: 'Execution Steps Required',
          message: 'Please add at least one execution step before generating the script.'
        });
        return;
      }

      // 1. FRONTEND STEP VALIDATION
      let isValid = true;
      let firstInvalidIndex = -1;
      document.querySelectorAll('.step-error-msg').forEach(el => el.remove());
      document.querySelectorAll('.step-item').forEach(el => el.style.border = '');

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        let errorMsg = '';
        
        if (!s.action) {
           errorMsg = 'Action must be selected.';
        } else if (['fill', 'click', 'select', 'upload', 'check', 'uncheck', 'assert_text', 'assert_visible'].includes(s.action) && !s.targetLabel) {
           errorMsg = 'Target Element Label / ID is required for this action.';
        } else if (['fill', 'select', 'upload'].includes(s.action) && !s.value) {
           errorMsg = 'Input Value / File Path is required for this action.';
        } else if (s.action === 'assert_url' && !s.value) {
           errorMsg = 'Expected URL Path is required.';
        } else if (s.action === 'assert_text' && !s.value) {
           errorMsg = 'Expected Text is required.';
        } else if (s.action === 'wait' && !s.value) {
           errorMsg = 'Delay (ms) is required.';
        }
        
        if (errorMsg) {
          isValid = false;
          const stepElements = document.querySelectorAll('.step-item');
          if (stepElements[i]) {
            stepElements[i].style.border = '1px solid var(--coral)';
            const errorDiv = document.createElement('div');
            errorDiv.className = 'step-error-msg';
            errorDiv.style.color = 'var(--coral)';
            errorDiv.style.fontSize = '12px';
            errorDiv.style.marginTop = '10px';
            errorDiv.style.paddingTop = '10px';
            errorDiv.style.borderTop = '1px dashed var(--coral)';
            errorDiv.style.fontWeight = '500';
            errorDiv.textContent = 'Action Required: ' + errorMsg;
            stepElements[i].appendChild(errorDiv);
            
            if (firstInvalidIndex === -1) {
              firstInvalidIndex = i;
              stepElements[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
      }

      if (!isValid) {
        return;
      }

      // 1. AUTO-CLEAN PREVIOUS RESULTS IMMEDIATELY
      summarySection.style.display = 'none';
      summaryTableBody.innerHTML = '';
      statusBadgeContainer.innerHTML = '<span class="status-chip" style="background: var(--soft-stone); color: var(--slate); border: 1px solid var(--hairline);">Processing...</span>';
      resetTerminalOutput();

      const dslPayload = buildDslPayload();

      if (!authToken) {
        checkAuthSession();
        showSnackbar({ type: 'warning', title: 'Authentication Required', message: 'Please sign in to generate test scripts.' });
        return;
      }

      // Projects and Suites are mandatory: user must pick or create both before generating.
      const selectedFolderId = (document.getElementById('folderSelect') || {}).value || '';
      if (!selectedFolderId) {
        showSnackbar({ type: 'warning', title: 'Project Required', message: 'Select or create a project before generating a script.' });
        const fg = document.getElementById('folderSelectGroup');
        if (fg) fg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const selectedSuiteId = (document.getElementById('suiteSelect') || {}).value || '';
      if (!selectedSuiteId) {
        showSnackbar({ type: 'warning', title: 'Suite Required', message: 'Select or create a test suite before generating a script.' });
        const sg = document.getElementById('suiteSelectGroup') || document.getElementById('folderSelectGroup');
        if (sg) sg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      btn.disabled = true;
      const btnText = btn.querySelector('span:not(.loader)');
      if (btnText) btnText.textContent = 'Generating Script...';
      loader.style.display = 'inline-block';
      isGeneratingScript = true;
      latestGeneratedCode = '';

      const btnRunTest = document.getElementById('btnRunTest');
      if (btnRunTest) btnRunTest.disabled = true;

      // UX Improvements: Disable steps and highlight container
      const stepInputs = document.querySelectorAll('#stepList input, #stepList select, #stepList button');
      stepInputs.forEach(el => el.disabled = true);
      const btnAddStep = document.getElementById('btnAddStep');
      if (btnAddStep) btnAddStep.disabled = true;
      document.querySelectorAll('.step-item').forEach(el => el.setAttribute('draggable', 'false'));
      
      const generalInputs = document.querySelectorAll('#testSuite, #targetUrl, #framework, #language, #dryRun, #btnGenerate');
      generalInputs.forEach(el => el.disabled = true);
      const topButtons = document.querySelectorAll('#scenarioBuilderCard .card-header button');
      topButtons.forEach(el => el.disabled = true);
      
      const btnCopyCode = document.getElementById('btnCopyCode');
      const btnDownloadCode = document.getElementById('btnDownloadCode');
      if (btnCopyCode) btnCopyCode.disabled = true;
      if (btnDownloadCode) btnDownloadCode.disabled = true;

      const scenarioCard = document.getElementById('scenarioBuilderCard');
      if (scenarioCard) scenarioCard.classList.add('highlight-green');

      const outputCard = document.getElementById('outputSpecCard');
      if (outputCard) {
        outputCard.classList.add('highlight-blue');
        setTimeout(() => {
          outputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }

      // 2. REALTIME MONITORING PROCESS DISPLAY
      const targetUrlVal = dslPayload.targetUrl;
      const isDryRun = document.getElementById('dryRun').checked;

      if (consoleTitle) consoleTitle.textContent = 'REALTIME BACKGROUND MONITOR';

      const generatedCodeCard = document.getElementById('generatedCodeCard');
      if (generatedCodeCard) generatedCodeCard.style.display = 'flex';

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
            dryRun: isDryRun,
            folderId: selectedFolderId,
            projectId: selectedFolderId,
            suiteId: selectedSuiteId
          })
        });

        clearInterval(progressTimer);
        const data = await response.json();

        if (consoleTitle) consoleTitle.textContent = frameworkDisplayName(document.getElementById('framework').value).toUpperCase() + ' TEST OUTPUT CONSOLE';

        if (!data.success) {
          statusBadgeContainer.innerHTML = '<span class="status-chip chip-fail">Generation Failed</span>';
          showSnackbar({ type: 'error', title: 'Generation Failed', message: (data.errors ? data.errors.join(', ') : data.error) });
          codeOutput.textContent = '// Generation failed.\n' + (data.errors ? data.errors.join('\n') : data.error);
          return;
        }

        latestGeneratedCode = data.code;
        currentHistoryId = data.historyId;
        isHistoryReplay = false; // fresh generate owns its own history record
        codeOutput.textContent = data.code;
        setCodeEditable(true);

        // UX Improvements: auto-scroll to Generated Code after success
        if (generatedCodeCard) {
          generatedCodeCard.classList.add('highlight-purple');
          setTimeout(() => {
            generatedCodeCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => {
              generatedCodeCard.classList.remove('highlight-purple');
            }, 3000);
          }, 100);
        }

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
        if (consoleTitle) consoleTitle.textContent = frameworkDisplayName(document.getElementById('framework').value).toUpperCase() + ' TEST OUTPUT CONSOLE';
        statusBadgeContainer.innerHTML = '<span class="status-chip chip-fail">Connection Error</span>';
        showSnackbar({ type: 'error', title: 'Connection Error', message: 'Failed to connect to API server: ' + err.message });
      } finally {
        isGeneratingScript = false;
        btn.disabled = false;
        const btnText = btn.querySelector('span:not(.loader)');
        if (btnText) btnText.textContent = 'Generate Script';
        loader.style.display = 'none';
        if (btnRunTest) btnRunTest.disabled = false;

        // UX Improvements: Re-enable steps and remove highlight
        const stepInputs = document.querySelectorAll('#stepList input, #stepList select, #stepList button');
        stepInputs.forEach(el => el.disabled = false);
        const btnAddStep = document.getElementById('btnAddStep');
        if (btnAddStep) btnAddStep.disabled = false;
        document.querySelectorAll('.step-item').forEach(el => el.setAttribute('draggable', 'true'));
        
        const generalInputs = document.querySelectorAll('#testSuite, #targetUrl, #framework, #language, #dryRun, #btnGenerate');
        generalInputs.forEach(el => el.disabled = false);
        const topButtons = document.querySelectorAll('#scenarioBuilderCard .card-header button');
        topButtons.forEach(el => el.disabled = false);
        
        const btnCopyCode = document.getElementById('btnCopyCode');
        const btnDownloadCode = document.getElementById('btnDownloadCode');
        if (btnCopyCode) btnCopyCode.disabled = false;
        if (btnDownloadCode) btnDownloadCode.disabled = false;

        const scenarioCard = document.getElementById('scenarioBuilderCard');
        if (scenarioCard) scenarioCard.classList.remove('highlight-green');

        const outputCard = document.getElementById('outputSpecCard');
        if (outputCard) outputCard.classList.remove('highlight-blue');
      }
    }

    function copyCode() {
      const format = document.getElementById('exportFormat') ? document.getElementById('exportFormat').value : 'code';
      let contentToCopy = '';
      if (format === 'code') {
         contentToCopy = document.getElementById('codeOutput').textContent;
      } else {
         const data = {
           testSuite: document.getElementById('testSuite').value,
           targetUrl: document.getElementById('targetUrl').value,
           framework: document.getElementById('framework').value,
           language: document.getElementById('language').value,
           steps: steps.map(s => {
             const out = { action: s.action, targetLabel: s.targetLabel, description: s.description };
             if (s.value) out.value = s.value;
             if (s.options) out.options = s.options;
             return out;
           })
         };
         if (format === 'yaml') {
            contentToCopy = jsyaml.dump(data, { indent: 2, lineWidth: -1 });
         } else if (format === 'json') {
            contentToCopy = JSON.stringify(data, null, 2);
         }
      }

      navigator.clipboard.writeText(contentToCopy).then(() => {
        showSnackbar({ type: 'success', title: 'Copied!', message: 'Content copied to clipboard!' });
      });
    }

    function downloadCode() {
      const format = document.getElementById('exportFormat') ? document.getElementById('exportFormat').value : 'code';
      const testSuiteName = document.getElementById('testSuite').value;
      
      let baseFilename = testSuiteName.trim().replace(/\s+/g, '_');
      if (!baseFilename) {
        baseFilename = 'test-spec';
      }

      let content = '';
      let filename = '';
      let mimeType = 'text/plain';

      if (format === 'code') {
        content = document.getElementById('codeOutput').textContent;
        const lang = document.getElementById('language').value;
        // Extension follows the selected language so the downloaded file matches
        // its actual contents (e.g. Selenium Python is .py, Selenium Java is .java).
        filename = `${baseFilename}.${codeExtForLanguage(lang)}`;
      } else {
         const data = {
           testSuite: document.getElementById('testSuite').value,
           targetUrl: document.getElementById('targetUrl').value,
           framework: document.getElementById('framework').value,
           language: document.getElementById('language').value,
           steps: steps.map(s => {
             const out = { action: s.action, targetLabel: s.targetLabel, description: s.description };
             if (s.value) out.value = s.value;
             if (s.options) out.options = s.options;
             return out;
           })
         };
         if (format === 'yaml') {
            content = jsyaml.dump(data, { indent: 2, lineWidth: -1 });
            filename = `${baseFilename}.yaml`;
            mimeType = 'text/yaml';
         } else if (format === 'json') {
            content = JSON.stringify(data, null, 2);
            filename = `${baseFilename}.json`;
            mimeType = 'application/json';
         }
      }

      const blob = new Blob([content], { type: mimeType });
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
        checkAuthSession();
        showSnackbar({ type: 'warning', title: 'Authentication Required', message: 'Please sign in to execute tests.' });
        return;
      }

      if (isGeneratingScript) {
        showSnackbar({
          type: 'warning',
          title: 'Generation in Progress',
          message: 'Please wait until script generation finishes before running the test.'
        });
        return;
      }

      // Option B: run whatever is currently in the (editable) code box, including user edits.
      const code = getEditableCode();
      // Keep the in-memory snapshot consistent with what we are about to run.
      latestGeneratedCode = code;

      if (!code || !code.trim() || code.startsWith('//') || code.includes('[1/4] INITIALIZING')) {
        // AC-14.09: Scenario has no generated code yet.
        showSnackbar({
          type: 'warning',
          title: 'Not Yet Generated Code',
          message: 'Please Generate First.'
        });
        return;
      }

      // AC-14.10 & AC-14.11: Only Playwright test scripts are executed on the server.
      const currentFw = (document.getElementById('framework') || {}).value || 'playwright';
      if (currentFw !== 'playwright' || !['typescript', 'javascript'].includes(language)) {
        const fwName = frameworkDisplayName(currentFw);
        const ext = codeExtForLanguage(language);
        showSnackbar({
          type: 'warning',
          title: 'Execution Rejected',
          message: `Only Playwright scripts are executed on the server. You can download the ${fwName} script (.${ext}) to run it independently.`
        });
        if (terminalTitle) terminalTitle.textContent = 'CLI Terminal Output [Execution Rejected]';
        if (terminalOutput) {
          terminalOutput.style.color = '#f87171';
          terminalOutput.textContent = `[REJECT] Only Playwright scripts are executed on the server.\n[INFO] ${fwName} script (.${ext}) can be downloaded using the "Download" button above to run it independently in your ${fwName} environment.`;
        }
        return;
      }

      btn.disabled = true;
      terminalTitle.textContent = `CLI Terminal Output [Running ${mode.toUpperCase()}...]`;
      terminalOutput.style.color = '#60a5fa';
      terminalOutput.textContent = `[TERMINAL] Initiating Playwright Test Runner...\n[TERMINAL] Mode: ${mode.toUpperCase()}\n[TERMINAL] Environment: Node.js / Playwright\n[TERMINAL] Executing script...\n`;

      const cliTerminalCard = document.getElementById('cliTerminalCard');
      if (cliTerminalCard) cliTerminalCard.classList.add('highlight-red');

      // Disable Execution Steps so they cannot be changed during run
      const stepListInputs = document.querySelectorAll('#stepList input, #stepList select, #stepList button');
      stepListInputs.forEach(el => el.disabled = true);
      const generalInputs = document.querySelectorAll('#testSuite, #targetUrl, #framework, #language, #dryRun, #btnGenerate');
      generalInputs.forEach(el => el.disabled = true);
      const topButtons = document.querySelectorAll('#scenarioBuilderCard .card-header button');
      topButtons.forEach(el => el.disabled = true);
      const btnAddStep = document.getElementById('btnAddStep');
      if (btnAddStep) btnAddStep.disabled = true;

      // Refresh (hide/clear) previous Video Recording
      const videoContainer = document.getElementById('videoContainer');
      const videoPlayer = document.getElementById('videoPlayer');
      if (videoContainer) videoContainer.style.display = 'none';
      if (videoPlayer) videoPlayer.src = '';

      // When running a scenario loaded from Flow History, treat it as repeated
      // work: ask the backend to save a NEW history record instead of
      // overwriting the loaded one.
      const runPayload = {
        code,
        mode,
        language,
        historyId: currentHistoryId
      };
      if (isHistoryReplay) {
        const dsl = buildDslPayload();
        runPayload.saveAsNewHistory = true;
        runPayload.testSuite = dsl.testSuite;
        runPayload.targetUrl = dsl.targetUrl;
        runPayload.rawDsl = dsl;
        runPayload.resolvedSteps = replaySourceResolvedSteps;
        // Keep the re-run in the same project & suite as the loaded scenario.
        const fSel = document.getElementById('folderSelect');
        if (fSel && fSel.value) {
          runPayload.folderId = fSel.value;
          runPayload.projectId = fSel.value;
        }
        const sSel = document.getElementById('suiteSelect');
        if (sSel && sSel.value) {
          runPayload.suiteId = sSel.value;
        }
      }

      try {
        const response = await fetch('/api/v1/run-test', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(runPayload)
        });

        const data = await response.json();

        // If a new history record was created for this replay run, adopt its id
        // so subsequent runs update that new record rather than the old one.
        if (data.historyId) {
          currentHistoryId = data.historyId;
          isHistoryReplay = false;
        }

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
            setTimeout(() => {
              videoContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
          }
        } else {
          const cliTerminalCard = document.getElementById('cliTerminalCard');
          if (cliTerminalCard) {
            setTimeout(() => {
              cliTerminalCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
          }
        }
      } catch (err) {
        terminalTitle.textContent = 'CLI Terminal Output [ERROR]';
        terminalOutput.style.color = '#f87171';
        terminalOutput.textContent = `[ERROR] Failed to communicate with runner service: ${err.message}`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Run Script Now';
        const cliTerminalCard = document.getElementById('cliTerminalCard');
        if (cliTerminalCard) cliTerminalCard.classList.remove('highlight-red');
        
        // Re-enable Execution Steps
        const stepListInputs = document.querySelectorAll('#stepList input, #stepList select, #stepList button');
        stepListInputs.forEach(el => el.disabled = false);
        const generalInputs = document.querySelectorAll('#testSuite, #targetUrl, #framework, #language, #dryRun, #btnGenerate');
        generalInputs.forEach(el => el.disabled = false);
        const topButtons = document.querySelectorAll('#scenarioBuilderCard .card-header button');
        topButtons.forEach(el => el.disabled = false);
        const btnAddStep = document.getElementById('btnAddStep');
        if (btnAddStep) btnAddStep.disabled = false;
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
      const appNav = document.getElementById('appNav');
      const authUserBar = document.getElementById('authUserBar');
      const unauthView = document.getElementById('unauthLoginView');
      const mainApp = document.getElementById('mainAppContainer');

      if (!authToken) {
        document.documentElement.classList.remove('has-auth-token');
        renderLoggedOutBar();
        if (topBar) topBar.style.display = 'none';
        if (header) header.style.display = 'none';
        if (appNav) appNav.style.display = 'none';
        if (unauthView) unauthView.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
        return;
      }

      try {
        const response = await fetch('/api/v1/auth/me', {
          headers: getAuthHeaders()
        });
        const data = await response.json();
        document.documentElement.classList.remove('has-auth-token');
        if (data.success) {
          currentUser = data.user;
          renderLoggedInBar();
          if (topBar) topBar.style.display = 'flex';
          if (header) header.style.display = 'flex';
          if (appNav) appNav.style.display = 'block';
          if (unauthView) unauthView.style.display = 'none';
          if (mainApp) mainApp.style.display = 'flex';

          await loadAppConfig();
          await loadFolders();
        } else {
          authToken = '';
          localStorage.removeItem('tester_jwt_token');
          renderLoggedOutBar();
          if (topBar) topBar.style.display = 'none';
          if (header) header.style.display = 'none';
          if (appNav) appNav.style.display = 'none';
          if (unauthView) unauthView.style.display = 'flex';
          if (mainApp) mainApp.style.display = 'none';
        }
      } catch (err) {
        document.documentElement.classList.remove('has-auth-token');
        renderLoggedOutBar();
        if (topBar) topBar.style.display = 'none';
        if (header) header.style.display = 'none';
        if (appNav) appNav.style.display = 'none';
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

      // Hide API Keys tab in Workspace if the user is an admin (Admin manages API keys in Admin Console)
      const navApiKeys = document.getElementById('navApiKeys');
      if (navApiKeys) {
        navApiKeys.style.display = currentUser.role === 'admin' ? 'none' : 'inline-block';
      }
    }

    // Removed legacy openAuthModal functions as they are replaced by heroLoginSection inline flow

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
          showSnackbar({ type: 'error', title: 'Login Failed', message: data.error });
          return;
        }

        authToken = data.token;
        localStorage.setItem('tester_jwt_token', authToken);
        currentUser = data.user;
        renderLoggedInBar();
        checkAuthSession();

        showSnackbar({
          type: 'success',
          title: `Welcome, ${currentUser.username}!`,
          message: 'Authentication successful.'
        });
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Connection Error', message: err.message });
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
          showSnackbar({ type: 'error', title: 'Registration Failed', message: data.error });
          return;
        }

        // Reset form and switch to login view immediately
        const regForm = document.getElementById('heroRegisterForm');
        if (regForm) regForm.reset();
        showLoginSection();

        // Optionally prefill login username
        const loginUserInput = document.getElementById('heroLoginUsername');
        if (loginUserInput) {
          loginUserInput.value = username;
        }

        showSnackbar({
          type: 'info',
          title: 'Request Submitted',
          message: 'Registration request submitted. Please wait for an Admin to approve your account.'
        });
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Connection Error', message: err.message });
      }
    }

    // Legacy handleLoginSubmit & handleRegisterSubmit removed

    function handleLogout() {
      authToken = '';
      currentUser = null;
      localStorage.removeItem('tester_jwt_token');
      checkAuthSession();
      showSnackbar({
        type: 'info',
        title: 'Signed Out',
        message: 'You have been signed out successfully.'
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
          showSnackbar({ type: 'success', title: 'User Approved', message: data.message });
          await loadAdminUsers();
        } else {
          showSnackbar({ type: 'error', title: 'Action Failed', message: data.error });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: err.message });
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
          showSnackbar({ type: 'info', title: 'User Rejected', message: data.message });
          await loadAdminUsers();
        } else {
          showSnackbar({ type: 'error', title: 'Action Failed', message: data.error });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: err.message });
      }
    }

    async function deleteUserAccount(id) {
      const confirm = await Swal.fire({
        title: 'Delete User Account?',
        text: "Are you sure you want to delete this user account? This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#66666e',
        confirmButtonText: 'Yes, delete it!'
      });

      if (!confirm.isConfirmed) return;
      try {
        const response = await fetch(`/api/v1/admin/users/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
          showSnackbar({ type: 'success', title: 'User Deleted', message: data.message });
          await loadAdminUsers();
        } else {
          showSnackbar({ type: 'error', title: 'Action Failed', message: data.error });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: err.message });
      }
    }

    // --- Flow Navigation & Tab Logic ---
    function switchTab(tabId) {
      const tabBuilder = document.getElementById('tabBuilder');
      const tabHistory = document.getElementById('tabHistory');
      const tabApiKeys = document.getElementById('tabApiKeys');
      const navBuilder = document.getElementById('navBuilder');
      const navHistory = document.getElementById('navHistory');
      const navApiKeys = document.getElementById('navApiKeys');

      // Hide all tabs
      if (tabBuilder) tabBuilder.style.display = 'none';
      if (tabHistory) tabHistory.style.display = 'none';
      if (tabApiKeys) tabApiKeys.style.display = 'none';

      // Reset all nav tab styles
      [navBuilder, navHistory, navApiKeys].forEach(nav => {
        if (nav) {
          nav.classList.remove('active');
          nav.style.color = 'var(--slate)';
          nav.style.borderBottom = 'none';
        }
      });

      if (tabId === 'history') {
        if (tabHistory) tabHistory.style.display = 'block';
        if (navHistory) {
          navHistory.classList.add('active');
          navHistory.style.color = 'var(--primary)';
          navHistory.style.borderBottom = '2px solid var(--primary)';
        }
        loadHistory();
      } else if (tabId === 'apikeys') {
        if (tabApiKeys) tabApiKeys.style.display = 'flex';
        if (navApiKeys) {
          navApiKeys.classList.add('active');
          navApiKeys.style.color = 'var(--primary)';
          navApiKeys.style.borderBottom = '2px solid var(--primary)';
        }
        loadUserApiKeys();
      } else {
        if (tabBuilder) tabBuilder.style.display = 'flex';
        if (navBuilder) {
          navBuilder.classList.add('active');
          navBuilder.style.color = 'var(--primary)';
          navBuilder.style.borderBottom = '2px solid var(--primary)';
        }
      }
    }

    // --- Flow History State ---
    let allHistoryData = [];
    let historySearchQuery = '';
    let historySortKey = 'timestamp';
    let historySortDesc = true;
    let historyCurrentPage = 1;
    const HISTORY_PAGE_SIZE = 10;
    // Filter for the history view:
    // historyProjectFilter: null = all, 'none' = uncategorized, or a projectId
    // historySuiteFilter: null = all in project, 'none' = unassigned in project, or a suiteId
    let historyProjectFilter = null;
    let historySuiteFilter = null;
    let expandedProjects = {}; // projectId -> bool
    let expandedSuites = {}; // suiteId -> bool
    let expandedUnassigned = {}; // projectId -> bool
    let expandedLegacyUncat = false;

    // Backward compat alias
    let expandedFolders = expandedProjects;
    let historyFolderFilter = historyProjectFilter;

    async function loadAllProjectSuites() {
      if (!authToken || userFolders.length === 0) return;
      const promises = userFolders.map(p =>
        fetch('/api/v1/suites?projectId=' + encodeURIComponent(p.id), { headers: getAuthHeaders() })
          .then(r => r.json())
          .then(d => {
            if (d.success) projectSuitesCache.set(p.id, d.suites || []);
          })
          .catch(() => {})
      );
      await Promise.all(promises);
    }

    async function loadHistory() {
      const tbody = document.getElementById('historyTableBody');
      if (!tbody) return;
      
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--slate);">Loading history...</td></tr>';
      
      try {
        // History and folders are independent, so fetch them concurrently.
        // loadAllProjectSuites still runs after loadFolders because it needs
        // the loaded project list (userFolders).
        const [data] = await Promise.all([
          fetch('/api/v1/history', { headers: getAuthHeaders() }).then(r => r.json()),
          loadFolders()
        ]);

        if (!data.success) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--coral);">${data.error}</td></tr>`;
          return;
        }

        allHistoryData = data.history || [];
        historyCurrentPage = 1;
        await loadAllProjectSuites();
        renderFolderTree();
        renderHistoryTable();
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--coral);">Failed to load history</td></tr>';
      }
    }

    window.handleHistorySearch = function(e) {
      historySearchQuery = e.target.value.toLowerCase();
      historyCurrentPage = 1;
      renderHistoryTable();
    };

    window.handleHistorySort = function(key) {
      if (historySortKey === key) {
        historySortDesc = !historySortDesc;
      } else {
        historySortKey = key;
        historySortDesc = key === 'timestamp'; // default desc for timestamp, asc for others
      }
      renderHistoryTable();
    };

    window.changeHistoryPage = function(delta) {
      historyCurrentPage += delta;
      renderHistoryTable();
    };

    function countInProject(projectId) {
      if (projectId === 'none') return allHistoryData.filter(h => !h.folderId).length;
      return allHistoryData.filter(h => h.folderId === projectId).length;
    }

    function countInSuite(suiteId) {
      return allHistoryData.filter(h => h.suiteId === suiteId).length;
    }

    function countUnassignedInProject(projectId) {
      return allHistoryData.filter(h => h.folderId === projectId && !h.suiteId).length;
    }

    window.selectHistoryAll = function() {
      historyProjectFilter = null;
      historySuiteFilter = null;
      historyFolderFilter = null;
      historyCurrentPage = 1;
      renderFolderTree();
      renderHistoryTable();
    };

    window.selectHistoryProject = function(id) {
      historyProjectFilter = id;
      historySuiteFilter = null;
      historyFolderFilter = id;
      historyCurrentPage = 1;
      renderFolderTree();
      renderHistoryTable();
    };
    window.selectHistoryFolder = window.selectHistoryProject;

    window.selectHistorySuite = function(suiteId, projectId, event) {
      if (event) event.stopPropagation();
      historyProjectFilter = projectId;
      historySuiteFilter = suiteId;
      historyFolderFilter = projectId;
      historyCurrentPage = 1;
      renderFolderTree();
      renderHistoryTable();
    };

    window.selectHistoryUnassigned = function(projectId, event) {
      if (event) event.stopPropagation();
      historyProjectFilter = projectId;
      historySuiteFilter = 'none';
      historyFolderFilter = projectId;
      historyCurrentPage = 1;
      renderFolderTree();
      renderHistoryTable();
    };

    window.toggleProjectExpand = function(id, event) {
      if (event) event.stopPropagation();
      expandedProjects[id] = !expandedProjects[id];
      renderFolderTree();
    };
    window.toggleFolderExpand = window.toggleProjectExpand;

    window.toggleSuiteExpand = function(id, event) {
      if (event) event.stopPropagation();
      expandedSuites[id] = !expandedSuites[id];
      renderFolderTree();
    };

    window.toggleUnassignedExpand = function(projectId, event) {
      if (event) event.stopPropagation();
      expandedUnassigned[projectId] = !expandedUnassigned[projectId];
      renderFolderTree();
    };

    window.toggleLegacyUncatExpand = function(event) {
      if (event) event.stopPropagation();
      expandedLegacyUncat = !expandedLegacyUncat;
      renderFolderTree();
    };

    function renderFolderTree() {
      const tree = document.getElementById('folderTree');
      if (!tree) return;
      const total = allHistoryData.length;
      let html = '';

      // Root level: "All scenarios"
      const isAllActive = historyProjectFilter === null && historySuiteFilter === null;
      html += '<div class="folder-row" onclick="selectHistoryAll()" ' +
        'style="display:flex; align-items:center; gap:8px; padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--hairline); ' +
        (isAllActive ? 'background: var(--accent-soft, rgba(37,99,168,.1));' : '') + '">' +
        '<span style="flex:1; font-size:13.5px; font-weight:600; color: var(--ink);">All Scenarios</span>' +
        '<span style="font-size:11px; font-family:var(--font-mono); color: var(--slate); background: var(--surface-2); padding:2px 8px; border-radius:20px;">' + total + '</span>' +
        '</div>';

      // Projects
      userFolders.forEach(p => {
        const pCount = countInProject(p.id);
        const isPExpanded = !!expandedProjects[p.id];
        const isPActive = historyProjectFilter === p.id && historySuiteFilter === null;
        const suites = projectSuitesCache.get(p.id) || [];
        const unassignedCount = countUnassignedInProject(p.id);

        const caret = '<span onclick="toggleProjectExpand(\'' + p.id + '\', event)" style="cursor:pointer; width:16px; display:inline-block; text-align:center; color: var(--slate); font-size:11px;">' + (isPExpanded ? '&#9662;' : '&#9656;') + '</span>';
        const actions =
          '<button class="btn-pill-outline" onclick="openCreateSuiteModal(\'' + p.id + '\', event)" style="padding:2px 8px; font-size:10px; min-height:unset; height:auto; color:var(--accent); border-color:var(--accent);" title="Create new suite in this project">+ Suite</button>' +
          '<button class="btn-pill-outline" onclick="renameProjectPrompt(\'' + p.id + '\', event)" style="padding:2px 8px; font-size:10px; min-height:unset; height:auto;">Rename</button>' +
          '<button class="btn-pill-outline" onclick="deleteProjectPrompt(\'' + p.id + '\', event)" style="padding:2px 8px; font-size:10px; min-height:unset; height:auto; color:var(--coral); border-color:var(--coral);">Delete</button>';

        html += '<div class="folder-row" onclick="selectHistoryProject(\'' + p.id + '\')" ' +
          'style="display:flex; align-items:center; gap:8px; padding:9px 14px; cursor:pointer; border-bottom:1px solid var(--hairline); ' +
          (isPActive ? 'background: var(--accent-soft, rgba(37,99,168,.1));' : '') + '">' +
          caret +
          '<span style="flex:1; font-size:13.5px; font-weight:600; color: var(--ink);">' + escapeHtml(p.name) + '</span>' +
          '<span style="font-size:11px; font-family:var(--font-mono); color: var(--slate); background: var(--surface-2); padding:1px 8px; border-radius:20px;">' + pCount + ' scenarios</span>' +
          actions +
          '</div>';

        if (isPExpanded) {
          // Suites inside project
          if (suites.length === 0 && unassignedCount === 0) {
            html += '<div style="padding:8px 14px 8px 38px; font-size:12px; color:var(--slate); font-style:italic; border-bottom:1px solid var(--hairline); background:var(--surface-2);">' +
              'No test suites yet in this project. <a href="javascript:void(0)" onclick="openCreateSuiteModal(\'' + p.id + '\', event)" style="color:var(--accent); text-decoration:underline;">Create a suite</a>' +
              '</div>';
          } else {
            suites.forEach(s => {
              const sCount = countInSuite(s.id);
              const isSExpanded = !!expandedSuites[s.id];
              const isSActive = historySuiteFilter === s.id;
              const sCaret = '<span onclick="toggleSuiteExpand(\'' + s.id + '\', event)" style="cursor:pointer; width:16px; display:inline-block; text-align:center; color: var(--slate); font-size:11px;">' + (isSExpanded ? '&#9662;' : '&#9656;') + '</span>';
              const sActions =
                '<button class="btn-pill-outline" onclick="renameSuitePrompt(\'' + s.id + '\', event)" style="padding:2px 6px; font-size:9.5px; min-height:unset; height:auto;">Rename</button>' +
                '<button class="btn-pill-outline" onclick="deleteSuitePrompt(\'' + s.id + '\', event)" style="padding:2px 6px; font-size:9.5px; min-height:unset; height:auto; color:var(--coral); border-color:var(--coral);">Delete</button>';

              html += '<div class="suite-row" onclick="selectHistorySuite(\'' + s.id + '\', \'' + p.id + '\', event)" ' +
                'style="display:flex; align-items:center; gap:8px; padding:7px 14px 7px 34px; cursor:pointer; border-bottom:1px solid var(--hairline); ' +
                (isSActive ? 'background: var(--accent-soft, rgba(37,99,168,.12));' : 'background: rgba(0,0,0,0.015);') + '">' +
                sCaret +
                '<span style="flex:1; font-size:13px; font-weight:500; color: var(--ink);">' + escapeHtml(s.name) + '</span>' +
                '<span style="font-size:10.5px; font-family:var(--font-mono); color: var(--slate); background: var(--surface-2); padding:1px 6px; border-radius:12px;">' + sCount + '</span>' +
                sActions +
                '</div>';

              if (isSExpanded) {
                const scenarios = allHistoryData.filter(h => h.suiteId === s.id);
                if (scenarios.length === 0) {
                  html += '<div style="padding:6px 14px 6px 58px; font-size:12px; color:var(--slate); font-style:italic; border-bottom:1px solid var(--hairline); background:var(--surface-2);">No scenarios in this suite yet.</div>';
                } else {
                  html += scenarios.map(h => scenarioRowHtml(h, 2)).join('');
                }
              }
            });

            // Unassigned scenarios in this project
            if (unassignedCount > 0) {
              const isUExpanded = !!expandedUnassigned[p.id];
              const isUActive = historyProjectFilter === p.id && historySuiteFilter === 'none';
              const uCaret = '<span onclick="toggleUnassignedExpand(\'' + p.id + '\', event)" style="cursor:pointer; width:16px; display:inline-block; text-align:center; color: var(--slate); font-size:11px;">' + (isUExpanded ? '&#9662;' : '&#9656;') + '</span>';

              html += '<div class="suite-row" onclick="selectHistoryUnassigned(\'' + p.id + '\', event)" ' +
                'style="display:flex; align-items:center; gap:8px; padding:7px 14px 7px 34px; cursor:pointer; border-bottom:1px solid var(--hairline); ' +
                (isUActive ? 'background: var(--accent-soft, rgba(37,99,168,.12));' : 'background: rgba(0,0,0,0.015);') + '">' +
                uCaret +
                '<span style="flex:1; font-size:12.5px; font-style:italic; color: var(--slate);">Unassigned to Suite</span>' +
                '<span style="font-size:10.5px; font-family:var(--font-mono); color: var(--slate); background: var(--surface-2); padding:1px 6px; border-radius:12px;">' + unassignedCount + '</span>' +
                '</div>';

              if (isUExpanded) {
                const unassignedScenarios = allHistoryData.filter(h => h.folderId === p.id && !h.suiteId);
                html += unassignedScenarios.map(h => scenarioRowHtml(h, 2)).join('');
              }
            }
          }
        }
      });

      // Legacy Uncategorized (scenarios without project)
      const legacyCount = countInProject('none');
      if (legacyCount > 0) {
        const isLActive = historyProjectFilter === 'none';
        const lCaret = '<span onclick="toggleLegacyUncatExpand(event)" style="cursor:pointer; width:16px; display:inline-block; text-align:center; color: var(--slate); font-size:11px;">' + (expandedLegacyUncat ? '&#9662;' : '&#9656;') + '</span>';

        html += '<div class="folder-row" onclick="selectHistoryProject(\'none\')" ' +
          'style="display:flex; align-items:center; gap:8px; padding:9px 14px; cursor:pointer; border-bottom:1px solid var(--hairline); ' +
          (isLActive ? 'background: var(--accent-soft, rgba(37,99,168,.1));' : '') + '">' +
          lCaret +
          '<span style="flex:1; font-size:13px; font-style:italic; color: var(--slate);">Legacy Uncategorized</span>' +
          '<span style="font-size:11px; font-family:var(--font-mono); color: var(--slate); background: var(--surface-2); padding:1px 8px; border-radius:20px;">' + legacyCount + '</span>' +
          '</div>';

        if (expandedLegacyUncat) {
          const legacyScenarios = allHistoryData.filter(h => !h.folderId);
          html += legacyScenarios.map(h => scenarioRowHtml(h, 1)).join('');
        }
      }

      tree.innerHTML = html;
    }

    function scenarioRowHtml(h, indentLevel) {
      const padLeft = indentLevel ? (indentLevel * 24 + 14) + 'px' : '38px';
      let moveOptions = '<option value="">Move to...</option>';
      userFolders.forEach(p => {
        const suites = projectSuitesCache.get(p.id) || [];
        moveOptions += '<optgroup label="' + escapeHtml(p.name) + '">';
        suites.forEach(s => {
          const isCurrent = h.suiteId === s.id;
          moveOptions += '<option value="suite:' + s.id + '"' + (isCurrent ? ' disabled' : '') + '>' + escapeHtml(s.name) + '</option>';
        });
        moveOptions += '<option value="project:' + p.id + '"' + (h.folderId === p.id && !h.suiteId ? ' disabled' : '') + '>Unassigned in ' + escapeHtml(p.name) + '</option>';
        moveOptions += '</optgroup>';
      });
      if (h.folderId) {
        moveOptions += '<option value="none">Uncategorized (No Project)</option>';
      }

      return '<div style="display:flex; align-items:center; gap:8px; padding:7px 14px 7px ' + padLeft + '; border-bottom:1px solid var(--hairline); background: var(--surface-2);">' +
        '<span style="flex:1; font-size:12.5px; color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + escapeHtml(h.testSuite || 'Untitled') + '">' + escapeHtml(h.testSuite || 'Untitled') + '</span>' +
        '<span style="font-size:10px; font-family:var(--font-mono); color: var(--slate);">' + new Date(h.timestamp).toLocaleDateString() + '</span>' +
        '<select onchange="handleScenarioMove(\'' + h.id + '\', this.value)" style="font-size:11px; padding:2px 6px; max-width:140px;">' + moveOptions + '</select>' +
        '<button class="btn-pill-outline" onclick="viewHistory(\'' + h.id + '\')" style="padding:2px 8px; font-size:10px; min-height:unset; height:auto;">View</button>' +
        '</div>';
    }

    window.handleScenarioMove = async function(id, targetValue) {
      if (!targetValue) return;
      try {
        if (targetValue.startsWith('suite:')) {
          const suiteId = targetValue.replace('suite:', '');
          const res = await fetch('/api/v1/history/' + id + '/suite', {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ suiteId })
          });
          const data = await res.json();
          if (data.success) {
            const rec = allHistoryData.find(h => h.id === id);
            if (rec) {
              rec.suiteId = suiteId;
              // Find suite's parent project
              for (const [pId, suites] of projectSuitesCache.entries()) {
                if (suites.some(s => s.id === suiteId)) {
                  rec.folderId = pId;
                  break;
                }
              }
            }
            await loadAllProjectSuites();
            renderFolderTree();
            renderHistoryTable();
            showSnackbar({ type: 'success', title: 'Moved', message: 'Scenario assigned to suite.' });
          } else {
            showSnackbar({ type: 'error', title: 'Move Failed', message: data.error || 'Unknown error.' });
          }
        } else if (targetValue.startsWith('project:')) {
          const projectId = targetValue.replace('project:', '');
          const res = await fetch('/api/v1/history/' + id + '/project', {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId })
          });
          const data = await res.json();
          if (data.success) {
            const rec = allHistoryData.find(h => h.id === id);
            if (rec) {
              rec.folderId = projectId;
              rec.suiteId = null;
            }
            await loadAllProjectSuites();
            renderFolderTree();
            renderHistoryTable();
            showSnackbar({ type: 'success', title: 'Moved', message: 'Scenario moved to project.' });
          } else {
            showSnackbar({ type: 'error', title: 'Move Failed', message: data.error || 'Unknown error.' });
          }
        } else if (targetValue === 'none') {
          const res = await fetch('/api/v1/history/' + id + '/project', {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId: null })
          });
          const data = await res.json();
          if (data.success) {
            const rec = allHistoryData.find(h => h.id === id);
            if (rec) {
              rec.folderId = null;
              rec.suiteId = null;
            }
            renderFolderTree();
            renderHistoryTable();
            showSnackbar({ type: 'success', title: 'Moved', message: 'Scenario uncategorized.' });
          } else {
            showSnackbar({ type: 'error', title: 'Move Failed', message: data.error || 'Unknown error.' });
          }
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not move scenario.' });
      }
    };
    window.moveScenarioToFolder = window.handleScenarioMove;
    window.moveScenarioToSuite = window.handleScenarioMove;

    window.renameProjectPrompt = async function(id, event) {
      if (event) event.stopPropagation();
      const project = userFolders.find(f => f.id === id);
      if (!project) return;
      const result = await Swal.fire({
        title: 'Rename Project',
        input: 'text',
        inputValue: project.name,
        showCancelButton: true,
        confirmButtonText: 'Rename',
        confirmButtonColor: '#005bbf',
        inputValidator: v => (!v || !v.trim()) ? 'Name cannot be empty' : undefined
      });
      if (!result.isConfirmed) return;
      try {
        const res = await fetch('/api/v1/projects/' + id, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name: result.value.trim() })
        });
        const data = await res.json();
        if (data.success) {
          await loadFolders();
          await loadAllProjectSuites();
          renderFolderTree();
          renderHistoryTable();
          showSnackbar({ type: 'success', title: 'Renamed', message: 'Project renamed.' });
        } else {
          showSnackbar({ type: 'error', title: 'Rename Failed', message: data.error || 'Unknown error.' });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not rename project.' });
      }
    };
    window.renameFolderPrompt = window.renameProjectPrompt;

    window.deleteProjectPrompt = async function(id, event) {
      if (event) event.stopPropagation();
      const project = userFolders.find(f => f.id === id);
      if (!project) return;
      const count = countInProject(id);
      const result = await Swal.fire({
        icon: 'warning',
        title: 'Delete Project?',
        html: 'Delete project <b>' + escapeHtml(project.name) + '</b>?' + (count > 0 ? '<br>The ' + count + ' scenario(s) inside will become uncategorized, not deleted.' : ''),
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc3545'
      });
      if (!result.isConfirmed) return;
      try {
        const res = await fetch('/api/v1/projects/' + id, { method: 'DELETE', headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
          if (historyProjectFilter === id) historyProjectFilter = null;
          allHistoryData.forEach(h => {
            if (h.folderId === id) {
              h.folderId = null;
              h.suiteId = null;
            }
          });
          projectSuitesCache.delete(id);
          await loadFolders();
          renderFolderTree();
          renderHistoryTable();
          showSnackbar({ type: 'success', title: 'Project Deleted', message: 'Scenarios inside are now uncategorized.' });
        } else {
          showSnackbar({ type: 'error', title: 'Delete Failed', message: data.error || 'Unknown error.' });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not delete project.' });
      }
    };
    window.deleteFolderPrompt = window.deleteProjectPrompt;

    window.renameSuitePrompt = async function(suiteId, event) {
      if (event) event.stopPropagation();
      let foundSuite = null;
      for (const suites of projectSuitesCache.values()) {
        const s = suites.find(item => item.id === suiteId);
        if (s) { foundSuite = s; break; }
      }
      if (!foundSuite) return;

      const result = await Swal.fire({
        title: 'Rename Test Suite',
        input: 'text',
        inputValue: foundSuite.name,
        showCancelButton: true,
        confirmButtonText: 'Rename',
        confirmButtonColor: '#005bbf',
        inputValidator: v => (!v || !v.trim()) ? 'Name cannot be empty' : undefined
      });
      if (!result.isConfirmed) return;

      try {
        const res = await fetch('/api/v1/suites/' + suiteId, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name: result.value.trim() })
        });
        const data = await res.json();
        if (data.success) {
          await loadAllProjectSuites();
          renderFolderTree();
          renderHistoryTable();
          showSnackbar({ type: 'success', title: 'Renamed', message: 'Test suite renamed.' });
        } else {
          showSnackbar({ type: 'error', title: 'Rename Failed', message: data.error || 'Unknown error.' });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not rename suite.' });
      }
    };

    window.deleteSuitePrompt = async function(suiteId, event) {
      if (event) event.stopPropagation();
      let foundSuite = null;
      for (const suites of projectSuitesCache.values()) {
        const s = suites.find(item => item.id === suiteId);
        if (s) { foundSuite = s; break; }
      }
      if (!foundSuite) return;

      const count = countInSuite(suiteId);
      const result = await Swal.fire({
        icon: 'warning',
        title: 'Delete Test Suite?',
        html: 'Delete suite <b>' + escapeHtml(foundSuite.name) + '</b>?' + (count > 0 ? '<br>The ' + count + ' scenario(s) inside will remain in the project as unassigned.' : ''),
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc3545'
      });
      if (!result.isConfirmed) return;

      try {
        const res = await fetch('/api/v1/suites/' + suiteId, { method: 'DELETE', headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
          if (historySuiteFilter === suiteId) historySuiteFilter = null;
          allHistoryData.forEach(h => {
            if (h.suiteId === suiteId) h.suiteId = null;
          });
          await loadAllProjectSuites();
          renderFolderTree();
          renderHistoryTable();
          showSnackbar({ type: 'success', title: 'Suite Deleted', message: 'Scenarios remain in project as unassigned.' });
        } else {
          showSnackbar({ type: 'error', title: 'Delete Failed', message: data.error || 'Unknown error.' });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Network Error', message: 'Could not delete suite.' });
      }
    };

    function renderHistoryTable() {
      const tbody = document.getElementById('historyTableBody');
      if (!tbody) return;

      // Filter by suite / project
      let filtered = allHistoryData;
      if (historySuiteFilter === 'none') {
        filtered = filtered.filter(h => h.folderId === historyProjectFilter && !h.suiteId);
      } else if (historySuiteFilter) {
        filtered = filtered.filter(h => h.suiteId === historySuiteFilter);
      } else if (historyProjectFilter === 'none') {
        filtered = filtered.filter(h => !h.folderId);
      } else if (historyProjectFilter) {
        filtered = filtered.filter(h => h.folderId === historyProjectFilter);
      }

      // Then by search query
      if (historySearchQuery) {
        filtered = filtered.filter(h =>
          (h.testSuite || '').toLowerCase().includes(historySearchQuery) ||
          (h.targetUrl || '').toLowerCase().includes(historySearchQuery) ||
          (h.status || '').toLowerCase().includes(historySearchQuery)
        );
      }

      // Sort
      filtered.sort((a, b) => {
        let valA = a[historySortKey] || '';
        let valB = b[historySortKey] || '';
        
        if (historySortKey === 'timestamp') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        } else {
          valA = String(valA).toLowerCase();
          valB = String(valB).toLowerCase();
        }

        if (valA < valB) return historySortDesc ? 1 : -1;
        if (valA > valB) return historySortDesc ? -1 : 1;
        return 0;
      });

      // Update Sort Icons
      ['timestamp', 'testSuite', 'targetUrl', 'status'].forEach(k => {
        const icon = document.getElementById(`sort-icon-${k}`);
        if (icon) {
          if (historySortKey === k) {
            icon.textContent = historySortDesc ? '↓' : '↑';
          } else {
            icon.textContent = '';
          }
        }
      });

      // Pagination
      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / HISTORY_PAGE_SIZE) || 1;
      if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
      if (historyCurrentPage < 1) historyCurrentPage = 1;

      const startIndex = (historyCurrentPage - 1) * HISTORY_PAGE_SIZE;
      const endIndex = Math.min(startIndex + HISTORY_PAGE_SIZE, totalItems);
      const paginated = filtered.slice(startIndex, endIndex);

      // Update Pagination UI
      const pageInfo = document.getElementById('historyPageInfo');
      if (pageInfo) {
        pageInfo.textContent = totalItems === 0 
          ? 'Showing 0 to 0 of 0 entries'
          : `Showing ${startIndex + 1} to ${endIndex} of ${totalItems} entries`;
      }
      const btnPrev = document.getElementById('btnHistoryPrev');
      if (btnPrev) btnPrev.disabled = historyCurrentPage === 1;
      const btnNext = document.getElementById('btnHistoryNext');
      if (btnNext) btnNext.disabled = historyCurrentPage === totalPages;

      // Render rows
      if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--slate);">No flow history found.</td></tr>';
        return;
      }
      
      tbody.innerHTML = '';
      paginated.forEach(h => {
        let badgeClass = 'status-badge-pill';
        if (h.status === 'SUCCESS') badgeClass += ' status-badge-success';
        else if (h.status === 'FAILED') badgeClass += ' status-badge-failed';
        else if (h.status === 'RUNNING') badgeClass += ' status-badge-running';
        else if (h.status === 'GENERATED') badgeClass += ' status-badge-generated';
        else badgeClass += ' status-badge-generated';

        // Project and Suite label tags
        const project = userFolders.find(p => p.id === h.folderId);
        let suiteName = null;
        if (h.suiteId) {
          for (const suites of projectSuitesCache.values()) {
            const s = suites.find(item => item.id === h.suiteId);
            if (s) { suiteName = s.name; break; }
          }
        }
        const locationTag = project
          ? `<div style="font-size: 11px; color: var(--slate); margin-top: 2px;">${escapeHtml(project.name)}${suiteName ? ' &nbsp;›&nbsp; ' + escapeHtml(suiteName) : ''}</div>`
          : `<div style="font-size: 11px; color: var(--slate); margin-top: 2px; font-style: italic;">Uncategorized</div>`;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="vertical-align: middle;"><span style="font-size: 11px; font-family: var(--font-mono); color: var(--slate);">${new Date(h.timestamp).toLocaleString()}</span></td>
          <td style="vertical-align: middle;">
            <div style="font-weight: 500;">${escapeHtml(h.testSuite || 'Untitled Scenario')}</div>
            ${locationTag}
          </td>
          <td style="vertical-align: middle;"><span style="font-family: var(--font-mono); font-size: 11px; word-break: break-all;">${escapeHtml(h.targetUrl || '-')}</span></td>
          <td style="text-align: center; vertical-align: middle;"><span class="${badgeClass}">${h.status}</span></td>
          <td style="text-align: center; vertical-align: middle;">
            <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
              <button class="btn-pill-outline" onclick="viewHistory('${h.id}')" style="padding: 4px 10px; font-size: 11px; min-height: unset; height: auto;">View</button>
              <button class="btn-pill-outline" onclick="deleteHistory('${h.id}')" style="padding: 4px 10px; font-size: 11px; min-height: unset; height: auto; color: var(--coral); border-color: var(--coral);">Delete</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    async function viewHistory(id) {
      try {
        const response = await fetch(`/api/v1/history/${id}`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (!data.success) {
          showSnackbar({ type: 'error', title: 'Error', message: data.error });
          return;
        }
        
        const h = data.data;
        currentViewedHistory = h;
        
        document.getElementById('histSuite').textContent = h.testSuite;
        document.getElementById('histUrl').textContent = h.targetUrl;
        document.getElementById('histDate').textContent = new Date(h.timestamp).toLocaleString();
        
        let modalBadgeClass = 'status-badge-pill';
        if (h.status === 'SUCCESS') modalBadgeClass += ' status-badge-success';
        else if (h.status === 'FAILED') modalBadgeClass += ' status-badge-failed';
        else if (h.status === 'RUNNING') modalBadgeClass += ' status-badge-running';
        else if (h.status === 'GENERATED') modalBadgeClass += ' status-badge-generated';
        else modalBadgeClass += ' status-badge-generated';
        
        document.getElementById('histStatus').innerHTML = `<span class="${modalBadgeClass}">${h.status}</span>`;
        document.getElementById('histCode').textContent = h.generatedCode || 'No code generated';
        
        // Render Steps
        const stepsBody = document.getElementById('histStepsBody');
        stepsBody.innerHTML = '';
        if (h.resolvedSteps && h.resolvedSteps.length > 0) {
          h.resolvedSteps.forEach(s => {
            const tr = document.createElement('tr');
            const isPassScore = s.matchScore >= 80;
            tr.innerHTML = `
              <td><span style="font-family: var(--font-mono); font-weight: 500;">Step ${s.step}</span></td>
              <td><span style="font-family: var(--font-mono); color: var(--action-blue);">${s.action}</span></td>
              <td><span style="font-family: var(--font-mono);">${s.selectorType}('${s.selectorValue}')</span></td>
              <td><span style="font-weight: 600; color: ${isPassScore ? 'var(--deep-green)' : 'var(--coral)'};">${s.matchScore}</span></td>
            `;
            stepsBody.appendChild(tr);
          });
        } else {
          stepsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--slate);">No steps recorded</td></tr>';
        }
        
        // Render Video
        const vidSec = document.getElementById('historyVideoSection');
        const vidPlayer = document.getElementById('historyVideoPlayer');
        if (h.videoUrl) {
          vidPlayer.src = h.videoUrl;
          vidSec.style.display = 'block';
        } else {
          vidPlayer.src = '';
          vidSec.style.display = 'none';
        }
        
        document.getElementById('historyDetailModal').style.display = 'flex';
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: 'Failed to load details' });
      }
    }

    function closeHistoryModal() {
      document.getElementById('historyDetailModal').style.display = 'none';
      document.getElementById('historyVideoPlayer').pause();
    }

    async function loadHistoryToBuilder() {
      if (!currentViewedHistory) return;
      const h = currentViewedHistory;

      // Populate basic info
      document.getElementById('testSuite').value = h.testSuite || '';
      document.getElementById('targetUrl').value = h.targetUrl || '';

      if (h.rawDsl) {
        if (h.rawDsl.framework) document.getElementById('framework').value = h.rawDsl.framework;
        onFrameworkChange(); // update language options
        if (h.rawDsl.language) {
          setTimeout(() => {
            document.getElementById('language').value = h.rawDsl.language;
            updateOutputLabels();
          }, 10);
        }
        
        if (Array.isArray(h.rawDsl.steps)) {
          steps = h.rawDsl.steps.map(s => ({
            action: s.action || 'fill',
            targetLabel: s.targetLabel || '',
            value: s.value !== undefined ? s.value : (s.expected !== undefined ? s.expected : ''),
            description: s.description || ''
          }));
        }
      } else {
        // Fallback for older history records without rawDsl
        const isKatalon = h.framework === 'katalon' || (h.generatedCode && h.generatedCode.includes('WebUI.'));
        const parsed = isKatalon ? parseGroovyToSteps(h.generatedCode) : parseSpecToSteps(h.generatedCode);
        if (parsed.length > 0) steps = parsed;
      }
      
      renderSteps();

      // Select the project and suite this scenario belongs to, if they still exist.
      const folderSelect = document.getElementById('folderSelect');
      if (folderSelect && h.folderId && userFolders.some(f => f.id === h.folderId)) {
        folderSelect.value = h.folderId;
        await loadSuites(h.folderId, h.suiteId);
      }

      // Populate Code output
      latestGeneratedCode = h.generatedCode;
      currentHistoryId = h.id;
      isHistoryReplay = true; // running this replay creates a new history record
      replaySourceResolvedSteps = Array.isArray(h.resolvedSteps) ? h.resolvedSteps : [];
      
      const codeOutput = document.getElementById('codeOutput');
      if (codeOutput) codeOutput.textContent = h.generatedCode || '// No code available';
      setCodeEditable(!!h.generatedCode);

      const generatedCodeCard = document.getElementById('generatedCodeCard');
      if (generatedCodeCard) generatedCodeCard.style.display = 'flex';
      
      const statusBadgeContainer = document.getElementById('statusBadgeContainer');
      if (statusBadgeContainer) {
        statusBadgeContainer.innerHTML = '<span class="status-chip chip-pass">Loaded from History</span>';
      }
      
      // Enable action buttons
      const btnCopyCode = document.getElementById('btnCopyCode');
      const btnDownloadCode = document.getElementById('btnDownloadCode');
      const btnRunTest = document.getElementById('btnRunTest');
      if (btnCopyCode) btnCopyCode.disabled = false;
      if (btnDownloadCode) btnDownloadCode.disabled = false;
      if (btnRunTest) btnRunTest.disabled = false;

      // Switch back to builder tab
      closeHistoryModal();
      switchTab('builder');

      showSnackbar({
        type: 'success',
        title: 'Loaded',
        message: 'Scenario successfully loaded into the builder.'
      });
    }

    async function deleteHistory(id) {
      const confirmResult = await Swal.fire({
        title: 'Delete Flow History?',
        text: "Are you sure you want to delete this flow history? This will also delete any associated videos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#66666e',
        confirmButtonText: 'Yes, delete it!'
      });

      if (!confirmResult.isConfirmed) return;
      try {
        const response = await fetch(`/api/v1/history/${id}`, { 
          method: 'DELETE',
          headers: getAuthHeaders() 
        });
        const data = await response.json();
        if (data.success) {
          showSnackbar({ type: 'success', title: 'Deleted', message: 'History record deleted.' });
          loadHistory();
        } else {
          showSnackbar({ type: 'error', title: 'Error', message: data.error });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: 'Failed to delete record' });
      }
    }

    // --- CONFIGURATION MODAL (ADMIN ONLY) ---
    async function loadAppConfig() {
      try {
        const res = await fetch('/api/v1/config', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
          appConfig = data.data;
        }
      } catch (err) {
        console.error('Failed to load app config', err);
      }
    }

    // --- API KEYS MANAGEMENT ---
    let allUserApiKeys = [];

    async function loadUserApiKeys() {
      const tbody = document.getElementById('apiKeyTableBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--slate);">Loading API keys...</td></tr>';

      try {
        const res = await fetch('/api/v1/api-keys', { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) {
          tbody.innerHTML = `<tr><td colspan="6" style="color: var(--coral); text-align: center;">${data.error}</td></tr>`;
          return;
        }

        const keys = data.data || [];
        allUserApiKeys = keys;
        if (keys.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--slate); padding: 24px;">No API keys generated yet. Click "+ Generate New Key" above.</td></tr>';
          return;
        }

        tbody.innerHTML = '';
        keys.forEach((k) => {
          const tr = document.createElement('tr');
          const isRevoked = k.status === 'revoked';
          const statusBadge = isRevoked 
            ? `<span class="status-badge-pill status-badge-failed">REVOKED</span>` 
            : `<span class="status-badge-pill status-badge-success">ACTIVE</span>`;

          const actionBtn = isRevoked
            ? `<button class="btn-pill-outline" onclick="handleDeleteApiKey('${k.id}')" style="padding: 4px 10px; font-size: 11px; color: var(--coral); border-color: var(--coral);">Delete</button>`
            : `<button class="btn-pill-outline" onclick="handleRevokeApiKey('${k.id}')" style="padding: 4px 10px; font-size: 11px; color: var(--coral); border-color: var(--coral);">Revoke</button>`;

          const rawKey = k.keyPrefix || '';
          const displayKey = (rawKey.length > 22 && !rawKey.includes('...'))
            ? `${rawKey.substring(0, 15)}...${rawKey.substring(rawKey.length - 4)}`
            : rawKey;

          const u = k.usage || { total: 0, generated: 0, success: 0, failed: 0 };
          const usageHtml = `
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="font-weight: 600; font-size: 12px; color: var(--ink);">
                ${u.total} <span style="font-size: 10px; font-weight: 400; color: var(--body-muted);">total</span>
              </div>
              <div style="display: flex; gap: 6px; font-size: 10px; font-family: var(--font-mono); line-height: 1;">
                <span style="color: #3b82f6;" title="Generated Scripts">${u.generated} gen</span>
                <span style="color: #10b981;" title="Passed Tests">${u.success} pass</span>
                <span style="color: #ef4444;" title="Failed">${u.failed} fail</span>
              </div>
            </div>
          `;

          tr.innerHTML = `
            <td><strong>${escapeHtml(k.name)}</strong></td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <code style="font-family: var(--font-mono); font-size: 12px; background: var(--surface-2); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--hairline);">${escapeHtml(displayKey)}</code>
                <button type="button" class="btn-icon" onclick="copyTableKey('${escapeHtml(rawKey)}')" title="Copy API Key" aria-label="Copy API Key">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </td>
            <td>${usageHtml}</td>
            <td><span style="font-size: 12px;">${new Date(k.createdAt).toLocaleDateString()}</span></td>
            <td><span style="font-size: 12px; color: var(--body-muted);">${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</span></td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
          `;
          tbody.appendChild(tr);
        });
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="color: var(--coral); text-align: center;">Failed to load API keys: ${err.message}</td></tr>`;
      }
    }

    function copyTableKey(rawKey) {
      if (!rawKey) return;
      navigator.clipboard.writeText(rawKey);
      if (rawKey.includes('...')) {
        showSnackbar({
          type: 'warning',
          title: 'Legacy Key',
          message: 'This older key only has the prefix saved. Please generate a new key to copy in full.'
        });
      } else {
        showSnackbar({
          type: 'success',
          title: 'Full API Key Copied!',
          message: 'Full API key copied to clipboard.'
        });
      }
    }

    function copySnippetCode(elementId) {
      const el = document.getElementById(elementId);
      if (!el) return;
      const text = el.textContent || el.innerText;
      navigator.clipboard.writeText(text);
      showSnackbar({
        type: 'success',
        title: 'Copied to Clipboard!',
        message: 'Code snippet copied successfully.'
      });
    }

    async function promptCreateApiKey() {
      const { value: keyName } = await Swal.fire({
        title: 'Generate New API Key',
        input: 'text',
        inputLabel: 'API Key Name / Description',
        inputValue: '',
        inputPlaceholder: 'e.g. CI/CD Pipeline, Staging Automation',
        showCancelButton: true,
        confirmButtonText: 'Generate Key',
        confirmButtonColor: '#005bbf',
        inputValidator: (value) => {
          if (!value || !value.trim()) {
            return 'Please enter a name for this API key';
          }
          const isDuplicate = (allUserApiKeys || []).some(k => k.name.trim().toLowerCase() === value.trim().toLowerCase());
          if (isDuplicate) {
            return `An API key named "${value.trim()}" already exists. Please choose a unique name.`;
          }
        }
      });

      if (!keyName) return;

      try {
        const res = await fetch('/api/v1/api-keys', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name: keyName.trim() })
        });
        const data = await res.json();
        if (data.success && data.data) {
          // Cache full key for current user session
          localStorage.setItem('tester_apikey_' + data.data.id, data.data.rawKey);
          localStorage.setItem('tester_apikey_prefix_' + data.data.keyPrefix, data.data.rawKey);

          const banner = document.getElementById('newKeyBanner');
          const input = document.getElementById('newKeyInput');
          if (banner && input) {
            input.value = data.data.rawKey;
            banner.style.display = 'block';
          }
          await loadUserApiKeys();
          showSnackbar({ type: 'success', title: 'API Key Created', message: 'New API key generated successfully.' });
        } else {
          showSnackbar({ type: 'error', title: 'Generation Failed', message: data.error });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: err.message });
      }
    }

    function copyNewApiKey() {
      const input = document.getElementById('newKeyInput');
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value);
      showSnackbar({
        type: 'success',
        title: 'Copied to Clipboard!',
        message: 'API key copied successfully.'
      });
    }

    async function handleRevokeApiKey(id) {
      const result = await Swal.fire({
        title: 'Revoke API Key?',
        text: 'Any automation script or integration using this key will immediately stop working.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Yes, Revoke Key'
      });

      if (!result.isConfirmed) return;

      try {
        const res = await fetch(`/api/v1/api-keys/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
          showSnackbar({ type: 'success', title: 'Revoked', message: 'API Key has been revoked.' });
          await loadUserApiKeys();
        } else {
          showSnackbar({ type: 'error', title: 'Failed', message: data.error });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: err.message });
      }
    }

    async function handleDeleteApiKey(id) {
      const result = await Swal.fire({
        title: 'Delete Record?',
        text: 'Permanently remove this revoked key record?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Delete'
      });

      if (!result.isConfirmed) return;

      try {
        const res = await fetch(`/api/v1/api-keys/${id}/delete`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
          showSnackbar({ type: 'success', title: 'Deleted', message: 'API Key record deleted.' });
          await loadUserApiKeys();
        } else {
          showSnackbar({ type: 'error', title: 'Failed', message: data.error });
        }
      } catch (err) {
        showSnackbar({ type: 'error', title: 'Error', message: err.message });
      }
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
      });
    }

    // --- INTERACTIVE STEP RECORDER LOGIC ---
    let recordedStepsBuffer = [];

    function openRecorderModal() {
      const targetUrlInput = document.getElementById('targetUrl');
      const targetUrl = targetUrlInput ? targetUrlInput.value.trim() : '';

      if (!targetUrl) {
        showSnackbar({
          type: 'warning',
          title: 'Target URL Required',
          message: 'Please enter a Target Web Application URL before starting the recorder.'
        });
        if (targetUrlInput) targetUrlInput.focus();
        return;
      }

      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Invalid protocol');
        }
      } catch {
        showSnackbar({
          type: 'warning',
          title: 'Invalid URL Format',
          message: 'Please enter a valid HTTP or HTTPS URL (e.g. https://example.com).'
        });
        return;
      }

      recordedStepsBuffer = [];
      updateRecorderStatsUI();

      const latestEl = document.getElementById('recorderLatestStepText');
      if (latestEl) {
        latestEl.textContent = 'Ready. Interact with the target page below to capture test steps automatically.';
      }

      const token = localStorage.getItem('tester_jwt_token') || (typeof authToken !== 'undefined' ? authToken : '') || localStorage.getItem('token') || '';
      const proxyUrl = `/api/v1/recorder/proxy?url=${encodeURIComponent(targetUrl)}&token=${encodeURIComponent(token)}`;
      const iframe = document.getElementById('recorderIframe');
      if (iframe) {
        iframe.src = proxyUrl;
      }

      const modal = document.getElementById('recorderModal');
      if (modal) {
        modal.style.display = 'flex';
      }
    }

    function closeRecorderModal() {
      const modal = document.getElementById('recorderModal');
      if (modal) {
        modal.style.display = 'none';
      }
      const iframe = document.getElementById('recorderIframe');
      if (iframe) {
        iframe.src = 'about:blank';
      }
    }

    function clearRecordedSteps() {
      recordedStepsBuffer = [];
      updateRecorderStatsUI();
      const latestEl = document.getElementById('recorderLatestStepText');
      if (latestEl) {
        latestEl.textContent = 'Cleared. Interact with the target page below to capture test steps automatically.';
      }
    }

    function updateRecorderStatsUI() {
      const countEl = document.getElementById('recorderLiveStepCount');
      const countText = `${recordedStepsBuffer.length} step${recordedStepsBuffer.length === 1 ? '' : 's'} recorded`;
      if (countEl) countEl.textContent = countText;
    }

    function applyRecordedSteps() {
      if (recordedStepsBuffer.length === 0) {
        showSnackbar({
          type: 'warning',
          title: 'No Steps Recorded',
          message: 'No actions have been captured yet. Interact with the target page first.'
        });
        return;
      }

      const startingIndex = steps.length;
      recordedStepsBuffer.forEach((recStep, idx) => {
        steps.push({
          step: startingIndex + idx + 1,
          action: recStep.action,
          targetLabel: recStep.targetLabel,
          value: recStep.value || '',
          description: recStep.description || `${recStep.action.toUpperCase()} on ${recStep.targetLabel}`
        });
      });

      renderSteps();
      closeRecorderModal();

      showSnackbar({
        type: 'success',
        title: 'Steps Applied',
        message: `Successfully added ${recordedStepsBuffer.length} recorded step(s) to Execution Steps.`
      });
    }

    function handleIncomingRecordedStep(payload) {
      if (!payload || !payload.action) return;

      // If the last step was a fill action on the same targetLabel, update its value
      const lastStep = recordedStepsBuffer[recordedStepsBuffer.length - 1];
      if (lastStep && lastStep.action === 'fill' && payload.action === 'fill' && lastStep.targetLabel === payload.targetLabel) {
        lastStep.value = payload.value || '';
        lastStep.description = payload.description || `Type ${lastStep.value} into ${lastStep.targetLabel}`;
      } else {
        const newStep = {
          step: recordedStepsBuffer.length + 1,
          action: payload.action,
          targetLabel: payload.targetLabel || 'Element',
          value: payload.value || '',
          description: payload.description || `${payload.action.toUpperCase()} on ${payload.targetLabel}`
        };
        recordedStepsBuffer.push(newStep);
      }

      updateRecorderStatsUI();

      const latestEl = document.getElementById('recorderLatestStepText');
      const currentLast = recordedStepsBuffer[recordedStepsBuffer.length - 1];
      if (latestEl && currentLast) {
        latestEl.textContent = `Captured: ${currentLast.description}`;
      }
    }

    // Global window exports for HTML event handlers
    window.openRecorderModal = openRecorderModal;
    window.closeRecorderModal = closeRecorderModal;
    window.clearRecordedSteps = clearRecordedSteps;
    window.applyRecordedSteps = applyRecordedSteps;

    // Global listener for postMessage events from the injected recorder-agent.js
    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'TESTER_LAB_RECORD_STEP') {
        handleIncomingRecordedStep(event.data.payload);
      }
    });

    // Cross-tab BroadcastChannel listener
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('tester_lab_recorder_channel');
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'TESTER_LAB_RECORD_STEP') {
            handleIncomingRecordedStep(event.data.payload);
          }
        };
      } catch {}
    }

    // --- THEME SWITCHER LOGIC ---
    function initTheme() {
      const savedTheme = localStorage.getItem('tester_lab_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateThemeIcons(savedTheme);
    }

    window.toggleTheme = function() {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', current);
      localStorage.setItem('tester_lab_theme', current);
      updateThemeIcons(current);
    };

    function updateThemeIcons(theme) {
      const sunIcons = document.querySelectorAll('.theme-icon-sun');
      const moonIcons = document.querySelectorAll('.theme-icon-moon');
      sunIcons.forEach(el => el.style.display = theme === 'dark' ? 'block' : 'none');
      moonIcons.forEach(el => el.style.display = theme === 'dark' ? 'none' : 'block');
    }

    // Initialize on page load
    initTheme();
    renderSteps();
    updateOutputLabels();
    checkAuthSession();
