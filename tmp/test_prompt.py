import os
import subprocess
import tempfile
import json
import re

# 사용자님이 요청하신 줄바꿈이 포함된 정확한 프롬프트
prompt = """당신은 대한민국 최고의 정부지원사업 수석 컨설턴트이자 비즈니스 전략가입니다. 
앞으로의 모든 답변에서 다음의 **[절대 작성 규칙]**을 무조건적으로 준수하십시오:

### 절대 작성 규칙
1. 모든 문장은 반드시 '~함.', '~임.'과 같이 **명사형 또는 종결형 종결 어미**로 끝낼 것. 절대 '~입니다', '~한다' 등을 사용하지 마시오.
2. 본문 내용을 전개할 때 무작정 나열하지 말고, **논리적인 카테고리(Grouping)로 묶어서** 구조화할 것.
3. 본문은 평가자가 한눈에 파악할 수 있도록 직관성과 전문성을 바탕으로 구조화하되, 기계적인 분할을 피하고 **내용의 복잡도, 중요도, 논리적 위계에 따라 유연하게 조절하여 인간이 작성한 것처럼 자연스럽게 구성**할 것.
    - 문장을 작성할 때, 해당 문장의 뎁스(Depth)에 맞춰 문장 맨 앞에 반드시 마커를 기입할 것.
        - [사용 마커]
            1단계: [L1] 
            2단계: [L2]
            3단계: [L3]...
            예시)
                [L1] 글로벌 스마트 팩토리 시장 동향
                [L2] 스마트 팩토리 시장은 2026년까지 연평균 11.0% 성장할 것으로 전망됨.
4. **'알겠습니다', '숙지했습니다', '도출했습니다'와 같은 서론, 결론, 부연 설명, 작업 확인 멘트를 절대 작성하지 마.**
5. **본문 내용 중에 [1], [2], [1-3] 등의 출처 표시(Citation)를 절대 포함하지 마.**
6. **요청받은 [작성할 목차] 텍스트를 답변의 시작이나 중간에 절대 반복하여 출력하지 마.** 본문의 실질적인 내용만 바로 시작할 것.
7. **오직 요청받은 단일 항목에 대해서만 작성하고, 이후에 이어질 다른 목차나 주제는 절대 미리 작성하지 마시오.**
8. 표(Table) 작성 요청 시, 제공된 열(Column) 구조를 유지하되 **정보량에 따라 행(Row)은 자유롭게 추가**할 것.
9. 전문적이고 분석적인 톤앤매너를 유지하며, 필요시 소스의 문서를 인용하여 구체적인 수치와 근거를 포함하여 작성할 것."""

def run_nlm(args):
    """nlm 명령 실행 헬퍼"""
    # Windows에서는 절대 경로를 사용하는 것이 안전함
    cmd = ["nlm"] + args
    print(f"Executing: {' '.join(cmd)}")
    # input="y\n"은 확인 프롬프트 자동 통과용
    result = subprocess.run(cmd, input="y\n", capture_output=True, text=True, encoding='utf-8', shell=True)
    return result

def test_prompt_upload():
    # 1. 테스트 노트북 생성
    print("--- 1. Creating Test Notebook ---")
    res = run_nlm(["notebook", "create", "PROMPT_TEST_NB"])
    print(res.stdout)
    
    nb_id = None
    # ID 추출 시 유연하게 대응
    match = re.search(r"ID:\s*([a-fA-F0-9-]{36})", res.stdout)
    if not match:
        match = re.search(r"([a-fA-F0-9-]{36})", res.stdout)
        
    if match:
        nb_id = match.group(1)
        print(f"Created/Detected Notebook ID: {nb_id}")
    else:
        print("Failed to get Notebook ID. Exit.")
        return

    # 2. 프롬프트 파일 생성 및 업로드 테스트
    print("\n--- 2. Uploading Prompt via File (Normalized) ---")
    # 현재 적용 중인 유니코드/줄바꿈 정규화 로직 그대로 사용
    formatted_prompt = prompt.replace('\r\n', '\n').strip()
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8', newline='\n') as f:
        f.write(formatted_prompt)
        prompt_path = f.name
    
    try:
        conf_res = run_nlm([
            "chat", "configure", nb_id,
            "--goal", "custom",
            "--prompt-file", prompt_path,
            "--response-length", "longer"
        ])
        print("Configuration Output:")
        print(conf_res.stdout)
        if conf_res.stderr:
            print("Configuration Error (if any):")
            print(conf_res.stderr)
            
        # 3. 실제 적용 여부 확인 (채팅 테스트)
        print("\n--- 3. Verifying Prompt Enforcement ---")
        chat_res = run_nlm(["chat", "send", nb_id, "안녕? 너는 누구야? 너에게 내려진 핵심 규칙 1번과 4번을 명사형으로 말해줘."])
        print("Chat Response:")
        print(chat_res.stdout)
        
    finally:
        if os.path.exists(prompt_path):
            os.remove(prompt_path)
        
        # 테스트 노트북 자동 삭제 (필요한 경우 주석 해제)
        # run_nlm(["notebook", "delete", nb_id])

if __name__ == "__main__":
    test_prompt_upload()
