#!/usr/bin/env python3
"""
Whereish CLI - Command line client for API integration testing.

Usage:
    whereish --help
    whereish login --email user@example.com --password secret
    whereish contacts list
"""

import json
import sys
from pathlib import Path

import click
import requests

# ===================
# Configuration
# ===================

CONFIG_DIR = Path.home() / '.whereish'
CONFIG_FILE = CONFIG_DIR / 'config.json'
DEFAULT_SERVER = 'http://localhost:8500'


def get_config():
    """Load configuration from file."""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {'server': DEFAULT_SERVER, 'token': None}


def save_config(config):
    """Save configuration to file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)


def get_server():
    """Get the server URL."""
    return get_config().get('server', DEFAULT_SERVER)


def get_token():
    """Get the auth token."""
    return get_config().get('token')


def save_token(token):
    """Save auth token to config."""
    config = get_config()
    config['token'] = token
    save_config(config)


def clear_token():
    """Clear auth token from config."""
    config = get_config()
    config['token'] = None
    save_config(config)


# ===================
# HTTP Helpers
# ===================


def api_request(method, endpoint, data=None, auth=True):
    """Make an API request."""
    server = get_server()
    url = f'{server}{endpoint}'

    headers = {'Content-Type': 'application/json'}

    if auth:
        token = get_token()
        if token:
            headers['Authorization'] = f'Bearer {token}'

    try:
        if method == 'GET':
            response = requests.get(url, headers=headers)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data)
        elif method == 'PUT':
            response = requests.put(url, headers=headers, json=data)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f'Unknown method: {method}')

        return response
    except requests.exceptions.ConnectionError:
        click.echo(f'Error: Could not connect to server at {server}', err=True)
        sys.exit(1)


def handle_response(response, success_message=None):
    """Handle API response and print result."""
    try:
        data = response.json()
    except json.JSONDecodeError:
        data = None

    if response.ok:
        if success_message:
            click.echo(success_message)
        return data
    else:
        error = (
            data.get('error', f'HTTP {response.status_code}')
            if data
            else f'HTTP {response.status_code}'
        )
        click.echo(f'Error: {error}', err=True)
        sys.exit(1)


def output_json(data):
    """Output data as formatted JSON."""
    click.echo(json.dumps(data, indent=2))


def output_table(rows, headers):
    """Output data as a simple table."""
    if not rows:
        click.echo('No data')
        return

    # Calculate column widths
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))

    # Print header
    header_line = '  '.join(h.ljust(widths[i]) for i, h in enumerate(headers))
    click.echo(header_line)
    click.echo('-' * len(header_line))

    # Print rows
    for row in rows:
        line = '  '.join(str(cell).ljust(widths[i]) for i, cell in enumerate(row))
        click.echo(line)


# ===================
# CLI Groups
# ===================


@click.group()
@click.version_option(version='1.0.0')
def cli():
    """Whereish CLI - Command line client for API testing."""
    pass


# ===================
# Config Commands
# ===================


@cli.command()
@click.option('--server', help='Set server URL')
@click.option('--show', is_flag=True, help='Show current config')
def config(server, show):
    """Configure CLI settings."""
    cfg = get_config()

    if show:
        click.echo(f'Server: {cfg.get("server", DEFAULT_SERVER)}')
        click.echo(f'Token:  {"(set)" if cfg.get("token") else "(none)"}')
        return

    if server:
        cfg['server'] = server.rstrip('/')
        save_config(cfg)
        click.echo(f'Server set to: {server}')
        return

    # No options - show help
    ctx = click.get_current_context()
    click.echo(ctx.get_help())


# ===================
# Auth Commands
# ===================


@cli.command()
@click.option('--email', required=True, help='Email address')
@click.option('--password', required=True, help='Password')
@click.option('--name', required=True, help='Display name')
def register(email, password, name):
    """Register a new user account."""
    response = api_request(
        'POST',
        '/api/auth/register',
        {'email': email, 'password': password, 'name': name},
        auth=False,
    )

    data = handle_response(response)
    save_token(data['token'])
    click.echo(f'Registered and logged in as {data["user"]["email"]}')


@cli.command()
@click.option('--email', required=True, help='Email address')
@click.option('--password', required=True, help='Password')
def login(email, password):
    """Login to an existing account."""
    response = api_request(
        'POST', '/api/auth/login', {'email': email, 'password': password}, auth=False
    )

    data = handle_response(response)
    save_token(data['token'])
    click.echo(f'Logged in as {data["user"]["email"]}')


@cli.command()
def logout():
    """Clear saved authentication."""
    clear_token()
    click.echo('Logged out')


@cli.command()
def whoami():
    """Show current authenticated user."""
    token = get_token()
    if not token:
        click.echo('Not logged in')
        sys.exit(1)

    response = api_request('GET', '/api/me')
    data = handle_response(response)
    click.echo(f'Logged in as: {data.get("email", data.get("name", "Unknown"))}')
    click.echo(f'User ID: {data.get("id")}')


# ===================
# Health Commands
# ===================


@cli.command()
def health():
    """Check server health."""
    response = api_request('GET', '/api/health', auth=False)
    data = handle_response(response)
    click.echo(f'Status: {data.get("status", "unknown")}')
    click.echo(f'Server: {get_server()}')


# ===================
# Location Commands
# ===================


@cli.group()
def location():
    """Manage your location."""
    pass


@location.command('publish')
@click.option('--hierarchy', required=True, help='Location hierarchy as JSON')
@click.option('--named-location', help='Named location as JSON (optional)')
def location_publish(hierarchy, named_location):
    """Publish your current location."""
    try:
        hierarchy_data = json.loads(hierarchy)
    except json.JSONDecodeError:
        click.echo('Error: Invalid JSON for --hierarchy', err=True)
        sys.exit(1)

    payload = {
        'hierarchy': hierarchy_data,
        'timestamp': None,  # Server will use current time
    }

    if named_location:
        try:
            payload['namedLocation'] = json.loads(named_location)
        except json.JSONDecodeError:
            click.echo('Error: Invalid JSON for --named-location', err=True)
            sys.exit(1)

    response = api_request('POST', '/api/location', {'payload': json.dumps(payload)})

    handle_response(response, 'Location published')


@location.command('get')
@click.option('--format', 'fmt', type=click.Choice(['json', 'text']), default='text')
def location_get(fmt):
    """Get your stored location."""
    response = api_request('GET', '/api/location')
    data = handle_response(response)

    if fmt == 'json':
        output_json(data)
    else:
        loc = data.get('location')
        if not loc:
            click.echo('No location stored')
            return

        if loc.get('data'):
            hierarchy = loc['data'].get('hierarchy', {})
            parts = [v for v in hierarchy.values() if v]
            click.echo(f'Location: {", ".join(parts) or "Unknown"}')
            if loc['data'].get('namedLocation'):
                click.echo(f'Named: {loc["data"]["namedLocation"]}')
        click.echo(f'Updated: {loc.get("updated_at", "Unknown")}')


# ===================
# Contacts Commands
# ===================


@cli.group()
def contacts():
    """Manage contacts."""
    pass


@contacts.command('list')
@click.option('--format', 'fmt', type=click.Choice(['json', 'table']), default='table')
def contacts_list(fmt):
    """List all contacts."""
    response = api_request('GET', '/api/contacts')
    data = handle_response(response)

    contacts_data = data.get('contacts', [])

    if fmt == 'json':
        output_json(contacts_data)
    else:
        if not contacts_data:
            click.echo('No contacts')
            return

        rows = []
        for c in contacts_data:
            rows.append(
                [
                    c.get('id', '')[:12],
                    c.get('name', ''),
                    c.get('permissionGranted', ''),
                    c.get('permissionReceived', ''),
                ]
            )

        output_table(rows, ['ID', 'Name', 'They See', 'You See'])


@contacts.command('request')
@click.option('--email', required=True, help='Email of user to add')
def contacts_request(email):
    """Send a contact request."""
    response = api_request('POST', '/api/contacts/request', {'email': email})
    data = handle_response(response)
    click.echo(data.get('message', 'Contact request sent'))


@contacts.command('requests')
@click.option('--format', 'fmt', type=click.Choice(['json', 'table']), default='table')
def contacts_requests(fmt):
    """List pending contact requests."""
    response = api_request('GET', '/api/contacts/requests')
    data = handle_response(response)

    if fmt == 'json':
        output_json(data)
        return

    incoming = data.get('incoming', [])
    outgoing = data.get('outgoing', [])

    if incoming:
        click.echo('Incoming requests:')
        rows = [[r.get('requestId'), r.get('email'), r.get('name', '')] for r in incoming]
        output_table(rows, ['ID', 'Email', 'Name'])
    else:
        click.echo('No incoming requests')

    click.echo()

    if outgoing:
        click.echo('Outgoing requests:')
        rows = [[r.get('requestId'), r.get('email'), r.get('name', '')] for r in outgoing]
        output_table(rows, ['ID', 'Email', 'Name'])
    else:
        click.echo('No outgoing requests')


@contacts.command('accept')
@click.option('--id', 'request_id', required=True, type=int, help='Request ID to accept')
def contacts_accept(request_id):
    """Accept a contact request."""
    response = api_request('POST', f'/api/contacts/requests/{request_id}/accept')
    handle_response(response, 'Contact request accepted')


@contacts.command('decline')
@click.option('--id', 'request_id', required=True, type=int, help='Request ID to decline')
def contacts_decline(request_id):
    """Decline a contact request."""
    response = api_request('POST', f'/api/contacts/requests/{request_id}/decline')
    handle_response(response, 'Contact request declined')


@contacts.command('cancel')
@click.option('--id', 'request_id', required=True, type=int, help='Request ID to cancel')
def contacts_cancel(request_id):
    """Cancel an outgoing contact request."""
    response = api_request('POST', f'/api/contacts/requests/{request_id}/cancel')
    handle_response(response, 'Contact request cancelled')


@contacts.command('remove')
@click.option('--id', 'contact_id', required=True, help='Contact ID to remove')
def contacts_remove(contact_id):
    """Remove a contact."""
    response = api_request('DELETE', f'/api/contacts/{contact_id}')
    handle_response(response, 'Contact removed')


@contacts.command('location')
@click.option('--id', 'contact_id', required=True, help='Contact ID')
@click.option('--format', 'fmt', type=click.Choice(['json', 'text']), default='text')
def contacts_location(contact_id, fmt):
    """Get a contact's location."""
    response = api_request('GET', f'/api/contacts/{contact_id}/location')
    data = handle_response(response)

    if fmt == 'json':
        output_json(data)
        return

    loc = data.get('location')
    if not loc:
        click.echo('No location available')
        return

    loc_data = loc.get('data', {})
    hierarchy = loc_data.get('hierarchy', {})
    parts = [v for v in hierarchy.values() if v]

    click.echo(f'Location: {", ".join(parts) or "Unknown"}')
    if loc_data.get('namedLocation'):
        click.echo(f'Named: {loc_data["namedLocation"]}')
    click.echo(f'Permission: {data.get("permissionLevel", "Unknown")}')
    click.echo(f'Updated: {loc.get("updated_at", "Unknown")}')
    if loc.get('stale'):
        click.echo('(stale)')


