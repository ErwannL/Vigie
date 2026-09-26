/**
 * Runs named jobs every N milliseconds using injected timer functions (never a bare
 * setInterval), so tests drive time explicitly. A job never overlaps itself, and a failure
 * is logged without stopping the schedule.
 */
export function createScheduler({ setTimer, clearTimer, log }) {
  const timers = new Map();
  let stopped = false;

  function schedule(name, everyMs, run) {
    const tick = async () => {
      try {
        await run();
      } catch (err) {
        log.error({ job: name, code: err.code ?? 'job_failed' }, 'job failed');
      }
      if (!stopped) timers.set(name, setTimer(tick, everyMs));
    };
    timers.set(name, setTimer(tick, everyMs));
  }

  function stop() {
    stopped = true;
    for (const handle of timers.values()) clearTimer(handle);
    timers.clear();
  }

  return { schedule, stop, timers };
}
