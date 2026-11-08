import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GithubOidcStackProps extends cdk.StackProps {
  /** "owner/repo" */
  repo: string;
  /** GitHub-Environments, aus denen deployt werden darf (z. B. ["dev"] oder ["prod"]). */
  environments: string[];
  /** Vorhandenen OIDC-Provider im Konto weiterverwenden statt neu anzulegen. */
  existingProviderArn?: string;
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
        StringLike: {
          'token.actions.githubusercontent.com:sub': props.environments.map(
            (env) => `repo:${props.repo}:environment:${env}`,
          ),
        },
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
