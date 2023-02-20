import { Args } from '@oclif/core';
import open from 'open';
import { ListrTask } from 'listr2';
import { FathymCommand } from '../../../common/fathym-command';
import { FathymTaskContext } from '../../../common/core-helpers';
import {
  EaCTaskContext,
  ActiveEnterpriseTaskContext,
  ProjectTaskContext,
  ensureActiveEnterpriseTask,
  loadEaCTask,
  ensureProjectTask,
} from '../../../common/eac-services';

interface PreivewContext
  extends FathymTaskContext,
    EaCTaskContext,
    ActiveEnterpriseTaskContext,
    ProjectTaskContext {}

export default class Preview extends FathymCommand<PreivewContext> {
  static description = `Used for preivewing a project.`;

  static examples = ['<%= config.bin %> <%= command.id %>'];

  static flags = {};

  static args = {
    projectLookup: Args.string({
      description: 'The project lookup to preview.',
    }),
  };

  static title = 'List Projects';

  protected async loadTasks(): Promise<ListrTask<PreivewContext>[]> {
    const { args } = await this.parse(Preview);

    const { projectLookup } = args;

    return [
      ensureActiveEnterpriseTask(this.config.configDir) as ListrTask,
      loadEaCTask(this.config.configDir),
      ensureProjectTask(this.config.configDir, projectLookup),
      {
        title: `Open project preview`,
        task: async (ctx, task) => {
          const project = ctx.EaC.Projects![ctx.ProjectLookup];

          const host = project.PrimaryHost;

          const previewUrl = `https://${host}/`;

          open(previewUrl);

          task.output = previewUrl;
        },
        options: { persistentOutput: true },
      },
    ];
  }
}
