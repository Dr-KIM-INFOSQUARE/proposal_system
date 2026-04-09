from pydantic import BaseModel
from typing import List, Any, Union, Optional

class ProjectSaveRequest(BaseModel):
    document_id: str
    name: Optional[str] = None # 프로젝트 별칭
    filename: str = "Unknown Document"
    selected_node_ids: List[Union[str, int, Any]]
    content_node_ids: List[Union[str, int, Any]] = []
    tree_data: Optional[List[Any]] = None # 초안 편집 후 저장 시 전체 트리 데이터

class ProjectRenameRequest(BaseModel):
    document_id: str
    new_name: str # 새 프로젝트 명

class IdeaEnhanceRequest(BaseModel):
    document_id: str
    idea_text: str
    model_id: str = "models/gemini-3.1-pro-preview"

class IdeaSaveRequest(BaseModel):
    document_id: str
    master_brief: str
    initial_idea: Optional[str] = None

class DraftGenerateRequest(BaseModel):
    document_id: str
    model_id: Optional[str] = "models/gemini-3.1-pro-preview" # 기본 모델 설정
    research_mode: str = "deep" # fast | deep

class HwpxGenerateRequest(BaseModel):
    document_id: str
    style_config: dict