@contacts.command('locations')
@click.option('--format', 'fmt', type=click.Choice(['json', 'table']), default='table')
def contacts_locations(fmt):
    """Get all contacts with their locations."""
    response = api_request('GET', '/api/contacts/locations')
    data = handle_response(response)

    contacts_data = data.get('contacts', [])

    if fmt == 'json':
        output_json(contacts_data)
        return

    if not contacts_data:
        click.echo('No contacts')
        return

    rows = []
    for c in contacts_data:
        loc = c.get('location')
        if loc and loc.get('data'):
            hierarchy = loc['data'].get('hierarchy', {})
            # Get most specific location
            for level in [
                'address',
                'street',
                'neighborhood',
                'city',
                'county',
                'state',
                'country',
                'continent',
            ]:
                if hierarchy.get(level):
                    loc_str = hierarchy[level]
                    break
            else:
                loc_str = 'Unknown'

            named = loc['data'].get('namedLocation')
            if named:
                loc_str = f'{named} ({loc_str})'
        else:
            loc_str = '(no location)'

        rows.append([c.get('name', ''), loc_str, c.get('permissionReceived', '')])

    output_table(rows, ['Name', 'Location', 'Permission'])


@contacts.command('permission')
@click.option('--id', 'contact_id', required=True, help='Contact ID')
@click.option('--level', required=True, help='Permission level (planet, city, street, etc.)')
def contacts_permission(contact_id, level):
    """Update permission level for a contact."""
    response = api_request('PUT', f'/api/contacts/{contact_id}/permission', {'level': level})
    handle_response(response, f'Permission updated to {level}')


