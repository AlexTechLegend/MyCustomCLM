const original = process.emitWarning.bind(process);

// node:sqlite prints an ExperimentalWarning on first load; it is stable enough for our use
// and the notice only confuses operators reading the logs.
(process as { emitWarning: typeof process.emitWarning }).emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === 'string' ? warning : warning?.message ?? '';
  if (text.includes('SQLite is an experimental feature')) return;
  return (original as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

export {};
