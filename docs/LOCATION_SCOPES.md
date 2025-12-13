# Location Scopes Design Document

**Version:** 1.0
**Date:** December 12, 2025
**Status:** Draft
**Related Issue:** #5 - Inconsistent naming between sharing scopes and radius sizes

---

## 1. Problem Statement

The application currently has inconsistent naming between:
- **Permission levels** (what contacts can see): planet, continent, country, state, county, city, zip, street, address
- **Named location radii** (geofence sizes): city block, neighborhood, zip code area, district, city/town
- **Display hierarchy** (from Nominatim): address, street, neighborhood/Area, city, county, state, country, continent

This inconsistency confuses users and makes the relationship between sharing permissions and physical spaces unclear.

---

## 2. Data Sources

### 2.1 Nominatim (OpenStreetMap) Response Fields

Nominatim reverse geocoding returns these address components:

| Field | Description | Example |
|-------|-------------|---------|
| `house_number` | Street number | "123" |
| `road` | Street name | "Main Street" |
| `neighbourhood` | Local area name | "Capitol Hill" |
| `suburb` | Suburb/district | "Downtown" |
| `hamlet` | Small settlement | "Millbrook" |
| `village` | Small town | "Kirkland" |
| `town` | Medium settlement | "Bellevue" |
| `city` | City | "Seattle" |
| `municipality` | Municipal area | "Seattle" |
| `county` | County/district | "King County" |
| `state` | State/province | "Washington" |
| `postcode` | Postal code | "98101" |
| `country` | Country name | "United States" |
| `country_code` | ISO code | "us" |

### 2.2 Nominatim Zoom Levels (Approximate Sizes)

| Zoom | Scope | Approximate Radius |
|------|-------|-------------------|
| 3 | Country | 500+ km |
| 5 | State | 100-500 km |
| 8 | County | 25-100 km |
| 10 | City | 5-25 km |
| 12 | Town/Borough | 2-5 km |
| 13 | Village/Suburb | 1-2 km |
| 14 | Neighbourhood | 500m-1 km |
| 16 | Major Streets | 200-500m |
| 17 | Streets | 100-200m |
| 18 | Building/Address | <100m |

---

## 3. Proposed Unified Scope System

### 3.1 Design Principles

1. **Use geographic/political terms** for large scopes (country, state, city)
2. **Use distance-based terms** for small scopes where political boundaries vary wildly
3. **Be consistent** across permissions, radii, and display
4. **Be clear to users** about what each scope means

### 3.2 Unified Scope Hierarchy

From most private (least sharing) to most public (most sharing):

| Scope Key | Display Name | Type | Approx. Radius | Nominatim Fields | Notes |
|-----------|--------------|------|----------------|------------------|-------|
| `planet` | Planet | Geographic | - | (none) | Default/hidden state |
| `continent` | Continent | Geographic | - | Derived from country | Derived, not from API |
| `country` | Country | Political | 500+ km | `country` | |
| `state` | State | Political | 100-500 km | `state` | Or province/region |
| `county` | County | Political | 25-100 km | `county` | Varies significantly |
| `city` | City | Political | 5-25 km | `city`, `town`, `village`, `municipality` | |
| `neighborhood` | Neighborhood | Geographic | 500m-2 km | `neighbourhood`, `suburb`, `hamlet` | |
| `street` | Street | Geographic | 100-200m | `road` | Street name only |
| `address` | Address | Geographic | <100m | `house_number` + `road` | Full street address |

**Removed:** `zip` / `postcode` - Postal codes vary wildly in size (from city blocks to entire regions) and don't map well to a consistent privacy level. Users thinking in terms of "zip code" can use "neighborhood" instead.

### 3.3 Named Location Radius Options

For geofencing, use the same scope names where they correspond to physical sizes:

| Scope | Radius | Use Case |
|-------|--------|----------|
| Street | 150m | Home, office, specific venue |
| Neighborhood | 750m | General area, campus, park |
| City | 10km | Downtown, district, large campus |

**Note:** Only scopes with meaningful physical radii are offered for named locations. You wouldn't create a "Country" or "State" named location.

### 3.4 Permission Level Display

When showing what a contact can see:

| Level | User Sees | Example |
|-------|-----------|---------|
| Planet | "Planet Earth" | Hidden/private |
| Continent | "North America" | Very coarse |
| Country | "United States" | Country only |
| State | "Washington" | State level |
| County | "King County" | County level |
| City | "Seattle" | City level |
| Neighborhood | "Capitol Hill" | Area/neighborhood |
| Street | "Main Street" | Street name |
| Address | "123 Main Street" | Full address |

