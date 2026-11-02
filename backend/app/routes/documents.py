
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId
from datetime import datetime
import fitz
import re

from ..db import db
from ..llm import generate
from ..config import MAX_PDF_MB

router = APIRouter()


# --------------------------------
# REQUEST MODELS
# --------------------------------

class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[dict] = Field(default_factory=list, max_length=20)


# --------------------------------
# PDF TEXT PROCESSING
# --------------------------------

def split(text, size=1100, overlap=150):
    """
    Split extracted PDF text into overlapping chunks.
    """

    text = " ".join(text.split())

    if not text:
        return []

    step = size - overlap

    return [
        text[i:i + size]
        for i in range(0, len(text), step)
    ]


def extract_pdf_text(raw):
    """
    Extract selectable text from PDF.
    """

    try:
        with fitz.open(stream=raw, filetype="pdf") as pdf:

            if pdf.page_count == 0:
                raise ValueError("The PDF contains no pages.")

            text = "\n".join(
                page.get_text("text")
                for page in pdf
            )

        return text.strip()

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read PDF: {str(exc)}"
        )


# --------------------------------
# UPLOAD PDF
# --------------------------------

@router.post("/upload")
async def upload(file: UploadFile = File(...)):

    filename = file.filename or "document.pdf"

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file."
        )

    raw = await file.read()

    if not raw:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty."
        )

    if len(raw) > MAX_PDF_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"PDF must be smaller than {MAX_PDF_MB} MB."
        )

    text = extract_pdf_text(raw)

    if not text:
        raise HTTPException(
            status_code=422,
            detail=(
                "No selectable text found. "
                "Scanned PDF OCR is not currently supported."
            )
        )

    chunks = split(text)

    try:
        result = db().documents.insert_one({
            "filename": filename,
            "chunks": chunks[:500],
            "characters": len(text),
            "total_chunks": len(chunks),
            "history": [],
            "created_at": datetime.utcnow()
        })

        return {
            "document_id": str(result.inserted_id),
            "filename": filename,
            "characters": len(text),
            "chunks": min(len(chunks), 500),
            "status": "uploaded"
        }

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Document storage failed: {str(exc)}"
        )


# --------------------------------
# FIND RELEVANT PDF CONTENT
# --------------------------------

def retrieve_chunks(chunks, question, history=None, limit=5):
    """
    Retrieve document chunks using keyword relevance.

    This is a simple keyword retrieval approach,
    not an embedding-based vector search.
    """

    search_text = question

    # Include the latest previous question for follow-ups.
    if history:
        recent = history[-2:]

        search_text += " " + " ".join(
            item.get("content", "")
            for item in recent
            if isinstance(item, dict)
        )

    terms = {
        word.lower()
        for word in re.findall(r"\b\w+\b", search_text)
        if len(word) > 2
    }

    if not terms:
        return chunks[:limit]

    ranked = []

    for chunk in chunks:
        lower_chunk = chunk.lower()

        score = sum(
            len(re.findall(
                r"\b" + re.escape(term) + r"\b",
                lower_chunk
            ))
            for term in terms
        )

        if score > 0:
            ranked.append((score, chunk))

    ranked.sort(key=lambda item: item[0], reverse=True)

    if not ranked:
        return chunks[:2]

    return [
        chunk
        for _, chunk in ranked[:limit]
    ]


# --------------------------------
# ASK QUESTIONS ABOUT PDF
# --------------------------------

