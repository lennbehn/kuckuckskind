import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GithubOidcStackProps extends cdk.StackProps {
  /** "owner/repo" */
  repo: string;
  /**
   * Unveränderliche GitHub-IDs von Besitzer und Repo. Für Repos, die nach dem 15.07.2026
   * angelegt (oder umbenannt/übertragen) wurden, enthält der OIDC-Claim `sub` diese IDs:
   * `repo:owner@<ownerId>/name@<repoId>:environment:<env>`.
   */
  ownerId?: string;
  repoId?: string;
  /** GitHub-Environments, aus denen deployt werden darf (z. B. ["dev"] oder ["prod"]). */
  environments: string[];
  /** Vorhandenen OIDC-Provider im Konto weiterverwenden statt neu anzulegen. */
  existingProviderArn?: string;
}

/**
 * Erlaubte `sub`-Claims: je Environment das alte, namensbasierte Format und – wenn die IDs
 * bekannt sind – das neue Format mit unveränderlichen IDs (GitHub-Änderung 2026).
 */
export function githubSubjects(
  props: Pick<GithubOidcStackProps, 'repo' | 'environments' | 'ownerId' | 'repoId'>,
): string[] {
  const [owner, name] = props.repo.split('/');
  return props.environments.flatMap((env) => [
    `repo:${props.repo}:environment:${env}`,
    ...(props.ownerId && props.repoId
      ? [`repo:${owner}@${props.ownerId}/${name}@${props.repoId}:environment:${env}`]
      : []),
  ]);
}

/**
 * Einmalig pro AWS-Konto von Hand deployen. Legt die Rolle an, die GitHub Actions per
 * OIDC übernimmt. Die Rolle darf nur die CDK-Bootstrap-Rollen übernehmen – die
 * eigentlichen Rechte liegen dort (Standard-Muster von CDK).
 */
export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = props.existingProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'Github',
          props.existingProviderArn,
        )
      : new iam.OpenIdConnectProvider(this, 'Github', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'kuckuckskind-github-deploy',
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: { 'token.actions.githubusercontent.com:sub': githubSubjects(props) },
      }),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-*`],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: role.roleArn,
      description: 'In GitHub als Variable AWS_DEPLOY_ROLE_ARN eintragen',
    });
  }
}
