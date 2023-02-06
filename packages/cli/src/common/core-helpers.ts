import { color } from '@oclif/color';
import express from 'express';
import oauth2 from 'simple-oauth2';
// import keytar from 'keytar';
import { ListrTask, PromptOptions } from 'listr2';
import { withConfig } from './config-helpers';
import { ClosureInstruction } from './ClosureInstruction';
import path from 'node:path';
import { readFile, existsSync, readJson, readdir } from 'fs-extra';
import loadAxios from './axios';
import { EnterpriseAsCode } from '@semanticjs/common';
import { runProc } from './task-helpers';
import { downloadFile } from './eac-services';
// import { EnterpriseAsCode } from '@semanticjs/common';

const tenant = 'fathymcloudprd';
const clientId = '800193b8-028a-44dd-ba05-73e82ee8066a';
const policy = 'b2c_1_sign_up_sign_in';
const redirectUri = 'http://localhost:8119/oauth';
const scope = `openid offline_access ${clientId}`;

export interface FathymTaskContext extends AccessTokenTaskContext {
  Fathym: {
    Instructions: ClosureInstruction[];

    Lookups: { name: string; lookups: string[] } | undefined;

    Result: string;
  };
}

export interface AccessTokenTaskContext {
  AccessToken?: oauth2.AccessToken;
}

export interface EaCTaskContext {
  EaC: EnterpriseAsCode;
}

export interface EaCRemovalsTaskContext {
  EaCRemovals: EnterpriseAsCode;
}

export interface ProjectTaskContext {
  ProjectLookup: string;
}

export interface ActiveEnterpriseTaskContext {
  ActiveEnterpriseLookup: string;
}

export interface AzureCLITaskContext {
  AzureCLIInstalled: boolean;
}

export interface SubscriptionTaskContext {
  SubscriptionID: string;

  SubscriptionName: string;

  TenantID: string;
}

export interface AzureSubscription {
  id: string;

  name: string;

  tenantId: string;
}

export class SystemConfig {
  public APIRoot!: string;
}

export class UserAuthConfig {
  public AccessToken?: oauth2.AccessToken;

  public ActiveEnterpriseLookup!: string;
}

const oauthCodeClient = new oauth2.AuthorizationCode({
  client: {
    id: clientId,
    secret: '',
  } as any,
  auth: {
    tokenHost: `https://auth.fathym.com`,
    tokenPath: `/${tenant}.onmicrosoft.com/${policy}/oauth2/v2.0/token`,
    authorizePath: `/${tenant}.onmicrosoft.com/${policy}/oauth2/v2.0/authorize`,
  },
});

export function azureCliInstallTask<TContext>(): ListrTask<
  TContext & AzureCLITaskContext
> {
  return {
    title: `Checking Azure CLI is installed`,
    task: async (ctx, task) => {
      try {
        await runProc('az', []);

        ctx.AzureCLIInstalled = true;
      } catch {
        task.title = 'Installing Azure CLI';

        task.output = 'Downloading the Azure CLI installer';

        await downloadFile(
          'https://aka.ms/installazurecliwindows',
          'azure-cli.msi'
        );

        task.output =
          'Laucnhing the Azure CLI installer.  Completing in the background.';

        // TODO: Cross platform support for msiexec

        await runProc('msiexec', ['/q', '/i', 'azure-cli.msi']);

        await runProc('refreshenv', []);

        task.title = 'Azure CLI was successfully installed';

        ctx.AzureCLIInstalled = true;
      }
    },
  };
}

export function setAzureSubTask<
  TContext extends SubscriptionTaskContext &
    AzureCLITaskContext &
    ActiveEnterpriseTaskContext
