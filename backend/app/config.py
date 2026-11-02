import os
from dotenv import load_dotenv
load_dotenv()
GROQ_API_KEY=os.getenv("GROQ_API_KEY","")
GROQ_MODEL=os.getenv("GROQ_MODEL","llama-3.3-70b-versatile")
MONGODB_URI=os.getenv("MONGODB_URI","")
DATABASE_NAME=os.getenv("DATABASE_NAME","ai_study_assistant")
FRONTEND_ORIGIN=os.getenv("FRONTEND_ORIGIN","http://localhost:5173")
MAX_PDF_MB=int(os.getenv("MAX_PDF_MB","10"))
