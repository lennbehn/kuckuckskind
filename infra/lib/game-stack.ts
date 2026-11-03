import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { StageConfig } from './stage-config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../..');

export interface GameStackProps extends cdk.StackProps {
  config: StageConfig;
  /** Pfad zum gebauten Frontend (web/dist). Fehlt er, wird kein Frontend hochgeladen. */
  webDistPath?: string;
  /** Container-Image; Standard: server/Dockerfile aus dem Repo bauen. */
  serverImage?: ecs.ContainerImage;
}

const ORIGIN_VERIFY_HEADER = 'x-kuckuck-origin-verify';

/**
 * Alles für eine Stufe (dev/prod):
 *
 *   Handy ──HTTPS──▶ CloudFront ──▶ S3            (Frontend, PWA)
 *                         │
 *                         └─ /ws, /api/*, /healthz ──HTTP──▶ ALB ──▶ Fargate (Spielserver)
 *                                                                       │
 *                                                       DynamoDB (Räume, Presets)
 *   Cognito: nur Admin-Konten.
 *
 * Der ALB nimmt nur Anfragen mit geheimem Header von CloudFront an. So gibt es eine
 * einzige HTTPS-Adresse (auch ohne eigene Domain) für Seite und WebSocket.
 */
export class GameStack extends cdk.Stack {
  readonly distribution: cloudfront.Distribution;
  readonly roomsTable: dynamodb.Table;
  readonly presetsTable: dynamodb.Table;
  readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: GameStackProps) {
    super(scope, id, props);
    const { config } = props;
    const removalPolicy = config.retainData ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    cdk.Tags.of(this).add('project', 'kuckuckskind');
    cdk.Tags.of(this).add('stage', config.stage);

    // --- Daten -------------------------------------------------------------

    /** Snapshots laufender Räume (zum Wiederherstellen nach Neustart); laufen per TTL ab. */
    this.roomsTable = new dynamodb.Table(this, 'Rooms', {
      partitionKey: { name: 'roomCode', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy,
    });

    /** Versionierte Parameter-Presets für den Admin-Bereich. */
    this.presetsTable = new dynamodb.Table(this, 'Presets', {
      partitionKey: { name: 'presetId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'version', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: config.retainData },
      removalPolicy,
    });

    // --- Admin-Login ---------------------------------------------------------

    this.userPool = new cognito.UserPool(this, 'AdminUsers', {
      userPoolName: `kuckuckskind-admins-${config.stage}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 12 },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      removalPolicy,
    });
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
    });
    const adminClient = this.userPool.addClient('AdminWebClient', {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(8),
      idTokenValidity: cdk.Duration.hours(8),
    });

    // --- Netz & Spielserver ------------------------------------------------

    // Öffentliche Subnetze ohne NAT-Gateway: günstig, Tasks bekommen eine öffentliche IP.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'ServerTask', {
      cpu: config.cpu,
      memoryLimitMiB: config.memoryMiB,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const image =
      props.serverImage ??
      ecs.ContainerImage.fromAsset(REPO_ROOT, {
        file: 'server/Dockerfile',
        platform: ecrAssets.Platform.LINUX_AMD64,
      });

    const container = taskDef.addContainer('server', {
      image,
      // Zeit, um beim Herunterfahren die Raum-Snapshots zu schreiben.
      stopTimeout: cdk.Duration.seconds(20),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        PORT: '8080',
        STAGE: config.stage,
        ROOMS_TABLE: this.roomsTable.tableName,
        PRESETS_TABLE: this.presetsTable.tableName,
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        COGNITO_CLIENT_ID: adminClient.userPoolClientId,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'server',
        logGroup: new logs.LogGroup(this, 'ServerLogs', {
          retention: config.logRetentionDays as logs.RetentionDays,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
    });
    this.roomsTable.grantReadWriteData(taskDef.taskRole);
    this.presetsTable.grantReadWriteData(taskDef.taskRole);

    const albSg = new ec2.SecurityGroup(this, 'AlbSg', { vpc, allowAllOutbound: true });
    albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'nur mit CloudFront-Header weitergeleitet',
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      // WebSocket-Verbindungen leben eine ganze Partie lang.
      idleTimeout: cdk.Duration.seconds(3600),
    });

    const serviceSg = new ec2.SecurityGroup(this, 'ServiceSg', { vpc, allowAllOutbound: true });
    serviceSg.connections.allowFrom(albSg, ec2.Port.tcp(8080), 'nur vom ALB');

    // Räume liegen im Speicher eines Tasks → genau ein Task (siehe ADR-0001).
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [serviceSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    const originSecret = new secretsmanager.Secret(this, 'OriginVerifySecret', {
      description: 'Geheimer Header zwischen CloudFront und ALB',
      generateSecretString: { excludePunctuation: true, passwordLength: 40 },
    });
    const originSecretValue = originSecret.secretValue.unsafeUnwrap();

    const listener = alb.addListener('Http', {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Forbidden',
      }),
    });
    listener.addTargets('Server', {
      priority: 10,
      conditions: [elbv2.ListenerCondition.httpHeader(ORIGIN_VERIFY_HEADER, [originSecretValue])],
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [
        service.loadBalancerTarget({ containerName: container.containerName, containerPort: 8080 }),
      ],
      healthCheck: {
        path: '/healthz',
        interval: cdk.Duration.seconds(15),
        healthyThresholdCount: 2,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // --- Frontend & CloudFront -----------------------------------------------

    const siteBucket = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Single-Page-App: Pfade ohne Dateiendung liefern index.html (nur fürs Frontend).
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        `function handler(event) {
  var r = event.request;
  if (!r.uri.includes('.')) r.uri = '/index.html';
  return r;
}`,
      ),
    });

    const serverOrigin = new origins.HttpOrigin(alb.loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      customHeaders: { [ORIGIN_VERIFY_HEADER]: originSecretValue },
      readTimeout: cdk.Duration.seconds(60),
      keepaliveTimeout: cdk.Duration.seconds(60),
    });
    const serverBehavior: cloudfront.BehaviorOptions = {
      origin: serverOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
    };

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'microphone=(self), accelerometer=(self), gyroscope=(self), camera=()',
            override: true,
          },
        ],
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: `Kuckuckskind ${config.stage}`,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      domainNames: config.domainName ? [config.domainName] : undefined,
      certificate: config.certificateArn
        ? acm.Certificate.fromCertificateArn(this, 'Cert', config.certificateArn)
        : undefined,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/ws': serverBehavior,
        '/api/*': serverBehavior,
        '/healthz': serverBehavior,
      },
    });

    const publicUrl = `https://${config.domainName ?? this.distribution.distributionDomainName}`;
    container.addEnvironment('ALLOWED_ORIGINS', publicUrl);

    if (props.webDistPath) {
      new s3deploy.BucketDeployment(this, 'DeploySite', {
        destinationBucket: siteBucket,
        sources: [
          s3deploy.Source.asset(props.webDistPath),
          // Laufzeit-Konfiguration fürs Frontend (Admin-Login).
          s3deploy.Source.jsonData('runtime-config.json', {
            stage: config.stage,
            cognito: {
              region: this.region,
              userPoolId: this.userPool.userPoolId,
              clientId: adminClient.userPoolClientId,
            },
          }),
        ],
        distribution: this.distribution,
        distributionPaths: ['/*'],
        memoryLimit: 512,
      });
    }

    new cdk.CfnOutput(this, 'Url', { value: publicUrl, description: 'Adresse des Spiels' });
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: adminClient.userPoolClientId });
    new cdk.CfnOutput(this, 'RoomsTableName', { value: this.roomsTable.tableName });
    new cdk.CfnOutput(this, 'PresetsTableName', { value: this.presetsTable.tableName });
  }
}
