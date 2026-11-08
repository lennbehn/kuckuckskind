import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { GameStack, REPO_ROOT } from '../lib/game-stack.ts';
import { GithubOidcStack } from '../lib/github-oidc-stack.ts';
import { stageConfig, type StageName } from '../lib/stage-config.ts';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'eu-central-1' };
const ctx = (key: string) => (app.node.tryGetContext(key) as string | undefined) || undefined;

const webDist = path.join(REPO_ROOT, 'web/dist');
const webDistPath = fs.existsSync(path.join(webDist, 'index.html')) ? webDist : undefined;
if (!webDistPath) {
  console.warn('Hinweis: web/dist fehlt – Frontend wird nicht hochgeladen (vorher `pnpm build`).');
}

for (const stage of ['dev', 'prod'] as StageName[]) {
  new GameStack(app, `Kuckuckskind-${stage}`, {
    env,
    config: stageConfig(stage, {
      domainName: ctx(`${stage}DomainName`),
      certificateArn: ctx(`${stage}CertificateArn`),
    }),
    webDistPath,
  });
}

// Einmalig je Konto: `pnpm cdk deploy Kuckuckskind-GithubOidc -c oidcEnvironments=dev,prod`
new GithubOidcStack(app, 'Kuckuckskind-GithubOidc', {
  env,
  repo: ctx('githubRepo') ?? 'lennbehn/kuckuckskind',
  environments: (ctx('oidcEnvironments') ?? 'dev,prod').split(','),
  existingProviderArn: ctx('existingOidcProviderArn'),
});
