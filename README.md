# AI Study Assistant Starter

React + Vite + Tailwind frontend; FastAPI backend; MongoDB Atlas via PyMongo; Groq LLM; PyMuPDF PDF extraction.

## Run it
1. Install Python 3.10+ and Node.js 18+.
2. In `backend/`: create/activate a virtual environment, then run `pip install -r requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env`; add your Groq key and Atlas connection URI.
4. From `backend/`, run `uvicorn app.main:app --reload`. Docs: http://127.0.0.1:8000/docs
5. Copy `frontend/.env.example` to `frontend/.env`.
6. From `frontend/`, run `npm install` then `npm run dev`. Open http://localhost:5173.

Replace `<password>` in the Atlas URI with your new database password. URL-encode special characters (e.g. @ -> %40). Never commit `.env` or share credentials. Add your current IP in Atlas Network Access.

PDF support extracts selectable text; scanned PDF OCR is not included. This is a development starter, not production-ready: add authentication, per-user authorization, rate limiting, tests, robust vector search, and deployment hardening before real users.
