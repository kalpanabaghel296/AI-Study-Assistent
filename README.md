# BACKBENCH — Just Learn Differently.

BACKBENCH is the rebranded version of the original AI Study Assistant. The existing dashboard, learning tools, colour theme, and layouts are preserved. Authentication and an animated welcome screen have been added around the original dashboard.

## Existing stack

- Frontend: React 18, Vite, Tailwind CSS
- Backend: FastAPI, Python
- Database: MongoDB Atlas
- AI: Groq
- PDF extraction: PyMuPDF

## What changed

- Product branding changed from StudyMate AI to BACKBENCH.
- Added an opening BACKBENCH animation with the tagline "Just Learn Differently."
- Added account signup, email OTP verification, sign in, session restoration, and sign out.
- Existing learning API routers now require a valid signed-in JWT.
- Original dashboard pages, layout, styling, sticky board, tutor, PDF learning, quiz, planner, and flashcards remain in place.

## Backend setup

1. Open a terminal in `backend/`.
2. Create and activate a virtual environment.
3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Copy `.env.example` to `.env`.
5. Configure your existing Groq and MongoDB settings, then set the authentication and SMTP variables below.
6. Start the backend:

   ```bash
   uvicorn app.main:app --reload
   ```

   API docs: http://127.0.0.1:8000/docs

### Required backend environment variables

```env
JWT_SECRET=your-long-random-secret-at-least-32-characters
ACCESS_TOKEN_MINUTES=10080

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=yourgmail@gmail.com
SMTP_PASSWORD=your-16-character-google-app-password
SMTP_FROM_EMAIL=yourgmail@gmail.com
SMTP_FROM_NAME=BACKBENCH

OTP_EXPIRE_MINUTES=10
OTP_RESEND_SECONDS=60
```

Generate a JWT secret locally with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

For Gmail SMTP, enable 2-Step Verification and create a Google App Password. Use that App Password as `SMTP_PASSWORD`, not your normal Gmail password.

**Keep `backend/.env` private. Never commit it or share its values.** The shareable project ZIP intentionally does not contain a real `.env` file or credentials. Copy your own local `.env` into the extracted project, or recreate it from `.env.example`.

## Frontend setup

1. Open another terminal in `frontend/`.
2. Copy `.env.example` to `.env`.
3. Set the backend URL:

   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8000
   ```

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

5. Open http://localhost:5173.

## Authentication flow

1. A new user signs up with name, email, and password.
2. BACKBENCH sends a six-digit email OTP.
3. The user verifies the OTP; it expires after the configured period and resend requests have a cooldown.
4. The backend creates the account and returns a signed JWT.
5. The frontend stores the JWT and restores the session on a subsequent visit.
6. The learning API routers require a valid signed-in JWT. Sign out clears the browser token.

## Important production notes

- Use HTTPS for the deployed frontend and backend.
- Set `FRONTEND_ORIGIN` to the exact deployed frontend origin.
- Keep JWT and SMTP secrets in the backend host's environment settings.
- Use secure, HttpOnly cookies instead of localStorage for stronger browser token protection before a public production launch.
- Add rate limiting, email delivery monitoring, backups, and automated tests.
- The existing learning records were created before account identity was introduced. This update authenticates access to the learning API, but the existing data model is not yet partitioned per user. Add owner/user IDs and ownership checks before allowing multiple users to store private documents, chats, plans, quizzes, or flashcards in a shared database.
