from pydantic import BaseModel
from typing import List

class ProjectSaveRequest(BaseModel):
    document_id: str
    filename: str = "Unknown Document"
    selected_node_ids: List[int]
    content_node_ids: List[int] = []
