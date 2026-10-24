import { describe, expect, it } from 'vitest';
import { traefikHostRuleLabel } from '../utils';

describe('traefikHostRuleLabel', () => {
    it('shell-quotes the full rule so Host backticks stay literal', () => {
        expect(traefikHostRuleLabel('df-sandbox-abc123', 'sandbox.example.com'))
            .toBe("'traefik.http.routers.df-sandbox-abc123.rule=Host(`sandbox.example.com`)' ".trim());
    });
});
