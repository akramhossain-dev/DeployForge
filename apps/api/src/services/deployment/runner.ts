import { SSHService } from '@deployforge/vps';
import { LoggingService, LogType } from '../logging.service';
import { DeploymentError } from './error';
import { CacheService } from '../cache.service';
import { shellQuote } from './utils';
import {
    DeploymentCancellationError,
    deploymentCancellationKey,
} from '../../utils/deployment-cancellation';
import crypto from 'node:crypto';

const STREAM_FLUSH_MS = 750;
const STREAM_CHUNK_LIMIT = 3500;

function liveLogWriter(deploymentId: string, type: LogType) {
    let buffer = '';
    let timer: NodeJS.Timeout | null = null;
    let writes = Promise.resolve();

    const flush = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        const text = buffer.replace(/\0/g, '').trim();
        buffer = '';
        if (!text) return;
        for (let offset = 0; offset < text.length; offset += STREAM_CHUNK_LIMIT) {
            const chunk = text.slice(offset, offset + STREAM_CHUNK_LIMIT);
            writes = writes.then(() => LoggingService.log(deploymentId, chunk, type, 'info')).then(() => undefined).catch(() => undefined);
        }
    };

    return {
        push(chunk: string) {
            buffer += chunk;
            if (buffer.length >= STREAM_CHUNK_LIMIT) flush();
            else if (!timer) timer = setTimeout(flush, STREAM_FLUSH_MS);
        },
        async finish() {
            flush();
            await writes;
        },
    };
}

export async function runCommand(
    ssh: SSHService,
    deploymentId: string,
    type: LogType,
    command: string,
    stage = 'deploying',
    errorCode = 'COMMAND_FAILED',
    timeoutMs?: number
) {
    const cancelKey = deploymentCancellationKey(deploymentId);
    if (await CacheService.get(cancelKey)) throw new DeploymentCancellationError();

    const token = crypto.randomBytes(12).toString('hex');
    const pidFile = `/tmp/deployforge-${deploymentId.replace(/[^a-zA-Z0-9-]/g, '')}-${token}.pid`;
    const quotedCommand = shellQuote(command);
    const quotedPidFile = shellQuote(pidFile);
    const wrappedCommand = `if command -v setsid >/dev/null 2>&1; then setsid sh -lc ${quotedCommand} & else sh -lc ${quotedCommand} & fi; child=$!; printf '%s' "$child" > ${quotedPidFile}; wait "$child"; code=$?; rm -f ${quotedPidFile}; exit "$code"`;
    const writer = liveLogWriter(deploymentId, type);
    let cancelRequested = false;
    let killInFlight = false;
    let terminationSent = false;

    const checkCancellation = async () => {
        if (!(await CacheService.get(cancelKey))) return;
        cancelRequested = true;
        if (killInFlight || terminationSent) return;
        killInFlight = true;
        try {
            const killResult = await ssh.execute(`if [ -s ${quotedPidFile} ]; then pid=$(cat ${quotedPidFile}); kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true; for i in 1 2 3 4; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done; kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; rm -f ${quotedPidFile}; echo terminated; else exit 3; fi`, 5000);
            terminationSent = killResult.code === 0;
        } catch {
            // The command channel may close while the process group is terminating.
        } finally {
            killInFlight = false;
        }
    };

    const cancelTimer = setInterval(() => {
        checkCancellation().catch(() => undefined);
    }, 750);
    cancelTimer.unref();

    let result: { stdout: string; stderr: string; code: number | null };
    try {
        result = await ssh.executeStreaming(wrappedCommand, {
            timeoutMs,
            onStdout: (chunk) => writer.push(chunk),
            onStderr: (chunk) => writer.push(chunk),
        });
        await checkCancellation();
    } catch (error) {
        if (cancelRequested || await CacheService.get(cancelKey)) throw new DeploymentCancellationError();
        throw error;
    } finally {
        clearInterval(cancelTimer);
        await writer.finish();
        await ssh.execute(`rm -f ${quotedPidFile}`, 5000).catch(() => undefined);
    }

    if (cancelRequested) throw new DeploymentCancellationError();
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (result.code !== 0 && result.code !== null) {
        const clipped = output.length > 8000 ? `${output.slice(-8000)}\n[output truncated]` : output;
        if (clipped) await LoggingService.log(deploymentId, clipped, type, 'error');
        if ((errorCode === 'DOCKER_RUN_FAILED' || errorCode === 'DOCKER_CREATE_FAILED') && /address already in use|port is already allocated|bind:.*already in use/i.test(output)) {
            throw new DeploymentError('port_alloc', output || 'Host port is already in use', 'PORT_IN_USE');
        }
        throw new DeploymentError(stage, clipped || `Command failed with exit code ${result.code}`, errorCode);
    }
    return result;
}
