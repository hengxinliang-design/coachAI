"""Ensure the backend root is on sys.path so `import app...` works in tests."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