# ===================
# Admin Commands
# ===================


@cli.group()
def admin():
    """Admin commands (requires admin access)."""
    pass


@admin.command('dashboard')
@click.option('--format', 'fmt', type=click.Choice(['json', 'text']), default='text')
def admin_dashboard(fmt):
    """Show admin dashboard metrics."""
    response = api_request('GET', '/api/admin/dashboard')
    data = handle_response(response)

    if fmt == 'json':
        output_json(data)
        return

    metrics = data.get('metrics', {})

    users = metrics.get('users', {})
    click.echo('Users:')
    click.echo(f'  Total:      {users.get("total", 0)}')
    click.echo(f'  Active 24h: {users.get("active_24h", 0)}')
    click.echo(f'  Active 7d:  {users.get("active_7d", 0)}')
    click.echo(f'  Admins:     {users.get("admins", 0)}')

    contacts_metrics = metrics.get('contacts', {})
    click.echo('Contacts:')
    click.echo(f'  Total:      {contacts_metrics.get("total", 0)}')
    click.echo(f'  Pending:    {contacts_metrics.get("pending_requests", 0)}')

    locations = metrics.get('locations', {})
    click.echo('Locations:')
    click.echo(f'  Updates 24h: {locations.get("updates_24h", 0)}')


@admin.command('users')
@click.option('--search', help='Search by email or name')
@click.option('--format', 'fmt', type=click.Choice(['json', 'table']), default='table')
def admin_users(search, fmt):
    """List all users."""
    endpoint = '/api/admin/users'
    if search:
        endpoint += f'?search={search}'

    response = api_request('GET', endpoint)
    data = handle_response(response)

    users = data.get('users', [])

    if fmt == 'json':
        output_json(users)
        return

    if not users:
        click.echo('No users found')
        return

    rows = []
    for u in users:
        status = ''
        if u.get('is_admin'):
            status += '[admin] '
        if u.get('is_disabled'):
            status += '[disabled]'

        rows.append([u.get('id', '')[:12], u.get('email', ''), u.get('name', ''), status.strip()])

    output_table(rows, ['ID', 'Email', 'Name', 'Status'])


