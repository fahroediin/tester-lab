/*
 * Unit and integration tests for Project & Suite hierarchy and compatibility.
 * Run: node scripts/test-suites.js
 */
'use strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const assert = require('assert');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

(async () => {
  console.log('\n[1] Type definitions and backward compat');
  const folderStore = require('../dist/server/folder-store.js');
  ok('getUserProjects is exported', typeof folderStore.getUserProjects === 'function');
  ok('getUserFolders is aliased to getUserProjects', folderStore.getUserFolders === folderStore.getUserProjects);
  ok('createProject is exported', typeof folderStore.createProject === 'function');
  ok('createFolder is aliased to createProject', folderStore.createFolder === folderStore.createProject);
  ok('getProjectById is exported', typeof folderStore.getProjectById === 'function');
  ok('getFolderById is aliased to getProjectById', folderStore.getFolderById === folderStore.getProjectById);
  ok('updateProject is exported', typeof folderStore.updateProject === 'function');
  ok('deleteProject is exported', typeof folderStore.deleteProject === 'function');

  console.log('\n[2] Suite Store exports');
  const suiteStore = require('../dist/server/suite-store.js');
  ok('getSuitesByProjectId is exported', typeof suiteStore.getSuitesByProjectId === 'function');
  ok('getSuiteById is exported', typeof suiteStore.getSuiteById === 'function');
  ok('createSuite is exported', typeof suiteStore.createSuite === 'function');
  ok('updateSuite is exported', typeof suiteStore.updateSuite === 'function');
  ok('deleteSuite is exported', typeof suiteStore.deleteSuite === 'function');

  console.log('\n[3] Flow History Store suiteId support');
  const historyStore = require('../dist/server/flow-history-store.js');
  ok('addHistory is exported', typeof historyStore.addHistory === 'function');
  ok('updateHistory is exported', typeof historyStore.updateHistory === 'function');
  ok('getUserHistorySummaries is exported (lightweight list)', typeof historyStore.getUserHistorySummaries === 'function');
  ok('getScenarioCountsByFolder is exported (count query)', typeof historyStore.getScenarioCountsByFolder === 'function');
  ok('getScenarioCountsBySuite is exported (count query)', typeof historyStore.getScenarioCountsBySuite === 'function');

  console.log('\n[4] Route module exports');
  const { folderRoutes } = require('../dist/server/routes/folder-routes.js');
  const { suiteRoutes } = require('../dist/server/routes/suite-routes.js');
  const { historyRoutes } = require('../dist/server/routes/history-routes.js');
  const { testRoutes } = require('../dist/server/routes/test-routes.js');
  ok('folderRoutes router is exported', typeof folderRoutes === 'function');
  ok('suiteRoutes router is exported', typeof suiteRoutes === 'function');
  ok('historyRoutes router is exported', typeof historyRoutes === 'function');
  ok('testRoutes router is exported', typeof testRoutes === 'function');

  console.log(`\nALL PROJECT & SUITE VERIFICATIONS PASSED (${passed} assertions)\n`);
})();
