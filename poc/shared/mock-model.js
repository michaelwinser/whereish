/**
 * Mock Model for PoC Evaluation
 *
 * Simulates the Whereish app state with event emission.
 * All three PoC implementations use this same model to ensure
 * fair comparison of how each approach handles reactive updates.
 */

// Simple event emitter
class EventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    console.log(`[Model] Event: ${event}`, data);
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
    // Also emit a generic 'change' event for simple subscriptions
    if (event !== 'change' && this.listeners['change']) {
      this.listeners['change'].forEach(cb => cb({ event, data }));
    }
  }
}

// Create the mock model
function createMockModel() {
  const events = new EventEmitter();

  // Internal state
  let state = {
    // User state
    currentUser: { id: 'u1', email: 'demo@whereish.app', name: 'Demo User' },
    isAuthenticated: true,

    // Location state
    currentLocation: {
      hierarchy: {
        planet: 'Earth',
        continent: 'North America',
        country: 'United States',
        state: 'Washington',
        city: 'Seattle',
        neighborhood: 'Capitol Hill'
      },
      timestamp: new Date().toISOString(),
      accuracy: 'neighborhood'
    },
    isLocationLoading: false,
    locationError: null,

    // Contacts state
    contacts: [
      {
        id: 'c1',
        name: 'Alice Chen',
        email: 'alice@example.com',
        location: { city: 'Portland', state: 'Oregon' },
        lastSeen: Date.now() - 5 * 60 * 1000, // 5 min ago
        permissionLevel: 'neighborhood'
      },
      {
        id: 'c2',
        name: 'Bob Smith',
        email: 'bob@example.com',
        location: { city: 'San Francisco', state: 'California' },
        lastSeen: Date.now() - 60 * 60 * 1000, // 1 hour ago
        permissionLevel: 'city'
      },
      {
        id: 'c3',
        name: 'Carol Davis',
        email: 'carol@example.com',
        location: { city: 'New York', state: 'New York' },
        lastSeen: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
        permissionLevel: 'state'
      }
    ],

    // Pending invitations
    pendingInvites: [
      {
        id: 'i1',
        from: { name: 'David Lee', email: 'david@example.com' },
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
        status: 'pending'
      }
    ],

    // Named locations (places)
    namedLocations: [
      {
        id: 'p1',
        name: 'Home',
        coordinates: { lat: 47.6145, lng: -122.3185 }, // Capitol Hill
        radius: 100, // meters
        visibleTo: ['c1', 'c2'] // Contact IDs who can see this place
      },
      {
        id: 'p2',
        name: 'Work',
        coordinates: { lat: 47.6062, lng: -122.3321 }, // Downtown Seattle
        radius: 200,
        visibleTo: ['c1']
      },
      {
        id: 'p3',
        name: 'Soccer Field',
        coordinates: { lat: 47.6297, lng: -122.3425 }, // Fremont
        radius: 150,
        visibleTo: ['c2', 'c3']
      }
    ],

    // Currently matched named location (null if not at any)
    currentPlaceMatch: null, // Will be set to a place object when user is at a named location

    // Server connection state
    isServerConnected: true,
    lastSync: Date.now(),

    // App metadata
    appVersion: '0.9.5',
    serverVersion: '0.9.5'
  };

  // Public API
  const model = {
    // Event subscription
    on: (event, callback) => events.on(event, callback),
    off: (event, callback) => events.off(event, callback),

    // === Getters ===

    // User
    getCurrentUser: () => state.currentUser,
    isAuthenticated: () => state.isAuthenticated,

    // Location
    getCurrentLocation: () => state.currentLocation,
    isLocationLoading: () => state.isLocationLoading,
    getLocationError: () => state.locationError,

    // Contacts
    getContacts: () => [...state.contacts],
    getContact: (id) => state.contacts.find(c => c.id === id),
    getContactCount: () => state.contacts.length,

    // Invites
    getPendingInvites: () => [...state.pendingInvites],
    getPendingInviteCount: () => state.pendingInvites.length,

    // Named Locations (Places)
    getNamedLocations: () => [...state.namedLocations],
    getNamedLocation: (id) => state.namedLocations.find(p => p.id === id),
    getCurrentPlaceMatch: () => state.currentPlaceMatch,

    // Get named locations visible to a specific contact
    getVisiblePlacesForContact: (contactId) => {
      return state.namedLocations.filter(p => p.visibleTo.includes(contactId));
    },

    // Server
    isServerConnected: () => state.isServerConnected,
    getLastSync: () => state.lastSync,

    // App
    getAppVersion: () => state.appVersion,
    getServerVersion: () => state.serverVersion,

    // === Setters (emit events) ===

    setAuthenticated: (isAuth, user = null) => {
      state.isAuthenticated = isAuth;
      if (user) state.currentUser = user;
      events.emit('auth:changed', { isAuthenticated: isAuth, user: state.currentUser });
    },

    setLocation: (location) => {
      state.currentLocation = { ...location, timestamp: new Date().toISOString() };
      state.isLocationLoading = false;
      events.emit('location:changed', state.currentLocation);
    },

    setLocationLoading: (loading) => {
      state.isLocationLoading = loading;
      events.emit('location:loading', loading);
    },

    setLocationError: (error) => {
      state.locationError = error;
      state.isLocationLoading = false;
      events.emit('location:error', error);
    },

    updateContact: (id, updates) => {
      const index = state.contacts.findIndex(c => c.id === id);
      if (index >= 0) {
        state.contacts[index] = { ...state.contacts[index], ...updates };
        events.emit('contacts:changed', state.contacts);
      }
    },

    addContact: (contact) => {
      state.contacts.push(contact);
      events.emit('contacts:changed', state.contacts);
    },

    removeContact: (id) => {
      state.contacts = state.contacts.filter(c => c.id !== id);
      events.emit('contacts:changed', state.contacts);
    },

    acceptInvite: (inviteId) => {
      const invite = state.pendingInvites.find(i => i.id === inviteId);
      if (invite) {
        // Remove from pending
        state.pendingInvites = state.pendingInvites.filter(i => i.id !== inviteId);
        events.emit('invites:changed', state.pendingInvites);

        // Add as new contact
        const newContact = {
          id: `c${Date.now()}`,
          name: invite.from.name,
          email: invite.from.email,
          location: { city: 'Unknown' },
          lastSeen: Date.now(),
          permissionLevel: 'city'
        };
        state.contacts.push(newContact);
        events.emit('contacts:changed', state.contacts);

        return newContact;
      }
      return null;
    },

    declineInvite: (inviteId) => {
      state.pendingInvites = state.pendingInvites.filter(i => i.id !== inviteId);
      events.emit('invites:changed', state.pendingInvites);
    },

    addInvite: (invite) => {
      state.pendingInvites.push({ ...invite, id: `i${Date.now()}`, status: 'pending' });
      events.emit('invites:changed', state.pendingInvites);
    },

    setServerConnected: (connected) => {
      state.isServerConnected = connected;
      if (connected) state.lastSync = Date.now();
      events.emit('server:status', { connected, lastSync: state.lastSync });
    },

    // Named Locations
    addNamedLocation: (place) => {
      const newPlace = { ...place, id: `p${Date.now()}`, visibleTo: place.visibleTo || [] };
      state.namedLocations.push(newPlace);
      events.emit('places:changed', state.namedLocations);
      return newPlace;
    },

    updateNamedLocation: (id, updates) => {
      const index = state.namedLocations.findIndex(p => p.id === id);
      if (index >= 0) {
        state.namedLocations[index] = { ...state.namedLocations[index], ...updates };
        events.emit('places:changed', state.namedLocations);
      }
    },

    removeNamedLocation: (id) => {
      state.namedLocations = state.namedLocations.filter(p => p.id !== id);
      events.emit('places:changed', state.namedLocations);
    },

    togglePlaceVisibility: (placeId, contactId) => {
      const place = state.namedLocations.find(p => p.id === placeId);
      if (place) {
        const idx = place.visibleTo.indexOf(contactId);
        if (idx >= 0) {
          place.visibleTo.splice(idx, 1);
        } else {
          place.visibleTo.push(contactId);
        }
        events.emit('places:changed', state.namedLocations);
      }
    },

    setCurrentPlaceMatch: (place) => {
      state.currentPlaceMatch = place;
      events.emit('place:match', place);
    },

    // Simulate arriving at a named location (for demo)
    simulateArriveAtPlace: (placeId) => {
      const place = state.namedLocations.find(p => p.id === placeId);
      if (place) {
        state.currentPlaceMatch = place;
        events.emit('place:match', place);
      }
    },

    simulateLeavePlace: () => {
      state.currentPlaceMatch = null;
      events.emit('place:match', null);
    },

    // === Utility ===

    // Format relative time
    formatTimeAgo: (timestamp) => {
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      if (seconds < 60) return 'just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    },

    // Escape HTML for safe rendering
    escapeHtml: (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    // Get location display string
    getLocationDisplay: (location) => {
      if (!location || !location.hierarchy) return 'Unknown';
      const h = location.hierarchy;
      if (h.neighborhood && h.city) return `${h.neighborhood}, ${h.city}`;
      if (h.city && h.state) return `${h.city}, ${h.state}`;
      if (h.city) return h.city;
      if (h.state) return h.state;
      if (h.country) return h.country;
      return h.planet || 'Unknown';
    },

    // Debug: dump state
    _getState: () => JSON.parse(JSON.stringify(state)),

    // Debug: reset to initial state
    _reset: () => {
      // Re-run initialization
      location.reload();
    }
  };

  return model;
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMockModel };
} else if (typeof window !== 'undefined') {
  window.createMockModel = createMockModel;
}
