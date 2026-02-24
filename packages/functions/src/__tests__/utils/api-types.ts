/**
 * Test-specific API response type for supertest assertions.
 *
 * This intentionally differs from the production ApiResponse/ApiError discriminated
 * union in types/api.ts. Tests need a single combined type because supertest responses
 * are parsed as unknown JSON — we can't use discriminated union narrowing.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
