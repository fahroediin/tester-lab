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
        Swal.fire({ icon: 'warning', title: 'Missing Details', text: 'Please provide feedback details.', toast: true, position: 'top-end' });
        return;
      }
      
      const file = attachmentInput.files[0];
      let fileBase64 = null;
      let filename = null;
      
      if (file) {
        // Validate size (client-side)
        if (file.size > 5242880) { // 5MB
          Swal.fire({ icon: 'error', title: 'File Too Large', text: 'Attachment exceeds 5MB limit.', toast: true, position: 'top-end' });
          return;
        }
        
        // Validate extension (client-side)
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
          Swal.fire({ icon: 'error', title: 'Invalid Format', text: 'Only PNG, JPG, JPEG, and BMP are allowed.', toast: true, position: 'top-end' });
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
          Swal.fire({ icon: 'success', title: 'Feedback Submitted', text: 'Thank you for your feedback!', timer: 3000, showConfirmButton: false, toast: true, position: 'top-end' });
        } else {
          Swal.fire({ icon: 'error', title: 'Submission Failed', text: data.error || 'Unknown error occurred.', toast: true, position: 'top-end' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Network Error', text: 'Could not connect to server.', toast: true, position: 'top-end' });
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
        Swal.fire({
          icon: 'warning',
          title: 'No Sample Configuration',
          text: 'Admin has not configured the sample scenario yet. Please contact the administrator.',
          confirmButtonColor: '#005bbf'
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
            
            Swal.fire({
              icon: 'success',
              title: 'Flow File Loaded',
              text: `Successfully imported "${file.name}".`,
              timer: 2500,
              showConfirmButton: false,
              toast: true,
              position: 'top-end'
            });

          } else {
            // Spec import logic (.spec.ts, .spec.js, .ts, .js)
            if (!content || !content.trim()) {
              Swal.fire({ icon: 'warning', title: 'Empty File', text: 'The uploaded spec file is empty.', confirmButtonColor: '#005bbf' });
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
        Swal.fire({ icon: 'warning', title: 'Authentication Required', text: 'Please sign in to generate test scripts.', confirmButtonColor: '#005bbf' });
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
          Swal.fire({ icon: 'error', title: 'Generation Failed', text: (data.errors ? data.errors.join(', ') : data.error), confirmButtonColor: '#005bbf' });
          codeOutput.textContent = '// Generation failed.\n' + (data.errors ? data.errors.join('\n') : data.error);
          return;
        }

        latestGeneratedCode = data.code;
        currentHistoryId = data.historyId;
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
        Swal.fire({ icon: 'success', title: 'Copied!', text: 'Content copied to clipboard!', timer: 2000, showConfirmButton: false, toast: true, position: 'top-end' });
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

      const cliTerminalCard = document.getElementById('cliTerminalCard');
      if (cliTerminalCard) cliTerminalCard.classList.add('highlight-red');

      // Disable Execution Steps so they cannot be changed during run
      const stepListInputs = document.querySelectorAll('#stepList input, #stepList select, #stepList button');
      stepListInputs.forEach(el => el.disabled = true);

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
        if (data.success) {
          currentUser = data.user;
          renderLoggedInBar();
          if (topBar) topBar.style.display = 'flex';
          if (header) header.style.display = 'flex';
          if (appNav) appNav.style.display = 'block';
          if (unauthView) unauthView.style.display = 'none';
          if (mainApp) mainApp.style.display = 'block';
          
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

    // Legacy handleLoginSubmit & handleRegisterSubmit removed

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
          Swal.fire({ icon: 'success', title: 'User Deleted', text: data.message, timer: 1800, showConfirmButton: false, toast: true, position: 'top-end' });
          await loadAdminUsers();
        } else {
          Swal.fire({ icon: 'error', title: 'Action Failed', text: data.error, confirmButtonColor: '#005bbf' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#005bbf' });
      }
    }

    // --- Flow History Logic ---
    function switchTab(tabId) {
      const tabBuilder = document.getElementById('tabBuilder');
      const tabHistory = document.getElementById('tabHistory');
      const navBuilder = document.getElementById('navBuilder');
      const navHistory = document.getElementById('navHistory');

      if (tabId === 'history') {
        tabBuilder.style.display = 'none';
        tabHistory.style.display = 'block';
        navBuilder.classList.remove('active');
        navHistory.classList.add('active');
        navBuilder.style.color = 'var(--slate)';
        navBuilder.style.borderBottom = 'none';
        navHistory.style.color = 'var(--primary)';
        navHistory.style.borderBottom = '2px solid var(--primary)';
        loadHistory();
      } else {
        tabHistory.style.display = 'none';
        tabBuilder.style.display = 'flex';
        navHistory.classList.remove('active');
        navBuilder.classList.add('active');
        navHistory.style.color = 'var(--slate)';
        navHistory.style.borderBottom = 'none';
        navBuilder.style.color = 'var(--primary)';
        navBuilder.style.borderBottom = '2px solid var(--primary)';
      }
    }

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
        
        if (data.history.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--slate);">No flow history found. Generate a script to get started!</td></tr>';
          return;
        }
        
        tbody.innerHTML = '';
        data.history.forEach(h => {
          let statusColor = 'var(--slate)';
          if (h.status === 'SUCCESS') statusColor = 'var(--deep-green)';
          else if (h.status === 'FAILED') statusColor = 'var(--coral)';
          else if (h.status === 'RUNNING') statusColor = '#eab308';
          else if (h.status === 'GENERATED') statusColor = 'var(--action-blue)';
          
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><span style="font-size: 11px; font-family: var(--font-mono); color: var(--slate);">${new Date(h.timestamp).toLocaleString()}</span></td>
            <td><span style="font-weight: 500;">${h.testSuite}</span></td>
            <td><span style="font-family: var(--font-mono); font-size: 11px; word-break: break-all;">${h.targetUrl}</span></td>
            <td style="text-align: center;"><span style="font-weight: 600; font-size: 11px; color: ${statusColor};">${h.status}</span></td>
            <td style="text-align: center; display: flex; gap: 8px; justify-content: center;">
              <button class="btn-pill-outline" onclick="viewHistory('${h.id}')" style="padding: 4px 10px; font-size: 11px; min-height: unset; height: auto;">View</button>
              <button class="btn-pill-outline" onclick="deleteHistory('${h.id}')" style="padding: 4px 10px; font-size: 11px; min-height: unset; height: auto; color: var(--coral); border-color: var(--coral);">Delete</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--coral);">Failed to load history</td></tr>';
      }
    }

    async function viewHistory(id) {
      try {
        const response = await fetch(`/api/v1/history/${id}`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (!data.success) {
          Swal.fire({ icon: 'error', title: 'Error', text: data.error, toast: true, position: 'top-end' });
          return;
        }
        
        const h = data.data;
        currentViewedHistory = h;
        
        document.getElementById('histSuite').textContent = h.testSuite;
        document.getElementById('histUrl').textContent = h.targetUrl;
        document.getElementById('histDate').textContent = new Date(h.timestamp).toLocaleString();
        
        let statusColor = 'var(--slate)';
        if (h.status === 'SUCCESS') statusColor = 'var(--deep-green)';
        else if (h.status === 'FAILED') statusColor = 'var(--coral)';
        else if (h.status === 'RUNNING') statusColor = '#eab308';
        else if (h.status === 'GENERATED') statusColor = 'var(--action-blue)';
        
        document.getElementById('histStatus').innerHTML = `<span style="color: ${statusColor}; font-weight: bold;">${h.status}</span>`;
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
        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load details', toast: true, position: 'top-end' });
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

      Swal.fire({
        icon: 'success',
        title: 'Loaded',
        text: 'Scenario successfully loaded into the builder.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
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
          Swal.fire({ icon: 'success', title: 'Deleted', text: 'History record deleted', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
          loadHistory();
        } else {
          Swal.fire({ icon: 'error', title: 'Error', text: data.error, toast: true, position: 'top-end' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to delete record', toast: true, position: 'top-end' });
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

    // Initialize on page load
    renderSteps();
    checkAuthSession();
