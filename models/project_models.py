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
