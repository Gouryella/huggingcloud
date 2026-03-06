export const GITHUB_REPO = 'gouryella/huggingcloud';

export function getGitHubRepoHref(repo = GITHUB_REPO): string {
  return `https://github.com/${repo}`;
}
