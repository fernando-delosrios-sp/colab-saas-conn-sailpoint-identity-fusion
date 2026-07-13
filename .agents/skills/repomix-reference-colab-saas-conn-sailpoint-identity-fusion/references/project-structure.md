# Directory Structure

```
.github/
  ISSUE_TEMPLATE/
    bug-report.md (33 lines)
    feature-request.md (19 lines)
  workflows/
    ai-cursor-review.yml (50 lines)
    ai-docs-review-cursor.yml (61 lines)
    ai-docs-review-opencode.yml (62 lines)
    ai-opencode-review.yml (48 lines)
    ai-performance-review-cursor.yml (61 lines)
    ai-performance-review-opencode.yml (62 lines)
    ai-refactor-review-cursor.yml (61 lines)
    ai-refactor-review-opencode.yml (62 lines)
    ai-security-review-cursor.yml (62 lines)
    ai-security-review-opencode.yml (63 lines)
    codeql.yml (36 lines)
    deploy-docs-pages.yml (57 lines)
    new-version-full-review.yml (91 lines)
    publish-connector-zip.yml (53 lines)
    README.md (59 lines)
    yaml-lint.yml (34 lines)
  bot.yml (12 lines)
  CODEOWNERS (1 lines)
.jules/
  bolt.md (63 lines)
  canary.md (52 lines)
  quartz.md (14 lines)
  sentinel.md (44 lines)
docs/
  concepts/
    map-define-match.md (31 lines)
  guides/
    advanced-connection-settings.md (493 lines)
    define.md (270 lines)
    index.md (40 lines)
    map.md (158 lines)
    match.md (514 lines)
    matching-algorithms.md (663 lines)
    migration-from-previous-fusion.md (146 lines)
    proxy-mode.md (627 lines)
    source-configuration.md (143 lines)
    testing-process.md (48 lines)
    troubleshooting.md (741 lines)
  operations/
    account-create.md (45 lines)
    account-disable.md (28 lines)
    account-discover-schema.md (17 lines)
    account-enable.md (37 lines)
    account-list.md (194 lines)
    account-read.md (24 lines)
    account-update.md (34 lines)
    custom-dryrun.md (31 lines)
    entitlement-list.md (44 lines)
    index.md (25 lines)
    test-connection.md (19 lines)
  get-started.md (33 lines)
  README.md (24 lines)
openspec/
  adr/
    0001-identity-origin-orphan-detection.md (27 lines)
  changes/
    archive/
      2026-06-18-enforce-fusion-schema-attributes/
        specs/
          fusion-account-attribute-resolution/
            spec.md (48 lines)
        .openspec.yaml (2 lines)
        design.md (41 lines)
        proposal.md (27 lines)
        README.md (3 lines)
        tasks.md (19 lines)
      2026-06-18-extend-delete-empty-to-identity-accounts/
        specs/
          identity-origin-orphan-detection/
            spec.md (52 lines)
        .openspec.yaml (2 lines)
        design.md (54 lines)
        proposal.md (27 lines)
        tasks.md (32 lines)
      2026-06-18-update-attribute-definition-docs/
        specs/
          attribute-definition-documentation/
            spec.md (149 lines)
        design.md (60 lines)
        proposal.md (45 lines)
        tasks.md (30 lines)
      2026-06-19-remove-velocity-id-fallback/
        specs/
          fusion-account-attribute-resolution/
            spec.md (38 lines)
        .openspec.yaml (2 lines)
        design.md (70 lines)
        proposal.md (23 lines)
        README.md (3 lines)
        tasks.md (32 lines)
    promote-identity-name-velocity-context/
      specs/
        fusion-account-attribute-resolution/
          spec.md (33 lines)
      .openspec.yaml (2 lines)
      design.md (40 lines)
      proposal.md (22 lines)
      README.md (3 lines)
      tasks.md (24 lines)
  schemas/
    behaviour-driven/
      templates/
        design.md (19 lines)
        proposal.md (23 lines)
        spec.md (23 lines)
        tasks.md (9 lines)
      README.md (71 lines)
      schema.yaml (253 lines)
    event-driven/
      templates/
        specs/
          spec.md (27 lines)
        asyncapi.yaml (55 lines)
        design.md (57 lines)
        event-modeling.md (88 lines)
        event-storming.md (71 lines)
        tasks.md (11 lines)
      README.md (58 lines)
      schema.yaml (103 lines)
    intent-driven/
      templates/
        adr.md (17 lines)
        design.md (27 lines)
        proposal.md (23 lines)
        spec.md (23 lines)
        tasks.md (9 lines)
      README.md (82 lines)
      schema.yaml (277 lines)
    minimalist/
      templates/
        specs/
          spec.md (27 lines)
        tasks.md (11 lines)
      README.md (29 lines)
      schema.yaml (19 lines)
    spec-driven-with-adr/
      templates/
        adr.md (17 lines)
        design.md (19 lines)
        proposal.md (23 lines)
        spec.md (8 lines)
        tasks.md (9 lines)
      README.md (58 lines)
      schema.yaml (326 lines)
  specs/
    attribute-definition-documentation/
      spec.md (144 lines)
    fusion-account-attribute-resolution/
      spec.md (116 lines)
    identity-origin-orphan-detection/
      spec.md (55 lines)
  config.yaml (20 lines)
  README.md (174 lines)
scripts/
  ci-check-readme-changelog.cjs (83 lines)
  ci-docs-diff-scope.cjs (29 lines)
  ci-eslint-changed.cjs (43 lines)
  ci-markdown-changed.cjs (43 lines)
  copy-license-for-docs.cjs (9 lines)
  prepare-docs.cjs (18 lines)
  README.md (14 lines)
  record-chain.js (79 lines)
  sync-connector-spec-initial-values.cjs (233 lines)
  sync-docs-home.cjs (60 lines)
  update-i18n.js (52 lines)
src/
  __tests__/
    index.test.ts (170 lines)
  data/
    __tests__/
      connectorDefaults.test.ts (18 lines)
    config/
      internal/
        clientService.ts (15 lines)
        formService.ts (6 lines)
        fusionService.ts (15 lines)
        index.ts (54 lines)
        messagingService.ts (5 lines)
      settings/
        __tests__/
          advancedConnectionSettings.test.ts (67 lines)
          connectionSettings.test.ts (46 lines)
          developerSettings.test.ts (75 lines)
          matchingSettings.test.ts (44 lines)
          normalAttributeDefinitionsSettings.test.ts (19 lines)
          processingControlSettings.test.ts (60 lines)
          proxySettings.test.ts (26 lines)
          reviewSettings.test.ts (26 lines)
          scopeSettings.test.ts (20 lines)
          sourcesSettings.test.ts (144 lines)
          uniqueAttributeDefinitionsSettings.test.ts (22 lines)
        advancedConnectionSettings.ts (45 lines)
        attributeMappingDefinitionsSettings.ts (17 lines)
        connectionSettings.ts (23 lines)
        developerSettings.ts (64 lines)
        developerSettings.ts.orig (52 lines)
        index.ts (2 lines)
        matchingSettings.ts (80 lines)
        normalAttributeDefinitionsSettings.ts (18 lines)
        processingControlSettings.ts (23 lines)
        proxySettings.ts (21 lines)
        reviewSettings.ts (24 lines)
        scopeSettings.ts (18 lines)
        sourcesSettings.ts (67 lines)
        uniqueAttributeDefinitionsSettings.ts (24 lines)
      defaults.ts (52 lines)
      index.ts (4 lines)
      migration.ts (8 lines)
      readConfig.ts (55 lines)
    action.ts (7 lines)
    config.ts (8 lines)
    schema.ts (90 lines)
    status.ts (19 lines)
  model/
    __tests__/
      fusionAccount.test.ts (268 lines)
      managedAccountKey.test.ts (31 lines)
    account.ts (3 lines)
    action.ts (11 lines)
    config.ts (507 lines)
    delayedAggregationWorkflow.ts (62 lines)
    emailWorkflow.ts (45 lines)
    entitlement.ts (26 lines)
    form.ts (90 lines)
    fusionAccount.ts (1653 lines)
    fusionAccountTypes.ts (41 lines)
    identity.ts (0 lines)
    managedAccountKey.ts (70 lines)
    messages.ts (4 lines)
    name-match.d.ts (16 lines)
    parse-address-string.d.ts (19 lines)
    source.ts (19 lines)
    status.ts (11 lines)
  operations/
    __tests__/
      chain/
        framework/
          ChainContext.ts (37 lines)
          ChainRunner.ts (240 lines)
          ChainState.ts (280 lines)
        harness/
          fakeApiAdapter.ts (56 lines)
          ReplayAdapter.ts (765 lines)
        chain.replay.test.ts (266 lines)
        explore.test.ts (57 lines)
      fixtures/
        aggregationScenarios.ts (46 lines)
        scenarioTypes.ts (39 lines)
      harness/
        mockRegistry.ts (156 lines)
        registryMocking.ts (94 lines)
      accountCreate.test.ts (85 lines)
      accountDisable.test.ts (45 lines)
      accountEnable.test.ts (71 lines)
      accountList.test.ts (228 lines)
      accountRead.test.ts (77 lines)
      accountUpdate.test.ts (119 lines)
      dryRun.test.ts (781 lines)
      testConnection.test.ts (79 lines)
    actions/
      __tests__/
        correlateAction.test.ts (36 lines)
      correlateAction.ts (27 lines)
      fusionAction.ts (24 lines)
      index.ts (45 lines)
      reportAction.ts (22 lines)
      reviewerAction.ts (29 lines)
      types.ts (6 lines)
    helpers/
      __tests__/
        buildDryRunPayload.test.ts (292 lines)
        corePipeline.test.ts (382 lines)
        dryRunHelpers.test.ts (198 lines)
        generateReport.test.ts (106 lines)
        rebuildFusionAccount.test.ts (167 lines)
      buildDryRunPayload.ts (486 lines)
      corePipeline.ts (481 lines)
      dryRunHelpers.ts (816 lines)
      generateReport.ts (59 lines)
      rebuildFusionAccount.ts (93 lines)
    accountCreate.ts (94 lines)
    accountDisable.ts (61 lines)
    accountDiscoverSchema.ts (21 lines)
    accountEnable.ts (80 lines)
    accountList.ts (40 lines)
    accountRead.ts (55 lines)
    accountUpdate.ts (106 lines)
    dryRun.ts (111 lines)
    entitlementList.ts (39 lines)
    testConnection.ts (60 lines)
  services/
    __tests__/
      proxyService.test.ts (140 lines)
      reportService.test.ts (152 lines)
    attributeService/
      __tests__/
        attributeService.test.ts (2370 lines)
        dateUtils.test.ts (180 lines)
        formatting.test.ts (683 lines)
        helpers.test.ts (233 lines)
        stateWrapper.test.ts (83 lines)
      contextHelpers/
        geo/
          geoData.ts (52 lines)
          ukGeoData.ts (241 lines)
          usGeoData.ts (465 lines)
        addressParse.ts (101 lines)
        dateUtils.ts (451 lines)
        index.ts (6 lines)
        json.ts (36 lines)
        normalize.ts (343 lines)
      attributeService.ts (1373 lines)
      constants.ts (6 lines)
      formatting.ts (158 lines)
      helpers.ts (255 lines)
      index.ts (11 lines)
      stateWrapper.ts (140 lines)
      types.ts (54 lines)
      velocityPrototypeGuard.cjs (35 lines)
    clientService/
      __tests__/
        apiQueue.test.ts (373 lines)
        clientService.test.ts (130 lines)
        helpers.test.ts (100 lines)
      clientService.ts (615 lines)
      constants.ts (24 lines)
      helpers.ts (144 lines)
      index.ts (30 lines)
      iscApiAdapter.ts (35 lines)
      queue.ts (370 lines)
      sdkApiAdapter.ts (124 lines)
      types.ts (64 lines)
    formService/
      __tests__/
        formBuilder.test.ts (142 lines)
        formProcessor.test.ts (83 lines)
        formService.test.ts (184 lines)
        helpers.test.ts (238 lines)
      constants.ts (13 lines)
      formBuilder.ts (628 lines)
      formProcessor.ts (312 lines)
      formService.ts (1536 lines)
      helpers.ts (139 lines)
      index.ts (26 lines)
      types.ts (47 lines)
    fusionService/
      __tests__/
        collections.test.ts (117 lines)
        fusionReportHelpers.test.ts (269 lines)
        fusionService.test.ts (2819 lines)
      aggregationTracker.ts (31 lines)
      collections.ts (120 lines)
      fusionReportBuilder.ts (129 lines)
      fusionService.ts (2349 lines)
      helpers.ts (216 lines)
      index.ts (6 lines)
      types.ts (247 lines)
    logService/
      __tests__/
        logService.test.ts (226 lines)
      helpers.ts (101 lines)
      index.ts (7 lines)
      logService.ts (563 lines)
    messagingService/
      __tests__/
        accountAttributeValueDisplay.test.ts (42 lines)
        messagingService.delayedAggregation.test.ts (94 lines)
        messagingService.errorHandling.test.ts (77 lines)
        messagingService.headerSubtitle.test.ts (51 lines)
        messagingService.reportSize.test.ts (170 lines)
      accountAttributeValueDisplay.ts (56 lines)
      email.ts (166 lines)
      helpers.ts (727 lines)
      index.ts (5 lines)
      locales.ts (476 lines)
      localization.ts (41 lines)
      messagingHandlebarsRegistration.ts (228 lines)
      messagingService.ts (880 lines)
    schemaService/
      __tests__/
        helpers.test.ts (94 lines)
        schemaService.test.ts (138 lines)
      helpers.ts (41 lines)
      index.ts (2 lines)
      schemaService.ts (467 lines)
    scoringService/
      __tests__/
        exactMatch.test.ts (50 lines)
        helpers.test.ts (213 lines)
        nameMatching.test.ts (63 lines)
        scoringService.test.ts (613 lines)
        stringComparison.test.ts (64 lines)
        trigramIndex.test.ts (80 lines)
      exactMatch.ts (21 lines)
      helpers.ts (332 lines)
      index.ts (8 lines)
      nameMatching.ts (221 lines)
      scoringService.ts (596 lines)
      stringComparison.ts (140 lines)
      trigramIndex.ts (72 lines)
      types.ts (48 lines)
    sourceService/
      __tests__/
        accountJmespathFilter.test.ts (95 lines)
        sourceService.test.ts (620 lines)
      accountFilters.ts (82 lines)
      helpers.ts (19 lines)
      index.ts (8 lines)
      sourceReverseCorrelationErrors.ts (59 lines)
      sourceService.ts (2122 lines)
      types.ts (25 lines)
    entitlementService.ts (45 lines)
    identityService.ts (367 lines)
    lockService.ts (85 lines)
    proxyService.ts (272 lines)
    recordingService.ts (270 lines)
    reportService.ts (537 lines)
    serviceRegistry.ts (166 lines)
  utils/
    __tests__/
      assert.test.ts (79 lines)
      attributes.test.ts (298 lines)
      date.test.ts (56 lines)
      error.test.ts (65 lines)
      numbers.test.ts (8 lines)
      operationHandler.test.ts (277 lines)
      safeRead.test.ts (104 lines)
      url.test.ts (140 lines)
      velocityAccountSnapshot.test.ts (25 lines)
    assert.ts (76 lines)
    attributes.ts (351 lines)
    date.ts (25 lines)
    error.ts (16 lines)
    index.ts (25 lines)
    numbers.ts (7 lines)
    operationHandler.ts (129 lines)
    safeRead.ts (110 lines)
    url.ts (215 lines)
    velocityAccountSnapshot.ts (41 lines)
  index.ts (90 lines)
test-data/
  black-mesa-feed.csv (36 lines)
  identity-feed.csv (51 lines)
  ryan-industries-feed.csv (41 lines)
  umbrella-corporation-feed.csv (37 lines)
.gitignore (48 lines)
.markdownlint.json (15 lines)
.npmrc (1 lines)
.repomixignore (4 lines)
babel.config.cjs (4 lines)
connector-spec.json (1255 lines)
eslint.config.mjs (43 lines)
jest.config.js (22 lines)
LICENSE.txt (21 lines)
log-server.js (221 lines)
mkdocs.yml (52 lines)
package.json (87 lines)
README.md (441 lines)
repomix.config.json (43 lines)
requirements-docs.txt (2 lines)
tsconfig.json (16 lines)
tsconfig.test.json (9 lines)
```