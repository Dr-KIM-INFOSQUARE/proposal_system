from pydantic import BaseModel
from typing import List, Any, Union, Optional

class ProjectSaveRequest(BaseModel):
    document_id: str
    name: Optional[str] = None # 프로젝트 별칭
    filename: str = "Unknown Document"
    selected_node_ids: List[Union[str, int, Any]]
    content_node_ids: List[Union[str, int, Any]] = []

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
