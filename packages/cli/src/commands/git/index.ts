import { Args, Flags } from '@oclif/core';
import { ListrTask } from 'listr2';

import { FathymCommand } from '../../common/fathym-command';
import { ClosureInstruction } from '../../common/ClosureInstruction';
import {
  commitGitChanges,
  confirmGitRepo,
  fetchChange,
  fetchPrune,
  mergeIntegration,
  pull,
  pushOrigin,
  rebaseIntegration,
} from '../../common/git-tasks';

export default class Commit extends FathymCommand<any> {
  static description = `Used for committing changes to the current working branch and syncing with integration.`;

  static examples = [
    '<%= config.bin %> <%= command.id %> "Commit messag here"',
  ];

  static flags = {
    rebase: Flags.boolean({
      char: 'r',
      description: 'When specified does a rebase instead of a merge.',
    }),
  };

  static args = {
    message: Args.string({
      description: 'The commit message.',
    }),
  };

  static title = 'Git Commit';

  protected async loadTasks(): Promise<ListrTask<any>[]> {
    const { args, flags } = await this.parse(Commit);

    const { ci, rebase } = flags;

    const { message } = args;

    return [
      confirmGitRepo(),
      commitGitChanges(message),
      fetchChange(),
      rebase ? rebaseIntegration() : mergeIntegration(),
      pull(),
      pushOrigin(),
      fetchPrune(),
    ];
  }
}
