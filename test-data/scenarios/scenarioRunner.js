const fs = require('fs')
const path = require('path')

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4) + '\n')
}

function ensureArray(value) {
    return Array.isArray(value) ? value : []
}

function normalize(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function tokenize(value) {
    const normalized = normalize(value)
    return normalized ? normalized.split(' ') : []
}

function getAccountDisplayName(account) {
    return (
        account?.attributes?.displayName ??
        account?.name ??
        account?.identity?.name ??
        account?.nativeIdentity ??
        account?.id ??
        ''
    )
}

function getAccountEmail(account) {
    return account?.attributes?.mail ?? account?.attributes?.email ?? ''
}

function getIdentityDisplayName(identity) {
    return identity?.attributes?.displayName ?? identity?.name ?? ''
}

function getIdentityEmail(identity) {
    return identity?.attributes?.email ?? identity?.attributes?.mail ?? ''
}

function getLastName(tokens) {
    return tokens.length ? tokens[tokens.length - 1] : ''
}

function getFirstToken(tokens) {
    return tokens.length ? tokens[0] : ''
}

function firstInitial(token) {
    return token ? token[0] : ''
}

function scoreAccountToIdentity(account, identity) {
    const accountDisplay = getAccountDisplayName(account)
    const identityDisplay = getIdentityDisplayName(identity)
    const accountEmail = normalize(getAccountEmail(account))
    const identityEmail = normalize(getIdentityEmail(identity))

    const aTokens = tokenize(accountDisplay)
    const iTokens = tokenize(identityDisplay)
    const aName = normalize(accountDisplay)
    const iName = normalize(identityDisplay)

    if (accountEmail && identityEmail && accountEmail === identityEmail) {
        return { score: 100, reason: 'email-exact' }
    }
    if (aName && iName && aName === iName) {
        return { score: 100, reason: 'displayName-exact' }
    }

    const aLast = getLastName(aTokens)
    const iLast = getLastName(iTokens)
    const aFirst = getFirstToken(aTokens)
    const iFirst = getFirstToken(iTokens)

    if (aLast && iLast && aLast === iLast) {
        if (aFirst && iFirst && firstInitial(aFirst) === firstInitial(iFirst)) {
            return { score: 85, reason: 'lastName+firstInitial' }
        }
        return { score: 70, reason: 'lastName-only' }
    }

    return { score: 0, reason: 'no-signal' }
}

function buildDecisionMap(forms) {
    const map = new Map()
    for (const form of ensureArray(forms)) {
        const accountId = form?.formInput?.account
        if (!accountId) continue
        const newIdentity = form?.formData?.newIdentity
        const chosenIdentity = Array.isArray(form?.formData?.identities) ? form.formData.identities[0] : undefined
        map.set(accountId, {
            formId: form?.id,
            accountId,
            finished: ['COMPLETED', 'IN_PROGRESS', 'SUBMITTED'].includes(form?.state),
            newIdentity: newIdentity !== undefined ? Boolean(newIdentity) : true,
            identityId: chosenIdentity,
            comments: form?.formData?.comments ?? '',
        })
    }
    return map
}

function runPass(passName, config, identities, managedAccounts, forms) {
    const threshold = Number(config?.fusionAverageScore ?? 80)
    const includeIdentities = config?.includeIdentities !== false
    const fusionMergingIdentical = Boolean(config?.fusionMergingIdentical)

    const decisionMap = buildDecisionMap(forms)
    const sourceConfigMap = new Map(
        ensureArray(config?.sources).map((source) => [
            source.name,
            {
                sourceType: source.sourceType ?? 'authoritative',
                disableNonMatchingAccounts: Boolean(source.disableNonMatchingAccounts),
            },
        ])
    )
    const potentials = []
    const correlations = []
    const unmatched = []
    const disablePlannedAccountIds = []
    const decisionsApplied = []

    const identitiesList = includeIdentities ? ensureArray(identities) : []

    for (const account of ensureArray(managedAccounts)) {
        const accountId = account?.id ?? account?.nativeIdentity
        const accountName = getAccountDisplayName(account)
        const candidateScores = []

        for (const identity of identitiesList) {
            const { score, reason } = scoreAccountToIdentity(account, identity)
            if (score <= 0) continue
            candidateScores.push({
                identityId: identity.id,
                identityName: getIdentityDisplayName(identity),
                score,
                reason,
            })
        }

        candidateScores.sort((a, b) => b.score - a.score)
        const top = candidateScores[0]

        potentials.push({
            accountId,
            accountName,
            sourceName: account?.sourceName ?? '',
            topCandidate: top ?? null,
            candidates: candidateScores.filter((c) => c.score >= threshold),
        })

        const decision = decisionMap.get(accountId)
        const sourceConfig = sourceConfigMap.get(account?.sourceName ?? '')
        const isOrphan = sourceConfig?.sourceType === 'orphan'
        const disableOnNoMatch = Boolean(sourceConfig?.disableNonMatchingAccounts)

        if (decision && decision.finished) {
            decisionsApplied.push(decision)
            if (decision.newIdentity === false && decision.identityId) {
                correlations.push({
                    accountId,
                    accountName,
                    identityId: decision.identityId,
                    decision: 'approved-by-form',
                })
                continue
            }
            unmatched.push(accountId)
            if (isOrphan && disableOnNoMatch) {
                disablePlannedAccountIds.push(accountId)
            }
            continue
        }

        if (fusionMergingIdentical && top && top.score === 100) {
            correlations.push({
                accountId,
                accountName,
                identityId: top.identityId,
                decision: 'auto-merge-identical',
            })
            continue
        }

        unmatched.push(accountId)
        if (isOrphan && disableOnNoMatch) {
            disablePlannedAccountIds.push(accountId)
        }
    }

    return {
        pass: passName,
        summary: {
            includeIdentities,
            threshold,
            managedAccountsCount: ensureArray(managedAccounts).length,
            identitiesCount: identitiesList.length,
            formDecisionsCount: ensureArray(forms).length,
            matchesCount: potentials.filter((p) => p.candidates.length > 0).length,
            correlatedCount: correlations.length,
            unmatchedCount: unmatched.length,
            disablePlannedCount: disablePlannedAccountIds.length,
        },
        matches: potentials,
        correlatedAccounts: correlations,
        unmatchedAccountIds: unmatched,
        disablePlannedAccountIds,
        decisionsApplied,
    }
}

function ensureExpected(outputDir, expectedName, generatedData) {
    const expectedPath = path.join(outputDir, expectedName)
    if (!fs.existsSync(expectedPath)) {
        writeJson(expectedPath, generatedData)
    }
}

function runScenario(scenarioDir) {
    const manifestPath = path.join(scenarioDir, 'scenario.manifest.json')
    const manifest = readJson(manifestPath)
    const config = readJson(path.join(scenarioDir, manifest.configFile))
    const identities = readJson(path.join(scenarioDir, manifest.dataFiles.identities))

    const pass1Managed = readJson(path.join(scenarioDir, manifest.dataFiles.pass1.managedAccounts))
    const pass1Forms = readJson(path.join(scenarioDir, manifest.dataFiles.pass1.forms))
    const pass2Managed = readJson(path.join(scenarioDir, manifest.dataFiles.pass2.managedAccounts))
    const pass2Forms = readJson(path.join(scenarioDir, manifest.dataFiles.pass2.forms))

    const pass1 = runPass('pass1', config, identities, pass1Managed, pass1Forms)
    const pass2 = runPass('pass2', config, identities, pass2Managed, pass2Forms)

    const outputFiles = manifest.outputFiles ?? {}
    const pass1GeneratedPath = path.join(scenarioDir, outputFiles.pass1Generated ?? 'output.pass1.generated.json')
    const pass2GeneratedPath = path.join(scenarioDir, outputFiles.pass2Generated ?? 'output.pass2.generated.json')
    const pass1SideEffectsGeneratedPath = path.join(
        scenarioDir,
        outputFiles.pass1SideEffectsGenerated ?? 'sideEffects.pass1.generated.json'
    )
    const pass2SideEffectsGeneratedPath = path.join(
        scenarioDir,
        outputFiles.pass2SideEffectsGenerated ?? 'sideEffects.pass2.generated.json'
    )

    writeJson(pass1GeneratedPath, pass1)
    writeJson(pass2GeneratedPath, pass2)
    writeJson(pass1SideEffectsGeneratedPath, { correlatedAccounts: pass1.correlatedAccounts, decisions: pass1.decisionsApplied })
    writeJson(pass2SideEffectsGeneratedPath, { correlatedAccounts: pass2.correlatedAccounts, decisions: pass2.decisionsApplied })

    ensureExpected(scenarioDir, outputFiles.pass1Expected ?? 'output.pass1.expected.json', pass1)
    ensureExpected(scenarioDir, outputFiles.pass2Expected ?? 'output.pass2.expected.json', pass2)

    return { manifest, pass1, pass2 }
}

function main() {
    const scenarioDirArg = process.argv[2]
    if (!scenarioDirArg) {
        process.stderr.write('Usage: node test-data/scenarios/scenarioRunner.js <scenarioDir>\n')
        process.exit(1)
    }
    const scenarioDir = path.resolve(scenarioDirArg)
    const { pass1, pass2, manifest } = runScenario(scenarioDir)
    process.stdout.write(
        [
            `Scenario: ${manifest.name}`,
            `Pass1 correlated: ${pass1.summary.correlatedCount}, unmatched: ${pass1.summary.unmatchedCount}`,
            `Pass2 correlated: ${pass2.summary.correlatedCount}, unmatched: ${pass2.summary.unmatchedCount}`,
        ].join('\n') + '\n'
    )
}

if (require.main === module) {
    main()
}

module.exports = {
    runScenario,
    runPass,
}
