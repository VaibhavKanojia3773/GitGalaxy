import diskcache
import os

cache = diskcache.Cache(os.path.join(os.path.dirname(__file__), '.cache'))
