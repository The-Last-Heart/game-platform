/**
 * Pure Docker Compose command resolution (testable, no shell evaluation).
 */

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(bin: string) => boolean} options.dockerWorks
 * @param {(path: string) => boolean} options.pathExists
 * @param {() => boolean} [options.detectWsl]
 * @returns {{ executable: string, prefixArgs: string[], source: string }}
 */
export function resolveComposeInvocation(options) {
  const env = options.env ?? process.env;
  const { dockerWorks, pathExists } = options;
  const detectWsl =
    options.detectWsl ??
    (() =>
      Boolean(env.WSL_DISTRO_NAME) ||
      pathExists('/proc/sys/fs/binfmt_misc/WSLInterop'));

  const exeOverride = env.LH_DOCKER_EXE?.trim();
  if (exeOverride) {
    if (!pathExists(exeOverride)) {
      throw new Error(
        'LH_DOCKER_EXE points to a missing executable (path not echoed for safety; check the variable)',
      );
    }
    if (!dockerWorks(exeOverride)) {
      throw new Error(
        'LH_DOCKER_EXE is set but the executable did not respond to `version` successfully',
      );
    }
    return {
      executable: exeOverride,
      prefixArgs: ['compose'],
      source: 'LH_DOCKER_EXE',
    };
  }

  // Optional unambiguous JSON argv array, e.g. ["docker","compose"] or
  // ["/mnt/c/Program Files/.../docker.exe","compose"].
  const argvJson = env.LH_DOCKER_COMPOSE_ARGV?.trim();
  if (argvJson) {
    let parsed;
    try {
      parsed = JSON.parse(argvJson);
    } catch {
      throw new Error(
        'LH_DOCKER_COMPOSE_ARGV must be a JSON array of argv strings',
      );
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((part) => typeof part === 'string' && part.length > 0)
    ) {
      throw new Error(
        'LH_DOCKER_COMPOSE_ARGV must be a non-empty JSON array of strings',
      );
    }
    return {
      executable: parsed[0],
      prefixArgs: parsed.slice(1),
      source: 'LH_DOCKER_COMPOSE_ARGV',
    };
  }

  if (dockerWorks('docker')) {
    return {
      executable: 'docker',
      prefixArgs: ['compose'],
      source: 'native',
    };
  }

  if (detectWsl()) {
    const dockerExe =
      '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe';
    if (pathExists(dockerExe) && dockerWorks(dockerExe)) {
      return {
        executable: dockerExe,
        prefixArgs: ['compose'],
        source: 'wsl-docker-exe',
      };
    }
  }

  throw new Error(
    'Docker Compose CLI not available. Install Docker, enable WSL integration, or set LH_DOCKER_EXE to the exact docker executable path.',
  );
}

/**
 * @param {{ executable: string, prefixArgs: string[] }} invocation
 * @param {string[]} composeArgs user compose args (e.g. ['-f', file, 'up', '-d'])
 */
export function buildComposeArgv(invocation, composeArgs) {
  return [invocation.executable, ...invocation.prefixArgs, ...composeArgs];
}
