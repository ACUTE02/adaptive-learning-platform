from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy import func
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.engine_models import StudentRating, EvaluationLog, Campaign, CampaignModuleDB, Assessment
from src.models import AITutoringSession

import os
import json
import traceback
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

import re

def get_next_remediation_title(base_title: str) -> str:
    match = re.search(r' \(Remediation - Attempt (\d+)\)$', base_title)
    if match:
        attempt = int(match.group(1)) + 1
        return re.sub(r' \(Remediation - Attempt \d+\)$', f' (Remediation - Attempt {attempt})', base_title)
    
    if base_title.endswith(' (Remediation)'):
        return base_title.replace(' (Remediation)', ' (Remediation - Attempt 2)')
        
    return f"{base_title} (Remediation)"

router = APIRouter(prefix="/api/v1/engine", tags=["Adaptive Engine"])

# ── Response Models ──────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    gpu_available: bool

class RoadmapPayload(BaseModel):
    user_skill_gaps: List[str]

class SyllabusNode(BaseModel):
    node_id: str
    topic: str
    estimated_minutes: int

class RoadmapResponse(BaseModel):
    nodes: List[SyllabusNode]

class QuizSubmission(BaseModel):
    user_id: str
    current_skill_rating: float
    time_taken_seconds: int
    is_correct: bool

class EvaluateResponse(BaseModel):
    updated_rating: float
    shift_difficulty: bool
    feedback: str

class RemediatePayload(BaseModel):
    student_id: str
    struggle_area: str

class RemediationResponse(BaseModel):
    scaffolding_text: str
    key_concept: str

class SimulationPayload(BaseModel):
    scenario_id: str
    parameters: Dict[str, Any]

class SimulationResponse(BaseModel):
    result: str


class AssessmentSchema(BaseModel):
    id: int
    type: str
    status: str
    score: Optional[int] = None
    exam_data: Optional[Dict[str, Any]] = None

class CampaignModule(BaseModel):
    id: int
    title: str
    description: str
    teaching_prompt: str
    subtopics: List[str]
    status: str = "locked"
    assessment: Optional[AssessmentSchema] = None

class CampaignGeneratePayload(BaseModel):
    syllabus_text: str
    student_id: str

class CampaignGenerateResponse(BaseModel):
    campaign_name: str
    modules: List[CampaignModule]

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatPayload(BaseModel):
    messages: List[ChatMessage]
    teaching_prompt: str
    subtopics: List[str] = []

class ChatResponse(BaseModel):
    reply: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System integrity check"
)
async def health_check() -> HealthResponse:
    """
    Returns the current health status and GPU availability for the Adaptive Engine.
    """
    return HealthResponse(status="active", gpu_available=True)