@router.post("/{doc_id}/ask")
def ask(doc_id: str, data: Ask):

    if not ObjectId.is_valid(doc_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid document ID."
        )

    try:
        document = db().documents.find_one({
            "_id": ObjectId(doc_id)
        })

        if not document:
            raise HTTPException(
                status_code=404,
                detail="Document not found."
            )

        question = data.question.strip()

        if not question:
            raise HTTPException(
                status_code=400,
                detail="Please enter a question."
            )

        chunks = document.get("chunks", [])

        # Prefer the conversation already saved with this document.
        # Fall back to client-supplied history for older documents/sessions.
        stored_history = document.get("history", [])
        conversation_history = stored_history if stored_history else data.history

        # Retrieve relevant PDF context using the current question and recent context.
        context_chunks = retrieve_chunks(
            chunks,
            question,
            conversation_history
        )

        context = "\n\n".join(context_chunks)[:8000]

        if not context:
            raise HTTPException(
                status_code=422,
                detail="Could not find relevant content in this PDF."
            )

        system_prompt = """
You are StudyMate AI, a friendly PDF learning assistant.

SOURCE RULES:
- Answer questions using the uploaded PDF context.
- Do not invent document-specific facts.
- If the answer is not supported by the PDF, say:
  "I could not find this information in the uploaded document."
- Use conversation history to understand follow-up questions and references.
- If a question asks for general meaning or expansion of an abbreviation that appears in
  the document, explain it briefly only when supported by the document. Otherwise clearly
  distinguish any general explanation from what the PDF states.

RESPONSE LENGTH AND STYLE:
- Match answer length to the complexity of the question.
- For a simple factual question, definition, abbreviation or meaning, answer directly in
  1-3 short sentences. Do not add headings or multiple paragraphs.
- For a normal concept question, give a concise explanation and one useful example only
  when the PDF supports it or clearly label it as an illustrative example.
- For complex questions, comparisons or requests for detail, explain in structured steps
  or bullets.
- If the student says "in short", "briefly" or similar, keep the answer very concise.
- Start with the answer. Avoid long introductions, repeated conclusions and generic offers.
- Use simple, student-friendly language.
- Use Markdown only when it improves readability. Do not force headings into short answers.
- Return a natural answer, never JSON.
"""

        messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]

        # Include recent conversation history from the saved document session.
        for item in conversation_history[-8:]:

            if (
                isinstance(item, dict)
                and item.get("role") in ("user", "assistant")
                and isinstance(item.get("content"), str)
            ):
                messages.append({
                    "role": item["role"],
                    "content": item["content"][:3000]
                })

        messages.append({
            "role": "user",
            "content": f"""
UPLOADED DOCUMENT: {document.get('filename', 'PDF')}

RELEVANT DOCUMENT CONTEXT:
{context}

STUDENT QUESTION:
{question}

Answer the student's question using the document context
and previous conversation where relevant.
"""
        })

        answer = generate(
            messages,
            temperature=0.3
        )

        if not answer or not answer.strip():
            raise ValueError("AI returned an empty answer.")

        # Save conversation history in MongoDB.
        existing_history = document.get("history", [])

        updated_history = existing_history + [
            {
                "role": "user",
                "content": question,
                "created_at": datetime.utcnow()
            },
            {
                "role": "assistant",
                "content": answer,
                "created_at": datetime.utcnow()
            }
        ]

        # Retain only the latest 30 messages.
        updated_history = updated_history[-30:]

        db().documents.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"history": updated_history}}
        )

        return {
            "answer": answer.strip(),
            "document": document.get("filename", "PDF"),
            "document_id": doc_id
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"PDF question answering failed: {str(exc)}"
        )


# --------------------------------
# GET DOCUMENT CONVERSATION
# --------------------------------

@router.get("/{doc_id}/history")
def get_history(doc_id: str):

    if not ObjectId.is_valid(doc_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid document ID."
        )

    try:
        document = db().documents.find_one(
            {"_id": ObjectId(doc_id)},
            {"filename": 1, "history": 1}
        )

        if not document:
            raise HTTPException(
                status_code=404,
                detail="Document not found."
            )

        history = []

        for item in document.get("history", []):
            history.append({
                "role": item.get("role"),
                "content": item.get("content")
            })

        return {
            "document": document.get("filename"),
            "history": history
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Could not retrieve conversation: {str(exc)}"
        )
