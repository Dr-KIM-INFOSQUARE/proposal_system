
import os
import asyncio
import json
import sys

# 프로젝트 루트 경로 추가
sys.path.append('d:/Desktop/proposal_system')

from services.parser_service import parse_document
from services.hwpx_service import generate_hwpx_from_draft
import shutil

async def test_full_flow():
    # 0. 준비: uploads 디렉토리에 테스트 파일 복사 (service 로직에 맞춤)
    if not os.path.exists("uploads"): os.makedirs("uploads")
    document_id = "debug_test_id"
    source_hwpx = "d:/Desktop/proposal_system/test_files/테스트 양식.hwpx"
    template_in_uploads = f"uploads/{document_id}.hwpx"
    shutil.copy(source_hwpx, template_in_uploads)
    
    output_path = "d:/Desktop/proposal_system/test_files/최종_검증_결과.hwpx"
    
    print(f"1. 구조 분석 시작...")
    parse_result = parse_document(source_hwpx)
    nodes = parse_result["nodes"]
    
    # 2. 가상 초안(Draft) 데이터 생성
    # hwpx_service는 node 내부에 'draft_content' 필드가 있기를 기대함
    print(f"2. 가상 초안(Draft) 데이터 주입...")
    def inject_draft_recursively(node_list):
        for node in node_list:
            if node.get("node_address"):
                node["draft_content"] = f"### [검증 완료] ###\n이 본문은 {node['title']} 섹션에 정확히 주입되었습니다.\nnode_address: {node['node_address']}"
            if node.get("children"):
                inject_draft_recursively(node["children"])
    
    inject_draft_recursively(nodes)
    
    # 3. HWPX 생성 호출
    print(f"3. HWPX 서비스 호출 (generate_hwpx_from_draft)...")
    success = generate_hwpx_from_draft(document_id, nodes, output_path)
    
    if success:
        print(f"🎉 성공! 파일이 생성되었습니다: {output_path}")
        print(f"파일 크기: {os.path.getsize(output_path)} bytes")
    else:
        print("❌ 실패: HWPX 주입 중 오류 발생")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_full_flow())
