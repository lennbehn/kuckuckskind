# AWS einrichten (einmalig)

Voraussetzungen: AWS-Konto(en) für dev und prod, AWS CLI mit Admin-Rechten angemeldet, Node 22, pnpm.

## 1. CDK bootstrappen (je Konto)

```bash
pnpm install
cd infra
pnpm cdk bootstrap aws://<KONTO-ID>/eu-central-1
```

## 2. Rolle für GitHub Actions anlegen (je Konto)

Gleiches Konto für dev und prod:

```bash
pnpm cdk deploy Kuckuckskind-GithubOidc -c oidcEnvironments=dev,prod
```

Getrennte Konten: im dev-Konto `-c oidcEnvironments=dev`, im prod-Konto `-c oidcEnvironments=prod`.
Gibt es im Konto schon einen GitHub-OIDC-Provider, zusätzlich
`-c existingOidcProviderArn=arn:aws:iam::<KONTO-ID>:oidc-provider/token.actions.githubusercontent.com`.

Die Ausgabe `DeployRoleArn` notieren.

## 3. GitHub einrichten

Unter _Settings → Environments_ zwei Environments anlegen: `dev` und `prod`.

Je Environment die Variablen (_Environment variables_, keine Secrets nötig):

| Variable              | Wert                                                     |
| --------------------- | -------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` aus Schritt 2                            |
| `DOMAIN_NAME`         | optional, z. B. `dev.kuckuckskind.de`                    |
| `CERTIFICATE_ARN`     | optional, ACM-Zertifikat **in us-east-1** für die Domain |

Für `prod` unter _Deployment protection rules_ „Required reviewers“ setzen.

## 4. Deploy

- Jeder Merge auf `main` deployt automatisch nach **dev**.
- **prod**: _Actions → Deploy → Run workflow → stage: prod_.

Die Spiel-Adresse steht in der Zusammenfassung des Workflow-Laufs (Ausgabe `Url`).

## 5. Eigene Domain (optional)

1. ACM-Zertifikat in **us-east-1** für die Domain anfordern (DNS-Validierung).
2. `DOMAIN_NAME` und `CERTIFICATE_ARN` im GitHub-Environment setzen, neu deployen.
3. Beim DNS-Anbieter einen CNAME von der Domain auf die CloudFront-Adresse
   (`xxxx.cloudfront.net`, siehe CloudFront-Konsole) anlegen.

## 6. Admin-Konto anlegen

Selbstregistrierung ist aus. Admins legt man von Hand an:

```bash
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true
aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username <email> --group-name admin
```

## Kosten (grob, dev)

Fargate-Task 0,25 vCPU/0,5 GB ≈ 9 €/Monat, ALB ≈ 18 €/Monat, Rest (CloudFront, S3,
DynamoDB, Secrets Manager) wenige Cent bis 1 €. Wer dev zwischen Testabenden nicht braucht:
`pnpm cdk destroy Kuckuckskind-dev -c stage=dev`.
