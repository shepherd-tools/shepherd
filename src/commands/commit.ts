import { IMigrationContext } from '../migration-context.js';
import forEachRepo from '../util/for-each-repo.js';

export default async (context: IMigrationContext, options: any) => {
  const { adapter, logger } = context;

  await forEachRepo(context, async (repo) => {
    const spinner = logger.spinner('Committing changes');
    try {
      await adapter.commitRepo(repo, options.noVerify);
      
      spinner.succeed('Changes committed');
    } catch (e: any) {
      logger.error(e);
      spinner.fail('Failed to commit changes');
    }
  });
};
