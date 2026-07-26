const message = [
  'Firebase Cloud Functions deployment is disabled.',
  'The production API runs on the brad-os-api Cloud Run service.',
  'Use npm run deploy:cloud-run for the API or npm run deploy:hosting for Hosting.',
  'The Functions adapter is retained only for local emulator compatibility.',
].join(' ');

console.error(message);
process.exitCode = 1;