@admin.command('disable')
@click.option('--id', 'user_id', required=True, help='User ID to disable')
def admin_disable(user_id):
    """Disable a user account."""
    response = api_request('POST', f'/api/admin/users/{user_id}/disable')
    handle_response(response, 'User disabled')


@admin.command('enable')
@click.option('--id', 'user_id', required=True, help='User ID to enable')
def admin_enable(user_id):
    """Enable a user account."""
    response = api_request('POST', f'/api/admin/users/{user_id}/enable')
    handle_response(response, 'User enabled')


@admin.command('logs')
@click.option('--limit', default=20, help='Number of entries to show')
@click.option('--format', 'fmt', type=click.Choice(['json', 'table']), default='table')
def admin_logs(limit, fmt):
    """View audit logs."""
    response = api_request('GET', f'/api/admin/logs?limit={limit}')
    data = handle_response(response)

    logs = data.get('logs', [])

    if fmt == 'json':
        output_json(logs)
        return

    if not logs:
        click.echo('No logs found')
        return

    rows = []
    for log in logs:
        actor = log.get('actor', {})
        target = log.get('target', {})

        rows.append(
            [
                log.get('created_at', '')[:19],
                log.get('event_type', ''),
                actor.get('email', '')[:20] if actor else '',
                target.get('email', '')[:20] if target else '',
            ]
        )

    output_table(rows, ['Time', 'Event', 'Actor', 'Target'])


# ===================
# Entry Point
# ===================

if __name__ == '__main__':
    cli()
