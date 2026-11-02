from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import Literal, Any
import json
import re
from bson import ObjectId

from ..db import db
from .auth import current_user
from ..llm import generate

router = APIRouter(dependencies=[Depends(current_user)])


class Quiz(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    number_of_questions: int = Field(default=5, ge=1, le=15)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class Plan(BaseModel):
    subjects: list[str] = Field(min_length=1, max_length=30)
    exam_date: str
    hours_per_day: int = Field(default=3, ge=1, le=16)
    goal_type: str = Field(default="college_exam", max_length=50)
    goal_name: str = Field(default="Study preparation", max_length=200)
    target_outcome: str = Field(default="", max_length=300)
    current_level: str = Field(default="intermediate", max_length=30)
    completed_topics: list[str] = Field(default_factory=list, max_length=50)
    weak_topics: list[str] = Field(default_factory=list, max_length=50)
    study_days_per_week: int = Field(default=6, ge=1, le=7)
    session_minutes: int = Field(default=90, ge=25, le=180)
    routine: str = Field(default="", max_length=500)
    extra_context: str = Field(default="", max_length=1000)


class Cards(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    count: int = Field(default=8, ge=1, le=30)


def parsed(text: str) -> Any:
    """Parse plain JSON, fenced JSON, or JSON embedded in model commentary."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("The AI returned an empty response.")
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for i, char in enumerate(cleaned):
            if char in "{[":
                try:
                    return decoder.raw_decode(cleaned[i:])[0]
                except json.JSONDecodeError:
                    continue
    raise ValueError("The AI response did not contain valid JSON.")


def find_array(value: Any, keys: tuple[str, ...]):
    """Find expected arrays even if the model wraps them in another object."""
    if isinstance(value, dict):
        for key in keys:
            if isinstance(value.get(key), list):
                return value[key]
        for child in value.values():
            found = find_array(child, keys)
            if found is not None:
                return found
    elif isinstance(value, list):
        if value and all(isinstance(x, dict) for x in value):
            return value
        for child in value:
            found = find_array(child, keys)
            if found is not None:
                return found
    return None


def generate_structured(prompt: str, keys: tuple[str, ...], temperature: float):
    raw = generate([{"role": "user", "content": prompt}], temperature=temperature)
    data = parsed(raw)
    items = find_array(data, keys)

    if items is None:
        retry = f"""Your previous answer did not follow the required schema.
Return ONLY a valid JSON object with a top-level "{keys[0]}" array.
Do not include Markdown fences or commentary.
Task and exact schema:
{prompt}"""
        raw = generate([{"role": "user", "content": retry}], temperature=0.0)
        data = parsed(raw)
        items = find_array(data, keys)

    if items is None:
        raise ValueError(f"The AI response is missing the required '{keys[0]}' array.")
    result = dict(data) if isinstance(data, dict) else {}
    result[keys[0]] = items
    return result


def save_document(collection_name: str, data: dict):
    try:
        result = getattr(db(), collection_name).insert_one(data)
        response = dict(data)
        response["id"] = str(result.inserted_id)
        response.pop("_id", None)
        return response
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database storage failed: {exc}")


@router.post("/quizzes/generate")
def quiz(x: Quiz):
    prompt = f"""
Create exactly {x.number_of_questions} {x.difficulty} multiple-choice questions about {x.topic}.
Each question needs four distinct options, answer_index from 0 to 3, and an explanation.
Return ONLY JSON:
{{
  "title": "Quiz title",
  "questions": [
    {{"question": "Question text", "options": ["A", "B", "C", "D"], "answer_index": 0, "explanation": "Explanation"}}
  ]
}}
"""
    try:
        data = generate_structured(prompt, ("questions", "quiz_questions", "items"), 0.1)
        valid = []
        for q in data["questions"]:
            if not isinstance(q, dict):
                continue
            question = q.get("question") or q.get("text") or q.get("prompt")
            options = q.get("options") or q.get("choices")
            answer = q.get("answer_index")
            if answer is None and isinstance(q.get("correct_option"), str):
                letter = q["correct_option"].strip().upper()
                if letter in "ABCD" and len(letter) == 1:
                    answer = ord(letter) - 65
            if (isinstance(question, str) and question.strip()
                and isinstance(options, list) and len(options) >= 4
                and all(isinstance(v, str) for v in options[:4])
                and isinstance(answer, int) and not isinstance(answer, bool)
                and 0 <= answer <= 3):
                valid.append({
                    "question": question.strip(),
                    "options": [v.strip() for v in options[:4]],
                    "answer_index": answer,
                    "explanation": str(q.get("explanation") or q.get("reason") or "")
                })
        if not valid:
            raise ValueError("The AI did not generate usable multiple-choice questions.")
        data.update({
            "title": str(data.get("title") or f"{x.topic} Quiz"),
            "topic": x.topic,
            "difficulty": x.difficulty,
            "questions": valid[:x.number_of_questions],
            "created_at": datetime.utcnow()
        })
        return save_document("quizzes", data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Quiz generation failed: {exc}")


@router.post("/plans/generate")
def plan(x: Plan):
    subjects = [s.strip() for s in x.subjects if s.strip()]
    if not subjects:
        raise HTTPException(status_code=400, detail="Please provide at least one subject.")

    try:
        exam = date.fromisoformat(x.exam_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Please provide a valid date in YYYY-MM-DD format.")
    if exam < date.today():
        raise HTTPException(status_code=400, detail="Deadline cannot be in the past.")

    goal_labels = {
        "college_exam": "college or university examinations",
        "competitive_exam": "competitive examinations",
        "school_exam": "school or board examinations",
        "placement": "job placements and interviews",
        "certification": "professional certification",
        "skill_learning": "learning a practical skill"
    }
    goal_label = goal_labels.get(x.goal_type, "personal learning")
    completed = [item.strip() for item in x.completed_topics if item.strip()]
    weak = [item.strip() for item in x.weak_topics if item.strip()]

    prompt = f"""
Act as an expert academic coach and adaptive study strategist. Build a genuinely useful, realistic plan for this learner.

LEARNER PROFILE
- Purpose/category: {goal_label} ({x.goal_type})
- Exact goal: {x.goal_name}
- Target outcome: {x.target_outcome or "Not specified; define sensible preparation priorities"}
- Deadline: {x.exam_date}
- Subjects, papers, modules or skills: {", ".join(subjects)}
- Current level: {x.current_level}
- Already completed: {", ".join(completed) if completed else "Not specified"}
- Weak or difficult areas: {", ".join(weak) if weak else "Not specified"}
- Available time: {x.hours_per_day} hours per study day
- Study days per week: {x.study_days_per_week}
- Preferred session length: {x.session_minutes} minutes
- Routine constraints: {x.routine or "Not specified"}
- Other instructions: {x.extra_context or "None"}

ADAPT THE STRATEGY TO THE GOAL:
- College exams: organize by subject/unit, prioritize exam-relevant units, include assignments/internal/final preparation and answer-writing where relevant.
- Competitive exams: balance concept learning, topic-wise practice, previous-year questions, timed tests, accuracy/speed and full mocks as the deadline approaches.
- School/boards: cover chapters, textbook concepts, sample papers, writing practice and revision.
- Placements: balance DSA/coding, CS fundamentals, aptitude, projects and interview practice; include timed problem-solving.
- Certifications: sequence modules, hands-on labs, practice questions and exam simulations.
- Skill learning: use a progressive learning path with hands-on tasks, mini-projects and a tangible final outcome. Do not force mock exams if they are not appropriate.

PLANNING RULES
1. Calculate a sensible number of weeks from today's date to the deadline. Cover the available preparation period without inventing an unrealistic workload.
2. Schedule only {x.study_days_per_week} study days per week. Keep the remaining days as rest, buffer or catch-up days.
3. Never allocate more than {x.hours_per_day} total study hours on a study day. Keep individual task duration practical and preferably near {x.session_minutes} minutes.
4. Do not schedule already completed topics as first-time learning. Use them for short revision or practice if appropriate.
5. Give weak topics extra attention without neglecting the rest of the syllabus.
6. Include active recall, spaced revision, practice, periodic self-tests and a final revision phase. Use mock tests when suitable for the goal.
7. Every task must be specific: what to study/do, not just "study subject".
8. Include a short reason ("why") for each task so the learner understands why it is scheduled.
9. The schedule must progress from foundations to practice to revision/application. Make priorities and milestones clear.
10. Do not claim you have measured the learner's ability or reviewed a syllabus that was not supplied. State assumptions briefly in summary if needed.
11. Return valid JSON only. Do not wrap it in Markdown.

Required JSON schema:
{{
  "title": "A clear plan title",
  "summary": "Explain the plan and any assumptions in 2-4 sentences",
  "strategy": "Explain the overall preparation strategy and how the goal type shaped it",
  "priority_reasons": ["Specific reason for prioritizing an area"],
  "milestones": [
    {{"title": "Milestone", "description": "What should be achieved and when"}}
  ],
  "revision_strategy": ["A practical revision or practice rule"],
  "weeks": [
    {{
      "week": "Week 1",
      "focus": "Specific weekly outcome",
      "tasks": [
        {{
          "day": "Monday",
          "subject": "{subjects[0]}",
          "topic": "Specific topic or activity",
          "duration_hours": 1.5,
          "task": "Concrete learning/practice instruction",
          "why": "Why this task matters now"
        }}
      ]
    }}
  ]
}}
Generate a complete plan with enough daily detail to be actionable. Ensure the sum of task durations for each day never exceeds the available daily hours.
"""
    try:
        data = generate_structured(prompt, ("weeks", "study_weeks", "schedule", "week_plan"), 0.15)
        normalized = []
        for wi, week in enumerate(data["weeks"]):
            if not isinstance(week, dict):
                continue
            tasks = week.get("tasks") or week.get("daily_tasks") or week.get("schedule")
            if not isinstance(tasks, list):
                continue

            clean_tasks = []
            daily_totals = {}
            for ti, task in enumerate(tasks):
                if not isinstance(task, dict):
                    continue
                try:
                    duration = float(task.get("duration_hours", task.get("hours", 1)))
                except (TypeError, ValueError):
                    duration = 1.0
                duration = max(0.25, min(duration, float(x.hours_per_day)))
                day_name = str(task.get("day") or f"Day {ti + 1}")
                clean_tasks.append({
                    "day": day_name,
                    "subject": str(task.get("subject") or subjects[ti % len(subjects)]),
                    "topic": str(task.get("topic") or task.get("title") or "Revision"),
                    "duration_hours": duration,
                    "task": str(task.get("task") or task.get("activity") or task.get("description") or "Study and practice the topic"),
                    "why": str(task.get("why") or task.get("reason") or "")
                })
                daily_totals[day_name] = daily_totals.get(day_name, 0) + duration

            # Normalize any overbooked day so the saved plan respects the learner's limit.
            for day_name, total in daily_totals.items():
                if total > x.hours_per_day:
                    scale = x.hours_per_day / total
                    for clean_task in clean_tasks:
                        if clean_task["day"] == day_name:
                            clean_task["duration_hours"] = round(clean_task["duration_hours"] * scale, 2)

            if clean_tasks:
                normalized.append({
                    "week": str(week.get("week") or f"Week {wi + 1}"),
                    "focus": str(week.get("focus") or week.get("goal") or ""),
                    "tasks": clean_tasks
                })

        if not normalized:
            raise ValueError("The AI did not generate usable weekly study tasks.")

        data.update({
            "title": str(data.get("title") or "Your Adaptive Study Plan"),
            "summary": str(data.get("summary") or "A personalized preparation roadmap."),
            "strategy": str(data.get("strategy") or ""),
            "priority_reasons": data.get("priority_reasons") if isinstance(data.get("priority_reasons"), list) else [],
            "milestones": data.get("milestones") if isinstance(data.get("milestones"), list) else [],
            "revision_strategy": data.get("revision_strategy") if isinstance(data.get("revision_strategy"), list) else [],
            "weeks": normalized,
            "goal_type": x.goal_type,
            "goal_name": x.goal_name,
            "target_outcome": x.target_outcome,
            "subjects": subjects,
            "exam_date": x.exam_date,
            "hours_per_day": x.hours_per_day,
            "study_days_per_week": x.study_days_per_week,
            "session_minutes": x.session_minutes,
            "current_level": x.current_level,
            "completed_topics": completed,
            "weak_topics": weak,
            "routine": x.routine,
            "extra_context": x.extra_context,
            "created_at": datetime.utcnow()
        })
        return save_document("study_plans", data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Study plan generation failed: {exc}")


@router.post("/flashcards/generate")
def cards(x: Cards):
    prompt = f"""
Create exactly {x.count} concise revision flashcards about {x.topic}.
Each card needs a question/concept in front and a correct concise answer in back.
Return ONLY JSON:
{{
  "topic": "{x.topic}",
  "cards": [{{"front": "Question", "back": "Answer"}}]
}}
"""
    try:
        data = generate_structured(prompt, ("cards", "flashcards", "items"), 0.2)
        valid = []
        for card in data["cards"]:
            if not isinstance(card, dict):
                continue
            front = card.get("front") or card.get("question")
            back = card.get("back") or card.get("answer")
            if isinstance(front, str) and front.strip() and isinstance(back, str) and back.strip():
                valid.append({"front": front.strip(), "back": back.strip()})
        if not valid:
            raise ValueError("The AI did not generate usable flashcards.")
        data.update({"topic": x.topic, "cards": valid[:x.count], "created_at": datetime.utcnow()})
        return save_document("flashcards", data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Flashcard generation failed: {exc}")


@router.get("/dashboard")
def dashboard():
    try:
        database = db()
        return {
            "documents": database.documents.count_documents({}),
            "quizzes": database.quizzes.count_documents({}),
            "study_plans": database.study_plans.count_documents({}),
            "flashcards": database.flashcards.count_documents({})
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Dashboard database error: {exc}")


# Saved study-plan library
def _serialize_plan(document: dict) -> dict:
    item = dict(document)
    item["id"] = str(item.pop("_id"))
    if isinstance(item.get("created_at"), datetime):
        item["created_at"] = item["created_at"].isoformat()
    return item


@router.get("/plans")
def list_plans():
    try:
        collection = db().study_plans
        return [_serialize_plan(item) for item in collection.find({}).sort("created_at", -1)]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load saved study plans: {exc}")


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str):
    if not ObjectId.is_valid(plan_id):
        raise HTTPException(status_code=400, detail="Invalid study plan ID.")
    try:
        item = db().study_plans.find_one({"_id": ObjectId(plan_id)})
        if not item:
            raise HTTPException(status_code=404, detail="Study plan not found.")
        return _serialize_plan(item)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not open study plan: {exc}")


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: str):
    if not ObjectId.is_valid(plan_id):
        raise HTTPException(status_code=400, detail="Invalid study plan ID.")
    try:
        result = db().study_plans.delete_one({"_id": ObjectId(plan_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Study plan not found.")
        return {"message": "Study plan deleted successfully."}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not delete study plan: {exc}")
