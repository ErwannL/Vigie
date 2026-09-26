/**
 * The structured payload sent to Orqea's issue board through IssueSink. No user identities:
 * only templates, catalogue keys, segment shares and numbers.
 */
export function issuePayload(incident, publicUrl) {
  const link = publicUrl ? [`${publicUrl}/#/incidents/${incident.id}?env=${incident.env}`] : [];
  return {
    schema: 1,
    source: 'vigie',
    incidentId: incident.id,
    env: incident.env,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    affected: {
      routes: incident.routes,
      pages: incident.pages,
      features: incident.features,
      errorFingerprints: incident.fingerprints,
    },
    segments: incident.segments,
    firstSeen: new Date(incident.firstSeen).toISOString(),
    lastSeen: new Date(incident.lastSeen).toISOString(),
    appVersion: incident.appVersion,
    sinceVersion: incident.sinceVersion,
    triggers: incident.triggers,
    reproduction: incident.replay
      ? {
          targetEnv: incident.replay.targetEnv,
          state: incident.replay.state,
          evidence: incident.replay.evidence ?? null,
        }
      : null,
    evidenceLinks: link,
  };
}
