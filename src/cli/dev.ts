#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { cwd, exit } from 'node:process';

import { findAvailablePort } from './ports';

interface CliArgs {
  project: string;
  port: number;
  host: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let project: string | undefined;
  let port = 51234; // Default port
  let host = '127.0.0.1'; // Default host

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--project' && i + 1 < args.length) {
      project = args[i + 1];
      i++; // Skip next argument
    } else if (arg === '--port' && i + 1 < args.length) {
      const portStr = args[i + 1];
      const parsedPort = parseInt(portStr, 10);
      if (isNaN(parsedPort) || parsedPort <= 0) {
        console.error('Error: --port must be a positive integer');
        exit(1);
      }
      port = parsedPort;
      i++; // Skip next argument
    } else if (arg === '--host' && i + 1 < args.length) {
      host = args[i + 1];
      i++; // Skip next argument
    }
  }

  return { project: project ?? cwd(), port, host };
}

async function main() {
  const { project, port, host } = parseArgs();

  const resolvedPort = await findAvailablePort({ host, preferredPort: port });
  if (resolvedPort !== port) {
    console.log(`Port ${port} is busy; using ${resolvedPort} instead`);
  }
  
  console.log(`Starting dev servers for project: ${project}`);
  console.log(`API port: ${resolvedPort}`);

  const apiArgs = ['run', 'src/server/dev.ts', '--', '--project', project, '--port', resolvedPort.toString(), '--host', host];
  const uiArgs = ['run', 'dev:ui'];

  const apiServer = spawn('bun', apiArgs, {
    stdio: 'inherit',
    shell: true
  });

  const uiServer = spawn('bun', uiArgs, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      OMO_DASHBOARD_API_PORT: resolvedPort.toString(),
    },
  });

  // Handle signals and clean up both processes
  const cleanup = () => {
    console.log('\nShutting down servers...');
    apiServer.kill('SIGTERM');
    uiServer.kill('SIGTERM');
    
    // Force kill if they don't terminate gracefully
    setTimeout(() => {
      apiServer.kill('SIGKILL');
      uiServer.kill('SIGKILL');
      exit(0);
    }, 5000);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Wait for either process to exit
  let apiExited = false;
  let uiExited = false;

  const handleExit = (processName: string) => {
    if (processName === 'API') {
      apiExited = true;
    } else {
      uiExited = true;
    }

    if (apiExited || uiExited) {
      console.log(`${processName} server exited, shutting down the other server...`);
      cleanup();
    }
  };

  apiServer.on('exit', (code, signal) => {
    if (signal) {
      console.log(`API server killed by signal: ${signal}`);
    } else if (code !== 0) {
      console.log(`API server exited with code: ${code}`);
    }
    handleExit('API');
  });

  uiServer.on('exit', (code, signal) => {
    if (signal) {
      console.log(`UI server killed by signal: ${signal}`);
    } else if (code !== 0) {
      console.log(`UI server exited with code: ${code}`);
    }
    handleExit('UI');
  });

  apiServer.on('error', (error) => {
    console.error('Failed to start API server:', error.message);
    cleanup();
    exit(1);
  });

  uiServer.on('error', (error) => {
    console.error('Failed to start UI server:', error.message);
    cleanup();
    exit(1);
  });

  console.log('Both servers started successfully');
  console.log(`API server: http://${host}:${resolvedPort}`);
  console.log('UI server: check Vite output for URL');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  exit(1);
});
