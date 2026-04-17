import os
import uuid
import shutil
import json
import asyncio
import traceback
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
from services.parser_service import parse_document, parse_document_stream
from models.database import get_db, Project, UsageLog
from models.project_models import ProjectSaveRequest, ProjectRenameRequest, IdeaEnhanceRequest, IdeaSaveRequest, DraftGenerateRequest, HwpxGenerateRequest, EnhanceGenerateRequest
from services.pdf_service import convert_hwpx_to_pdf
from services.gemini_service import enhance_business_idea
from services.notebooklm_service import notebooklm_service
from services.pyhwpx_service import generate_hwpx_with_pyhwpx

router = APIRouter(prefix="/api", tags=["Projects"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Gemini 모델별 가격 정보 (1백만 토큰당 USD) - 추정치
MODEL_PRICING = {
    "models/gemini-3-flash-preview": {"input": 0.50, "output": 3.00},
    "models/gemini-3.1-flash-lite-preview": {"input": 0.25, "output": 1.50},
    "models/gemini-3.1-pro-preview": {"input": 2.00, "output": 12.00},
    "models/gemini-2.5-flash": {"input": 0.30, "output": 2.50},
    "models/gemini-2.5-pro": {"input": 1.25, "output": 10.00},
}

from collections import defaultdict

class DraftingManager:
    """백그라운드에서 실행되는 초안 작성 작업을 관리합니다."""
    def __init__(self):
        # document_id -> asyncio.Task
        self.tasks = {}
        # document_id -> 리스트[asyncio.Queue] (여러 브라우저 연결 대응)
        self.queues = defaultdict(list)
        # document_id -> 마지막 상태 메시지 (새로고침 시 복구용)
        self.last_status = {}
        # document_id -> 메시지 히스토리 (SSE 연결 지연 시 누락 방지)
        self.status_history = defaultdict(list)

    def is_running(self, document_id: str) -> bool:
        task = self.tasks.get(document_id)
        return task is not None and not task.done()

    async def start_task(self, document_id: str, coro_func):
        if self.is_running(document_id):
            print(f"[MANAGER] Task already running for {document_id}")
            return
        
        # 실제 코루틴 실행
        self.status_history[document_id] = [] # 히스토리 초기화
        task = asyncio.create_task(coro_func())
        self.tasks[document_id] = task
        self.last_status[document_id] = "백그라운드 작업 시작 중..."
        
        # 태스크 종료 시 정리
        task.add_done_callback(lambda t: self._cleanup(document_id))
        print(f"[MANAGER] Started background task for {document_id}")

    def _cleanup(self, document_id: str):
        if document_id in self.tasks:
            del self.tasks[document_id]
        
        # 대기 중인 큐들에게 종료 알림
        for q in self.queues[document_id]:
            q.put_nowait(None)
        
        self.queues[document_id] = []
        # 히스토리는 잠시 유지했다가 다른 곳에서 정리하거나 혹은 여기서 정리
        # (너무 빨리 지우면 마지막 완료 메시지 수신 전에 지워질 수 있음)
        # 여기서는 유지하고, start_task 시점에 초기화하도록 변경
        print(f"[MANAGER] Cleaned up task for {document_id}")

    def cancel_task(self, document_id: str):
        task = self.tasks.get(document_id)
        if task:
            task.cancel()
            print(f"[MANAGER] Cancel requested for {document_id}")
            return True
        return False

    async def broadcast(self, document_id: str, message: str):
        """진행 상황을 모든 연결된 큐에 전파합니다."""
        self.last_status[document_id] = message
        self.status_history[document_id].append(message)
        queues = self.queues.get(document_id, [])
        for q in queues:
            await q.put(message)

    def subscribe(self, document_id: str) -> asyncio.Queue:
        """메시지를 수신할 큐를 생성하고 반환합니다."""
        q = asyncio.Queue()
        self.queues[document_id].append(q)
        return q

    def unsubscribe(self, document_id: str, q: asyncio.Queue):
        if document_id in self.queues:
            if q in self.queues[document_id]:
                self.queues[document_id].remove(q)

# 전역 매니저 및 락 인스턴스
drafting_manager = DraftingManager()
enhancement_manager = DraftingManager() 
hwpx_manager = DraftingManager() # HWPX 생성 전용 매니저 추가
hwpx_global_lock = asyncio.Lock() # HWPX는 COM 객체를 사용하므로 다중 사용자 충돌 방지를 위해 전역 락 사용

def log_usage(document_id: str, model_id: str, usage: dict, db: Session, task_type: str = "analysis"):
    """토큰 사용량을 계산하고 DB에 기록합니다."""
    # models/ 접두사 일관성 유지
    full_model_id = model_id if model_id.startswith("models/") else f"models/{model_id}"
    
    pricing = MODEL_PRICING.get(full_model_id, {"input": 0.0, "output": 0.0})
    
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    
    # 입력과 출력 토큰이 모두 0이면 로그를 기록하지 않습니다.
    if input_tokens == 0 and output_tokens == 0:
        return

    # 비용 계산 (1M 토큰당 가격 기준)
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    total_cost = input_cost + output_cost
    
    log_entry = UsageLog(
        document_id=document_id,
        model_id=full_model_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=usage.get("total_tokens", 0),
        task_type=task_type,
        estimated_cost={
            "usd": round(total_cost, 6),
            "input_usd": round(input_cost, 6),
            "output_usd": round(output_cost, 6),
            "unit": "USD"
        }
    )
    db.add(log_entry)
    db.commit()

@router.get("/health")
async def health_check():
    """서버 헬스 체크 엔드포인트"""
    return {"status": "ok", "message": "Server is running smoothly."}

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...), 
    model_id: str = "models/gemini-3-flash-preview",
    db: Session = Depends(get_db)
):
    """문서를 업로드하고 지정된 모델로 분석을 시작합니다."""
    try:
        document_id = str(uuid.uuid4())
        
        # 파일 저장 경로 및 이름 설정
        _, ext = os.path.splitext(file.filename)
        filename = f"{document_id}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
 
        # uploads/ 디렉토리에 파일 저장
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 분석 실행 (사례 정보를 포함한 결과 리턴)
        analysis_result = parse_document(filepath, model_id=model_id)
        document_tree = analysis_result.get("nodes", [])
        usage = analysis_result.get("usage", {})
 
        # PDF 변환 (미리보기용)
        pdf_filename = f"{document_id}.pdf"
        pdf_path = os.path.join(UPLOAD_DIR, pdf_filename)
        convert_hwpx_to_pdf(filepath, pdf_path)
 
        # DB에 분석 결과 캐시 저장
        project = Project(
            document_id=document_id,
            filename=file.filename,
            parsed_tree=document_tree
        )
        db.add(project)
        
        # 사용량 기록
        log_usage(document_id, model_id, usage, db, task_type="analysis")
        
        db.commit()
 
        return {
            "document_id": document_id,
            "tree": document_tree,
            "usage": usage,
            "pdf_url": f"/uploads/{pdf_filename}"
        }
 
    except Exception as e:
        # 에러 메시지를 프론트엔드로 전달
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-stream")
async def upload_document_stream(
    file: UploadFile = File(...),
    model_id: str = Form("gemini-3-flash-preview"),
    db: Session = Depends(get_db)
):
    """실시간 진행 상태를 보고하며 문서를 업로드하고 분석합니다."""
    document_id = str(uuid.uuid4())
    filename = file.filename
    # 디렉토리 생성 및 파일 저장
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filepath = os.path.join(UPLOAD_DIR, f"{document_id}_{filename}")
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    async def event_generator():
        try:
            # 1. 문서 접수 보고
            yield f"data: {json.dumps({'status': 'received', 'message': '파일이 성공적으로 업로드되었습니다.', 'document_id': document_id})}\n\n"
            await asyncio.sleep(0.5) # 체감을 위한 아주 짧은 지연
            
            # 2. PDF 변환 (별도 미리보기용)
            yield f"data: {json.dumps({'status': 'preparing', 'message': '문서 미리보기를 준비하는 중 (PDF 변환)...'})}\n\n"
            pdf_filename = f"{document_id}.pdf"
            pdf_path = os.path.join(UPLOAD_DIR, pdf_filename)
            convert_hwpx_to_pdf(filepath, pdf_path)
            
            # 3. AI 분석 스트리밍 시작
            final_data = None
            async for event in parse_document_stream(filepath, model_id=model_id):
                # 이벤트 데이터 전송
                yield f"data: {json.dumps(event)}\n\n"
                if event["status"] == "completed":
                    final_data = event["data"]
            
            if final_data:
                # DB 저장 및 후처리
                project = Project(
                    document_id=document_id,
                    name=filename, # 최초 생성 시 이름은 파일명과 동일하게 설정
                    filename=filename,
                    parsed_tree=final_data["nodes"]
                )
                db.add(project)
                
                # 사용량 로깅
                log_usage(document_id, model_id, final_data.get("usage", {}), db, task_type="analysis")
                db.commit()
                
                # 최종 완료 시그널 (클라이언트에서 상태 마무리를 위해 사용)
                yield f"data: {json.dumps({'status': 'final', 'document_id': document_id, 'name': filename, 'pdf_url': f'/uploads/{pdf_filename}', 'tree': final_data['nodes']})}\n\n"
            else:
                yield f"data: {json.dumps({'status': 'error', 'message': 'AI 분석 결과가 올바르지 않습니다.'})}\n\n"
                
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/projects/{document_id}/reanalyze-stream")
async def reanalyze_project_stream(
    document_id: str,
    model_id: str = Form("gemini-3-flash-preview"),
    db: Session = Depends(get_db)
):
    """지정된 모델로 재분석을 수행하며 실시간 상태를 보고합니다."""
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 원본 파일 경로 찾기
    filename = project.filename
    # 저장된 파일 검색 (document_id로 시작하는 파일)
    candidates = [f for f in os.listdir(UPLOAD_DIR) if f.startswith(document_id) and not f.endswith(".pdf")]
    if not candidates:
        raise HTTPException(status_code=404, detail="Original document file not found")
    filepath = os.path.join(UPLOAD_DIR, candidates[0])

    async def event_generator():
        try:
            yield f"data: {json.dumps({'status': 'preparing', 'message': '재분석을 위해 문서를 불러오는 중...'})}\n\n"
            
            final_data = None
            async for event in parse_document_stream(filepath, model_id=model_id):
                yield f"data: {json.dumps(event)}\n\n"
                if event["status"] == "completed":
                    final_data = event["data"]
            
            if final_data:
                # DB 업데이트
                project.parsed_tree = final_data["nodes"]
                # 사용량 로깅
                log_usage(document_id, model_id, final_data.get("usage", {}), db, task_type="analysis")
                db.commit()
                
                yield f"data: {json.dumps({'status': 'final', 'document_id': document_id, 'tree': final_data['nodes']})}\n\n"
            else:
                yield f"data: {json.dumps({'status': 'error', 'message': '재분석 결과가 올바르지 않습니다.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.patch("/projects/{document_id}/rename")
