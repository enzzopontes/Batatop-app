import { isAdminUser, checkIsAdmin } from '../isAdmin';
import { supabase } from '../../supabaseConfig';

jest.mock('../../supabaseConfig', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('Phase 1 - Mobile App Admin Authority & PoLP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('isAdminUser returns false for null/undefined user', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });

  test('isAdminUser returns true strictly when app_metadata.role is admin', () => {
    const adminUser = {
      id: 'admin-1',
      email: 'admin@batatatop.com.br',
      app_metadata: { role: 'admin' },
    };
    expect(isAdminUser(adminUser)).toBe(true);
  });

  test('isAdminUser does NOT grant admin based on hardcoded client-side emails', () => {
    // Fails before fix because hardcoded ADMIN_EMAILS gave instant admin bypass without server role
    const unverifiedEmailUser = {
      id: 'user-spoof',
      email: 'enzzobaraldo2008@gmail.com',
      app_metadata: {},
    };
    expect(isAdminUser(unverifiedEmailUser)).toBe(false);
  });

  test('checkIsAdmin resolves true only when database profile role is admin', async () => {
    const mockMaybeSingle = jest.fn().mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    });

    const isAuthorized = await checkIsAdmin('admin-uuid');
    expect(isAuthorized).toBe(true);
  });

  test('checkIsAdmin rejects when profile role is customer or missing', async () => {
    const mockMaybeSingle = jest.fn().mockResolvedValue({
      data: { role: 'customer' },
      error: null,
    });
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    });

    const isAuthorized = await checkIsAdmin('customer-uuid');
    expect(isAuthorized).toBe(false);
  });
});
