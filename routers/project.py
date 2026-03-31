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
from models.project_models import ProjectSaveRequest, ProjectRenameRequest, IdeaEnhanceRequest, IdeaSaveRequest, DraftGenerateRequest
from services.pdf_service import convert_hwpx_to_pdf
from services.gemini_service import enhance_business_idea
from services.notebooklm_service import notebooklm_service

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
    """프론트엔드에서 선택한 항목(selected_node_ids)을 저장합니다."""
    project = db.query(Project).filter(Project.document_id == request.document_id).first()
    if project:
        project.selected_node_ids = request.selected_node_ids
        project.content_node_ids = request.content_node_ids
        # 사용자 정의 이름 반영 (있을 경우만)
        if request.name:
            project.name = request.name
        # 원본 파일명은 웬만하면 덮어쓰지 않음
    else:
        project = Project(
            document_id=request.document_id,
            name=request.name or request.filename,
            filename=request.filename,
            selected_node_ids=request.selected_node_ids,
            content_node_ids=request.content_node_ids
        )
        db.add(project)
    
    db.commit()
    return {"status": "success", "message": "Project saved successfully"}
@router.post("/projects/rename")
async def rename_project(request: ProjectRenameRequest, db: Session = Depends(get_db)):
    """프로젝트의 이름을 변경합니다."""
    project = db.query(Project).filter(Project.document_id == request.document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    project.name = request.new_name
    db.commit()
    return {"status": "success", "message": "Project renamed successfully"}
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
                # 데이터가 완료 상태이면 요금 및 결과 로깅
                if chunk.get("status") == "completed":
                    data = chunk.get("data", {})
                    if data.get("usage"):
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

    return StreamingResponse(event_generator(), media_type="text/event-stream")

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
        # (기존 4단계 상태 판별 로직 유지)
        is_analysis = True if p.selected_node_ids and len(p.selected_node_ids) > 0 else False
        is_idea = True if p.master_brief and len(p.master_brief.strip()) > 0 else False
        
        has_draft = False
        if p.parsed_tree:
            def check_draft(nodes):
                for n in nodes:
                    if n.get("draft_content"): return True
                    if n.get("children") and check_draft(n["children"]): return True
                return False
            has_draft = check_draft(p.parsed_tree)
            
        is_draft = True if p.notebook_id or has_draft else False
        is_complete = has_draft

        statuses = {
            "analysis": is_analysis,
            "idea_enhance": is_idea,
            "draft_generate": is_draft,
            "proposal_complete": is_complete
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
    
    selected_set = set(project.selected_node_ids or [])
    content_set = set(project.content_node_ids or [])
    
    def apply_checked(nodes):
        for n in nodes:
            if n["id"] in selected_set:
                n["checked"] = True
            if n["id"] in content_set:
                n["contentChecked"] = True
            if "children" in n and n["children"]:
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


@router.post("/projects/{document_id}/draft/generate")
async def generate_draft_stream(
    document_id: str, 
    request: DraftGenerateRequest,
    db: Session = Depends(get_db)
):
    """5단계 파이프라인(NotebookLM)을 통해 초안을 자동 생성하고 SSE 스트림을 반환합니다."""
    print(f"[BACKEND] API Request: Generate draft for {document_id}")
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        print(f"[BACKEND] ERROR: Project not found: {document_id}")
        raise HTTPException(status_code=404, detail="Project not found")
        
    master_brief = project.master_brief
    if not master_brief:
        print(f"[BACKEND] ERROR: Master brief missing for {document_id}")
        raise HTTPException(status_code=400, detail="Master brief is required. Please complete Step 2 first.")
        
    # PDF 경로 확인 (양식 가이드용)
    pdf_path = os.path.join(UPLOAD_DIR, f"{document_id}.pdf")
    if not os.path.exists(pdf_path):
        print(f"[BACKEND] WARNING: Template PDF missing: {pdf_path}")
        pdf_path = None
        
    # 트리 데이터 준비
    try:
        print(f"[BACKEND] Preparing document tree...")
        export_data = await export_project(document_id, db)
        document_tree = export_data.get("export_data", [])
        print(f"[BACKEND] Document tree prepared (nodes: {len(document_tree)})")
    except Exception as e:
        print(f"[BACKEND] WARNING: export_project failed: {e}. Using raw parsed_tree.")
        document_tree = project.parsed_tree or []

    async def event_generator():
        print(f"[BACKEND] SSE event_generator started for {document_id}")
        try:
            # NotebookLMService를 통해 5단계 파이프라인 실행
            async for progress in notebooklm_service.generate_draft_stream(
                document_id=document_id,
                master_brief=master_brief,
                document_tree=document_tree,
                pdf_path=pdf_path,
                research_mode=request.research_mode,
                project_name=project.name,
                existing_notebook_id=project.notebook_id
            ):
                print(f"[BACKEND] SSE Yielding progress: {progress[:100]}")
                data = json.loads(progress)
                
                # notebook_id가 반환되면 즉시 DB에 저장 (중간 중단 대비)
                if data.get("notebook_id") and data.get("notebook_id") != project.notebook_id:
                    print(f"[BACKEND] New notebook_id discovered: {data.get('notebook_id')}. Saving to DB.")
                    project.notebook_id = data.get("notebook_id")
                    db.commit()

                # 성공적으로 완료된 경우 DB에 트리 업데이트
                if data.get("status") == "completed":
                    final_tree = data.get("tree")
                    if final_tree:
                        print(f"[BACKEND] Draft generation completed. Saving final tree to DB.")
                        project.parsed_tree = final_tree
                        db.commit()
                
                yield f"data: {progress}\n\n"
                await asyncio.sleep(0.1)
        except Exception as e:
            print(f"[BACKEND] SSE FATAL ERROR: {str(e)}")
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
        finally:
            print(f"[BACKEND] SSE event_generator closed for {document_id}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
                        os.remove(filepath)
                        print(f"Removed project file: {filepath}")
                    except Exception as fe:
                        print(f"Failed to remove file {filepath}: {fe}")
    except Exception as e:
        print(f"Error while cleaning up project files: {e}")
            
    return {"status": "success", "message": "Project deleted successfully"}
