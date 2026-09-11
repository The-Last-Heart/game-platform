/**
 * Schedule an async fetch after the current effect turn so React Compiler /
 * eslint react-hooks/set-state-in-effect does not treat the kickoff setState
 * as a synchronous cascade from the effect body.
 */
export function scheduleEffectTask(task: () => void): () => void {
  const id = window.setTimeout(task, 0);
  return () => window.clearTimeout(id);
}
