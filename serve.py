#!/usr/bin/env python3
"""
Simple development server for Whereish PWA.

Run with: python serve.py
Then open: http://localhost:8000

Geolocation API requires HTTPS in production, but works on localhost for development.
"""

import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Add headers for PWA and security
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, format, *args):
        # Colorized logging
        status = args[1] if len(args) > 1 else ''
        if status.startswith('2'):
            color = '\033[92m'  # Green
        elif status.startswith('3'):
            color = '\033[93m'  # Yellow
        elif status.startswith('4') or status.startswith('5'):
            color = '\033[91m'  # Red
        else:
            color = '\033[0m'   # Default

        reset = '\033[0m'
        print(f"{color}{args[0]} {args[1]}{reset} - {self.path}")


def main():
    os.chdir(DIRECTORY)

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Whereish Development Server                                ║
║                                                              ║
║   Local:   http://localhost:{PORT}                            ║
║                                                              ║
║   Press Ctrl+C to stop                                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            sys.exit(0)


if __name__ == "__main__":
    main()
