import { firstValueFrom } from 'rxjs';
import { afterEach, vi } from 'vitest';
import { AuthTokenService } from './auth-token.service';
import { SessionScopeChangedError, renewAccessToken } from './session-sync';

/**
 * TS-220: another tab switched the shared session to another Organisation. When this tab renews
 * its token, the renewal must store the new Organisation and report the move, never hand back a
 * token for the new Organisation while the header still names the old one.
 */
describe('renewAccessToken (TS-220)', () => {
  const tokensShowing = (tenantId: string | null) => {
    let current: { tenantId: string | null; tenantName?: string } | null = tenantId ? { tenantId } : null;
    return {
      tenant: () => current,
      storeSignIn: vi.fn(),
      storeTenant: vi.fn((t: { tenantId: string | null } | null) => { current = t; }),
    } as unknown as AuthTokenService & { storeSignIn: ReturnType<typeof vi.fn>; storeTenant: ReturnType<typeof vi.fn> };
  };

  const answer = (data: unknown, ok = true) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => ({ success: ok, data, message: ok ? null : 'Session ended.' }) })));

  afterEach(() => vi.unstubAllGlobals());

  it('returns the token when the session is still in the same Organisation', async () => {
    const tokens = tokensShowing('smile');
    answer({ accessToken: 'new-token', tenant: { tenantId: 'smile', tenantName: 'Smile Foundation' } });

    await expect(firstValueFrom(renewAccessToken(tokens))).resolves.toBe('new-token');
    expect(tokens.storeSignIn).toHaveBeenCalled();
  });

  it('reports the move, and stores the new Organisation, when another tab switched the session', async () => {
    const tokens = tokensShowing('smile');
    answer({ accessToken: 'helpage-token', tenant: { tenantId: 'helpage', tenantName: 'HelpAge India' } });

    const error = await firstValueFrom(renewAccessToken(tokens)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionScopeChangedError);
    expect((error as SessionScopeChangedError).message).toContain('HelpAge India');
    expect(tokens.storeTenant).toHaveBeenCalledWith({ tenantId: 'helpage', tenantName: 'HelpAge India' });
  });

  it('reports a move to platform level as a change too', async () => {
    const tokens = tokensShowing('smile');
    answer({ accessToken: 'platform-token', tenant: null });

    const error = await firstValueFrom(renewAccessToken(tokens)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionScopeChangedError);
    expect(tokens.storeTenant).toHaveBeenCalledWith(null);
  });

  it('fails plainly when the server refuses the renewal', async () => {
    const tokens = tokensShowing('smile');
    answer(null, false);

    const error = await firstValueFrom(renewAccessToken(tokens)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SessionScopeChangedError);
  });
});
