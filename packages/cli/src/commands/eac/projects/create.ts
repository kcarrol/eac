import {} from '@oclif/core';
import Listr from 'listr';
import {} from '@semanticjs/common';
import {
  ClosureInstruction,
  FathymCommand,
} from '../../../common/fathym-command';

export default class Create extends FathymCommand {
  static description = `Used for creating a new project.`;

  static examples = ['<%= config.bin %> <%= command.id %>'];

  static flags = {};

  static args = [];

  static title = 'Create Project';

  protected async loadInstructions(): Promise<ClosureInstruction[]> {
    return [
      {
        Instruction: 'fathym eac projects --help',
        Description: `You can now manage more about your project.`,
      },
    ];
  }

  protected async loadTasks(): Promise<Listr> {
    // const { args } = await this.parse(Create);

    return [
      {
        title: `Creating new project`,
        task: (ctx, task) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              task.title = `New project created`;

              resolve(true);
            }, 3000);
          });
        },
      },
    ];
  }
}
