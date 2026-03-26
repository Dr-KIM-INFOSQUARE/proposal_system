from pydantic import BaseModel
from typing import List, Any, Union

class ProjectSaveRequest(BaseModel):
    document_id: str
    filename: str = "Unknown Document"
    selected_node_ids: List[Union[str, int, Any]]
    content_node_ids: List[Union[str, int, Any]] = []