>(configDir: string): ListrTask<TContext> {
  return {
    title: `Setting Azure Subscription`,
    skip: (ctx) => !ctx.AzureCLIInstalled,
    task: (ctx, task) => {
      return task.newListr((parent) => [
        {
          title: 'Ensure login with Azure CLI',
          task: async (ctx, task) => {
            try {
              await runProc('az', ['account', 'show']);

              task.title = 'Azure CLI already authenticated';
            } catch {
              task.output = color.yellow(
                'Opening a login form in your browser, complete sign in there, then return.'
              );

              await runProc('az', ['login']);
            }
          },
        },
        {
          title: 'Select Azure Subscription',
          task: async (ctx, task) => {
            const subsList: AzureSubscription[] = JSON.parse(
              (await runProc('az', ['account', 'list'])) || '[]'
            );

            subsList.unshift({
              id: '',
              name: '-- Create New Subscription --',
              tenantId: '',
            });

            ctx.SubscriptionID = (
              await task.prompt({
                type: 'Select',
                name: 'subId',
                message: 'Choose Azure subscription:',
                choices: subsList.map((account) => {
                  return {
                    message: `${account.name} (${color.blueBright(
                      account.id
                    )})`,
                    name: account.id,
                  };
                }),
                validate: (v) => Boolean(v),
              } as PromptOptions<true>)
            ).trim();

            if (ctx.SubscriptionID) {
              const sub = subsList.find((al) => al.id === ctx.SubscriptionID);

              ctx.TenantID = sub?.tenantId || '';

              ctx.SubscriptionName = sub?.name || ctx.SubscriptionID;

              task.title = `Azure subscription selected: ${ctx.SubscriptionName}`;
            } else {
              task.title = `Creating azure subscription`;

              ctx.SubscriptionName = (
                await task.prompt({
                  type: 'Select',
                  name: 'subId',
                  message: 'Azure subscription name:',
                  choices: subsList.map((account) => {
                    return {
                      message: `${account.name} (${color.blueBright(
                        account.id
                      )})`,
                      name: account.id,
                    };
                  }),
                } as PromptOptions<true>)
              ).trim();

              task.title = `Creating azure subscription: ${ctx.SubscriptionName}`;

              const sub = await createAzureSubscription(
                configDir,
                ctx.ActiveEnterpriseLookup,
                ctx.SubscriptionName
              );

              ctx.SubscriptionID = sub.id;

              ctx.SubscriptionName = sub.name;

              ctx.TenantID = sub.tenantId;
            }

            await runProc('az', [
              'account',
              'set',
              `--subscription ${ctx.SubscriptionID}`,
            ]);

            parent.title = `Azure subscription set: ${ctx.SubscriptionName}`;
          },
        },
      ]);
    },
  };
}

export async function createAzureSubscription(
  configDir: string,
  entLookup: string,
  subName: string
): Promise<AzureSubscription> {
  const axios = await loadAxios(configDir);

  const response = await axios.post(`${entLookup}/subscriptions`, {
    Name: subName,
  });

  return response.data.Model as AzureSubscription;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function ensureActiveEnterprise<
  TContext extends ActiveEnterpriseTaskContext
>(configDir: string): ListrTask<TContext> {
  return {
    title: `Ensuring active enterprise`,
    task: async (ctx, task) => {
      ctx.ActiveEnterpriseLookup = await loadActieEnterpriseLookup(configDir);

      if (ctx.ActiveEnterpriseLookup) {
        task.title = `Active enterprise is currently set to ${ctx.ActiveEnterpriseLookup}`;
      } else {
        throw new Error(
          `Active enterprise must be set with 'fathym enterprises set' command.`
        );
      }
    },
  };
}

export function ensureProject<
  TContext extends ProjectTaskContext & EaCTaskContext
>(project?: string, create: boolean = true): ListrTask<TContext> {
  return {
    title: `Ensuring project set`,
    task: async (ctx, task) => {
      if (!project) {
        const projects = Object.keys(ctx.EaC?.Projects || {}) || [];

        projects.push('');

        project = (
          await task.prompt({
            type: 'Select',
            // type: 'Input',
            name: 'project',
            message: 'Choose EaC Project:',
            choices: projects.map((proj) => {
              return {
                message: `${
                  ctx.EaC?.Projects![proj]?.Project?.Name || '-Create new-'
                }`, //  (${color.blueBright(proj)})
                name: proj,
              };
            }),
            validate: (v) => create || Boolean(v),
          } as PromptOptions<true>)
        ).trim();
      }

      project = project === '-Create new-' ? '' : project;

      ctx.ProjectLookup = project || '';

      task.title = `Selected project is ${
        ctx.EaC.Projects![ctx.ProjectLookup]?.Project?.Name ||
        'Creating New Project'
      }`; //  (${ctx.ProjectLookup})
    },
  };
}

export async function getAccessToken(
  configDir: string,
  authCode: string
): Promise<void> {
  const tokenConfig = {
    redirect_uri: redirectUri,
    scope: scope,
    code: authCode,
  };

  const accessToken = await oauthCodeClient.getToken(tokenConfig);

  await withUserAuthConfig(configDir, async (cfg) => {
    cfg.AccessToken = accessToken;

    return cfg;
  });
}

export async function getAuthorizationCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    // start an express server that listens for the authorization response
    const app = express();

    app.get('/oauth', (req, res) => {
      // store the authorization code in the Listr context
      const authorizationCode = req.query.code;

      if (authorizationCode) {
        // close the express server
        res.send('Authorization successful! You can close this window now.');

        // resolve the promise with the authorization code
        resolve(authorizationCode as string);
      } else {
        reject(new Error(`Invalid authorization code`));

        res.send('Authorization invalid! You can close this window now.');
      }

      server.close();
    });

    const server = app.listen(8119);
  });
}

