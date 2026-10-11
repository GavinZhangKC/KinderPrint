"""PostgreSQL storage layer for KinderPrint datasets.

The backend reads datasets either from files (local development and tests) or
from PostgreSQL (production). ``datasets`` is the shared registry used by both
the API and the data-science load script.
"""
