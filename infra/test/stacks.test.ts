import { describe, expect, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { GameStack } from '../lib/game-stack.ts';
import { GithubOidcStack, githubSubjects } from '../lib/github-oidc-stack.ts';
import { stageConfig } from '../lib/stage-config.ts';

const env = { account: '123456789012', region: 'eu-central-1' };

function gameTemplate(stage: 'dev' | 'prod' = 'dev') {
  const app = new cdk.App();
  const stack = new GameStack(app, `Test-${stage}`, {
    env,
    config: stageConfig(stage, {}),
    serverImage: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:22-alpine'),
  });
  return Template.fromStack(stack);
}

describe('GameStack', () => {
  const t = gameTemplate();

  it('hat Tabellen für Räume (mit TTL) und Presets', () => {
    t.resourceCountIs('AWS::DynamoDB::Table', 2);
    t.hasResourceProperties('AWS::DynamoDB::Table', {
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
    t.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'presetId', KeyType: 'HASH' },
        { AttributeName: 'version', KeyType: 'RANGE' },
      ],
    });
  });

  it('erlaubt keine Selbstregistrierung im Admin-Login', () => {
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  it('hält WebSocket-Verbindungen am ALB lange offen', () => {
    t.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([
        { Key: 'idle_timeout.timeout_seconds', Value: '3600' },
      ]),
    });
  });

  it('leitet am ALB nur mit geheimem CloudFront-Header weiter', () => {
    t.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: [Match.objectLike({ Type: 'fixed-response' })],
    });
    t.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: [Match.objectLike({ Field: 'http-header' })],
    });
  });

  it('läuft mit genau einem Server-Task', () => {
    t.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 1, LaunchType: 'FARGATE' });
  });

  it('leitet /ws, /api/* und /healthz über CloudFront an den Server', () => {
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: '/ws' }),
          Match.objectLike({ PathPattern: '/api/*' }),
          Match.objectLike({ PathPattern: '/healthz' }),
        ]),
      }),
    });
  });

  it('behält in prod die Daten', () => {
    gameTemplate('prod').hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
  });
});

describe('GithubOidcStack', () => {
  it('erlaubt nur das eigene Repo und Environment', () => {
    const app = new cdk.App();
    const stack = new GithubOidcStack(app, 'Oidc', {
      env,
      repo: 'lennbehn/kuckuckskind',
      environments: ['dev'],
    });
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  'repo:lennbehn/kuckuckskind:environment:dev',
                ],
              },
            }),
          }),
        ],
      }),
    });
  });
});

describe('GitHub-OIDC-Claims', () => {
  it('akzeptiert altes und neues Format (mit unveränderlichen IDs)', () => {
    expect(
      githubSubjects({
        repo: 'lennbehn/kuckuckskind',
        environments: ['dev', 'prod'],
        ownerId: '194357753',
        repoId: '1443920140',
      }),
    ).toEqual([
      'repo:lennbehn/kuckuckskind:environment:dev',
      'repo:lennbehn@194357753/kuckuckskind@1443920140:environment:dev',
      'repo:lennbehn/kuckuckskind:environment:prod',
      'repo:lennbehn@194357753/kuckuckskind@1443920140:environment:prod',
    ]);
  });

  it('ohne IDs nur das alte Format', () => {
    expect(githubSubjects({ repo: 'a/b', environments: ['dev'] })).toEqual([
      'repo:a/b:environment:dev',
    ]);
  });

  it('landet so in der Vertrauensregel der Rolle', () => {
    const app = new cdk.App();
    const stack = new GithubOidcStack(app, 'OidcIds', {
      env,
      repo: 'lennbehn/kuckuckskind',
      environments: ['dev'],
      ownerId: '194357753',
      repoId: '1443920140',
    });
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  'repo:lennbehn/kuckuckskind:environment:dev',
                  'repo:lennbehn@194357753/kuckuckskind@1443920140:environment:dev',
                ],
              },
            }),
          }),
        ],
      }),
    });
  });
});

describe('stageConfig', () => {
  it('verlangt ein Zertifikat zur Domain', () => {
    expect(() => stageConfig('dev', { domainName: 'spiel.example' })).toThrow();
  });
});
