import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from '../../cache.service';
import { LoggingService } from '../../logging.service';
import { DeploymentCancellationError } from '../../../utils/deployment-cancellation';
import { runCommand } from '../runner';

describe('runCommand live output and cancellation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('persists streamed output before returning the command result', async () => {
        vi.spyOn(CacheService, 'get').mockResolvedValue(null);
        const log = vi.spyOn(LoggingService, 'log').mockResolvedValue({} as any);
        const ssh = {
            executeStreaming: vi.fn(async (_command: string, options: any) => {
                options.onStdout('installing dependencies\n');
                options.onStderr('building application\n');
                return { stdout: 'installing dependencies\n', stderr: 'building application\n', code: 0 };
            }),
            execute: vi.fn(async () => ({ stdout: '', stderr: '', code: 0 })),
        };

        await runCommand(ssh as any, 'dep-1', 'build', 'npm run build');

        expect(log).toHaveBeenCalledWith(
            'dep-1',
            expect.stringContaining('installing dependencies'),
            'build',
            'info',
        );
        expect(log).toHaveBeenCalledWith(
            'dep-1',
            expect.stringContaining('building application'),
            'build',
            'info',
        );
    });

    it('does not start a remote command after cancellation was requested', async () => {
        vi.spyOn(CacheService, 'get').mockResolvedValue({ requestedAt: new Date().toISOString() } as any);
        const ssh = { executeStreaming: vi.fn(), execute: vi.fn() };

        await expect(runCommand(ssh as any, 'dep-2', 'build', 'docker build .')).rejects.toBeInstanceOf(DeploymentCancellationError);
        expect(ssh.executeStreaming).not.toHaveBeenCalled();
    });

    it('terminates the remote process group when cancellation arrives during execution', async () => {
        vi.spyOn(CacheService, 'get')
            .mockResolvedValueOnce(null)
            .mockResolvedValue({ requestedAt: new Date().toISOString() } as any);
        vi.spyOn(LoggingService, 'log').mockResolvedValue({} as any);

        let finishRemote: ((value: { stdout: string; stderr: string; code: number }) => void) | undefined;
        const ssh = {
            executeStreaming: vi.fn(() => new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
                finishRemote = resolve;
            })),
            execute: vi.fn(async (command: string) => {
                if (command.includes('kill -TERM')) {
                    finishRemote?.({ stdout: '', stderr: '', code: 143 });
                    return { stdout: 'terminated', stderr: '', code: 0 };
                }
                return { stdout: '', stderr: '', code: 0 };
            }),
        };

        await expect(runCommand(ssh as any, 'dep-3', 'build', 'sleep 30')).rejects.toBeInstanceOf(DeploymentCancellationError);
        expect(ssh.execute).toHaveBeenCalledWith(expect.stringContaining('kill -TERM'), 5000);
        expect(ssh.execute).toHaveBeenCalledWith(expect.stringContaining('rm -f'), 5000);
    }, 4000);
});
