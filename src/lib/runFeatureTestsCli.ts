import { runAllBalizaFeatureTests } from './featureTests';

async function main() {
  const report = await runAllBalizaFeatureTests();
  console.log(
    `\nBaliza Feature Test Suite: ${report.passed}/${report.total} passed in ${report.durationMs}ms\n`
  );
  report.results.forEach((r) => {
    const mark = r.passed ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${r.name} — ${r.detail}`);
  });
  if (report.failed > 0) {
    process.exit(1);
  }
}

void main();