---

## 4. Current vs. Proposed Comparison

### 4.1 Permission Levels

| Current | Proposed | Change |
|---------|----------|--------|
| planet | planet | - |
| continent | continent | - |
| country | country | - |
| state | state | - |
| county | county | - |
| city | city | - |
| zip | *(removed)* | Removed - inconsistent sizing |
| street | street | - |
| address | address | - |
| - | neighborhood | Added - fills gap between city and street |

### 4.2 Display Hierarchy (app.js)

| Current Key | Current Label | Proposed Key | Proposed Label |
|-------------|---------------|--------------|----------------|
| address | Address | address | Address |
| street | Street | street | Street |
| neighborhood | Area | neighborhood | Neighborhood |
| city | City | city | City |
| county | County | county | County |
| state | State | state | State |
| country | Country | country | Country |
| continent | Continent | continent | Continent |
| *(implicit)* | - | planet | Planet |

### 4.3 Named Location Radii

| Current | Current Radius | Proposed | Proposed Radius |
|---------|----------------|----------|-----------------|
| City block | 200m | Street | 150m |
| Neighborhood | 500m | Neighborhood | 750m |
| Zip code area | 1.5km | *(removed)* | - |
| District | 5km | City | 10km |
| City/Town | 15km | *(removed)* | - |

---

## 5. Implementation Changes

### 5.1 Backend (server/app.py)

```python
PERMISSION_LEVELS = [
    'planet',       # 0 - Hidden
    'continent',    # 1
    'country',      # 2
    'state',        # 3
    'county',       # 4
    'city',         # 5
    'neighborhood', # 6 - NEW
    'street',       # 7
    'address'       # 8
]
# Remove 'zip' from list
```

### 5.2 Frontend Hierarchy (app.js)

```javascript
const HIERARCHY_LEVELS = [
    { key: 'address', label: 'Address', nominatimKeys: ['house_number', 'road'] },
    { key: 'street', label: 'Street', nominatimKeys: ['road'] },
    { key: 'neighborhood', label: 'Neighborhood', nominatimKeys: ['neighbourhood', 'suburb', 'hamlet'] },
    { key: 'city', label: 'City', nominatimKeys: ['city', 'town', 'village', 'municipality'] },
    { key: 'county', label: 'County', nominatimKeys: ['county'] },
    { key: 'state', label: 'State', nominatimKeys: ['state'] },
    { key: 'country', label: 'Country', nominatimKeys: ['country'] },
    { key: 'continent', label: 'Continent', nominatimKeys: [] }  // Derived
];
```

### 5.3 Named Location Radius Options (index.html)

```html
<select id="location-radius" name="radius">
    <option value="150" selected>Street (~150m)</option>
    <option value="750">Neighborhood (~750m)</option>
    <option value="10000">City (~10km)</option>
</select>
```

### 5.4 Permission Label Formatting (app.js)

```javascript
function formatPermissionLabel(level) {
    const labels = {
        'planet': 'Planet',
        'continent': 'Continent',
        'country': 'Country',
        'state': 'State',
        'county': 'County',
        'city': 'City',
        'neighborhood': 'Neighborhood',
        'street': 'Street',
        'address': 'Address'
    };
    return labels[level] || level;
}
```

---

## 6. Migration Notes

### 6.1 Database Migration

- Any existing permissions with level `zip` should be migrated to `neighborhood`
- No data loss expected

### 6.2 UI Changes

- Permission dropdowns will show "Neighborhood" instead of "Zip"
- Named location radius options simplified to 3 choices
- Display label "Area" changed to "Neighborhood"

---

## 7. Open Questions

### 7.1 Should we keep more radius options?

The proposed 3 options (Street, Neighborhood, City) cover most use cases, but users might want finer control. Alternative: keep 5 options but rename consistently:

| Option | Radius |
|--------|--------|
| Address | 50m |
| Street | 150m |
| Neighborhood | 750m |
| District | 3km |
| City | 10km |

### 7.2 What about "District"?

Some cities have meaningful districts (Downtown, Midtown). Could add as a scope between Neighborhood and City if needed. Not in Nominatim by default.

### 7.3 International considerations

- "State" may be called "Province", "Region", etc. in other countries
- "County" doesn't exist everywhere
- Could use more generic terms but loses familiarity for US users

---

## 8. Recommendation

Implement the unified scope system as described in Section 3, with:
- 9 permission levels (planet through address, no zip)
- 3 named location radius options (street, neighborhood, city)
- Consistent display names throughout the UI

This provides clarity while covering the practical use cases for both sharing permissions and geofencing.

---

*End of Document*
