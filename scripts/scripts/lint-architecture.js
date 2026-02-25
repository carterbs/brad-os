#!/usr/bin/env tsx
/**
 * Architecture Enforcement Linter — CLI Runner
 *
 * Imports check functions from lint-checks.ts and runs them in sequence.
 * See lint-checks.ts for the actual check implementations.
 */
import { createDefaultConfig, checkLayerDeps, checkSchemaBoundary, checkTypeDedup, checkFirebaseRoutes, checkIosLayers, checkArchMapRefs, checkClaudeMdRefs, checkOrphanFeatures, checkPlanLifecycle, checkNoConsoleLog, checkNoRawUrlSession, checkTypesInTypesDir, checkSchemasInSchemasDir, checkNoSkippedTests, checkUntestedHighRisk, checkTestFactoryUsage, checkNoInlineApiResponse, checkNoFocusedTests, checkTestQuality, checkQualityGradesFreshness, checkRepositoryTestCoverage, checkMarkdownLinks, } from './lint-checks.js';
// ── Color helpers ────────────────────────────────────────────────────────────
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
function main() {
    const config = createDefaultConfig();
    console.log(bold('\n=== Architecture Enforcement ===\n'));
    const checks = [
        () => checkLayerDeps(config),
        () => checkSchemaBoundary(config),
        () => checkTypeDedup(config),
        () => checkFirebaseRoutes(config),
        () => checkIosLayers(config),
        () => checkArchMapRefs(config),
        () => checkClaudeMdRefs(config),
        () => checkOrphanFeatures(config),
        () => checkPlanLifecycle(config),
        () => checkNoConsoleLog(config),
        () => checkNoRawUrlSession(config),
        () => checkTypesInTypesDir(config),
        () => checkSchemasInSchemasDir(config),
        () => checkNoSkippedTests(config),
        () => checkUntestedHighRisk(config),
        () => checkTestFactoryUsage(config),
        () => checkNoInlineApiResponse(config),
        () => checkNoFocusedTests(config),
        () => checkTestQuality(config),
        () => checkRepositoryTestCoverage(config),
        () => checkMarkdownLinks(config),
    ];
    const results = [];
    for (const check of checks) {
        const result = check();
        results.push(result);
        if (result.passed) {
            console.log(`${green('\u2713')} ${result.name}: ${green('clean')}`);
        }
        else {
            console.log(`${red('\u2717')} ${result.name}: ${red(`${result.violations.length} violation(s)`)}`);
            console.log();
            for (const v of result.violations) {
                console.log(`  ${dim(v)}`);
            }
            console.log();
        }
    }
    // Warning checks (non-blocking)
    const warningChecks = [];
    const warningResults = [];
    for (const check of warningChecks) {
        const result = check();
        warningResults.push(result);
        if (result.passed) {
            console.log(`${green('\u2713')} ${result.name}: ${green('clean')}`);
        }
        else {
            console.log(`${yellow('\u26a0')} ${result.name}: ${yellow(`${result.violations.length} warning(s)`)}`);
            console.log();
            for (const v of result.violations) {
                console.log(`  ${dim(v)}`);
            }
            console.log();
        }
    }
    // Warnings (non-blocking)
    const freshness = checkQualityGradesFreshness(config);
    if (freshness.stale) {
        console.log(`\n${yellow('\u26a0')} Quality grades freshness: ${yellow(freshness.message)}`);
    }
    // Summary
    const failed = results.filter((r) => !r.passed);
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
    const totalWarnings = warningResults.reduce((sum, r) => sum + r.violations.length, 0);
    console.log(bold('\n--- Summary ---'));
    if (failed.length === 0) {
        console.log(green(`\nAll ${results.length}/${results.length} checks passed.\n`));
        if (totalWarnings > 0) {
            console.log(yellow(`${totalWarnings} warning(s) (non-blocking).`));
        }
        process.exit(0);
    }
    else {
        console.log(red(`\n${failed.length}/${results.length} check(s) failed with ${totalViolations} total violation(s).\n`));
        if (totalWarnings > 0) {
            console.log(yellow(`${totalWarnings} warning(s) (non-blocking).`));
        }
        process.exit(1);
    }
}
main();
