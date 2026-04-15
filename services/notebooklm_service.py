import os
import json
import asyncio
import subprocess
import tempfile
import time
import shutil
import sys
import re
from datetime import datetime
from typing import AsyncGenerator, List, Dict, Any, Optional

class NotebookLMService:
    def __init__(self, timeout: int = 600):
        self.timeout = timeout
        # Windows에서는 nlm.cmd 또는 nlm.exe를 찾아야 하며, shutil.which를 사용해 절대 경로를 정적으로 미리 찾음
        self.nlm_cmd = self._find_nlm_executable()
        print(f"[NOTEBOOKLM_SERVICE] Initialized. NLM executable: {self.nlm_cmd}")

    def _find_nlm_executable(self) -> str:
        """현재 시스템에서 nlm 실행 파일의 절대 경로를 찾습니다."""
        possible_names = ["nlm"]
        if sys.platform == "win32":
            possible_names = ["nlm.cmd", "nlm.exe", "nlm"]
            
        for name in possible_names:
            path = shutil.which(name)
            if path:
                return path
        return "nlm" # 기본값 (PATH에 있을 것으로 기대)

    def _clean_citations(self, text: str) -> str:
        """내용에서 [1], [2], [1, 2], [1-3] 등의 출처 표시를 제거합니다."""
        if not text:
            return text
        # 패턴: [숫자], [숫자, 숫자], [숫자-숫자] 등 (앞의 공백 포함)
        pattern = r"\s*\[\d+(?:[,\-\s]+\d+)*\]"
        cleaned = re.sub(pattern, "", text)
        return cleaned.strip()

    async def _run_command(self, args: List[str], timeout: Optional[int] = None, **kwargs) -> Dict[str, Any]:
        """nlm CLI 명령어를 실행하고 결과를 반환합니다."""
        cmd = [self.nlm_cmd] + args
        
        # Windows 인코딩 에러 방지를 위한 환경 변수
        current_env = os.environ.copy()
        current_env["PYTHONIOENCODING"] = "utf-8"
        current_env["PYTHONUTF8"] = "1"

        def sync_run():
            # 호출부에서 명시적으로 shell 옵션을 주지 않은 경우, 리스트 형태면 False, 문자열 형태면 True 권장
            # 여기서는 윈도우에서 .exe 실행 시 멀티라인 보존을 위해 기본 False 전략 사용
            use_shell = kwargs.get('shell', False)
            return subprocess.run(
                cmd,
                input="y\n",
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='ignore',
                env=current_env,
                shell=use_shell,
                timeout=timeout or self.timeout
            )

        try:
            print(f"[NOTEBOOKLM_SERVICE] Executing command: {' '.join(cmd)}")
            # 별도 스레드에서 차단 없이 실행 (Windows Uvicorn 호환성)
            result = await asyncio.to_thread(sync_run)
            stdout = result.stdout
            stderr = result.stderr
            output = stdout + "\n" + stderr

            if result.returncode != 0:
                print(f"[NOTEBOOKLM_SERVICE] ERROR (Code {result.returncode}):\nSTDOUT: {stdout}\nSTDERR: {stderr}")
                raise Exception(f"NLM Error (Code {result.returncode}): {stderr or stdout}")
            
            print(f"[NOTEBOOKLM_SERVICE] SUCCESS. Response: {output[:100]}...")
            
            # --- ID 추출 로직 ---
            id_match = re.search(r"ID:\s*([a-fA-F0-9-]{36})", output)
            nb_id = id_match.group(1) if id_match else None
            
            task_id = None
            task_match = re.search(r"(?:Task\s*ID|Task):\s*([a-fA-F0-9-]{36})", output, re.IGNORECASE)
            if task_match:
                task_id = task_match.group(1)
            else:
                all_uuids = re.findall(r"([a-fA-F0-9-]{36})", output)
                unique_uuids = [u for u in all_uuids if u != nb_id]
                if unique_uuids:
                    task_id = unique_uuids[0]

            res_dict = {"status": "success", "output": output}
            if nb_id: res_dict["id"] = nb_id
            if task_id: res_dict["task_id"] = task_id
                
            return res_dict
            
        except subprocess.TimeoutExpired:
            print(f"[NOTEBOOKLM_SERVICE] TIMEOUT ERROR")
            raise Exception(f"Command timed out: {' '.join(cmd)}")
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"[NOTEBOOKLM_SERVICE] EXCEPTION: {error_trace}")
            raise Exception(f"Failed to execute NLM command: {str(e)}")

    async def generate_draft_stream(
        self, 
        document_id: str, 
        master_brief: str, 
        document_tree: List[Dict[str, Any]], 
        pdf_path: Optional[str] = None, 
        research_mode: str = "deep", 
        project_name: Optional[str] = None
    ) -> AsyncGenerator[str, None]:

        """5단계 파이프라인을 스트리밍 방식으로 실행합니다. (항상 처음부터 시작)"""
        print(f"[NOTEBOOKLM_SERVICE] Starting fresh draft stream for document: {document_id}")
        notebook_id = None
        
        try:
            # Phase 1: Setup (항상 새로운 노트북 생성)
            timestamp = datetime.now().strftime("%H%M%S")
            safe_project_name = project_name.replace(" ", "_").replace("'", "").replace("\"", "") if project_name else document_id
            notebook_title = f"Draft_{safe_project_name}_{timestamp}"
            
            print(f"[NOTEBOOKLM_SERVICE] Phase 1 - Setting up notebook: {notebook_title}")
            yield json.dumps({"phase": 1, "status": "Phase 1: 노트북 생성 및 소스 업로드 중..."})
            create_res = await self._run_command(["notebook", "create", notebook_title])
            notebook_id = create_res.get("id")
            if not notebook_id:
                match = re.search(r"ID:\s*([a-fA-F0-9-]{36})", create_res.get("output", ""))
                notebook_id = match.group(1) if match else None
                if not notebook_id:
                    raise Exception(f"노트북 ID를 생성할 수 없습니다. 출력: {create_res.get('output')}")
            
            print(f"[NOTEBOOKLM_SERVICE] Notebook created successfully: {notebook_id}")
            
            # 마스터 브리프 및 템플릿 파일 업로드
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as tmp_brief:
                tmp_brief.write(master_brief)
                brief_path = tmp_brief.name
            
            try:
                print(f"[NOTEBOOKLM_SERVICE] Adding source: Master Brief")
                await self._run_command(["source", "add", notebook_id, "--file", brief_path, "--wait"])
                
                if pdf_path and os.path.exists(pdf_path):
                    print(f"[NOTEBOOKLM_SERVICE] Adding source: Template PDF")
                    await self._run_command(["source", "add", notebook_id, "--file", pdf_path, "--wait"])
            finally:
                if os.path.exists(brief_path):
                    os.remove(brief_path)

            # Phase 2: Optimize Query
            print(f"[NOTEBOOKLM_SERVICE] Phase 2 - Optimizing search query")
            yield json.dumps({"phase": 2, "status": "Phase 2: 최적의 리서치 쿼리 생성 중..."})
            opt_query_prompt = (
                "업로드된 사업계획서 양식과 사업 아이디어를 완벽하게 뒷받침할 객관적이고 균형 잡힌 "
                "근거 자료(시장/기술/정책)를 찾기 위해, Deep Research에 입력할 가장 완벽한 '검색용 프롬프트' 1개만 작성해 줘. "
                "반드시 [SEARCH_QUERY]태그 사이에 검색어만 넣어줘."
            )
            query_res = await self._run_command(["notebook", "query", notebook_id, opt_query_prompt])
            raw_output = query_res.get("output", "").strip()
            optimal_query = ""
            
            # [수정] [SEARCH_QUERY] 태그를 기준으로 분할하여 사이 내용을 더 확실하게 추출
            # parts는 [태그 앞 내용, 태그 사이 내용, 태그 뒤 내용, ...] 순서로 구성됨
            parts = re.split(r'\[/?SEARCH_QUERY\]', raw_output, flags=re.IGNORECASE)
            if len(parts) >= 3:
                # 첫 번째 태그와 두 번째 태그 사이의 내용을 선택 (intro 텍스트는 parts[0]에 위치하므로 제외됨)
                optimal_query = parts[1].strip()
                print(f"[NOTEBOOKLM_SERVICE] Query extracted from tags: {optimal_query[:50]}...")
            
            # [백업] 태그 기반 추출이 실패한 경우에만 다른 방식 시도
            if not optimal_query:
                tag_match = re.search(r"\[SEARCH_QUERY\](.*?)(?:\[/SEARCH_QUERY\]|\[SEARCH_QUERY\]|$)", raw_output, re.DOTALL | re.IGNORECASE)
                if tag_match:
                    optimal_query = tag_match.group(1).strip()
            
            if not optimal_query:
                # [백업] 태그가 없더라도 핵심 문구만이라도 추출 시도
                keyword_match = re.search(r"입력용 프롬프트\]\*\*\s*[\n\r]*(.*?)[\n\r]*(\*\*\*|###|$)", raw_output, re.DOTALL)
                if keyword_match:
                    optimal_query = keyword_match.group(1).strip()
            
            if not optimal_query:
                try:
                    json_match = re.search(r"(\{.*\})", raw_output, re.DOTALL)
                    if json_match:
                        json_data = json.loads(json_match.group(1))
                        val = json_data.get("value", {})
                        optimal_query = val.get("answer", raw_output) if isinstance(val, dict) else raw_output
                    else:
                        optimal_query = raw_output
                except:
                    optimal_query = raw_output
            
            optimal_query = optimal_query.replace("\n", " ").replace('"', "'").strip()
            if len(optimal_query) > 1000:
                optimal_query = optimal_query[:1000] + "..."
            
            if not optimal_query:
                optimal_query = f"{document_id} 사업계획서 시장 및 기술 분석"
            
            print(f"[NOTEBOOKLM_SERVICE] Optimized query: {optimal_query[:50]}...")
            
            # Phase 3: Research
            print(f"[NOTEBOOKLM_SERVICE] Phase 3 - Starting {research_mode} research")
            yield json.dumps({"phase": 3, "status": f"Phase 3: {research_mode.capitalize()} Research 시작 ('{optimal_query[:30]}...')"})
            research_start = await self._run_command(["research", "start", optimal_query, "--notebook-id", notebook_id, "--mode", research_mode])
            task_id = research_start.get("task_id")
            
            max_polls = 20
            poll_count = 0
            while poll_count < max_polls:
                await asyncio.sleep(40)
                poll_count += 1
                status_res = await self._run_command(["research", "status", notebook_id])
                output_lower = status_res.get("output", "").lower()
                
                if "completed" in output_lower or "finish" in output_lower:
                    yield json.dumps({"phase": 3, "status": "Phase 3: 리서치 완료. 소스 반입 시작..."})
                    await asyncio.sleep(5)
                    final_task_id = status_res.get("task_id") or task_id
                    try:
                        if final_task_id and final_task_id != "latest":
                            await self._run_command(["research", "import", notebook_id, final_task_id])
                        else:
                            await self._run_command(["research", "import", notebook_id])
                    except Exception as import_err:
                        print(f"[NOTEBOOKLM_SERVICE] Import failed, fallback: {import_err}")
                        try:
                            await self._run_command(["research", "import", notebook_id])
                        except: pass
                    break
                else:
                    yield json.dumps({"phase": 3, "status": f"Phase 3: 리서치 진행 중 ({poll_count * 40}초 경과...)"})

            # Phase 4: Persona & Global Rules
            print(f"[NOTEBOOKLM_SERVICE] Phase 4 - Configuring global chat persona and style rules")
            yield json.dumps({"phase": 4, "status": "Phase 4: 글로벌 작성 규칙(명사형 종결 등) 적용 중..."})
            
            draft_prompt = """당신은 대한민국 최고의 정부지원사업 수석 컨설턴트이자 비즈니스 전략가입니다. 
앞으로의 모든 답변에서 다음의 **[절대 작성 규칙]**을 무조건적으로 준수하십시오:
### 절대 작성 규칙
1. 모든 문장은 반드시 '~함.', '~임.'과 같이 **명사형 또는 종결형 종결 어미**로 끝낼 것. 절대 '~입니다', '~한다' 등을 사용하지 마시오.
2. 본문 내용을 전개할 때 무작정 나열하지 말고, **논리적인 카테고리(Grouping)로 묶어서** 구조화할 것.
3. 본문은 평가자가 한눈에 파악할 수 있도록 직관성과 전문성을 바탕으로 구조화하되, 기계적인 분할을 피하고 **내용의 복잡도, 중요도, 논리적 위계에 따라 유연하게 조절하여 인간이 작성한 것처럼 자연스럽게 구성**할 것.
    - **[핵심 주의사항] 모든 항목(단계)은 한 줄에 이어서 쓰지 말고, 반드시 줄바꿈(Enter)을 통해 구분할 것.**
    - 문장을 작성할 때, 해당 문장의 뎁스(Depth)에 맞춰 **마크다운 글머리기호(- 또는 *)와 마커**를 함께 기입하여 들여쓰기를 표현할 것.
    - **[순번 체계 예외] 단, 문맥상 순서나 넘버링(①, ②, 1., 2. 등)으로 명확한 구분이 필요한 경우, 기계적인 글머리기호 대신 마커([L1] 등) 바로 뒤에 해당 순번 기호를 직접 결합하여 작성할 것.** 이 넘버링은 [L1], [L2], [L3]를 비롯한 모든 단계에 포함될 수 있음.
        - [사용 마커 및 마크다운 형태 예시]
            1단계: * [L1] 
            2단계:   * [L2]
            3단계:     * [L3]
        - [일반 작성 예시]
            * [L1] 글로벌 스마트 팩토리 시장 동향
                * [L2] 스마트 팩토리 시장은 2026년까지 연평균 11.0% 성장할 것으로 전망됨.
        - [순번 체계 적용 예시 (숫자 번호가 필요한 경우)]
            * [L1] ① 비전 AI 기반의 자동화 검수 체계 구축
                * [L2] 기존 육안 검사의 한계를 극복하고 검수 리드타임을 45% 단축함.
            * [L1] ② 데이터 무결성 검증 아키텍처 도입
                * [L2] 블록체인 기반의 해싱 알고리즘을 통해 조작을 원천 차단함.
4. **'알겠습니다', '숙지했습니다', '도출했습니다'와 같은 서론, 결론, 부연 설명, 작업 확인 멘트를 절대 작성하지 마.**
5. **본문 내용 중에 [1], [2], [1-3] 등의 출처 표시(Citation)를 절대 포함하지 마.**
6. **요청받은 [작성할 목차] 텍스트를 답변의 시작이나 중간에 절대 반복하여 출력하지 마.** 본문의 실질적인 내용만 바로 시작할 것.
7. **오직 요청받은 단일 항목에 대해서만 작성하고, 이후에 이어질 다른 목차나 주제는 절대 미리 작성하지 마시오.**
8. 표(Table) 작성 요청 시, 제공된 열(Column) 구조를 유지하되 **정보량에 따라 행(Row)은 자유롭게 추가**할 것.
9. 표 내부의 텍스트도 구조화가 필요하다면 본문과 동일하게 마커([L1], [L2] 등)를 사용하여 위계를 표현 할 것.
10. 전문적이고 분석적인 톤앤매너를 유지하며, 필요시 소스의 문서를 인용하여 구체적인 수치와 근거를 포함하여 작성할 것."""
            
            
            # 1. 프롬프트 정제 (코드 들여쓰기 공백 제거 및 줄바꿈 통일)
            import inspect as _inspect
            # 텍스트 앞뒤 공백 제거
            clean_prompt = _inspect.cleandoc(draft_prompt).strip()
            
            try:
                # nlm chat configure [ID] --prompt [CONTENT] 순서 준수
                # shell=False를 사용하여 줄바꿈(\n)이 포함된 문자열을 원본 그대로 전달
                await self._run_command([
                    "chat", "configure", notebook_id,
                    "--goal", "custom",
                    "--prompt", clean_prompt,
                    "--response-length", "longer"
                ], shell=False)
                print("[NOTEBOOKLM_SERVICE] Global chat configuration applied successfully with preserved formatting.")
            except Exception as e:
                print(f"[NOTEBOOKLM_SERVICE] Warning: Failed to configure via formatted prompt: {e}")
                # 폴백: 줄바꿈을 공백으로 치환하여 재시도
                cli_safe_prompt = clean_prompt.replace('\n', ' ').replace('\r', ' ')
                await self._run_command([
                    "chat", "configure", notebook_id,
                    "--goal", "custom",
                    "--prompt", cli_safe_prompt,
                    "--response-length", "longer"
                ])
            
            yield json.dumps({"persona_injected": True})


            # Phase 5: Recursive Drafting
            print(f"[NOTEBOOKLM_SERVICE] Phase 5 - Generating content sections")
            yield json.dumps({"phase": 5, "status": "Phase 5: 섹션별 순회 초안 작성 시작..."})
            
            async def write_sections_recursive(nodes):
                if not nodes or not isinstance(nodes, list):
                    return
                for node in nodes:
                    # 방어 로직: node가 문자열인 경우 JSON 파싱 시도
                    if isinstance(node, str):
                        try:
                            node = json.loads(node)
                        except:
                            print(f"[NOTEBOOKLM_SERVICE] Skipping invalid node (string): {node}")
                            continue
                            
                    if not isinstance(node, dict):
                         print(f"[NOTEBOOKLM_SERVICE] Skipping invalid node (type {type(node)}): {node}")
                         continue

                    # "content" (export 경유) 또는 "contentChecked" (DB 직접 접근) 모두 지원
                    if node.get("content") is True or node.get("contentChecked") is True:
                        title = node.get("title", "Unknown Section")
                        writing_guide = node.get("writingGuide")
                        user_instruction = node.get("userInstruction")
                        table_metadata = node.get("tableMetadata")
                        node_type = node.get("type")

                        # [추가] 이미 초안 내용이 존재한다면 작성을 건너뜀 (이어하기 지원)
                        current_draft = node.get("draft_content")
                        if current_draft and str(current_draft).strip() and len(str(current_draft).strip()) > 50:
                            print(f"[NOTEBOOKLM_SERVICE] Skipping section (already drafted): {title}")
                            yield json.dumps({"phase": 5, "status": f"건너뜀: {title}"})
                            # 이미 존재하더라도 실시간 업데이트 이벤트를 한 번 더 쏴줌으로써 프론트엔드와 동기화
                            yield json.dumps({
                                "status": "node_updated", 
                                "node_id": node.get("id"), 
                                "content": current_draft
                            })
                            # 자식 노드 순회를 위해 continue 대신 루프 하단으로 이동
                        else:
                            print(f"[NOTEBOOKLM_SERVICE] Drafting section: {title}")
                            yield json.dumps({"phase": 5, "status": f"작성 중: {title}"})

                            prompt_parts = [f"작성할 목차: [{title}]\n"]
                            if writing_guide and str(writing_guide).strip():
                                prompt_parts.append(f"- 양식 작성 가이드: {writing_guide}\n(위 가이드라인의 의도를 완벽하게 충족하도록 작성할 것.)\n")
                            if user_instruction and str(user_instruction).strip():
                                prompt_parts.append(f"- 사용자 추가 지시사항: {user_instruction}\n(이 내용을 우선적으로 반영할 것.)\n")
                            if node_type == "table" and table_metadata:
                                metadata_str = json.dumps(table_metadata, ensure_ascii=False)
                                prompt_parts.append(
                                    f"- 이 항목은 표(Table)로 작성되어야 해. 다음 구조를 참고하여 반드시 **Markdown 표 형식**으로 출력해 줘.\n"
                                    f"  [표 구조]: {metadata_str}\n"
                                    f"  단, **열(Column)의 개수와 구조는 반드시 유지하되, 정보의 양에 맞추어 행(Row)은 자유롭게 무제한으로 추가해서 작성해.**\n"
                                    f"  주의: 오직 이 표 하나만 작성하고, 다른 표나 섹션 등을 추가로 작성하지 마시오.\n"
                                )
                            else:
                                prompt_parts.append("\n설정된 [절대 작성 규칙]을 엄수하여 오직 이 항목의 **본문만** 상세히 작성해 줘.")

                            final_prompt = "".join(prompt_parts)
                            await asyncio.sleep(2)
                            
                            node_res = await self._run_command(["notebook", "query", notebook_id, final_prompt])
                            raw_ans = node_res.get("output", "").strip()
                            
                            try:
                                json_match = re.search(r"(\{.*\})", raw_ans, re.DOTALL)
                                if json_match:
                                    ans_json = json.loads(json_match.group(1))
                                    if "answer" in ans_json:
                                        node["draft_content"] = ans_json["answer"]
                                    elif "value" in ans_json and isinstance(ans_json["value"], dict):
                                        node["draft_content"] = ans_json["value"].get("answer", raw_ans)
                                    else:
                                        node["draft_content"] = raw_ans
                                else:
                                    node["draft_content"] = raw_ans
                            except:
                                node["draft_content"] = raw_ans
                                
                            if node.get("draft_content"):
                                node["draft_content"] = self._clean_citations(node["draft_content"])
                                # [추가] 실시간 업데이트를 위해 노드 내용이 완성되자마자 즉시 yield
                                yield json.dumps({
                                    "status": "node_updated", 
                                    "node_id": node.get("id"), 
                                    "content": node["draft_content"]
                                })
                            
                    if "children" in node and node["children"]:
                        async for prog in write_sections_recursive(node["children"]):
                            yield prog

            async for p in write_sections_recursive(document_tree):
                yield p

            print(f"[NOTEBOOKLM_SERVICE] Draft generation completed successfully")
            yield json.dumps({"status": "completed", "tree": document_tree, "notebook_id": notebook_id})

        except Exception as e:
            import traceback
            print(f"[NOTEBOOKLM_SERVICE] FATAL ERROR: {str(e)}")
            print(traceback.format_exc())
            yield json.dumps({"status": "error", "message": str(e)})

    async def generate_enhanced_draft_stream(
        self, 
        document_id: str, 
        notebook_id: str,
        document_tree: List[Dict[str, Any]], 
        run_deep_research: bool = False,
        project_name: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """기존 노트북 세션을 활용하여 초안을 고도화합니다."""
        print(f"[NOTEBOOKLM_SERVICE] Starting enhancement stream for document: {document_id}, Notebook: {notebook_id}")
        
        try:
            # Phase 1: Optional Deep Research
            if run_deep_research:
                print(f"[NOTEBOOKLM_SERVICE] Phase 1 - Starting Deep Research for Enhancement")
                yield json.dumps({"phase": 1, "status": "Phase 1: 고도화를 위한 심층 리서치(Deep Research) 시작..."})
                
                # 최적의 리서치 쿼리 생성
                opt_query_prompt = (
                    "사용자가 사업계획서를 더욱 전문적으로 고도화하고자 합니다. 기존 자료를 보강할 수 있는 "
                    "최신 시장 트렌드, 경쟁사 분석, 정부 정책 자료를 찾기 위한 가장 완벽한 'Deep Research 검색용 프롬프트' 1개만 작성해 줘. "
                    "반드시 [SEARCH_QUERY]태그 사이에 검색어만 넣어줘."
                )
                query_res = await self._run_command(["notebook", "query", notebook_id, opt_query_prompt])
                raw_output = query_res.get("output", "").strip()
                tag_match = re.search(r"\[SEARCH_QUERY\](.*?)\[/SEARCH_QUERY\]", raw_output, re.DOTALL)
                optimal_query = tag_match.group(1).strip() if tag_match else f"{project_name or document_id} 고도화 리서치"
                
                research_start = await self._run_command(["research", "start", optimal_query, "--notebook-id", notebook_id, "--mode", "deep"])
                task_id = research_start.get("task_id")
                
                # 리서치 완료 대기
                max_polls = 20
                poll_count = 0
                while poll_count < max_polls:
                    await asyncio.sleep(40)
                    poll_count += 1
                    status_res = await self._run_command(["research", "status", notebook_id])
                    output_lower = status_res.get("output", "").lower()
                    
                    if "completed" in output_lower or "finish" in output_lower:
                        yield json.dumps({"phase": 1, "status": "Phase 1: 리서치 완료. 소스 반입 중..."})
                        await asyncio.sleep(5)
                        final_task_id = status_res.get("task_id") or task_id
                        try:
                            if final_task_id and final_task_id != "latest":
                                await self._run_command(["research", "import", notebook_id, final_task_id])
                            else:
                                await self._run_command(["research", "import", notebook_id])
                        except: pass
                        break
                    else:
                        yield json.dumps({"phase": 1, "status": f"Phase 1: 리서치 진행 중 ({poll_count * 40}초 경과...)"})
            else:
                yield json.dumps({"phase": 1, "status": "Phase 1: 기존 노트북 세션을 활용하여 고도화 준비 중..."})

            # Phase 2: Persona & Global Rules (V5)
            print(f"[NOTEBOOKLM_SERVICE] Phase 2 - Configuring enhancement persona (V5)")
            yield json.dumps({"phase": 2, "status": "Phase 2: 고도화 전용 프롬프트 및 기술가치평가사 역할 적용 중..."})
            
            enhancement_prompt = """당신은 대한민국 정부지원사업 수석 컨설턴트이자 최고 수준의 테크니컬 라이터입니다. 
전달받은 [초안 내용]을 바탕으로 평가위원들이 선호하는 '초격차 고도화 사업계획서'로 변환하는 것이 당신의 사명입니다.

### [고도화 전략: 3단계 Up]
1. **Volume Up (상세화)**: 단순 개요나 짧은 문장을 구체적인 실행 프로세스, 실무 배경, 정량적 기대효과가 포함된 풍부한 본문으로 확장하십시오.
2. **Level Up (전문성)**: 일반 용어를 산업 표준(Industry Standard) 용어 및 전략적 비즈니스 키워드로 격상하십시오. 논리적 인과관계를 강화하여 전문성을 극대화하십시오.
3. **Source Up (근거 강화)**: 업로드된 소스 문서(Context)에 포함된 구체적인 데이터, 수치, 기업 현황, 기술 사양을 적극적으로 인용하여 내용의 객관성과 신뢰도를 확보하십시오.

### [작성 규칙 및 제약 조건]
1. **문체 준수**: 모든 문장은 반드시 '~함.', '~임.'과 같은 명사형/종결형 어미로 끝내십시오.
2. **구조 최적화**: 모든 문장은 직관성과 전문성을 바탕으로 구조화하되, 기계적인 분할을 피하고 **내용의 복잡도, 중요도, 논리적 위계에 따라 유연하게 조절하여 인간이 작성한 것처럼 자연스럽게 구성하십시오.
    - 마커([L1], [L2], [L3] 등)를 활용하십시오. (권장 깊이 [L1]~[L3], 필요 시 [L4]~[L5])
    - 논리적으로 연결된 내용은 적당히 묶어 '벽돌 글'이나 '과도한 파편화'를 방지하십시오.
    - 문장을 작성할 때, 해당 문장의 뎁스(Depth)에 맞춰 **마크다운 글머리기호(- 또는 *)와 마커**를 함께 기입하여 **들여쓰기를 표현**하십시오.
    - **[순번 체계 예외] 단, 문맥상 순서나 넘버링(①, ② 등)으로 명확한 구분이 필요한 경우, 기계적인 글머리기호 대신 마커([L1] 등) 바로 뒤에 해당 순번 기호를 직접 결합하여 작성하십시오.** 이 넘버링은 [L1], [L2], [L3]를 비롯한 모든 단계에 포함될 수 있습니다.
        - [사용 마커 및 마크다운 형태 예시]
            1단계: * [L1] 
            2단계:   * [L2]
            3단계:     * [L3]
        - [일반 작성 예시]
            * [L1] 글로벌 스마트 팩토리 시장 동향
                * [L2] 스마트 팩토리 시장은 2026년까지 연평균 11.0% 성장할 것으로 전망됨.
        - [순번 체계 적용 예시 (숫자 번호가 필요한 경우)]
            * [L1] ① 비전 AI 기반의 자동화 검수 체계 구축
                * [L2] 기존 육안 검사의 한계를 극복하고 검수 리드타임을 45% 단축함.
            * [L1] ② 데이터 무결성 검증 아키텍처 도입
                * [L2] 블록체인 기반의 해싱 알고리즘을 통해 조작을 원천 차단함.
3. **표(Table) 처리**: 마크다운 표 형식 유지 및 데이터 보강. 행(Row)은 정보량에 따라 자유롭게 추가하되 열(Column) 구조는 절대 변경하지 마십시오. 표 내부의 텍스트도 구조화가 필요하다면 본문과 동일하게 마커([L1], [L2] 등)를 사용하여 위계를 표현 하십시오.
4. **무결성 유지**: 초안의 핵심 키워드나 정량적 수치는 절대 빠뜨리지 말고 보존하십시오.
5. **금지 사항**: 인사말, 작업 확인 멘트, 출처 표시(Citation) 태그 출력을 절대 금지함. 고도화된 결과물만 출력하십시오. **요청받은 [목차명] 텍스트를 답변의 시작이나 중간에 절대 반복하여 출력하지 마십시오.** 본문의 실질적인 내용만 바로 시작하십시오."""

            try:
                await self._run_command([
                    "chat", "configure", notebook_id,
                    "--goal", "custom",
                    "--prompt", enhancement_prompt,
                    "--response-length", "longer"
                ], shell=False)
            except:
                cli_safe_prompt = enhancement_prompt.replace('\n', ' ').replace('\r', ' ')
                await self._run_command([
                    "chat", "configure", notebook_id,
                    "--goal", "custom",
                    "--prompt", cli_safe_prompt,
                    "--response-length", "longer"
                ])
            
            # Phase 3: Recursive Enhancement
            print(f"[NOTEBOOKLM_SERVICE] Phase 3 - Generating enhanced sections")
            yield json.dumps({"phase": 3, "status": "Phase 3: 섹션별 고도화 작업 순회 시작..."})
            
            async def enhance_sections_recursive(nodes):
                for node in nodes:
                    if not isinstance(node, dict): continue
                    
                    if node.get("content") is True or node.get("contentChecked") is True:
                        title = node.get("title", "Unknown Section")
                        draft_content = node.get("draft_content")
                        
                        # [주의] draft_content가 있을 때만 고도화 시도
                        if draft_content and str(draft_content).strip():
                            # 이미 고도화된 내용이 존재한다면 건너뜀 (이어하기 지원)
                            current_ext = node.get("extended_content")
                            if current_ext and str(current_ext).strip() and len(str(current_ext).strip()) > 50:
                                print(f"[NOTEBOOKLM_SERVICE] Skipping enhancement (already enhanced): {title}")
                                yield json.dumps({
                                    "status": "node_enhanced", 
                                    "node_id": node.get("id"), 
                                    "content": current_ext
                                })
                            else:
                                print(f"[NOTEBOOKLM_SERVICE] Enhancing section: {title}")
                                yield json.dumps({"phase": 3, "status": f"고도화 중: {title}"})

                                final_prompt = f"목차명: [{title}]\n초안 내용: {draft_content}\n\n위 내용을 [고도화 전략] 및 [작성 규칙 및 제약 조건]을 엄수하여 오직 이 항목의 **본문만** 상세하고 전문적으로 확장하여 작성해 줘."
                                await asyncio.sleep(2)
                                
                                node_res = await self._run_command(["notebook", "query", notebook_id, final_prompt])
                                raw_ans = node_res.get("output", "").strip()
                                
                                # JSON 추출 처리
                                try:
                                    json_match = re.search(r"(\{.*\})", raw_ans, re.DOTALL)
                                    if json_match:
                                        ans_json = json.loads(json_match.group(1))
                                        enhanced_text = ans_json.get("answer") or (ans_json.get("value", {}).get("answer") if isinstance(ans_json.get("value"), dict) else raw_ans)
                                    else:
                                        enhanced_text = raw_ans
                                except:
                                    enhanced_text = raw_ans
                                    
                                node["extended_content"] = self._clean_citations(enhanced_text)
                                yield json.dumps({
                                    "status": "node_enhanced", 
                                    "node_id": node.get("id"), 
                                    "content": node["extended_content"]
                                })
                        else:
                            print(f"[NOTEBOOKLM_SERVICE] Skipping enhancement: {title} (No draft content, but checking children)")
                            
                    if "children" in node and node["children"]:
                        async for prog in enhance_sections_recursive(node["children"]):
                            yield prog

            async for p in enhance_sections_recursive(document_tree):
                yield p
            print(f"[NOTEBOOKLM_SERVICE] Enhancement completed successfully")
            yield json.dumps({"status": "completed", "tree": document_tree})

        except Exception as e:
            import traceback
            print(f"[NOTEBOOKLM_SERVICE] ENHANCE FATAL ERROR: {str(e)}")
            print(traceback.format_exc())
            yield json.dumps({"status": "error", "message": str(e)})

notebooklm_service = NotebookLMService()
