export type StageName = 'dev' | 'prod';

export interface StageConfig {
  stage: StageName;
  /** Eigene Domain (optional). Ohne Domain läuft das Spiel unter *.cloudfront.net. */
  domainName?: string;
  /** ACM-Zertifikat in us-east-1 für die Domain (Pflicht, wenn domainName gesetzt ist). */
  certificateArn?: string;
  /** Daten beim Löschen des Stacks behalten. */
  retainData: boolean;
  /** Fargate-Größe. */
  cpu: number;
  memoryMiB: number;
  logRetentionDays: number;
}

/**
 * Stufen-Einstellungen. Domain und Zertifikat kommen aus dem CDK-Kontext
 * (`-c domainName=… -c certificateArn=…`) oder aus GitHub-Variablen im Deploy.
 */
export function stageConfig(
  stage: StageName,
  ctx: { domainName?: string; certificateArn?: string },
): StageConfig {
  if (ctx.domainName && !ctx.certificateArn) {
    throw new Error('domainName braucht certificateArn (ACM-Zertifikat in us-east-1).');
  }
  const base = { stage, domainName: ctx.domainName, certificateArn: ctx.certificateArn };
  return stage === 'prod'
    ? { ...base, retainData: true, cpu: 512, memoryMiB: 1024, logRetentionDays: 90 }
    : { ...base, retainData: false, cpu: 256, memoryMiB: 512, logRetentionDays: 14 };
}
