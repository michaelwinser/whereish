# Whereish - PWA Client

Privacy-first semantic location sharing.

## Milestone 1: Self Location Display

This milestone implements:
- PWA shell (installable web app)
- Browser geolocation integration
- Reverse geocoding via OpenStreetMap Nominatim
- Geographic hierarchy display (City, State, Country, Continent)

## Running Locally

From the project root:

```bash
python serve.py
```

Then open http://localhost:8000

## Files

- `index.html` - Main HTML shell
- `style.css` - Styles (supports light/dark mode)
- `app.js` - Application logic (geolocation, geocoding, UI)
- `manifest.json` - PWA manifest
- `sw.js` - Service worker for offline support
- `icon.svg` - App icon

## Privacy Notes

**Prototype limitation:** This version uses OpenStreetMap Nominatim for reverse geocoding, which means your coordinates are sent to their servers. The production version will use on-device geocoding.

The app stores:
- Last known location (localStorage) - for faster startup
- No location history is kept
- No data is sent to any backend (yet)

## Browser Support

Requires a modern browser with:
- Geolocation API
- Fetch API
- Service Workers (for PWA features)

Tested on Chrome, Firefox, Safari (desktop and mobile).
