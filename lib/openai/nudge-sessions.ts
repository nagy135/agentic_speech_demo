type NudgeSession = { token: string; setMessage: (message: string) => boolean };

// Route bundles must share the same registry in our single Node process.
const shared = globalThis as typeof globalThis & {
  liveNudgeSessions?: Map<string, NudgeSession>;
};
const sessions = (shared.liveNudgeSessions ??= new Map());

export function registerNudgeSession(sessionId: string, session: NudgeSession) {
  sessions.set(sessionId, session);
  return () => {
    if (sessions.get(sessionId) === session) sessions.delete(sessionId);
  };
}

export function updateNudgeSession(
  sessionId: string,
  token: string,
  message: string,
) {
  const session = sessions.get(sessionId);
  return !!session && session.token === token && session.setMessage(message);
}