export async function getAuthorizationUrl(state?: any): Promise<any> {
  const authorizationUri = oauthCodeClient.authorizeURL({
    redirect_uri: redirectUri,
    scope: scope,
    client_id: clientId,
    state: state,
  });

  return authorizationUri;
}

export async function loadAccessToken(
  configDir: string
): Promise<oauth2.AccessToken | undefined> {
  const config = await withUserAuthConfig(configDir);

  return config.AccessToken
    ? oauthCodeClient.createToken(config.AccessToken)
    : undefined;
}

export async function loadActieEnterpriseLookup(
  configDir: string
): Promise<string> {
  const { ActiveEnterpriseLookup } = await withUserAuthConfig(configDir);

  return ActiveEnterpriseLookup;
}

export async function loadApiRootUrl(configDir: string): Promise<string> {
  const config = await withSystemConfig(configDir);

  return config.APIRoot;
}

export async function loadEaC(
  configDir: string,
  entLookup: string
): Promise<EnterpriseAsCode> {
  const axios = await loadAxios(configDir);

  const response = await axios.get(`${entLookup}/eac`);

  return response.data?.Model || [];
}

export function loadEaCTask<
  TContext extends EaCTaskContext & ActiveEnterpriseTaskContext
>(configDir: string): ListrTask<TContext> {
  return {
    title: `Load EaC for active enterprise`,
    task: async (ctx, task) => {
      ctx.EaC = await loadEaC(configDir, ctx.ActiveEnterpriseLookup);
    },
  };
}

export async function loadChildDirectories(
  directory: string,
  checkPath: string
): Promise<string[]> {
  const dirPath = path.join(directory, checkPath);

  const entries = await readdir(dirPath, { withFileTypes: true });

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  return dirs;
}

export async function loadFileAsJson<T>(
  directory: string,
  filename: string
): Promise<T> {
  const filePath = path.join(directory, filename);

  const json = existsSync(filePath) ? await readJson(filePath) : {};

  return json as T;
}

export async function loadFileAsString(
  directory: string,
  filename: string
): Promise<string> {
  const filePath = path.join(directory, filename);

  const str = existsSync(filePath) ? await readFile(filePath) : '';

  return String(str);
}

export async function processAsyncArray<T>(
  vals: T[],
  process: (val: T) => Promise<void>
): Promise<void> {
  const val: T = vals?.shift()!;

  if (val) {
    await process(val);

    if (vals?.length > 0) {
      await processAsyncArray(vals, process);
    }
  }
}

export async function refreshAccessTokenTask<
  TContext extends AccessTokenTaskContext
>(configDir: string, refreshWindow = 300): Promise<ListrTask<TContext>> {
  return {
    title: `Refreshing access token`,
    task: async (ctx) => {
      ctx.AccessToken = await loadAccessToken(configDir);

      if (!ctx.AccessToken) {
        throw new Error(
          `Access token is required, use 'fathym auth' command to sign in.`
        );
      } else if (ctx.AccessToken.expired(refreshWindow)) {
        ctx.AccessToken = await refreshAccessToken(configDir, ctx.AccessToken);
      }
    },
  };
}

export async function refreshAccessToken(
  configDir: string,
  accessToken: oauth2.AccessToken
): Promise<oauth2.AccessToken> {
  accessToken = await accessToken.refresh({ scope: scope });

  await withUserAuthConfig(configDir, async (cfg) => {
    cfg.AccessToken = accessToken;

    return cfg;
  });

  return accessToken;
}

export async function setApiRoot(
  configDir: string,
  env: 'prod' | 'local'
): Promise<void> {
  await withSystemConfig(configDir, async (cfg) => {
    if (env === 'prod') {
      cfg.APIRoot = `https://fcp-cli-stateflow.azurewebsites.net/api`;
    } else if (env === 'local') {
      cfg.APIRoot = `http://127.0.0.1:7119/api`;
    }

    return cfg;
  });
}

export async function withSystemConfig(
  configDir: string,
  action?: (config: SystemConfig) => Promise<SystemConfig>
): Promise<SystemConfig> {
  return withConfig<SystemConfig>('lcu.system.json', configDir, async (cfg) => {
    if (!cfg.APIRoot) {
      cfg.APIRoot = `https://fcp-cli-stateflow.azurewebsites.net/api`;
    }

    if (action) {
      cfg = await action(cfg);
    }

    return cfg;
  });
}

export async function withUserAuthConfig(
  configDir: string,
  action?: (config: UserAuthConfig) => Promise<UserAuthConfig>
): Promise<UserAuthConfig> {
  return withConfig<UserAuthConfig>('user-auth.config.json', configDir, action);
}