async def rename_project(
    document_id: str, 
    request: ProjectRenameRequest,
    db: Session = Depends(get_db)
):
    """프로젝트의 이름을 변경합니다."""
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project.name = request.new_name
    db.commit()
    return {"status": "success", "new_name": project.name}

@router.get("/usage")
async def get_usage_statistics(db: Session = Depends(get_db)):
    """API 사용량 및 비용 통계를 반환합니다."""
    logs = db.query(UsageLog).order_by(UsageLog.created_at.desc()).all()
    
    # 간단한 집계
    total_input = sum(log.input_tokens for log in logs)
    total_output = sum(log.output_tokens for log in logs)
    total_cost_usd = sum(log.estimated_cost.get("usd", 0.0) for log in logs) if logs else 0.0
    
    # 작업별 집계
    tasks = {}
    for log in logs:
        t = getattr(log, "task_type", "analysis")
        if t not in tasks:
            tasks[t] = {"input_tokens": 0, "output_tokens": 0, "usd": 0.0, "calls": 0}
        tasks[t]["input_tokens"] += log.input_tokens
        tasks[t]["output_tokens"] += log.output_tokens
        tasks[t]["usd"] += log.estimated_cost.get("usd", 0.0)
        tasks[t]["calls"] += 1

    for k in tasks:
        tasks[k]["usd"] = round(tasks[k]["usd"], 4)
    
    return {
        "summary": {
            "total_calls": len(logs),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_estimated_cost_usd": round(total_cost_usd, 4),
            "by_task": tasks
        },
        "logs": [
            {
                "id": log.id,
                "document_id": log.document_id,
                "model_id": log.model_id,
                "task_type": getattr(log, "task_type", "analysis"),
                "input_tokens": log.input_tokens,
                "output_tokens": log.output_tokens,
                "cost": log.estimated_cost,
                "timestamp": log.created_at.strftime("%Y-%m-%d %H:%M:%S")
            }
            for log in logs
        ]
    }

