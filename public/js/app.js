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

          } else {
            // Spec import logic (.spec.ts, .spec.js, .ts, .js)
            if (!content || !content.trim()) {
              showSnackbar({ type: 'warning', title: 'Empty File', message: 'The uploaded spec file is empty.' });
              return;
            }

            resetTerminalOutput();
            latestGeneratedCode = content;
            const codeOutput = document.getElementById('codeOutput');
            if (codeOutput) codeOutput.textContent = content;

            // Attempt to parse back the UI steps
            const parsedSteps = parseSpecToSteps(content);
            if (parsedSteps.length > 0) {
              steps = parsedSteps;
              renderSteps();
            }

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

    function resetGeneratedState() {
      latestGeneratedCode = ''; // Ensure memory is cleared
      const generatedCodeCard = document.getElementById('generatedCodeCard');
      const codeOutput = document.getElementById('codeOutput');
      const summarySection = document.getElementById('summarySection');
      const statusBadgeContainer = document.getElementById('statusBadgeContainer');
      
      if (generatedCodeCard) generatedCodeCard.style.display = 'none';
      if (codeOutput) codeOutput.textContent = '';
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

    function renderSteps() {
      resetGeneratedState();
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

    function resetTerminalOutput() {
      const terminalTitle = document.getElementById('terminalTitle');
      const terminalOutput = document.getElementById('terminalOutput');
      const videoContainer = document.getElementById('videoContainer');
      const videoPlayer = document.getElementById('videoPlayer');

      if (terminalTitle) terminalTitle.textContent = 'CLI Terminal Output';
      if (terminalOutput) {
        terminalOutput.textContent = "// Terminal ready. Click 'Run Script Now' to execute the generated Playwright test script directly in the terminal...";
        terminalOutput.style.color = '#34d399';
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

      // 0. FRONTEND STEP VALIDATION
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
        checkAuthSession();
        showSnackbar({ type: 'warning', title: 'Authentication Required', message: 'Please sign in to generate test scripts.' });
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
            dryRun: isDryRun
          })
        });

        clearInterval(progressTimer);
        const data = await response.json();

        if (consoleTitle) consoleTitle.textContent = 'PLAYWRIGHT TEST OUTPUT CONSOLE';

        if (!data.success) {
          statusBadgeContainer.innerHTML = '<span class="status-chip chip-fail">Generation Failed</span>';
          showSnackbar({ type: 'error', title: 'Generation Failed', message: (data.errors ? data.errors.join(', ') : data.error) });
          codeOutput.textContent = '// Generation failed.\n' + (data.errors ? data.errors.join('\n') : data.error);
          return;
        }

        latestGeneratedCode = data.code;
        currentHistoryId = data.historyId;
        codeOutput.textContent = data.code;

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
        if (consoleTitle) consoleTitle.textContent = 'PLAYWRIGHT TEST OUTPUT CONSOLE';
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
        filename = `${baseFilename}.${lang === 'javascript' ? 'spec.js' : 'spec.ts'}`;
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

      const code = latestGeneratedCode;

      if (!code || !code.trim() || code.startsWith('//') || code.includes('[1/4] INITIALIZING')) {
        showSnackbar({
          type: 'warning',
          title: 'No Valid Script Found',
          message: 'Please generate a valid test script first before running.'
        });
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

      try {
        const response = await fetch('/api/v1/run-test', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            code,
            mode,
            language,
            historyId: currentHistoryId
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

    async function loadHistory() {
      const tbody = document.getElementById('historyTableBody');
      if (!tbody) return;
      
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--slate);">Loading history...</td></tr>';
      
      try {
        const response = await fetch('/api/v1/history', { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (!data.success) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--coral);">${data.error}</td></tr>`;
          return;
        }
        
        allHistoryData = data.history || [];
        historyCurrentPage = 1;
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

    function renderHistoryTable() {
      const tbody = document.getElementById('historyTableBody');
      if (!tbody) return;

      // Filter
      let filtered = allHistoryData;
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
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="vertical-align: middle;"><span style="font-size: 11px; font-family: var(--font-mono); color: var(--slate);">${new Date(h.timestamp).toLocaleString()}</span></td>
          <td style="vertical-align: middle;"><span style="font-weight: 500;">${h.testSuite}</span></td>
          <td style="vertical-align: middle;"><span style="font-family: var(--font-mono); font-size: 11px; word-break: break-all;">${h.targetUrl}</span></td>
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

    function loadHistoryToBuilder() {
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
        const parsed = parseSpecToSteps(h.generatedCode);
        if (parsed.length > 0) steps = parsed;
      }
      
      renderSteps();

      // Populate Code output
      latestGeneratedCode = h.generatedCode;
      currentHistoryId = h.id;
      
      const codeOutput = document.getElementById('codeOutput');
      if (codeOutput) codeOutput.textContent = h.generatedCode || '// No code available';
      
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

    // Attach direct click listeners to Record Steps buttons
    const btnRecord = document.getElementById('btnRecordSteps');
    if (btnRecord) {
      btnRecord.addEventListener('click', openRecorderModal);
    }
    const btnRecordBottom = document.getElementById('btnRecordStepsBottom');
    if (btnRecordBottom) {
      btnRecordBottom.addEventListener('click', openRecorderModal);
    }

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

    function clearRecordedSteps() {
      recordedStepsBuffer = [];
      updateRecorderStatsUI();
      const latestEl = document.getElementById('recorderLatestStepText');
      if (latestEl) {
        latestEl.textContent = 'Cleared. Interact with the target page to capture test steps automatically.';
      }
    }

    function updateRecorderStatsUI() {
      const countEl = document.getElementById('recorderLiveStepCount');
      const countTabEl = document.getElementById('recorderLiveCountTab');
      const countText = `${recordedStepsBuffer.length} step${recordedStepsBuffer.length === 1 ? '' : 's'} recorded`;
      if (countEl) countEl.textContent = countText;
      if (countTabEl) countTabEl.textContent = recordedStepsBuffer.length;
      renderRecorderStepsTable();
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
    checkAuthSession();
