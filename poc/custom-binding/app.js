/**
 * Custom Binding PoC - Application Controller
 *
 * This file demonstrates the Controller layer:
 * - Initializes Model and View bindings
 * - Handles user interactions (clicks, form submits)
 * - Orchestrates view navigation
 * - Performs Model transactions
 *
 * Note: NO manual DOM updates here. All rendering is declarative via Bind.
 */

// Wait for DOM
document.addEventListener('DOMContentLoaded', init);

// Model instance (from shared/mock-model.js)
let Model;

// Current view state
let currentView = 'main';

/**
 * Initialize the application
 */
function init() {
  // Create model instance
  Model = createMockModel();

  // Enable debug logging
  Bind.setDebug(true);

  // Set up all bindings (View layer)
  setupBindings();

  // Connect bindings to Model events
  Bind.connect(Model);

  // Set up event handlers (Controller layer)
  setupEventHandlers();

  // Show initial view
  showView('main');

  console.log('[App] Initialized with', Bind.getBindingCount(), 'bindings');
}

/**
 * Set up declarative bindings (View layer)
 *
 * This is where we define WHAT to render, not WHEN.
 * Bindings automatically update when Model emits relevant events.
 */
function setupBindings() {
  // === Header ===
  Bind.class('#status-indicator', 'disconnected',
    () => !Model.isServerConnected(),
    ['server:status']
  );

  // === Main View: Location Card ===
  Bind.html('#location-display', () => {
    const loc = Model.getCurrentLocation();
    if (!loc) return '<span class="text-muted">No location</span>';
    return Model.escapeHtml(Model.getLocationDisplay(loc));
  }, ['location:changed']);

  Bind.text('#location-timestamp', () => {
    const loc = Model.getCurrentLocation();
    if (!loc) return '';
    return `Updated ${Model.formatTimeAgo(new Date(loc.timestamp).getTime())}`;
  }, ['location:changed']);

  Bind.visible('#location-loading', () => Model.isLocationLoading(), ['location:loading']);
  Bind.visible('#location-card', () => !Model.isLocationLoading(), ['location:loading']);

  // === Main View: Current Place Match ===
  Bind.visible('#place-match', () => Model.getCurrentPlaceMatch() !== null, ['place:match']);
  Bind.text('#place-match-name', () => {
    const match = Model.getCurrentPlaceMatch();
    return match ? match.name : '';
  }, ['place:match']);

  // === Contacts Tab Badge ===
  Bind.html('#contacts-badge', () => {
    const count = Model.getPendingInviteCount();
    return count > 0 ? `<span class="badge">${count}</span>` : '';
  }, ['invites:changed']);

  // === Contacts View: Contact List ===
  Bind.html('#contacts-list', () => {
    const contacts = Model.getContacts();
    if (contacts.length === 0) {
      return `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p>No contacts yet</p>
        </div>
      `;
    }
    return contacts.map(renderContact).join('');
  }, ['contacts:changed']);

  // === Contacts View: Pending Invites ===
  Bind.visible('#invites-section', () => Model.getPendingInviteCount() > 0, ['invites:changed']);

  Bind.html('#invites-list', () => {
    return Model.getPendingInvites().map(renderInvite).join('');
  }, ['invites:changed']);

  // === Places View: Named Locations List ===
  Bind.html('#places-list', () => {
    const places = Model.getNamedLocations();
    if (places.length === 0) {
      return `<div class="empty-state"><p>No named locations yet</p></div>`;
    }
    return places.map(renderPlace).join('');
  }, ['places:changed']);

  // === Footer: Version Info ===
  Bind.text('#app-version', () => `App: v${Model.getAppVersion()}`, []);
  Bind.text('#server-version', () => `Server: v${Model.getServerVersion()}`, ['server:status']);
}

/**
 * Render a single contact item with visible places
 */
function renderContact(contact) {
  const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase();
  const location = contact.location
    ? `${contact.location.city || 'Unknown'}${contact.location.state ? ', ' + contact.location.state : ''}`
    : 'Location unknown';

  // Get named locations visible to this contact
  const visiblePlaces = Model.getVisiblePlacesForContact(contact.id);
  const placesHtml = visiblePlaces.length > 0
    ? `<div class="contact-places">Can see: ${visiblePlaces.map(p => Model.escapeHtml(p.name)).join(', ')}</div>`
    : '';

  return `
    <li class="contact-item" data-contact-id="${Model.escapeHtml(contact.id)}">
      <div class="contact-avatar">${Model.escapeHtml(initials)}</div>
      <div class="contact-info">
        <div class="contact-name">${Model.escapeHtml(contact.name)}</div>
        <div class="contact-location">${Model.escapeHtml(location)}</div>
        ${placesHtml}
      </div>
      <div class="contact-time">${Model.formatTimeAgo(contact.lastSeen)}</div>
    </li>
  `;
}

