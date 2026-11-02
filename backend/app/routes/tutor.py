from datetime import datetime
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import db
from ..llm import generate

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class Chat(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: Optional[str] = None
    history: list[ChatMessage] = Field(default_factory=list, max_length=40)


def _serialize_conversation(document: dict, include_messages: bool = False) -> dict:
    item = dict(document)
    item["id"] = str(item.pop("_id"))
    for key in ("created_at", "updated_at"):
        if isinstance(item.get(key), datetime):
            item[key] = item[key].isoformat()
    if not include_messages:
        messages = item.pop("messages", [])
        item["message_count"] = len(messages)
        item["preview"] = messages[-1].get("content", "")[:110] if messages else ""
    return item


@router.post("/chat")
def chat(data: Chat):
    user_text = data.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    collection = db().conversations
    now = datetime.utcnow()
    conversation_doc = None

    try:
        if data.conversation_id:
            if not ObjectId.is_valid(data.conversation_id):
                raise HTTPException(status_code=400, detail="Invalid conversation ID.")
            conversation_doc = collection.find_one({"_id": ObjectId(data.conversation_id)})
            if not conversation_doc:
                raise HTTPException(status_code=404, detail="Conversation not found.")

        if conversation_doc:
            history = conversation_doc.get("messages", [])[-12:]
            conversation_id = conversation_doc["_id"]
        else:
            history = [{"role": m.role, "content": m.content.strip()} for m in data.history[-12:] if m.content.strip()]
            first_title = user_text[:65] + ("…" if len(user_text) > 65 else "")
            created = collection.insert_one({
                "title": first_title, "messages": [], "created_at": now, "updated_at": now
            })
            conversation_id = created.inserted_id

        system_prompt = """You are StudyMate AI, a friendly, clear and practical study tutor.
Answer simple questions briefly. Explain complex concepts step by step with examples when useful. Use student-friendly language, preserve technical accuracy, and use Markdown only when it improves readability."""
        prompt_messages = [{"role": "system", "content": system_prompt}]
        prompt_messages.extend({"role": m.get("role", "user"), "content": m.get("content", "")} for m in history)
        prompt_messages.append({"role": "user", "content": user_text})
        answer = generate(prompt_messages, temperature=0.35)
        if not answer or not answer.strip():
            raise ValueError("The AI returned an empty answer.")

        new_messages = [
            {"role": "user", "content": user_text, "created_at": now},
            {"role": "assistant", "content": answer.strip(), "created_at": datetime.utcnow()}
        ]
        collection.update_one(
            {"_id": conversation_id},
            {"$push": {"messages": {"$each": new_messages}}, "$set": {"updated_at": datetime.utcnow()}}
        )
        return {"answer": answer.strip(), "conversation_id": str(conversation_id)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Tutor response failed: {str(exc)}")


@router.get("/conversations")
def list_conversations():
    try:
        collection = db().conversations
        return [_serialize_conversation(item) for item in collection.find({}).sort("updated_at", -1)]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load conversations: {exc}")


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=400, detail="Invalid conversation ID.")
    try:
        item = db().conversations.find_one({"_id": ObjectId(conversation_id)})
        if not item:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        return _serialize_conversation(item, include_messages=True)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not open conversation: {exc}")


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=400, detail="Invalid conversation ID.")
    try:
        result = db().conversations.delete_one({"_id": ObjectId(conversation_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        return {"message": "Conversation deleted successfully."}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not delete conversation: {exc}")
