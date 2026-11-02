from pymongo import MongoClient
from .config import MONGODB_URI,DATABASE_NAME
_client=None
_db=None
def db():
    global _client,_db
    if not MONGODB_URI: raise RuntimeError("Set MONGODB_URI in backend/.env")
    if _db is None:
        _client=MongoClient(MONGODB_URI,serverSelectionTimeoutMS=5000)
        _db=_client[DATABASE_NAME]
    return _db
