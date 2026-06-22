import { SSHService } from '@deployforge/vps';
import { LoggingService, LogType } from '../logging.service';
import { DeploymentError } from './error';

export async function runCommand(
    ssh: SSHService,
    deploymentId: string,
    type: LogType,
    command: string,
    stage = 'deploying',
    errorCode = 'COMMAND_FAILED',
    timeoutMs?: number
) {
    const result = await ssh.execute(command, timeoutMs);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (output) {
        const clipped = output.length > 8000 ? `${output.slice(0, 8000)}\n[output truncated]` : output;
        await LoggingService.log(deploymentId, clipped, type, result.code === 0 || result.code === null ? 'info' : 'error');
    }
    if (result.code !== 0 && result.code !== null) {
        if ((errorCode === 'DOCKER_RUN_FAILED' || errorCode === 'DOCKER_CREATE_FAILED') && /address already in use|port is already allocated|bind:.*already in use/i.test(output)) {
            throw new DeploymentError('port_alloc', output || 'Host port is already in use', 'PORT_IN_USE');
        }
        throw new DeploymentError(stage, output || `Command failed with exit code ${result.code}`, errorCode);
    }
    return result;
}
