import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from services.parser_service import parse_document
from models.database import get_db, Project
from models.project_models import ProjectSaveRequest

router = APIRouter(prefix="/api", tags=["Projects"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/health")
async def health_check():
    """서버 헬스 체크 엔드포인트"""
    return {"status": "ok", "message": "Server is running smoothly."}

@router.post("/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """문서를 업로드하고 구조화된 트리를 파싱하여 DB에 저장 후 반환합니다."""
    try:
        document_id = str(uuid.uuid4())
        
        # 파일 저장 경로 및 이름 설정
        _, ext = os.path.splitext(file.filename)
        filename = f"{document_id}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)

        # uploads/ 디렉토리에 파일 저장
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 실제 파싱 로직 호출 (Gemini API 등)
        document_tree = parse_document(filepath)

        # DB에 초기 파싱 결과를 곧바로 캐싱
        project = Project(
            document_id=document_id,
            filename=file.filename,
            parsed_tree=document_tree
        )
        db.add(project)
        db.commit()

        return {
            "document_id": document_id,
            "tree": document_tree
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
    
    selected_set = set(project.selected_node_ids or [])
    content_set = set(project.content_node_ids or [])
    
    # 선택된 노드 및 자식이 선택된 부모 구조를 유지하며 필터링
    def filter_tree(nodes):
        result = []
        for n in nodes:
            children_filtered = filter_tree(n.get("children", []))
            
            if n["id"] in selected_set or children_filtered:
                # 키 순서를 명시적으로 지정
                new_node = {
                    "id": n["id"],
                    "title": n["title"],
                    "type": n.get("type", "heading"),
                    "content": n["id"] in content_set,
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
        "content_node_ids": project.content_node_ids
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
