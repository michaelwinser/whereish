/**
 * Whereish - Semantic Location Sharing
 * Milestone 2: Named Locations
 *
 * This module handles:
 * - Browser geolocation
 * - Reverse geocoding via OpenStreetMap Nominatim
 * - Geographic hierarchy display
 * - Named locations (create, store, match)
 */

(function() {
    'use strict';

    // ===================
    // Configuration
    // ===================

    const CONFIG = {
        // Nominatim API (OpenStreetMap) - free, no API key required
        geocodeUrl: 'https://nominatim.openstreetmap.org/reverse',

        // Geolocation options
        geolocation: {
            enableHighAccuracy: false,  // Battery conscious
            timeout: 10000,             // 10 seconds
            maximumAge: 300000          // 5 minutes cache
        },

        // User-Agent for Nominatim (required by their ToS)
        userAgent: 'Whereish/1.0 (semantic-location-prototype)'
    };

    // ===================
    // Geographic Hierarchy Definition
    // ===================

    const HIERARCHY_LEVELS = [
        { key: 'address', label: 'Address', nominatimKeys: ['house_number', 'road'] },
        { key: 'street', label: 'Street', nominatimKeys: ['road'] },
        { key: 'neighborhood', label: 'Area', nominatimKeys: ['neighbourhood', 'suburb', 'hamlet'] },
        { key: 'city', label: 'City', nominatimKeys: ['city', 'town', 'village', 'municipality'] },
        { key: 'county', label: 'County', nominatimKeys: ['county'] },
        { key: 'state', label: 'State', nominatimKeys: ['state'] },
        { key: 'country', label: 'Country', nominatimKeys: ['country'] },
        { key: 'continent', label: 'Continent', nominatimKeys: [] }
    ];

    const COUNTRY_TO_CONTINENT = {
        'United States': 'North America',
        'Canada': 'North America',
        'Mexico': 'North America',
        'United Kingdom': 'Europe',
        'France': 'Europe',
        'Germany': 'Europe',
        'Italy': 'Europe',
        'Spain': 'Europe',
        'Netherlands': 'Europe',
        'Belgium': 'Europe',
        'Switzerland': 'Europe',
        'Austria': 'Europe',
        'Poland': 'Europe',
        'Sweden': 'Europe',
        'Norway': 'Europe',
        'Denmark': 'Europe',
        'Finland': 'Europe',
        'Ireland': 'Europe',
        'Portugal': 'Europe',
        'Greece': 'Europe',
        'Japan': 'Asia',
        'China': 'Asia',
        'South Korea': 'Asia',
        'India': 'Asia',
        'Singapore': 'Asia',
        'Thailand': 'Asia',
        'Vietnam': 'Asia',
        'Indonesia': 'Asia',
        'Malaysia': 'Asia',
        'Philippines': 'Asia',
        'Australia': 'Oceania',
        'New Zealand': 'Oceania',
        'Brazil': 'South America',
        'Argentina': 'South America',
        'Chile': 'South America',
        'Colombia': 'South America',
        'Peru': 'South America',
        'South Africa': 'Africa',
        'Egypt': 'Africa',
        'Nigeria': 'Africa',
        'Kenya': 'Africa',
        'Morocco': 'Africa'
    };

    // ===================
    // State
    // ===================

    let currentCoordinates = null;
    let currentHierarchy = null;
    let namedLocations = [];
    let currentMatch = null;

    // ===================
    // DOM Elements
    // ===================

    const elements = {
        // Status and location display
        status: document.getElementById('status'),
        statusIcon: document.querySelector('.status-icon'),
        statusText: document.querySelector('.status-text'),
        hierarchy: document.getElementById('location-hierarchy'),
        error: document.getElementById('error-message'),
        errorText: document.querySelector('.error-text'),

        // Named location match display
        namedMatch: document.getElementById('named-location-match'),
        namedMatchLabel: document.querySelector('.named-match-label'),

        // Buttons
        refreshBtn: document.getElementById('refresh-btn'),
        retryBtn: document.getElementById('retry-btn'),
        saveLocationBtn: document.getElementById('save-location-btn'),

        // Named locations list
        namedLocationsList: document.getElementById('named-locations-list'),
        placesCount: document.getElementById('places-count'),

        // Modal
        modal: document.getElementById('save-modal'),
        modalForm: document.getElementById('save-location-form'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        modalCurrentLocation: document.getElementById('modal-current-location'),
        locationLabelInput: document.getElementById('location-label'),
        locationRadiusSelect: document.getElementById('location-radius')
    };

    // ===================
    // Geolocation Service
    // ===================

    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                resolve,
                (error) => {
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            reject(new Error('Location permission denied. Please enable location access in your browser settings.'));
                            break;
                        case error.POSITION_UNAVAILABLE:
                            reject(new Error('Location information unavailable. Please try again.'));
                            break;
                        case error.TIMEOUT:
                            reject(new Error('Location request timed out. Please try again.'));
                            break;
                        default:
                            reject(new Error('An unknown error occurred while getting location.'));
                    }
                },
                CONFIG.geolocation
            );
        });
    }

    // ===================
    // Geocoding Service
    // ===================

    async function reverseGeocode(lat, lon) {
        const url = new URL(CONFIG.geocodeUrl);
        url.searchParams.set('lat', lat);
        url.searchParams.set('lon', lon);
        url.searchParams.set('format', 'json');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('zoom', '18');

        const response = await fetch(url, {
            headers: {
                'User-Agent': CONFIG.userAgent
            }
        });

        if (!response.ok) {
            throw new Error(`Geocoding failed: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(`Geocoding error: ${data.error}`);
        }

        return data.address || {};
    }

    function buildHierarchy(addressComponents) {
        const hierarchy = {};

        for (const level of HIERARCHY_LEVELS) {
            if (level.key === 'continent') {
                const country = hierarchy.country;
                hierarchy.continent = country ? (COUNTRY_TO_CONTINENT[country] || 'Planet Earth') : 'Planet Earth';
                continue;
            }

            if (level.key === 'address') {
                const houseNumber = addressComponents.house_number;
                const road = addressComponents.road;
                if (houseNumber && road) {
                    hierarchy.address = `${houseNumber} ${road}`;
                }
                continue;
            }

            for (const nominatimKey of level.nominatimKeys) {
                if (addressComponents[nominatimKey]) {
                    hierarchy[level.key] = addressComponents[nominatimKey];
                    break;
                }
            }
        }

        if (!hierarchy.continent) {
            hierarchy.continent = 'Planet Earth';
        }

        return hierarchy;
    }

    // ===================
    // UI Updates
    // ===================

    function showLoading() {
        elements.status.classList.remove('located');
        elements.statusIcon.textContent = '📍';
        elements.statusText.textContent = 'Locating...';
        elements.hierarchy.classList.add('hidden');
        elements.error.classList.add('hidden');
        elements.namedMatch.classList.add('hidden');
        elements.refreshBtn.disabled = true;
        elements.saveLocationBtn.disabled = true;
    }

    function showError(message) {
        elements.status.classList.remove('located');
        elements.statusIcon.textContent = '❌';
        elements.statusText.textContent = 'Location unavailable';
        elements.hierarchy.classList.add('hidden');
        elements.error.classList.remove('hidden');
        elements.namedMatch.classList.add('hidden');
        elements.errorText.textContent = message;
        elements.refreshBtn.disabled = false;
        elements.saveLocationBtn.disabled = true;
    }

    function displayLocation(hierarchy, match) {
        elements.status.classList.add('located');
        elements.statusIcon.textContent = '✓';
        elements.error.classList.add('hidden');

        // Display named location match if present
        if (match) {
            elements.namedMatch.classList.remove('hidden');
            elements.namedMatchLabel.textContent = match.label;
            elements.statusText.textContent = match.label;
        } else {
            elements.namedMatch.classList.add('hidden');
            const mostSpecific = findMostSpecificLevel(hierarchy);
            elements.statusText.textContent = mostSpecific || 'Planet Earth';
        }

        // Build hierarchy display
        elements.hierarchy.innerHTML = '';
        const levelsToShow = HIERARCHY_LEVELS.filter(level => hierarchy[level.key]);

        levelsToShow.forEach((level, index) => {
            const value = hierarchy[level.key];
            if (!value) return;

            const levelElement = document.createElement('div');
            levelElement.className = 'hierarchy-level';

            if (index === 0 && !match) {
                levelElement.classList.add('primary');
            }

            levelElement.innerHTML = `
                <span class="hierarchy-label">${level.label}</span>
                <span class="hierarchy-value">${escapeHtml(value)}</span>
            `;

            elements.hierarchy.appendChild(levelElement);
        });

        elements.hierarchy.classList.remove('hidden');
        elements.refreshBtn.disabled = false;
        elements.saveLocationBtn.disabled = false;
    }

    function findMostSpecificLevel(hierarchy) {
        for (const level of HIERARCHY_LEVELS) {
            if (hierarchy[level.key]) {
                return hierarchy[level.key];
            }
        }
        return null;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===================
    // Named Locations UI
    // ===================

    function renderNamedLocationsList() {
        elements.placesCount.textContent = namedLocations.length;

        if (namedLocations.length === 0) {
            elements.namedLocationsList.innerHTML = `
                <p class="empty-state">No saved places yet. Save your current location to get started.</p>
            `;
            return;
        }

        elements.namedLocationsList.innerHTML = namedLocations.map(location => {
            const isActive = currentMatch && currentMatch.id === location.id;
            const distance = currentCoordinates
                ? Geofence.calculateDistance(
                    currentCoordinates.latitude,
                    currentCoordinates.longitude,
                    location.latitude,
                    location.longitude
                )
                : null;

            const distanceText = distance !== null
                ? Geofence.formatDistance(distance)
                : '';

            return `
                <div class="named-location-item ${isActive ? 'active' : ''}" data-id="${location.id}">
                    <span class="location-item-icon">${isActive ? '📍' : '🏠'}</span>
                    <div class="location-item-content">
                        <div class="location-item-label">${escapeHtml(location.label)}</div>
                        <div class="location-item-meta">
                            ${location.radiusMeters}m radius${distanceText ? ` • ${distanceText} away` : ''}
                        </div>
                    </div>
                    <div class="location-item-actions">
                        <button class="btn btn-danger delete-location-btn" data-id="${location.id}" title="Delete">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add delete handlers
        elements.namedLocationsList.querySelectorAll('.delete-location-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteLocation);
        });
    }

    async function handleDeleteLocation(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const location = namedLocations.find(loc => loc.id === id);

        if (location && confirm(`Delete "${location.label}"?`)) {
            try {
                await Storage.deleteNamedLocation(id);
                namedLocations = namedLocations.filter(loc => loc.id !== id);

                // Re-check for matches
                if (currentCoordinates) {
                    currentMatch = Geofence.findBestMatch(
                        currentCoordinates.latitude,
                        currentCoordinates.longitude,
                        namedLocations
                    );
                }

                renderNamedLocationsList();
                displayLocation(currentHierarchy, currentMatch);
            } catch (error) {
                console.error('Failed to delete location:', error);
                alert('Failed to delete location. Please try again.');
            }
        }
    }

    // ===================
    // Modal Handling
    // ===================

    function openModal() {
        elements.modal.classList.remove('hidden');
        elements.locationLabelInput.value = '';
        elements.locationLabelInput.focus();

        // Show current location in modal
        if (currentHierarchy) {
            const locationText = findMostSpecificLevel(currentHierarchy) || 'Current location';
            elements.modalCurrentLocation.textContent = locationText;
        }
    }

    function closeModal() {
        elements.modal.classList.add('hidden');
        elements.modalForm.reset();
    }

    async function handleSaveLocation(event) {
        event.preventDefault();

        if (!currentCoordinates) {
            alert('No location available. Please refresh your location first.');
            return;
        }

        const label = elements.locationLabelInput.value.trim();
        const radius = parseInt(elements.locationRadiusSelect.value, 10);

        if (!label) {
            alert('Please enter a name for this location.');
            return;
        }

        try {
            const newLocation = await Storage.saveNamedLocation({
                label,
                latitude: currentCoordinates.latitude,
                longitude: currentCoordinates.longitude,
                radiusMeters: radius
            });

            namedLocations.push(newLocation);

            // Check if we're now at this location
            currentMatch = Geofence.findBestMatch(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                namedLocations
            );

            closeModal();
            renderNamedLocationsList();
            displayLocation(currentHierarchy, currentMatch);

        } catch (error) {
            console.error('Failed to save location:', error);
            alert('Failed to save location. Please try again.');
        }
    }

    // ===================
    // Main Location Flow
    // ===================

    async function updateLocation() {
        showLoading();

        try {
            // Step 1: Get coordinates
            const position = await getCurrentPosition();
            currentCoordinates = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            elements.statusText.textContent = 'Getting location name...';

            // Step 2: Reverse geocode
            const addressComponents = await reverseGeocode(
                currentCoordinates.latitude,
                currentCoordinates.longitude
            );

            // Step 3: Build hierarchy
            currentHierarchy = buildHierarchy(addressComponents);

            // Step 4: Check for named location matches
            currentMatch = Geofence.findBestMatch(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                namedLocations
            );

            // Step 5: Display
            displayLocation(currentHierarchy, currentMatch);
            renderNamedLocationsList();

            // Save to localStorage for persistence
            saveLastLocation();

        } catch (error) {
            console.error('Location error:', error);
            showError(error.message);
        }
    }

    // ===================
    // Persistence
    // ===================

    function saveLastLocation() {
        try {
            localStorage.setItem('whereish_lastLocation', JSON.stringify({
                coordinates: currentCoordinates,
                hierarchy: currentHierarchy,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('Could not save location to localStorage:', e);
        }
    }

    function loadLastLocation() {
        try {
            const stored = localStorage.getItem('whereish_lastLocation');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Could not load location from localStorage:', e);
        }
        return null;
    }

    async function loadNamedLocations() {
        try {
            namedLocations = await Storage.getAllNamedLocations();
        } catch (error) {
            console.error('Failed to load named locations:', error);
            namedLocations = [];
        }
    }

    // ===================
    // Event Handlers
    // ===================

    function setupEventListeners() {
        // Location buttons
        elements.refreshBtn.addEventListener('click', updateLocation);
        elements.retryBtn.addEventListener('click', updateLocation);
        elements.saveLocationBtn.addEventListener('click', openModal);

        // Modal
        elements.modalCloseBtn.addEventListener('click', closeModal);
        elements.modalCancelBtn.addEventListener('click', closeModal);
        elements.modalForm.addEventListener('submit', handleSaveLocation);

        // Close modal on backdrop click
        elements.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

        // Close modal on Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !elements.modal.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    // ===================
    // Service Worker
    // ===================

    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('ServiceWorker registered:', registration.scope);
            } catch (error) {
                console.warn('ServiceWorker registration failed:', error);
            }
        }
    }

    // ===================
    // Initialization
    // ===================

    async function init() {
        setupEventListeners();
        registerServiceWorker();

        // Load named locations from IndexedDB
        await loadNamedLocations();
        renderNamedLocationsList();

        // Check for last known location
        const lastLocation = loadLastLocation();
        if (lastLocation && lastLocation.hierarchy) {
            currentCoordinates = lastLocation.coordinates;
            currentHierarchy = lastLocation.hierarchy;

            // Check for matches with current named locations
            if (currentCoordinates) {
                currentMatch = Geofence.findBestMatch(
                    currentCoordinates.latitude,
                    currentCoordinates.longitude,
                    namedLocations
                );
            }

            displayLocation(currentHierarchy, currentMatch);
            elements.statusText.textContent += ' (updating...)';
        }

        // Get fresh location
        updateLocation();
    }

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