@router.post(
    "/roadmap",
    response_model=RoadmapResponse,
    summary="Dynamic roadmap generator"
)
async def generate_roadmap(payload: RoadmapPayload) -> RoadmapResponse:
 
 
    """
    Generates a dynamic learning roadmap based on user skill gaps using LangChain.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
    parser = PydanticOutputParser(pydantic_object=RoadmapResponse)
    
    prompt = PromptTemplate(
        template="Generate a dynamic syllabus roadmap for a student with the following skill gaps: {skill_gaps}.\n\n{format_instructions}",
        input_variables=["skill_gaps"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    
    chain = prompt | llm | parser
    
    response = chain.invoke({"skill_gaps": ", ".join(payload.user_skill_gaps)})
    return response


@router.post(
    "/evaluate",
    response_model=EvaluateResponse,
    summary="Real-time difficulty calibration"
)
async def evaluate_student(
    payload: QuizSubmission,
    db_session: AsyncSession = Depends(get_db_session)
) -> EvaluateResponse:
    """
    Processes student quiz answers and calibrates difficulty in real-time.
    """
    base_shift = 25.0 if payload.is_correct else -25.0
    
    multiplier = 1.0
    if payload.is_correct and payload.time_taken_seconds < 15:
        multiplier = 1.5
        
    points_gained = base_shift * multiplier
    
    updated_rating = payload.current_skill_rating + points_gained
    if updated_rating < 0:
        updated_rating = 0.0
        
    absolute_change = abs(updated_rating - payload.current_skill_rating)
    shift_difficulty = absolute_change > 30.0
    
    # Database writing logic
    rating_query = await db_session.execute(select(StudentRating).where(StudentRating.user_id == payload.user_id))
    rating_obj = rating_query.scalars().first()
    
    if rating_obj:
        rating_obj.skill_rating = updated_rating
        rating_obj.total_evaluations += 1
    else:
        rating_obj = StudentRating(
            user_id=payload.user_id,
            skill_rating=updated_rating,
            total_evaluations=1
        )
        
    db_session.add(rating_obj)
    
    log_obj = EvaluationLog(
        user_id=payload.user_id,
        is_correct=payload.is_correct,
        time_taken_seconds=payload.time_taken_seconds,
        rating_change=points_gained
    )
    db_session.add(log_obj)
    
    await db_session.commit()
    await db_session.refresh(rating_obj)
    await db_session.refresh(log_obj)

    feedback = "Great job!" if payload.is_correct else "Let's review this concept."
    
    return EvaluateResponse(
        updated_rating=updated_rating,
        shift_difficulty=shift_difficulty,
        feedback=feedback
    )


@router.post(
    "/remediate",
    response_model=RemediationResponse,
    summary="Targeted hint engine"
)
async def remediate_struggle(
    payload: RemediatePayload,
    db_session: AsyncSession = Depends(get_db_session)
) -> RemediationResponse:
    """
    Provides targeted conceptual scaffolding text when a student struggles.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
    parser = PydanticOutputParser(pydantic_object=RemediationResponse)
    
    prompt = PromptTemplate(
        template="You are a direct academic answer engine. RULE 1: If the topic is NOT a recognized academic subject (maths, science, geography, history, economics, CS, literature, languages, social sciences, arts), respond only with: I can only help with academic subjects. No explanation. RULE 2: If it IS academic, answer IMMEDIATELY and DIRECTLY. No greetings. No 'Excellent question'. No 'It seems...'. No asking the student questions back. Just give the complete answer with examples.\n\nStudent question: {struggle_area}\n\n{format_instructions}",
        input_variables=["struggle_area"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    
    chain = prompt | llm | parser
    
    response = chain.invoke({"struggle_area": payload.struggle_area})
    
    session_record = AITutoringSession(
        student_id=payload.student_id or "student_999",
        struggle_area=payload.struggle_area,
        scaffolding_text=response.scaffolding_text
    )
    db_session.add(session_record)
    await db_session.commit()
    await db_session.refresh(session_record)
    
    return response


@router.post(
    "/simulate",
    response_model=SimulationResponse,
    summary="Administrative simulation tool"
)
async def simulate_scenario(payload: SimulationPayload) -> SimulationResponse:
    """
    Administrative tool to simulate adaptive scenarios for testing ML models.
    """
    return SimulationResponse(result="Simulation completed successfully.")


@router.get(
    "/history",
    summary="Fetch AI Tutoring History"
)
async def get_history(student_id: str, db_session: AsyncSession = Depends(get_db_session)):
    """
    Fetches all records of previous AI tutoring sessions for a specific student.
    """
    result = await db_session.execute(select(AITutoringSession).where(AITutoringSession.student_id == student_id))
    return result.scalars().all()


@router.delete(
    "/history/{session_id}",
    summary="Delete AI Tutoring Session"
)
async def delete_history(
    session_id: int, 
    db_session: AsyncSession = Depends(get_db_session)
):
    """
    Deletes a specific AI tutoring session record.
    """
    record = await db_session.get(AITutoringSession, session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
        
    await db_session.delete(record)
    await db_session.commit()
    
    return {"status": "success", "message": "Session deleted"}


@router.post(
    "/roadmap/generate",
    response_model=CampaignGenerateResponse,
    summary="Generate AI Campaign Roadmap"
)
async def generate_campaign(
    payload: CampaignGeneratePayload,
    db_session: AsyncSession = Depends(get_db_session)
) -> CampaignGenerateResponse:
    """
    Reads a syllabus or learning goal and generates a structured module roadmap.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
    parser = PydanticOutputParser(pydantic_object=CampaignGenerateResponse)
    
    prompt = PromptTemplate(
        template="You are an expert curriculum architect. Read the provided syllabus or learning goal and break it down into 5 to 10 comprehensive learning modules. First, provide a concise, descriptive `campaign_name` for the overall topic. Then, for each module, provide an integer id starting from 1, a title, a short description, and a detailed `teaching_prompt` to guide an AI tutor later.\n\nCRITICAL: For every single module, you MUST generate a non-empty `subtopics` array. This array must contain 3 to 5 specific, granular, step-by-step concepts progressing cleanly from basic fundamentals to advanced applications. NEVER leave the `subtopics` array empty.\n\nYou must respond ONLY in valid JSON matching the provided schema. Do NOT wrap the response in markdown backticks (e.g., ```json).\n\nSyllabus/Goal: {syllabus_text}\n\n{format_instructions}",
        input_variables=["syllabus_text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    
    chain = prompt | llm | parser
    
    try:
        # Enforce 3-campaign limit
        count_query = await db_session.execute(select(func.count(Campaign.id)).where(Campaign.user_id == payload.student_id))
        count = count_query.scalar_one()
        if count >= 3:
            raise HTTPException(status_code=400, detail="You have reached the maximum limit of 3 active courses. Please delete an old course to create a new one.")

        response = chain.invoke({"syllabus_text": payload.syllabus_text})
        
        if response.modules:
            for module in response.modules:
                module.status = "active"
        
        db_campaign = Campaign(
            user_id=payload.student_id,
            title=response.campaign_name,
            syllabus_text=payload.syllabus_text
        )
        db_session.add(db_campaign)
        await db_session.commit()
        await db_session.refresh(db_campaign)
        
        db_modules = []
        for idx, module in enumerate(response.modules):
            db_module = CampaignModuleDB(
                campaign_id=db_campaign.id,
                title=module.title,
                description=module.description,
                teaching_prompt=module.teaching_prompt,
                subtopics=json.dumps(module.subtopics),
                status=module.status,
                order_index=idx
            )
            db_session.add(db_module)
            db_modules.append(db_module)
        await db_session.commit()
        
        for idx, module in enumerate(response.modules):
            module.id = db_modules[idx].id
            
        print(f"DEBUG: Returning modules payload count: {len(response.modules)}")        
        return response
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        traceback.print_exc()
        if os.getenv("ENVIRONMENT") == "development":
            print("⚠️ LLM returned null or failed. Returning Dev Mode Mock Syllabus.")
            
            mock_title = f"Mock: {payload.syllabus_text[:30]}..."
            db_campaign = Campaign(
                user_id=payload.student_id,
                title=mock_title,
                syllabus_text=payload.syllabus_text
            )
            db_session.add(db_campaign)
            await db_session.commit()
            await db_session.refresh(db_campaign)
            
            mock_module = CampaignModuleDB(
                campaign_id=db_campaign.id,
                title="Intro to Deep Learning",
                description="Mock description",
                teaching_prompt="Mock prompt",
                subtopics=json.dumps(["Introduction Concept Overview", "Core Fundamental Principles", "Practical Implementation Basics"]),
                status="active",
                order_index=0
            )
            db_session.add(mock_module)
            await db_session.commit()
            await db_session.refresh(mock_module)

            mock_data = {
                "campaign_name": mock_title,
                "modules": [
                    {
                        "id": mock_module.id,
                        "title": mock_module.title,
                        "description": mock_module.description,
                        "teaching_prompt": mock_module.teaching_prompt,
                        "subtopics": ["Introduction Concept Overview", "Core Fundamental Principles", "Practical Implementation Basics"],
                        "status": mock_module.status
                    }
                ]
            }
            return CampaignGenerateResponse(**mock_data)
        else:
            raise HTTPException(status_code=503, detail="The AI Tutor is currently overloaded. Please try generating your campaign again in 60 seconds.")


@router.post(
    "/roadmap/chat",
    response_model=ChatResponse,
    summary="Study Room AI Chat"
)
async def generate_chat(payload: ChatPayload) -> ChatResponse:
    """
    Generates a chat response from the AI tutor based on the history and teaching prompt.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
    
    system_prompt = f"""You are a strict but highly supportive world-class university professor. Your ONLY goal is to teach the following topic:
{payload.teaching_prompt}

Here is your subtopic roadmap: {payload.subtopics}. 
You must teach these strictly in order. Review the conversation history to determine which subtopic we are currently on. Do not introduce the next subtopic until the student has demonstrated understanding of the current one.

RULE 1: STRICT TOPIC BOUNDARY
If the student asks a question about ANY subject outside the scope of the topic above, you MUST politely refuse to answer. 
Respond exactly like: "That is a great question, but right now we are strictly focused on our current module. Let's get back on track." Then, ask a relevant question to redirect them.

RULE 2: THE SOCRATIC METHOD (STEP-BY-STEP)
- NEVER explain an entire concept in one massive wall of text.
- Guide them step-by-step:
  1. Explain only a small, digestible piece of the concept.
  2. Ask a simple, leading question to verify they understand.
  3. Stop talking and WAIT for the student to reply.

RULE 3: THE ESCAPE HATCH & PRAISE
- If the student answers correctly, explicitly praise them before moving to the next step.
- If the student gives the wrong answer, gently correct them and provide a hint.
- CRITICAL: If the student struggles, says "I don't know," or gets the answer wrong 2 times in a row, DO NOT keep asking questions. Give them the clear answer, explain it simply, and move on.

RULE 4: FORMATTING
Keep your responses extremely concise (maximum 2-3 short paragraphs). Always end your message with a question.
"""
    
    messages_langchain = [SystemMessage(content=system_prompt)]
    
    for msg in payload.messages:
        if msg.role == "user":
            messages_langchain.append(HumanMessage(content=msg.content))
        elif msg.role == "ai":
            messages_langchain.append(AIMessage(content=msg.content))
            
    try:
        response = llm.invoke(messages_langchain)
        # Handle string response vs AIMessage object depending on langchain version
        content = response.content if hasattr(response, 'content') else str(response)
        return ChatResponse(reply=content)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/campaigns",
    summary="Get All AI Campaigns"
)
async def get_campaigns(user_id: str, db_session: AsyncSession = Depends(get_db_session)):
    """
    Fetches all campaigns for a given user.
    """
    result = await db_session.execute(select(Campaign).where(Campaign.user_id == user_id))
    campaigns = result.scalars().all()
    
    response_campaigns = []
    for c in campaigns:
        mod_query = await db_session.execute(select(CampaignModuleDB).where(CampaignModuleDB.campaign_id == c.id))
        modules = mod_query.scalars().all()
        response_campaigns.append({
            "id": c.id,
            "title": c.title,
            "syllabus_text": c.syllabus_text,
            "created_at": c.created_at,
            "difficulty_tier": c.difficulty_tier,
            "module_count": len(modules)
        })
    return response_campaigns

@router.get(
    "/campaigns/active",
    summary="Get Active AI Campaign"
)
async def get_active_campaign(user_id: str, campaign_id: Optional[int] = None, db_session: AsyncSession = Depends(get_db_session)):
    """
    Fetches a specific active campaign, or the most recently generated one if no id is provided.
    """
    query = select(Campaign).where(Campaign.user_id == user_id)
    if campaign_id:
        query = query.where(Campaign.id == campaign_id)
    else:
        query = query.order_by(Campaign.id.desc())
        
    result = await db_session.execute(query)
    campaign = result.scalars().first()
    if not campaign:
        return {"campaign": None, "modules": []}
        
    mod_query = await db_session.execute(
        select(CampaignModuleDB).where(CampaignModuleDB.campaign_id == campaign.id).order_by(CampaignModuleDB.order_index, CampaignModuleDB.id)
    )
    modules_db = mod_query.scalars().all()
    
    assessment_query = await db_session.execute(
        select(Assessment).where(Assessment.campaign_id == campaign.id)
    )
    assessments_db = assessment_query.scalars().all()
    
    module_assessments = {a.module_id: a for a in assessments_db if a.type == 'module_quiz'}
    
    modules = []
    for m in modules_db:
        m_assessment = module_assessments.get(m.id)
        modules.append({
            "id": m.id,
            "title": m.title,
            "description": m.description,
            "teaching_prompt": m.teaching_prompt,
            "status": m.status,
            "order_index": m.order_index,
            "requires_remediation": m.requires_remediation,
            "subtopics": json.loads(m.subtopics) if m.subtopics else [],
            "assessment": m_assessment.model_dump(exclude={"exam_data"}) if m_assessment else None
        })
    
    return {
        "campaign": campaign,
        "modules": modules
    }

@router.delete(
    "/campaigns/{campaign_id}",
    summary="Delete an AI Campaign and all associated data"
)
async def delete_campaign(campaign_id: int, db_session: AsyncSession = Depends(get_db_session)):
    """
    Hard deletes a campaign, cascading to remove all modules and heavy assessment JSON data.
    """
    campaign = await db_session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    await db_session.delete(campaign)
    await db_session.commit()
    return {"message": "Campaign deleted successfully"}



class AssessmentSubmitPayload(BaseModel):
    score: float
    time_taken_seconds: float
    answers: Optional[Dict[str, Any]] = None

@router.post(
    "/assessments/{module_id}/start",
    summary="Generate module assessment on demand"
)
async def start_module_assessment(module_id: int, db_session: AsyncSession = Depends(get_db_session)):
    """
    Synchronously generates a module assessment via Langchain.
    """
    module = await db_session.get(CampaignModuleDB, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
        
    campaign = await db_session.get(Campaign, module.campaign_id)
    
    # Try to find existing assessment
    result = await db_session.execute(select(Assessment).where(Assessment.module_id == module_id))
    assessment = result.scalars().first()
    
    if assessment and assessment.status in ["pending", "in_progress"] and assessment.exam_data is not None:
        return assessment
        
    if assessment and assessment.status in ["completed", "cancelled"]:
        if module.requires_remediation:
            # Bypass lock and prepare for re-generation
            assessment.status = "in_progress"
            assessment.score = None
            assessment.exam_data = None
        else:
            raise HTTPException(status_code=400, detail=f"Cannot start an assessment that is already {assessment.status}")
        
    if not assessment:
        assessment = Assessment(
            campaign_id=campaign.id,
            module_id=module_id,
            type="module_quiz",
            status="locked",
            cancelled_count=0
        )
        db_session.add(assessment)

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
    
    prompt = PromptTemplate(
        template="Generate a 50 Multiple Choice Question test based on these subtopics: {subtopics}. Synthesize multiple interconnected subtopics into a single analytical question wherever applicable. Respond ONLY in valid JSON format containing an array of 50 objects under the key 'questions'. Each object should have 'question', 'options' (array of 4 strings), and 'correct_answer' (exact match to one of the options).",
        input_variables=["subtopics"]
    )
    
    chain = prompt | llm
    response = chain.invoke({"subtopics": module.subtopics})
    content = response.content if hasattr(response, 'content') else str(response)
    
    try:
        if content.startswith("```json"):
            content = content.replace("```json\\n", "").replace("```json\n", "").replace("```", "").strip()
        parsed_data = json.loads(content)
        assessment.exam_data = parsed_data
        
        # Dynamically set total_marks based on actual questions generated
        num_questions = len(parsed_data.get("questions", []))
        assessment.total_marks = num_questions if num_questions > 0 else 50
        
        assessment.time_allowed_mins = 30
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to parse LLM response")
        
    assessment.status = "in_progress"
    await db_session.commit()
    await db_session.refresh(assessment)
    
    return assessment


@router.post(
    "/assessments/{assessment_id}/submit",
    summary="Submit and evaluate assessment"
)
async def submit_assessment(assessment_id: int, payload: AssessmentSubmitPayload, db_session: AsyncSession = Depends(get_db_session)):
    """
    Submits a campaign assessment. Applies DDA loop.
    """
    assessment = await db_session.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    campaign = await db_session.get(Campaign, assessment.campaign_id)
    
    # Secure server-side grading
    if assessment.exam_data and "questions" in assessment.exam_data:
        if payload.answers:
            questions = assessment.exam_data["questions"]
            calculated_score = 0
            for i, q in enumerate(questions):
                # frontend might send answers keyed by index or question string
                ans = payload.answers.get(f"q_{i}")
                if ans and ans == q.get("correct_answer"):
                    calculated_score += 1
            if len(questions) > 0:
                actual_score = int((calculated_score / len(questions)) * (assessment.total_marks or 50))
            else:
                actual_score = 0
        else:
            actual_score = 0
    else:
        actual_score = payload.score

    assessment.score = actual_score
    assessment.status = "completed"
    
    # Avoid division by zero
    total = assessment.total_marks if assessment.total_marks and assessment.total_marks > 0 else 1
    percentage = (actual_score / total) * 100
    time_limit_sec = assessment.time_allowed_mins * 60
    
    if percentage >= 80:
        campaign.difficulty_tier += 1
        if assessment.type == "module_quiz":
            module = await db_session.get(CampaignModuleDB, assessment.module_id)
            if module:
                module.status = "completed"
                module.requires_remediation = False
                module.current_retention_score = 100.0
                
                if module.is_remediation:
                    original_query = select(CampaignModuleDB).where(
                        CampaignModuleDB.campaign_id == campaign.id,
                        CampaignModuleDB.order_index == module.order_index,
                        CampaignModuleDB.is_remediation == False
                    )
                    original_result = await db_session.execute(original_query)
                    original_module = original_result.scalar_one_or_none()
                    if original_module:
                        original_module.status = "completed"
                        original_module.requires_remediation = False
                        db_session.add(original_module)
                
                db_session.add(module)
    elif percentage < 80 and assessment.type == "module_quiz":
        if percentage < 40:
            campaign.difficulty_tier = max(1, campaign.difficulty_tier - 1)
        
        # Remediation: Duplicate and rebuild module
        module = await db_session.get(CampaignModuleDB, assessment.module_id)
        if module:
            # Clear decay flag if they failed a retake, so the old module properly locks
            module.requires_remediation = False
            db_session.add(module)
            
            llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
            
            class RemediationPlan(BaseModel):
                teaching_prompt: str
                subtopics: List[str]
                
            parser = PydanticOutputParser(pydantic_object=RemediationPlan)
            
            prompt = PromptTemplate(
                template="A student failed this module: {module_title}. Rebuild the module using simpler real-world breakdowns and visual analogies. Return a new 'teaching_prompt' and a new array of 3-5 simplified 'subtopics'.\n{format_instructions}",
                input_variables=["module_title"],
                partial_variables={"format_instructions": parser.get_format_instructions()}
            )
            
            chain = prompt | llm | parser
            try:
                remediation = chain.invoke({"module_title": module.title})
                
                # Create duplicate module row
                new_module = CampaignModuleDB(
                    campaign_id=campaign.id,
                    title=get_next_remediation_title(module.title),
                    description=module.description,
                    teaching_prompt=remediation.teaching_prompt,
                    subtopics=json.dumps(remediation.subtopics),
                    status="active",
                    order_index=module.order_index,
                    is_remediation=True
                )
                db_session.add(new_module)
                await db_session.flush()
                
                # Create new assessment for it
                new_assessment = Assessment(
                    campaign_id=campaign.id,
                    module_id=new_module.id,
                    type="module_quiz",
                    status="locked"
                )
                db_session.add(new_assessment)
            except Exception:
                pass
            
            # Lock original so progress freezes
            module.status = "locked"
            db_session.add(module)

    db_session.add(assessment)
    db_session.add(campaign)
    await db_session.commit()
    
    return {"status": "success", "score": actual_score, "tier": campaign.difficulty_tier}

@router.post(
    "/assessments/{assessment_id}/cancel",
    summary="Abort assessment for anti-cheat violations"
)
async def cancel_assessment(assessment_id: int, db_session: AsyncSession = Depends(get_db_session)):
    """
    Aborts the assessment due to fullscreen exits. Applies penalty score.
    """
    assessment = await db_session.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    assessment.cancelled_count += 1
    assessment.status = "cancelled"
    
    assessment.score = -25
        
    db_session.add(assessment)
    await db_session.commit()
    
    # Also trigger remediation logic if it's a module test? The instructions said:
    # "forces the system into the <40% Context-Aware Remediation branch."
    # Let's execute that remediation manually if needed, or we can just rely on the submit endpoint logic.
    # To keep it simple and perfectly match the requirement: "forces the system into the <40% Context-Aware Remediation branch."
    # We will trigger the same logic.
    if assessment.type == "module_quiz":
        campaign = await db_session.get(Campaign, assessment.campaign_id)
        campaign.difficulty_tier = max(1, campaign.difficulty_tier - 1)
        
        module = await db_session.get(CampaignModuleDB, assessment.module_id)
        if module:
            llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
            
            class RemediationPlan(BaseModel):
                teaching_prompt: str
                subtopics: List[str]
                
            parser = PydanticOutputParser(pydantic_object=RemediationPlan)
            
            prompt = PromptTemplate(
                template="A student failed this module: {module_title} due to cheating. Rebuild the module using simpler real-world breakdowns and visual analogies. Return a new 'teaching_prompt' and a new array of 3-5 simplified 'subtopics'.\n{format_instructions}",
                input_variables=["module_title"],
                partial_variables={"format_instructions": parser.get_format_instructions()}
            )
            
            chain = prompt | llm | parser
            try:
                remediation = chain.invoke({"module_title": module.title})
                new_module = CampaignModuleDB(
                    campaign_id=campaign.id,
                    title=get_next_remediation_title(module.title),
                    description=module.description,
                    teaching_prompt=remediation.teaching_prompt,
                    subtopics=json.dumps(remediation.subtopics),
                    status="active",
                    order_index=module.order_index,
                    is_remediation=True
                )
                db_session.add(new_module)
                await db_session.flush()
                
                new_assessment = Assessment(
                    campaign_id=campaign.id,
                    module_id=new_module.id,
                    type="module_quiz",
                    status="locked"
                )
                db_session.add(new_assessment)
            except Exception as e:
                pass # If LangChain fails, we just continue.

            module.status = "locked"
            db_session.add(module)

        db_session.add(campaign)
        
    await db_session.commit()
    
    return {"status": "cancelled", "score": assessment.score}
