# Tutorial

In this tutorial, we're going to build a simple Shepherd migration spec and apply it to a demo repo.

> Note: this tutorial is designed for people who like to learn by doing. If that's not how you prefer to learn, you can check out the docs on the [Readme](../README.md).

## Setting the scene

ESLint has deprecated extensionless `.eslintrc` files - they're now expected to have an extension indicating the format of the contents, like `.eslintrc.yml`. Your organization has 100s of JavaScript repositories that were created from the same repository template, and they all use YAML in extensionless `.eslintrc` files. You want to get ahead of the game and rename them in preparation for the inevitable breaking change that removes support for the old filename. You could try to convince your coworkers to do this, but they're far too busy disrupting the "Tinder for Uber for cats" industry. You could also make these changes yourself, but that would take forever and you also have better things to do with your time.

Thankfully, you just heard about this tool called Shepherd that can help you automate code changes across infinitely many repositories at once. Let's build a Shepherd migration to do all the hard work for you.

## Setting up for the tutorial

Of course, for this tutorial, you don't have access to hundreds of repositories to try Shepherd out on. So, we'll be running on this migration on only one repository. While it may seem silly to do all this work just to rename a single file in a single repository, keep in mind that once you have a migration working for one repository, it will scale efforlessly to as many repositories as your organization has.

We've set up a simple repository that you can fork for the purpose of this demo: [shepherd-demo](https://github.com/NerdWalletOSS/shepherd-demo). You should fork this repository first, but there's no need to clone it to your machine! Shepherd will take care of that for you. Note that there's no actual project in the repository, as that's not relevant to this tutorial.

Create a directory to hold files for this migration somewhere on your machine. We'll be using the directory `~/shepherd-migration`.

```sh
mkdir ~/shepherd-migration
cd ~/shepherd-migration
```

Shepherd migrations are declaratively specified in a file named `shepherd.yml`. We call this file a spec.

Create that file in the directory you just made and open it in your favorite editor.

```sh
touch shepherd.yml
```

## An aside

This tutorial goes somewhat slowly to explain a lot of core concepts. If you're like me and need instant gratification and want to see a fully-automated pull request **now**, you can scroll all the way to the bottom of this page to see the completed migration spec and the commands needed to apply it. Once that's satiated your need for immediate results, come back here and see how it all works!

## Outlining our migration spec

Let's bootstrap the file with some contents.

```yml
# shepherd.yml
id: 2018.08.15-eslintrc-yml
title: Rename all .eslintrc files to .eslintrc.yml
```

The `id` value will be used to as a unique identifier for this migration, as well as the name of the branch that Shepherd creates. The `title` will be used to build a commit message and a title for the pull request that we'll open.

## Hooking our migration up to GitHub

Shepherd isn't tied to any specific version control system; all interactions with repositories and hosted sites like GitHub and Bitbucket happen through a layer of abstraction called an adapter. You can read more about how adapters work [here](./adapters.md) if you're interested.

To tell Shepherd which adapter we want to use, we can add to our `shepherd.yml` file:

```yml
# shepherd.yml
adapter:
  type: github
```

This tells Shepherd that we should use the GitHub adapter. This will be relevant when finding repositories to operate on, cloning repositories, pushing changes, and opening pull requests.

## Finding repositories to migrate

