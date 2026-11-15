const required = [
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'OPENAI_API_KEY',
  'AGENT_NAME',
];

/** Report missing variable names without exposing credentials in terminal output. */
function findMissingSettings(environment) {
  return required.filter((key) => {
    const value = environment[key]?.trim();
    return !value || /^(wss:\/\/)?YOUR_/.test(value);
  });
}

const missing = findMissingSettings(process.env);

if (missing.length > 0) {
  console.error(
    'Configure these names privately in agents/oracle/.env.local: ' + missing.join(', '),
  );
  process.exitCode = 1;
} else if (!process.env.LIVEKIT_URL.startsWith('wss://')) {
  console.error('LIVEKIT_URL must use wss://');
  process.exitCode = 1;
} else {
  console.log(
    'Required environment values are present. Connectivity and account credits are not verified.',
  );
}
