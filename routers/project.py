import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from services.parser_service import parse_document
from models.database import get_db, Project, UsageLog
from models.project_models import ProjectSaveRequest, ProjectRenameRequest
from services.pdf_service import convert_hwpx_to_pdf


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

def log_usage(document_id: str, model_id: str, usage: dict, db: Session):
    """토큰 사용량을 계산하고 DB에 기록합니다."""
    # models/ 접두사 일관성 유지
    full_model_id = model_id if model_id.startswith("models/") else f"models/{model_id}"
    
    pricing = MODEL_PRICING.get(full_model_id, {"input": 0.0, "output": 0.0})
    
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    
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
        log_usage(document_id, model_id, usage, db)
        
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

@router.get("/usage")
async def get_usage_statistics(db: Session = Depends(get_db)):
    """API 사용량 및 비용 통계를 반환합니다."""
    logs = db.query(UsageLog).order_by(UsageLog.created_at.desc()).all()
    
    # 간단한 집계
    total_input = sum(log.input_tokens for log in logs)
    total_output = sum(log.output_tokens for log in logs)
    total_cost_usd = sum(log.estimated_cost.get("usd", 0.0) for log in logs) if logs else 0.0
    
    return {
        "summary": {
            "total_calls": len(logs),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_estimated_cost_usd": round(total_cost_usd, 4)
        },
        "logs": [
            {
                "id": log.id,
                "document_id": log.document_id,
                "model_id": log.model_id,
                "input_tokens": log.input_tokens,
                "output_tokens": log.output_tokens,
                "cost": log.estimated_cost,
                "timestamp": log.created_at.strftime("%Y-%m-%d %H:%M:%S")
            }
            for log in logs
        ]
    }

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
        project.filename = request.filename
    else:
        project = Project(
            document_id=request.document_id,
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
        
    project.filename = request.new_filename
    db.commit()
    return {"status": "success", "message": "Project renamed successfully"}

@router.get("/projects")
async def list_projects(db: Session = Depends(get_db)):
    """저장된 모든 프로젝트 목록을 반환합니다."""
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [
        {
            "id": str(p.id),
            "document_id": p.document_id,
            "filename": p.filename,
            "status": "분석 완료" if p.selected_node_ids else "분석 진행 중",
            "updatedAt": p.created_at.strftime("%Y-%m-%d")
        }
        for p in projects
    ]
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
        "filename": project.filename,
        "tree": tree,
        "selected_node_ids": project.selected_node_ids,
        "content_node_ids": project.content_node_ids,
        "pdf_url": f"/uploads/{document_id}.pdf"
    }


@router.delete("/projects/{document_id}")
async def delete_project(document_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.document_id == document_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    db.delete(project)
    db.commit()
    
    # 관련 파일도 삭제
    _, ext = os.path.splitext(project.filename)
    filepath = os.path.join(UPLOAD_DIR, f"{document_id}{ext}")
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except Exception as e:
            print(f"Failed to remove file {filepath}: {e}")
            
    return {"status": "success", "message": "Project deleted successfully"}
