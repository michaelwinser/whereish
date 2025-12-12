#!/usr/bin/env python3
"""
Development server runner for Whereish backend.
Run with: python run.py
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set development defaults
os.environ.setdefault('FLASK_DEBUG', 'true')
os.environ.setdefault('DATABASE_PATH', 'whereish_dev.db')

from app import app

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8500, debug=True)
