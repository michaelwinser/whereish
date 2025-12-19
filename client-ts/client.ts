/**
 * Whereish TypeScript API Client
 *
 * Type-safe client generated from OpenAPI specification.
 * This client can be used in browser (PWA) or bundled for other environments.
 */

import type { paths, components } from './generated/api';

// =============================================================================
// Type Exports
// =============================================================================

export type User = components['schemas']['User'];
export type Contact = components['schemas']['Contact'];
export type ContactRequest = components['schemas']['ContactRequest'];
export type IdentityBackup = components['schemas']['IdentityBackup'];
export type UserData = components['schemas']['UserData'];
export type EncryptedLocation = components['schemas']['EncryptedLocation'];
export type Device = components['schemas']['Device'];
export type DeviceWithToken = components['schemas']['DeviceWithToken'];
export type HealthResponse = components['schemas']['HealthResponse'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type ContactList = components['schemas']['ContactList'];
export type ContactRequestList = components['schemas']['ContactRequestList'];
export type LocationList = components['schemas']['LocationList'];
export type DeviceList = components['schemas']['DeviceList'];

// Request types
export type GoogleLoginRequest = components['schemas']['GoogleLoginRequest'];
export type ContactRequestCreate = components['schemas']['ContactRequestCreate'];
export type LocationShare = components['schemas']['LocationShare'];
export type LocationShareRequest = components['schemas']['LocationShareRequest'];
export type DeviceCreate = components['schemas']['DeviceCreate'];
export type PublicKeyRequest = components['schemas']['PublicKeyRequest'];
export type UserDataUpdate = components['schemas']['UserDataUpdate'];

// Error types
export type ApiError = components['schemas']['Error'];
export type ConflictError = components['schemas']['ConflictError'];

// =============================================================================
// Client Configuration
// =============================================================================

export interface ClientConfig {
  /** Base URL for API requests (default: '' for same-origin) */
  baseUrl?: string;
  /** Function to get current auth token */
  getToken?: () => string | null;
  /** Function to set auth token after login */
  setToken?: (token: string | null) => void;
  /** Callback when session expires (401) */
  onUnauthorized?: () => void;
}

// =============================================================================
// API Error Class
// =============================================================================

export class WhereishApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'WhereishApiError';
  }
}

// =============================================================================
// Client Implementation
// =============================================================================

export class WhereishClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private setToken: (token: string | null) => void;
  private onUnauthorized: () => void;

  constructor(config: ClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? '';
    this.getToken = config.getToken ?? (() => null);
    this.setToken = config.setToken ?? (() => {});
    this.onUnauthorized = config.onUnauthorized ?? (() => {});
  }

  // ===========================================================================
  // HTTP Helpers
  // ===========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    requiresAuth = true
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (requiresAuth && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      this.onUnauthorized();
      throw new WhereishApiError(401, 'unauthorized', 'Session expired');
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Parse JSON response
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      if (!response.ok) {
        throw new WhereishApiError(response.status, 'unknown', `HTTP ${response.status}`);
      }
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const error = data as ApiError;
      throw new WhereishApiError(
        response.status,
        error.error?.code ?? 'unknown',
        error.error?.message ?? `HTTP ${response.status}`
      );
    }

    return data as T;
  }

  // ===========================================================================
  // Health
  // ===========================================================================

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/api/health', undefined, false);
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  async loginWithGoogle(idToken: string): Promise<LoginResponse> {
    const body: GoogleLoginRequest = { idToken };
    const response = await this.request<LoginResponse>('POST', '/api/auth/google', body, false);
    this.setToken(response.token);
    return response;
  }

  async logout(): Promise<void> {
    await this.request<void>('POST', '/api/auth/logout');
    this.setToken(null);
  }

  async deleteAccount(): Promise<void> {
    await this.request<void>('DELETE', '/api/auth/account');
    this.setToken(null);
  }

  // ===========================================================================
  // User
  // ===========================================================================

  async getCurrentUser(): Promise<User> {
    return this.request<User>('GET', '/api/me');
  }

  // ===========================================================================
  // Identity
  // ===========================================================================

  async getIdentityBackup(): Promise<IdentityBackup> {
    return this.request<IdentityBackup>('GET', '/api/identity/backup');
  }

  async setIdentityBackup(backup: IdentityBackup): Promise<void> {
    await this.request<void>('PUT', '/api/identity/backup', backup);
  }

  async setPublicKey(publicKey: string): Promise<void> {
    const body: PublicKeyRequest = { publicKey };
    await this.request<void>('POST', '/api/identity/public-key', body);
  }

  // ===========================================================================
  // User Data
  // ===========================================================================

  async getUserData(): Promise<UserData> {
    return this.request<UserData>('GET', '/api/user-data');
  }

  async setUserData(version: number, blob: string): Promise<UserData> {
    const body: UserDataUpdate = { version, blob };
    return this.request<UserData>('PUT', '/api/user-data', body);
  }

  // ===========================================================================
  // Contacts
  // ===========================================================================

  async listContacts(): Promise<ContactList> {
    return this.request<ContactList>('GET', '/api/contacts');
  }

  async removeContact(contactId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/contacts/${contactId}`);
  }

  async sendContactRequest(email: string): Promise<ContactRequest> {
    const body: ContactRequestCreate = { email };
    return this.request<ContactRequest>('POST', '/api/contacts/request', body);
  }

  async listContactRequests(): Promise<ContactRequestList> {
    return this.request<ContactRequestList>('GET', '/api/contacts/requests');
  }

  async acceptContactRequest(requestId: string): Promise<Contact> {
    return this.request<Contact>('POST', `/api/contacts/requests/${requestId}/accept`);
  }

  async declineContactRequest(requestId: string): Promise<void> {
    await this.request<void>('POST', `/api/contacts/requests/${requestId}/decline`);
  }

  async cancelContactRequest(requestId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/contacts/requests/${requestId}`);
  }

  // ===========================================================================
  // Locations
  // ===========================================================================

  async getLocations(): Promise<LocationList> {
    return this.request<LocationList>('GET', '/api/locations');
  }

  async shareLocations(locations: LocationShare[]): Promise<void> {
    const body: LocationShareRequest = { locations };
    await this.request<void>('POST', '/api/locations', body);
  }

  // ===========================================================================
  // Devices
  // ===========================================================================

  async listDevices(): Promise<DeviceList> {
    return this.request<DeviceList>('GET', '/api/devices');
  }

  async registerDevice(name: string, platform: 'ios' | 'android' | 'web' | 'cli'): Promise<DeviceWithToken> {
    const body: DeviceCreate = { name, platform };
    return this.request<DeviceWithToken>('POST', '/api/devices', body);
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/devices/${deviceId}`);
  }
}

// =============================================================================
// Default Export
// =============================================================================

export default WhereishClient;
