/**
 * Whereish TypeScript Client Library
 *
 * Usage:
 *   import { WhereishClient, type User, type Contact } from '@whereish/client';
 *
 *   const client = new WhereishClient({
 *     baseUrl: 'https://api.whereish.app',
 *     getToken: () => localStorage.getItem('token'),
 *     setToken: (token) => localStorage.setItem('token', token),
 *     onUnauthorized: () => { window.location.href = '/login'; }
 *   });
 *
 *   const user = await client.getCurrentUser();
 */

// Re-export everything from client
export * from './client';

// Re-export generated types for advanced use cases
export type { paths, components, operations } from './generated/api';