If we wanted to be naïve, we could check out every repository you own looking for `.eslintrc` files. Thankfully, GitHub has the ability to search repos using [advanced search qualifiers](https://help.github.com/articles/searching-code/). You can write a search query to identify repositories that are candidates for migrations. If a repository contains a file matching the search, it will be checked out as a candidate for a migration.

```yml
# shepherd.yml
adapter:
  type: github
  search_query: org:NerdWalletOSS path:/ filename:.eslintrc
```

This search query will be used to identify any repositories in the `NerdWalletOSS` GitHub organization that contain a `.eslintrc` file in the repository root.

For the purpose of this demo, we'll change the search query to only match your forked demo repo to avoid modifying any of your own repositories that might actually have a `.eslintrc` file in them.

**Note:** you should change `YOURUSERNAME` to your own username if you've cloned our demo repository.

```yml
#shepherd.yml
adapter:
  type: github
  search_query: repo:YOURUSERNAME/shepherd-demo path:/ filename:.eslintrc
```

**Note:** you can provide an `org` instead of `search_query`. GitHub code search can be unreliable. Using `org` will return a list of every visible repo in a GitHub organization, allowing you to match more confidently.

```yml
#shepherd.yml
adapter:
  type: github
  org: YOURORGANIZATION
```

**Note:** while for purposes of this tutorial, searching codebases for a file is exactly what we want, other use cases may call for different types of searching, which Github supports. In addition to searching code, shepherd also allows you to do a search of repository metadata. For example, if your repo had an associated 'eslint-repo' topic:

```yml
#shepherd.yml
adapter:
  type: github
  search_type: repository
  search_query: topic:eslint-repo
```

## Filtering repositories

GitHub's search is still relatively limited. For instance, it doesn't let you determine which version of a dependency a repository uses. To perform additional checks, Shepherd lets you define commands that Shepherd will run to determine if a checked-out repository should be migrated.

For our demo, let's add a simple sanity check to ensure that the checked out repositories all contain a `.eslintrc` file.

```yml
# shepherd.yml
hooks:
  should_migrate:
    - ls .eslintrc
```

If the file does not exist, `ls` will exit with a non-zero exit code, which signals Shepherd that this check failed and that the repository should not be migrated.

This will be largely redundant, since we're already doing this check with the GitHub query. To demonstrate the power of these hooks, we could add a hook to filter out any repositories that haven't been committed to in the current year (2018, at the time of writing). In a large organization, this can help prevent noise on old repositories that might not be actively developed anymore.

```yml
# You don't actually need to add this to your shepherd.yml, this is just an example!
hooks:
  should_migrate:
    - git log -1 --format=%cd | grep 2018 --silent
```

This prints the date of the last commit and then checks that it contains the string `2018` in it. If it doesn't, `grep` will exit with a non-zero exit code, failing the check.

## Checking out candidate repositories

Your `shepherd.yml` should now look like this:

```yml
# shepherd.yml
id: 2018.08.15-eslintrc-yml
title: Rename all .eslintrc files to .eslintrc.yml
adapter:
  type: github
  search_query: repo:YOURUSERNAME/shepherd-demo path:/ filename:.eslintrc
hooks:
  should_migrate:
    - ls .eslintrc
```

We're finally ready to start checking our the repositories! Make sure you've followed the installation instructions on the README, and then run the following command.

```sh
shepherd checkout ~/shepherd-demo
```

Shepherd will look for a `shepherd.yml` file in the provided directory and then check out repositories based on the spec in that file. After this command completes, you should see output similar to the following:

```text
✔ Loaded 1 repos

[nwalters512/shepherd-demo] 1/1
✔ Checked out repo
> Running should_migrate steps
$ ls .eslintrc
.eslintrc
Step "ls .eslintrc" exited with 0
✔ Completed all should_migrate steps successfully
> Running post_checkout steps
✔ Completed all post_checkout steps successfully

Checked out 1 out of 1 repos
```

Woot! Your repository has been checked out to your machine and passed the `should_migrate` checks you defined.

Note that Shepherd doesn't do anything magic with repositories. They're checked out to `~/.shepherd/2018.08.15-eslintrc-yml/repos`, and you can always poke around in the repositories as you're developing migrations to check that they're working, manually run tests, etc.

## Defining the migration steps

Now that you've got your repositories checked out, we can define what the migration actually does (rename `.eslintrc` to `.eslintrc.yml`):

```yml
hooks:
  apply:
    - mv .eslintrc .eslintrc.yml
```

That's it! Not too bad, right?

## Applying the migration

Run the following command to apply the migration to all checked out repositories:

```sh
shepherd apply ~/shepherd-migration
```

## Committing the changes from the migration

Run the following command to commit all the changes to their respective repositories:

```sh
shepherd commit ~/shepherd-migration
```

This will commit the changes with a message derived from the migration spec title:

```sh
[shepherd] Rename all .eslintrc files to .eslintrc.yml
```

## Pushing the changes to the remote branch

Run the following command to push all the remote branches up to GitHub:

```sh
shepherd push ~/shepherd-migration
```

You should now see your branch in the repository if you visit GitHub.

## Opening a pull request

We're almost done! Our last step is to open a pull request with these changes. To do that, we'll need to teach Shepherd how to generate a message for the pull request. A special `pr_message` hook is available for this purpose. It will execute all the specified commands and concatenate their standard output together to form a message. Add the following to your `hooks`:

```yml
# shepherd.yml
hooks:
  pr_message:
    - echo 'Hey! This PR renames `.eslintrc` to `.eslintrc.yml`'
```

You can now open a pull request for your repos:

```sh
shepherd pr ~/shepherd-migration
```

If you visit your repository, you should see that Shepherd opened a pull request for you!

## From start to finish

Congrats! You just applied an automated Shepherd migration to a repo! While this may seem trivial for just a single repo, it scales efforlessly to as many repos as you need. You can also perform significantly more complex tasks than just renaming a file. If you can automate your changes with any tool in any language, you can apply it across all your repos with Shepherd.

Here's our finished migration spec:

```yml
# shepherd.yml
id: 2018.08.15-eslintrc-yml
title: Rename all .eslintrc files to .eslintrc.yml
adapter:
  type: github
  search_query: repo:YOURUSERNAME/shepherd-demo path:/ filename:.eslintrc
hooks:
  should_migrate:
    - ls .eslintrc
  apply:
    - mv .eslintrc .eslintrc.yml
  pr_message:
    - echo 'Hey! This PR renames `.eslintrc` to `.eslintrc.yml`'
```

And here are all the commands we used to apply this migration:

```sh
shepherd checkout ~/shepherd-migration
shepherd apply ~/shepherd-migration
shepherd commit ~/shepherd-migration
shepherd push ~/shepherd-migration
shepherd pr ~/shepherd-migration
```

## Alternative: AI-Powered Migrations

For complex migrations that are difficult to express as shell scripts, Shepherd also supports AI-powered migrations. Instead of writing `apply` hooks, you describe the changes you want in natural language:

```yaml
# shepherd.yml
id: 2024.01.15-eslint-config-upgrade
title: Upgrade ESLint configuration
adapter:
  type: github
  search_query: repo:YOURUSERNAME/shepherd-demo path:/ filename:.eslintrc
provider: claude
```

Then apply the migration with a natural language prompt:

```sh
shepherd checkout ~/shepherd-migration
shepherd ai ~/shepherd-migration "rename .eslintrc to .eslintrc.yml and ensure the file format is valid YAML"
shepherd commit ~/shepherd-migration
shepherd push ~/shepherd-migration
shepherd pr ~/shepherd-migration
```

AI migrations are particularly useful for:

- Complex refactoring (e.g., "convert all callback functions to async/await")
- Dependency upgrades with breaking changes (e.g., "upgrade React from v17 to v18")
- Code modernization (e.g., "add TypeScript types to all functions")

Learn more in the [AI Migrations documentation](./ai-migrations.md).