@router.delete("/projects/usage/{log_id}")
async def delete_usage_log(log_id: int, db: Session = Depends(get_db)):
    """특정 비용 로그를 삭제합니다."""
    log = db.query(UsageLog).filter(UsageLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
        
    db.delete(log)
    db.commit()
    return {"status": "success", "message": "Log deleted successfully"}

@router.post("/projects/{document_id}/reanalyze")
async def reanalyze_project(
    document_id: str, 
    model_id: str = "models/gemini-3-flash-preview", 
    db: Session = Depends(get_db)
):
    """이미 업로드된 파일을 다른 모델로 다시 분석합니다."""
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    try:
        _, ext = os.path.splitext(project.filename)
        filepath = os.path.join(UPLOAD_DIR, f"{document_id}{ext}")
        
        if not os.path.exists(filepath):
            # 파일이 없으면 uploads 폴더 재탐색
            found = False
            for root, dirs, files in os.walk(UPLOAD_DIR):
                for file in files:
                    if file.startswith(document_id):
                        filepath = os.path.join(root, file)
                        found = True
                        break
                if found: break
            
            if not found:
                raise HTTPException(status_code=404, detail="Original file not found for re-analysis")

        # 새로운 모델로 다시 분석
        analysis_result = parse_document(filepath, model_id=model_id)
        document_tree = analysis_result.get("nodes", [])
        usage = analysis_result.get("usage", {})
        
        # 결과 업데이트
        project.parsed_tree = document_tree
        
        # 사용량 신규 기록
        log_usage(document_id, model_id, usage, db)
        
        db.commit()
        
        return {
            "document_id": document_id,
            "tree": document_tree,
            "usage": usage,
            "status": "re-analyzed"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/save")
async def save_project(request: ProjectSaveRequest, db: Session = Depends(get_db)):
    """프론트엔드에서 선택한 항목(selected_node_ids) 및 수정된 트리 데이터를 저장합니다."""
    project = db.query(Project).filter(Project.document_id == request.document_id).first()
    if project:
        project.selected_node_ids = request.selected_node_ids
        project.content_node_ids = request.content_node_ids
        # 사용자 정의 이름 반영 (있을 경우만)
        if request.name:
            project.name = request.name
        # 초안 편집 후 저장: tree_data가 전달되면 parsed_tree를 업데이트
        if request.tree_data is not None and len(request.tree_data) > 0:
            print(f"[BACKEND] Updating parsed_tree with edited draft data ({len(request.tree_data)} top-level nodes)")
            project.parsed_tree = request.tree_data
    else:
        project = Project(
            document_id=request.document_id,
            name=request.name or request.filename,
            filename=request.filename,
            selected_node_ids=request.selected_node_ids,
            content_node_ids=request.content_node_ids,
            parsed_tree=request.tree_data  # 신규 생성 시에도 트리 데이터 저장
        )
        db.add(project)
    
    db.commit()
    return {"status": "success", "message": "Project saved successfully"}
@router.post("/projects/{document_id}/idea/enhance")
async def enhance_idea(document_id: str, request: IdeaEnhanceRequest, db: Session = Depends(get_db)):
    """사용자의 아이디어를 마스터 브리프로 고도화합니다."""
    if document_id != request.document_id:
        raise HTTPException(status_code=400, detail="Document ID mismatch")
        
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        result = await enhance_business_idea(request.idea_text, request.model_id)
        
        # 비용 기록
        if result.get("usage"):
            log_usage(document_id, request.model_id, result["usage"], db, task_type="idea_enhance")
            
        return {
            "status": "success",
            "master_brief": result["master_brief"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/{document_id}/idea/enhance-stream")
async def enhance_idea_stream(
    document_id: str, 
    request: IdeaEnhanceRequest,
    db: Session = Depends(get_db)):
    """사용자의 아이디어를 마스터 브리프로 고도화하며 실시간 피드백을 제공합니다."""
    
    if document_id != request.document_id:
        raise HTTPException(status_code=400, detail="Document ID mismatch")
        
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def event_generator():
        try:
            from services.gemini_service import enhance_business_idea_stream
            async for chunk in enhance_business_idea_stream(request.idea_text, request.model_id):
                # 방어 로직: chunk가 dict인지 확인
                if not isinstance(chunk, dict):
                    print(f"[BACKEND] Skipping non-dict chunk: {chunk}")
                    continue

                # 데이터가 완료 상태이면 요금 및 결과 로깅
                if chunk.get("status") == "completed":
                    data = chunk.get("data")
                    if isinstance(data, dict) and data.get("usage"):
                        # 스트리밍 방식에서는 usage 정보 활용이 제한적일 수 있음.
                        log_usage(document_id, request.model_id, data["usage"], db, task_type="idea_enhance")
                
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            traceback.print_exc()
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/projects/{document_id}/idea/save")
async def save_idea(document_id: str, request: IdeaSaveRequest, db: Session = Depends(get_db)):
    """확정된 마스터 브리프를 프로젝트 DB에 저장합니다."""
    if document_id != request.document_id:
        raise HTTPException(status_code=400, detail="Document ID mismatch")
        
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    project.master_brief = request.master_brief
    if hasattr(project, "initial_idea"):
        project.initial_idea = request.initial_idea
    db.commit()
    
    return {"status": "success", "message": "아이디어가 성공적으로 저장되었습니다."}

from datetime import datetime, timedelta
from sqlalchemy import or_

@router.get("/projects")
async def list_projects(
    keyword: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """검색 및 기간 필터를 적용하여 저장된 프로젝트 목록을 반환합니다."""
    query = db.query(Project)
    
    # 키워드 검색 (프로젝트명 또는 원본 파일명)
    if keyword:
        query = query.filter(
            or_(
                Project.name.ilike(f"%{keyword}%"),
                Project.filename.ilike(f"%{keyword}%")
            )
        )
    
    # 기간 검색 (생성일 기준)
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(Project.created_at >= start_dt)
        except ValueError:
            pass
            
    if end_date:
        try:
            # 종료일의 경우 해당 날짜의 23:59:59까지 포함하도록 처리
            end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1) - timedelta(seconds=1)
            query = query.filter(Project.created_at <= end_dt)
        except ValueError:
            pass
            
    projects = query.order_by(Project.created_at.desc()).all()
    
    result = []
    for p in projects:
        # 누적형 진행 프로세스 판별 로직 (Sequential)
        
        # 3단계: 초안(Draft) 유무 확인
        has_any_draft = False
        if p.parsed_tree:
            def check_draft_content(nodes):
                if not nodes or not isinstance(nodes, list):
                    return False
                for n in nodes:
                    # 방어 로직: n이 딕셔너리가 아닌 경우 스킵 (손상된 데이터 대응)
                    if not isinstance(n, dict):
                        continue
                    if n.get("draft_content") and len(n["draft_content"].strip()) > 0: return True
                    if n.get("children") and check_draft_content(n["children"]): return True
                return False
            has_any_draft = check_draft_content(p.parsed_tree)
        is_draft_done = has_any_draft or (p.notebook_id is not None)

        # 2단계: 아이디어(Idea) 유무 확인 (초안이 있으면 아이디어도 완료된 것으로 간주)
        is_idea_done = (p.master_brief is not None and len(p.master_brief.strip()) > 0) or is_draft_done
        
        # 1단계: 분석(Analysis) 유무 확인 (아이디어나 초안이 있으면 분석도 당연히 완료된 것)
        is_analysis_done = (p.selected_node_ids is not None and len(p.selected_node_ids) > 0) or is_idea_done

        # 4단계: 완성(Proposal Complete) - 고도화 내용 유무 확인
        has_any_enhanced = False
        if p.parsed_tree:
            def check_enhanced_content(nodes):
                if not nodes or not isinstance(nodes, list): return False
                for n in nodes:
                    if not isinstance(n, dict): continue
                    if n.get("extended_content") and len(n["extended_content"].strip()) > 0: return True
                    if n.get("children") and check_enhanced_content(n["children"]): return True
                return False
            has_any_enhanced = check_enhanced_content(p.parsed_tree)
        
        is_final_complete = has_any_enhanced

        statuses = {
            "analysis": is_analysis_done,
            "idea_enhance": is_idea_done,
            "draft_generate": is_draft_done,
            "proposal_complete": is_final_complete
        }
        
        result.append({
            "id": str(p.id),
            "document_id": p.document_id,
            "name": p.name or p.filename,
            "filename": p.filename,
            "status": statuses,
            "updatedAt": p.created_at.strftime("%Y-%m-%d")
        })
        
    return result
@router.get("/projects/{document_id}/export")
async def export_project(document_id: str, db: Session = Depends(get_db)):
    """저장된 노드들을 기반으로 실제 트리 컨텐츠를 필터링하여 최종 JSON을 반환합니다."""
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # DB에 캐싱된 트리가 있으면 그대로 사용, 없으면 파일에서 파싱 (이전 호환성용)
    tree = project.parsed_tree if project and project.parsed_tree else []
    if not tree:
        _, ext = os.path.splitext(project.filename)
        filepath = os.path.join(UPLOAD_DIR, f"{document_id}{ext}")
        if not os.path.exists(filepath):
            for root, dirs, files in os.walk(UPLOAD_DIR):
                for file in files:
                    if file.startswith(document_id):
                        filepath = os.path.join(root, file)
                        break
        tree = parse_document(filepath) if os.path.exists(filepath) else []
        if tree:
            project.parsed_tree = tree
            db.commit()
    
    selected_set = {str(i) for i in (project.selected_node_ids or [])}
    content_set = {str(i) for i in (project.content_node_ids or [])}
    
    # 선택된 노드 및 자식이 선택된 부모 구조를 유지하며 필터링
    def filter_tree(nodes):
        result = []
        if not nodes or not isinstance(nodes, list):
            return result
            
        for n in nodes:
            if not isinstance(n, dict):
                continue
                
            orig_id = n.get("id", "")
            node_id = str(orig_id)
            if not node_id:
                continue
                
            children_filtered = filter_tree(n.get("children", []))
            
            # 선택된 노드이거나, 하위 노드 중 선택된 것이 있는 경우 포함
            is_selected = node_id in selected_set
            
            if is_selected or children_filtered:
                # 키 누락 방지를 위해 .get() 사용 및 기본값 할당
                new_node = {
                    "id": orig_id, # 원본 ID 타입 유지 (int/str)
                    "title": n.get("title", "제목 없음"),
                    "type": n.get("type", "heading"),
                    "content": node_id in content_set,
                    "node_address": n.get("node_address"), # 물리 주소 보존
                    "tableMetadata": n.get("tableMetadata"),
                    "writingGuide": n.get("writingGuide"),
                    "userInstruction": n.get("userInstruction"),
                    "children": children_filtered
                }
                result.append(new_node)
        return result
        
    filtered_tree = filter_tree(tree)
        
    return {
        "document_id": document_id,
        "filename": project.filename,
        "exported_nodes": project.selected_node_ids,
        "export_data": filtered_tree
    }

@router.get("/projects/{document_id}/load")
async def load_project(document_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # DB에 캐싱된 트리가 있으면 그대로 사용
    tree = project.parsed_tree if project and project.parsed_tree else []
    if not tree:
        _, ext = os.path.splitext(project.filename)
        filepath = os.path.join(UPLOAD_DIR, f"{document_id}{ext}")
        if not os.path.exists(filepath):
            for root, dirs, files in os.walk(UPLOAD_DIR):
                for file in files:
                    if file.startswith(document_id):
                        filepath = os.path.join(root, file)
                        break
        tree = parse_document(filepath) if os.path.exists(filepath) else []
        if tree:
            project.parsed_tree = tree
            db.commit()
    
    # ID 타입 불일치(int vs str) 방지를 위해 모두 문자열로 변환하여 비교
    selected_set = {str(i) for i in (project.selected_node_ids or [])}
    content_set = {str(i) for i in (project.content_node_ids or [])}
    
    def apply_checked(nodes):
        if not nodes or not isinstance(nodes, list):
            return
        for n in nodes:
            if not isinstance(n, dict):
                continue
            node_id = str(n.get("id", ""))
            n["checked"] = node_id in selected_set
            n["contentChecked"] = node_id in content_set
            if n.get("children"):
                apply_checked(n["children"])
                
    apply_checked(tree)
    
    return {
        "document_id": document_id,
        "name": getattr(project, "name", project.filename) or project.filename,
        "filename": project.filename,
        "tree": tree,
        "selected_node_ids": project.selected_node_ids,
        "content_node_ids": project.content_node_ids,
        "master_brief": project.master_brief,
        "initial_idea": getattr(project, "initial_idea", None),
        "pdf_url": f"/uploads/{document_id}.pdf"
    }


def find_and_update_node_recursive(nodes, target_id, content):
    """트리 내에서 target_id와 일치하는 노드를 찾아 draft_content를 업데이트합니다."""
    if not nodes or not isinstance(nodes, list):
        return nodes
    
    for node in nodes:
        if str(node.get("id")) == str(target_id):
            node["draft_content"] = content
            return nodes
        if "children" in node and node["children"]:
            find_and_update_node_recursive(node["children"], target_id, content)
    return nodes

def prepare_tree_for_drafting(nodes, selected_set, content_set):
    """현재 선택 상태(selected_set, content_set)를 기준으로 NotebookLM 서비스에 전달할 트리의 작성 여부를 제어합니다."""
    if not isinstance(nodes, list):
        return []
    result = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        prepared = dict(node)
        node_id = str(node.get("id", ""))
        
        # 문서에 포함(checked)되고, 내용 작성 대상(contentChecked)인 경우에만 초안 작성 허용
        is_content = (node_id in selected_set) and (node_id in content_set)
        prepared["content"] = bool(is_content)
        prepared["contentChecked"] = bool(is_content) # 백엔드 로직 충돌 방지를 위해 동기화
        
        if "children" in node and isinstance(node["children"], list):
            prepared["children"] = prepare_tree_for_drafting(node["children"], selected_set, content_set)
        result.append(prepared)
    return result


@router.get("/projects/{document_id}/draft/status")
async def get_draft_status(document_id: str):
    """현재 초안 작성이 백그라운드에서 진행 중인지 확인합니다."""
    is_running = drafting_manager.is_running(document_id)
    last_msg = drafting_manager.last_status.get(document_id, "")
    return {
        "is_running": is_running,
        "last_message": last_msg
    }

@router.post("/projects/{document_id}/draft/cancel")
async def cancel_draft_generation(document_id: str):
    """실행 중인 초안 작성 작업을 중단합니다."""
    success = drafting_manager.cancel_task(document_id)
    if success:
        return {"status": "success", "message": "초안 작성이 중단되었습니다."}
    else:
        return {"status": "error", "message": "중단할 작업이 없거나 이미 종료되었습니다."}

@router.post("/projects/{document_id}/draft/generate")
async def generate_draft_stream(
    document_id: str, 
    request: DraftGenerateRequest,
    db: Session = Depends(get_db)
):
    """백그라운드에서 초안을 생성하거나, 이미 진행 중인 작업의 스트림에 연결합니다."""
    print(f"[BACKEND] API Request: Generate draft (Background) for {document_id}")
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    master_brief = project.master_brief
    if not master_brief:
        raise HTTPException(status_code=400, detail="Master brief is required. Please complete Step 2 first.")
        
    pdf_path = os.path.join(UPLOAD_DIR, f"{document_id}.pdf")
    if not os.path.exists(pdf_path):
        pdf_path = None
        
    # 트리 데이터 준비
    raw_tree = project.parsed_tree or []
    if not raw_tree:
        raise HTTPException(status_code=400, detail="문서 구조 분석 데이터가 없습니다.")
        
    selected_set = {str(i) for i in (project.selected_node_ids or [])}
    content_set = {str(i) for i in (project.content_node_ids or [])}
    document_tree = prepare_tree_for_drafting(raw_tree, selected_set, content_set)
    project_name = project.name

    # 참고 자료 파일 경로 수집
    refs_dir = os.path.join(UPLOAD_DIR, f"{document_id}_refs")
    reference_file_paths = []
    if os.path.isdir(refs_dir):
        for fname in os.listdir(refs_dir):
            fpath = os.path.join(refs_dir, fname)
            if os.path.isfile(fpath):
                reference_file_paths.append(fpath)
    print(f"[BACKEND] Reference files for drafting: {len(reference_file_paths)} files")

    # 백그라운드에서 상주하며 일할 코루틴 정의
    async def run_drafting_task():
        from models.database import SessionLocal # 별도 세션 필요
        task_db = SessionLocal()
        try:
            print(f"[TASK] Background drafting started for {document_id}")
            async for progress in notebooklm_service.generate_draft_stream(
                document_id=document_id,
                master_brief=master_brief,
                document_tree=document_tree,
                pdf_path=pdf_path,
                research_mode=request.research_mode,
                project_name=project_name,
                reference_files=reference_file_paths
            ):
                # 1. 메시지 전파 (모든 연결된 큐에 전송)
                await drafting_manager.broadcast(document_id, progress)
                
                # 2. 중간 저장 로직 (task_db 사용)
                data = json.loads(progress)
                task_project = task_db.query(Project).filter(Project.document_id == document_id).first()
                if not task_project:
                    continue

                if data.get("status") == "node_updated":
                    node_id = data.get("node_id")
                    content = data.get("content")
                    if node_id and content:
                        import copy
                        current_tree = copy.deepcopy(task_project.parsed_tree)
                        updated_tree = find_and_update_node_recursive(current_tree, node_id, content)
                        task_project.parsed_tree = updated_tree
                        task_db.commit()

                if data.get("notebook_id"):
                    task_project.notebook_id = data.get("notebook_id")
                    task_db.commit()

                if data.get("status") == "completed":
                    final_tree = data.get("tree")
                    if final_tree and len(final_tree) > 0:
                        task_project.parsed_tree = final_tree
                        task_db.commit()
            
            print(f"[TASK] Background drafting finished for {document_id}")
        except asyncio.CancelledError:
            print(f"[TASK] Background drafting CANCELLED for {document_id}")
            await drafting_manager.broadcast(document_id, json.dumps({"status": "cancelled", "message": "사용자에 의해 작업이 취소되었습니다."}))
        except Exception as e:
            print(f"[TASK] Background drafting ERROR: {e}")
            await drafting_manager.broadcast(document_id, json.dumps({"status": "error", "message": str(e)}))
        finally:
            task_db.close()

    # 태스크가 실행 중이지 않다면 새로 시작
    if not drafting_manager.is_running(document_id):
        await drafting_manager.start_task(document_id, run_drafting_task)
    else:
        print(f"[BACKEND] Connecting to existing task for {document_id}")

    # SSE 이벤트 제너레이터 (클라이언트에게 큐 내용 전달)
    async def event_generator():
        q = drafting_manager.subscribe(document_id)
        print(f"[SSE] Client connected via queue for {document_id}")
        
        # [복구] 만약 작업이 이미 진행 중이라면 마지막 상태를 먼저 한 번 쏴줌 (새로고침 대응)
        if drafting_manager.last_status.get(document_id):
            yield f"data: {drafting_manager.last_status[document_id]}\n\n"

        try:
            while True:
                msg = await q.get()
                if msg is None: # 작업 종료 신호
                    break
                yield f"data: {msg}\n\n"
                
                # 작업 종료 여부 판단 로직
                try:
                    data = json.loads(msg)
                    if data.get("status") in ["completed", "error", "cancelled"]:
                        break
                except:
                    pass
                    
        except asyncio.CancelledError:
            print(f"[SSE] Client disconnected for {document_id}")
        finally:
            drafting_manager.unsubscribe(document_id, q)
            print(f"[SSE] Subscription closed for {document_id}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/projects/{document_id}/export_hwpx")
async def export_project_hwpx(
    document_id: str, 
    mode: str = "draft",  # "draft" 또는 "enhanced"
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not project.parsed_tree:
        raise HTTPException(status_code=400, detail="Draft content is empty. Please complete Draft Generation first.")
        
    # JSON 문자열인 경우 파싱
    tree_data = project.parsed_tree
    if isinstance(tree_data, str):
        try:
            tree_data = json.loads(tree_data)
        except:
            tree_data = []

    # 출력 파일명에 모드 포함
    output_filename = f"{document_id}_{mode}.hwpx"
    output_path = os.path.join(UPLOAD_DIR, output_filename)
    
    print(f"[BACKEND] Exporting {document_id} (Mode: {mode}) using PyHWPX engine...")
    success = generate_hwpx_with_pyhwpx(document_id, tree_data, output_path, mode=mode)
    
    if not success:
        error_msg = f"HWPX 파일 생성 중 오류가 발생했습니다. (모드: {mode})"
        raise HTTPException(status_code=500, detail=error_msg)
        
    display_name = f"{project.name}_고도화.hwpx" if mode == "enhanced" else f"{project.name}_초안.hwpx"
        
    return {
        "status": "success", 
        "download_url": f"/api/projects/download/{output_filename}",
        "filename": display_name
    }

@router.post("/generate-hwpx")
async def generate_hwpx_custom(request: HwpxGenerateRequest, db: Session = Depends(get_db)):
    """프론트엔드에서 전달받은 스타일 설정을 적용하여 HWPX 파일을 생성합니다. SSE 스트리밍 지원."""
    document_id = request.document_id
    style_config = request.style_config
    mode = request.mode or "draft"

    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not project.parsed_tree:
        raise HTTPException(status_code=400, detail="Content is empty.")
    
    tree_data = project.parsed_tree
    output_filename = f"{document_id}_styled_{mode}.hwpx"
    output_path = os.path.join(UPLOAD_DIR, output_filename)

    # 메인 루프 캡처
    main_loop = asyncio.get_running_loop()

    async def run_hwpx_gen():
        try:
            print(f"[HWPX] Starting generation task for {document_id}")
            
            # 사용자에게 대기열 진행 상태를 먼저 알림
            await hwpx_manager.broadcast(document_id, json.dumps({"status": "progress", "message": "[PYHWPX] 서버 HWP 엔진 가용 자원을 획득 대기 중입니다 (대기열 등재)..."}, ensure_ascii=False))
            
            # 전역 락을 획득하여 한 번에 하나의 HWPX 파일만 생성되도록 보장 (COM 객체 충돌 방지)
            async with hwpx_global_lock:
                await hwpx_manager.broadcast(document_id, json.dumps({"status": "progress", "message": "[PYHWPX] HWPX 엔진 초기화 중..."}, ensure_ascii=False))
                
                def progress_callback(msg):
                    try:
                        # 터미널과 동일한 느낌을 위해 [PYHWPX] 접두사 추가
                        full_msg = f"[PYHWPX] {msg}"
                        asyncio.run_coroutine_threadsafe(
                            hwpx_manager.broadcast(document_id, json.dumps({"status": "progress", "message": full_msg}, ensure_ascii=False)),
                            main_loop
                        )
                    except Exception as e:
                        print(f"[HWPX] Callback Error: {e}")
    
                # PyHWPX 작업은 별도 스레드에서 수행 (COM 초기화 필요성 때문)
                success = await main_loop.run_in_executor(
                    None, 
                    lambda: generate_hwpx_with_pyhwpx(
                        document_id, 
                        tree_data, 
                        output_path, 
                        style_config=style_config, 
                        mode=mode,
                        on_progress=progress_callback
                    )
                )

            if success:
                display_name = f"{project.name}_고도화_최종.hwpx" if mode == "enhanced" else f"{project.name}_초안_최종.hwpx"
                await hwpx_manager.broadcast(document_id, json.dumps({
                    "status": "completed", 
                    "message": "[PYHWPX] HWPX 파일이 성공적으로 생성되었습니다.",
                    "download_url": f"/api/projects/download/{output_filename}",
                    "filename": display_name
                }, ensure_ascii=False))
            else:
                await hwpx_manager.broadcast(document_id, json.dumps({"status": "error", "message": "[PYHWPX] HWPX 생성 엔진에서 오류가 발생했습니다."}, ensure_ascii=False))
        except Exception as e:
            print(f"[HWPX] Error: {str(e)}")
            traceback.print_exc()
            await hwpx_manager.broadcast(document_id, json.dumps({"status": "error", "message": f"시스템 오류: {str(e)}"}, ensure_ascii=False))

    # 이미 실행 중이면 세션 연결만, 아니면 새로 시작
    if not hwpx_manager.is_running(document_id):
        await hwpx_manager.start_task(document_id, run_hwpx_gen)

    # SSE 이벤트 제너레이터
    async def event_generator():
        q = hwpx_manager.subscribe(document_id)
        
        # 기존 히스토리 먼저 전송
        for old_msg in hwpx_manager.status_history[document_id]:
            yield f"data: {old_msg}\n\n"

        try:
            while True:
                msg = await q.get()
                if msg is None: break
                yield f"data: {msg}\n\n"
                
                try:
                    data = json.loads(msg)
                    if data.get("status") in ["completed", "error"]:
                        break
                except: pass
        finally:
            hwpx_manager.unsubscribe(document_id, q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/projects/download/{filename}")
async def download_project_file(filename: str):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
        
    from fastapi.responses import FileResponse
    return FileResponse(filepath, filename=filename)



@router.post("/projects/{document_id}/draft/reset")
async def reset_project_draft(document_id: str, db: Session = Depends(get_db)):
    """작업 초기화를 위해 프로젝트의 NotebookLM 진행 상태 및 생성된 초안을 완전히 리셋합니다."""
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # 1. 프로젝트 메인 상태 초기화 (노트북 세션 관련 데이터 모두 삭제)
    project.notebook_id = None
    project.research_mode = None
    project.persona_injected = 0
    
    # 2. parsed_tree 내의 모든 노드에 대해 'content' 및 'draft_content', 'extended_content' 필드 초기화
    def clear_content_recursive(nodes):
        if not nodes or not isinstance(nodes, list):
            return
        for node in nodes:
            # 초안 및 고도화 내용 모두 초기화
            if "draft_content" in node:
                node["draft_content"] = None
            if "extended_content" in node:
                node["extended_content"] = None
                
            if "children" in node and node["children"]:
                clear_content_recursive(node["children"])
    
    if project.parsed_tree:
        import copy
        new_tree = copy.deepcopy(project.parsed_tree)
        clear_content_recursive(new_tree)
        project.parsed_tree = new_tree
        
    db.commit()
    return {"status": "success", "message": "모든 진행 상태와 초안 데이터가 초기화되었습니다.", "tree": project.parsed_tree}

# --- 고도화 (Enhancement) 관련 엔드포인트 ---

@router.post("/projects/{document_id}/enhance/generate")
async def generate_enhanced_draft(
    document_id: str,
    req: EnhanceGenerateRequest,
    db: Session = Depends(get_db)
):
    """사업계획서 초안을 전문가 수준으로 고도화합니다 (백그라운드 실행)."""
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not project.notebook_id:
        raise HTTPException(status_code=400, detail="초안 작성이 먼저 완료되어야 고도화가 가능합니다.")
    
    if enhancement_manager.is_running(document_id):
        return {"status": "already_running", "message": "고도화 작업이 이미 진행 중입니다."}

    # 백그라운드 태스크 정의
    async def run_enhance():
        try:
            generator = notebooklm_service.generate_enhanced_draft_stream(
                document_id=document_id,
                notebook_id=project.notebook_id,
                document_tree=project.parsed_tree or [],
                run_deep_research=req.run_deep_research,
                project_name=project.name
            )
            
            async for chunk in generator:
                data = json.loads(chunk)
                
                # 실시간 노드 업데이트 처리
                if data.get("status") == "node_enhanced":
                    node_id = data.get("node_id")
                    content = data.get("content")
                    
                    # DB 세션 로컬 생성 (백그라운드 스레드 안전)
                    from models.database import SessionLocal as BackgroundSession
                    with BackgroundSession() as bdb:
                        b_project = bdb.query(Project).filter(Project.document_id == document_id).first()
                        if b_project and b_project.parsed_tree:
                            import copy
                            updated_tree = copy.deepcopy(b_project.parsed_tree)
                            
                            def update_node_recursive(nodes):
                                for n in nodes:
                                    if n.get("id") == node_id:
                                        n["extended_content"] = content
                                        return True
                                    if n.get("children") and update_node_recursive(n["children"]):
                                        return True
                                return False
                            
                            if update_node_recursive(updated_tree):
                                b_project.parsed_tree = updated_tree
                                bdb.commit()
                                print(f"[ENHANCE] Node {node_id} saved to DB.")
                
                # 모든 상태 메시지 브로드캐스트
                await enhancement_manager.broadcast(document_id, chunk)
                
        except asyncio.CancelledError:
            print(f"[ENHANCE] Task cancelled for {document_id}")
            await enhancement_manager.broadcast(document_id, json.dumps({"status": "error", "message": "작업이 사용자에 의해 중단되었습니다."}))
        except Exception as e:
            print(f"[ENHANCE] Task error: {str(e)}")
            traceback.print_exc()
            await enhancement_manager.broadcast(document_id, json.dumps({"status": "error", "message": str(e)}))

    # 태스크가 실행 중이지 않다면 새로 시작
    if not enhancement_manager.is_running(document_id):
        await enhancement_manager.start_task(document_id, run_enhance)
    else:
        print(f"[BACKEND] Connecting to existing enhancement task for {document_id}")

    # SSE 이벤트 제너레이터
    async def event_generator():
        q = enhancement_manager.subscribe(document_id)
        print(f"[SSE] Client connected to enhancement queue for {document_id}")
        
        # 복구 메시지 (새로고침 대응)
        if enhancement_manager.last_status.get(document_id):
            yield f"data: {enhancement_manager.last_status[document_id]}\n\n"

        try:
            while True:
                msg = await q.get()
                if msg is None: break
                yield f"data: {msg}\n\n"
                
                try:
                    data = json.loads(msg)
                    if data.get("status") in ["completed", "error", "cancelled"]:
                        break
                except: pass
        except asyncio.CancelledError:
            print(f"[SSE] Client disconnected (Enhance) for {document_id}")
        finally:
            enhancement_manager.unsubscribe(document_id, q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/projects/{document_id}/enhance/check")
async def check_enhance_status(document_id: str):
    """현재 고도화 작업이 진행 중인지 단순 상태를 반환합니다 (JSON)."""
    is_running = enhancement_manager.is_running(document_id)
    last_msg = ""
    last = enhancement_manager.last_status.get(document_id)
    if last:
        import json
        try:
            data = json.loads(last)
            last_msg = data.get("status") or data.get("message") or ""
        except: pass
        
    return {"is_running": is_running, "last_message": last_msg}

@router.post("/projects/{document_id}/enhance/cancel")
async def cancel_enhance(document_id: str):
    """진행 중인 고도화 작업을 중단합니다."""
    success = enhancement_manager.cancel_task(document_id)
    if success:
        return {"status": "success", "message": "고도화 작업이 중단되었습니다."}
    return {"status": "error", "message": "중단할 작업이 없거나 이미 완료되었습니다."}

@router.post("/projects/{document_id}/enhance/reset")
async def reset_enhanced_draft(document_id: str, db: Session = Depends(get_db)):
    """사업계획서의 고도화 내용(extended_content)만 초기화합니다."""
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not project.parsed_tree:
        return {"status": "success", "message": "초기화할 데이터가 없습니다."}

    import copy
    updated_tree = copy.deepcopy(project.parsed_tree)
    
    def reset_node_recursive(nodes):
        for n in nodes:
            if "extended_content" in n:
                n["extended_content"] = None
            if n.get("children"):
                reset_node_recursive(n["children"])
                
    reset_node_recursive(updated_tree)
    project.parsed_tree = updated_tree
    
    db.commit()
    return {"status": "success", "message": "고도화 데이터가 초기화되었습니다."}

@router.delete("/projects/{document_id}")
async def delete_project(document_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    db.delete(project)
    db.commit()
    
    # 관련 실제 파일들도 모두 탐색하여 삭제 (원본, PDF, 임시 파일 등)
    try:
        if os.path.exists(UPLOAD_DIR):
            for filename in os.listdir(UPLOAD_DIR):
                if filename.startswith(document_id):
                    filepath = os.path.join(UPLOAD_DIR, filename)
                    try:
                        if os.path.isdir(filepath):
                            shutil.rmtree(filepath)
                            print(f"Removed project directory: {filepath}")
                        else:
                            os.remove(filepath)
                            print(f"Removed project file: {filepath}")
                    except Exception as fe:
                        print(f"Failed to remove file {filepath}: {fe}")
    except Exception as e:
        print(f"Error while cleaning up project files: {e}")
            
    return {"status": "success", "message": "Project deleted successfully"}


# === 참고 자료(Reference Files) 관리 API ===

from typing import List as TypingList

@router.post("/projects/{document_id}/references/upload")
async def upload_reference_files(
    document_id: str,
    files: TypingList[UploadFile] = File(...),
):
    """프로젝트에 참고 자료 파일들을 업로드합니다."""
    refs_dir = os.path.join(UPLOAD_DIR, f"{document_id}_refs")
    os.makedirs(refs_dir, exist_ok=True)
    
    uploaded = []
    for f in files:
        # 파일명 충돌 방지: 동일 파일명이면 덮어쓰기
        safe_name = f.filename.replace("/", "_").replace("\\", "_")
        filepath = os.path.join(refs_dir, safe_name)
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        
        file_size = os.path.getsize(filepath)
        uploaded.append({
            "name": safe_name,
            "size": file_size,
            "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        print(f"[BACKEND] Reference file uploaded: {safe_name} ({file_size} bytes)")
    
    return {"status": "success", "files": uploaded}


@router.get("/projects/{document_id}/references")
async def list_reference_files(document_id: str):
    """프로젝트에 업로드된 참고 자료 파일 목록을 반환합니다."""
    refs_dir = os.path.join(UPLOAD_DIR, f"{document_id}_refs")
    
    if not os.path.isdir(refs_dir):
        return {"files": []}
    
    files = []
    for fname in sorted(os.listdir(refs_dir)):
        fpath = os.path.join(refs_dir, fname)
        if os.path.isfile(fpath):
            stat = os.stat(fpath)
            files.append({
                "name": fname,
                "size": stat.st_size,
                "uploaded_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            })
    
    return {"files": files}


@router.delete("/projects/{document_id}/references/{filename}")
async def delete_reference_file(document_id: str, filename: str):
    """특정 참고 자료 파일을 삭제합니다."""
    refs_dir = os.path.join(UPLOAD_DIR, f"{document_id}_refs")
    filepath = os.path.join(refs_dir, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        os.remove(filepath)
        print(f"[BACKEND] Reference file deleted: {filename}")
        return {"status": "success", "message": f"{filename} 삭제 완료"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
