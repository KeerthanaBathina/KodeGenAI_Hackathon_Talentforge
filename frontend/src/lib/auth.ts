/**
 * Auth Token Utility
 * 
 * Provides functions to get/set/remove JWT authentication token.
 * Token is stored in cookies for both client and server access.
 */

/**
 * Get authentication token from cookies (client-side)
 * 
 * @returns JWT token or null if not found
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null; // Server-side, cannot access cookies here
  }

  const cookies = document.cookie.split('; ');
  const authCookie = cookies.find(row => row.startsWith('authToken='));
  
  if (!authCookie) {
    return null;
  }

  return authCookie.split('=')[1] || null;
}

/**
 * Set authentication token in cookies
 * 
 * @param token - JWT authentication token
 * @param expiresInDays - Number of days until cookie expires (default: 7)
 */
export function setAuthToken(token: string, expiresInDays: number = 7): void {
  if (typeof window === 'undefined') {
    return; // Server-side, cannot set cookies here
  }

  const expires = new Date();
  expires.setDate(expires.getDate() + expiresInDays);

  document.cookie = `authToken=${token}; expires=${expires.toUTCString()}; path=/; secure; samesite=strict`;
}

/**
 * Remove authentication token from cookies
 */
export function removeAuthToken(): void {
  if (typeof window === 'undefined') {
    return; // Server-side, cannot remove cookies here
  }

  document.cookie = 'authToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}