/**
 * Render a named location (place)
 */
function renderPlace(place) {
  const contacts = Model.getContacts();
  const visibleToNames = place.visibleTo
    .map(id => contacts.find(c => c.id === id))
    .filter(Boolean)
    .map(c => c.name);

  const currentMatch = Model.getCurrentPlaceMatch();
  const isCurrentPlace = currentMatch && currentMatch.id === place.id;

  return `
    <div class="place-item ${isCurrentPlace ? 'current' : ''}" data-place-id="${Model.escapeHtml(place.id)}">
      <div class="place-header">
        <span class="place-name">${Model.escapeHtml(place.name)}</span>
        ${isCurrentPlace ? '<span class="place-current-badge">You are here</span>' : ''}
      </div>
      <div class="place-radius">${place.radius}m radius</div>
      <div class="place-visibility">
        Visible to: ${visibleToNames.length > 0 ? visibleToNames.join(', ') : 'No one'}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="handleSimulateArrive('${place.id}')">
        Simulate Arrive
      </button>
    </div>
  `;
}

/**
 * Render a pending invite card
 */
function renderInvite(invite) {
  return `
    <div class="invite-card" data-invite-id="${Model.escapeHtml(invite.id)}">
      <div class="invite-from">${Model.escapeHtml(invite.from.name)}</div>
      <div class="invite-email">${Model.escapeHtml(invite.from.email)}</div>
      <div class="invite-actions">
        <button class="btn btn-primary" onclick="handleAcceptInvite('${invite.id}')">Accept</button>
        <button class="btn btn-secondary" onclick="handleDeclineInvite('${invite.id}')">Decline</button>
      </div>
    </div>
  `;
}

/**
 * Set up event handlers (Controller layer)
 *
 * These handle user interactions and translate them to Model operations.
 * NO direct DOM manipulation here - just Model updates.
 */
function setupEventHandlers() {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      showView(view);
    });
  });

  // Refresh location button
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefreshLocation);

  // Debug: Toggle server connection
  document.getElementById('toggle-server')?.addEventListener('click', () => {
    Model.setServerConnected(!Model.isServerConnected());
  });

  // Debug: Add random invite
  document.getElementById('add-invite')?.addEventListener('click', () => {
    Model.addInvite({
      from: {
        name: `Test User ${Math.floor(Math.random() * 100)}`,
        email: `test${Math.floor(Math.random() * 100)}@example.com`
      },
      timestamp: Date.now()
    });
  });
}

/**
 * Show a view (Controller - navigation)
 */
function showView(viewName) {
  currentView = viewName;

  // Update tab active states
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  // Update view visibility
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });
}

/**
 * Handle location refresh (Controller - action)
 */
function handleRefreshLocation() {
  Model.setLocationLoading(true);

  // Simulate async location fetch
  setTimeout(() => {
    Model.setLocation({
      hierarchy: {
        planet: 'Earth',
        continent: 'North America',
        country: 'United States',
        state: 'Washington',
        city: 'Seattle',
        neighborhood: ['Capitol Hill', 'Fremont', 'Ballard'][Math.floor(Math.random() * 3)]
      }
    });
  }, 1000);
}

/**
 * Handle accept invite (Controller - action)
 */
function handleAcceptInvite(inviteId) {
  const newContact = Model.acceptInvite(inviteId);
  if (newContact) {
    console.log('[App] Accepted invite, added contact:', newContact.name);
  }
}

/**
 * Handle decline invite (Controller - action)
 */
function handleDeclineInvite(inviteId) {
  Model.declineInvite(inviteId);
  console.log('[App] Declined invite:', inviteId);
}

/**
 * Handle simulating arrival at a place (Controller - action)
 */
function handleSimulateArrive(placeId) {
  Model.simulateArriveAtPlace(placeId);
  console.log('[App] Simulated arrival at place:', placeId);
}

/**
 * Handle simulating leaving a place (Controller - action)
 */
function handleSimulateLeave() {
  Model.simulateLeavePlace();
  console.log('[App] Simulated leaving place');
}

// Expose handlers for inline onclick (in production, use event delegation)
window.handleAcceptInvite = handleAcceptInvite;
window.handleDeclineInvite = handleDeclineInvite;
window.handleSimulateArrive = handleSimulateArrive;
window.handleSimulateLeave = handleSimulateLeave;
