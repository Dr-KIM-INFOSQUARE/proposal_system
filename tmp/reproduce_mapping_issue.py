
import os
import asyncio
import json
import sys

# 프로젝트 루트 경로 추가
sys.path.append('d:/Desktop/proposal_system')

from services.parser_service import parse_document

async def debug_mapping_flow():
    hwpx_path = "d:/Desktop/proposal_system/test_files/테스트 양식.hwpx"
    print(f"\n--- [Phase 1 & 2 & 3] Full Pipeline Test: {os.path.basename(hwpx_path)} ---")
    
    # 통합 파싱 함수 호출 (내부적으로 Extraction -> Gemini -> Recursive Mapping 수행)
    result = parse_document(hwpx_path)
    nodes = result.get("nodes", [])
    
    print(f"Total Processed Nodes: {len(nodes)}")
    
    def check_nodes_recursively(node_list, level=0):
        null_count = 0
        for node in node_list:
            indent = "  " * level
            address = node.get('node_address')
            print(f"{indent}[Node] title='{node.get('title')[:25]}...', address={address}")
            if address is None:
                null_count += 1
            if node.get("children"):
                null_count += check_nodes_recursively(node["children"], level + 1)
        return null_count

    null_total = check_nodes_recursively(nodes)
    print(f"\nFinal Results: {len(nodes)} root nodes, {null_total} nodes have NULL node_address")

if __name__ == "__main__":
    import asyncio
    asyncio.run(debug_mapping_flow())
