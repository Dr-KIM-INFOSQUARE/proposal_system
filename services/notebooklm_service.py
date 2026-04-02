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

    async def _run_command(self, args: List[str], timeout: Optional[int] = None) -> Dict[str, Any]:
        """nlm CLI 명령어를 실행하고 결과를 반환합니다."""
        cmd = [self.nlm_cmd] + args
        
        try:
            print(f"[NOTEBOOKLM_SERVICE] Executing command: {' '.join(cmd)}")
            
            # Windows에서 asyncio.create_subprocess_shell의 NotImplementedError 이슈를 
            # 근본적으로 해결하기 위해 subprocess.run을 asyncio.to_thread로 실행합니다.
            def sync_run():
                # Windows 인코딩 에러(cp949) 방지를 위한 환경 변수 설정
                current_env = os.environ.copy()
                current_env["PYTHONIOENCODING"] = "utf-8"
                current_env["PYTHONUTF8"] = "1"
                
                return subprocess.run(
                    cmd,
                    input="y\n",
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='ignore',
                    env=current_env,
                    shell=False,
                    timeout=timeout or self.timeout
                )
            # 별도 스레드에서 차단 없이 실행
            result = await asyncio.to_thread(sync_run)
            output = result.stdout + "\n" + result.stderr
            
            if result.returncode != 0:
                print(f"[NOTEBOOKLM_SERVICE] ERROR (Code {result.returncode}):\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}")
                raise Exception(f"NLM Error (Code {result.returncode}): {result.stderr or result.stdout}")
            
            print(f"[NOTEBOOKLM_SERVICE] SUCCESS. Response: {output[:100]}...")
            
            # --- ID 추출 로직 ---
            # 1. Notebook ID: "ID: [UUID]" 형식을 먼저 찾음
            id_match = re.search(r"ID:\s*([a-fA-F0-9-]{36})", output)
            nb_id = id_match.group(1) if id_match else None
            
            # 2. Task ID: "Task ID: [UUID]" 또는 "Task: [UUID]" 형식을 먼저 찾음
            task_id = None
            task_match = re.search(r"(?:Task\s*ID|Task):\s*([a-fA-F0-9-]{36})", output, re.IGNORECASE)
            if task_match:
                task_id = task_match.group(1)
            else:
                # 만약 Task ID 접두사가 없는데 36자 ID가 있고, 그게 Notebook ID와 다르다면 Task ID로 추정
                all_uuids = re.findall(r"([a-fA-F0-9-]{36})", output)
                unique_uuids = [u for u in all_uuids if u != nb_id]
                if unique_uuids:
                    task_id = unique_uuids[0]

            res_dict = {"status": "success", "output": output}
            if nb_id:
                res_dict["id"] = nb_id
            if task_id:
                res_dict["task_id"] = task_id
                
            return res_dict
            
        except subprocess.TimeoutExpired:
            print(f"[NOTEBOOKLM_SERVICE] TIMEOUT ERROR")
            raise Exception(f"Command timed out: {' '.join(cmd)}")
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"[NOTEBOOKLM_SERVICE] EXCEPTION: {error_trace}")
            raise Exception(f"Failed to execute NLM command: {str(e)} | Details: {type(e).__name__}")

    async def generate_draft_stream(
        self, 
        document_id: str, 
        master_brief: str, 
        document_tree: List[Dict[str, Any]], 
        pdf_path: Optional[str] = None, 
        research_mode: str = "deep", 
        project_name: Optional[str] = None, 
        existing_notebook_id: Optional[str] = None,
        last_research_mode: Optional[str] = None,
        has_persona: bool = False
    ) -> AsyncGenerator[str, None]:

        """5단계 파이프라인을 스트리밍 방식으로 실행합니다."""
        print(f"[NOTEBOOKLM_SERVICE] Starting draft stream for document: {document_id}")
        notebook_id = None
        
        try:
            # Phase 1: Setup (또는 기존 노트북 확인)
            if existing_notebook_id:
                notebook_id = existing_notebook_id
                print(f"[NOTEBOOKLM_SERVICE] Phase 1 - Reusing existing notebook: {notebook_id}")
                yield json.dumps({"phase": 1, "status": "Phase 1: 기존 노트북 재사용 중..."})
            else:
                timestamp = datetime.now().strftime("%H%M%S")
                safe_project_name = project_name.replace(" ", "_").replace("'", "").replace("\"", "") if project_name else document_id
                notebook_title = f"Draft_{safe_project_name}_{timestamp}"
                
                print(f"[NOTEBOOKLM_SERVICE] Phase 1 - Setting up notebook: {notebook_title}")
                yield json.dumps({"phase": 1, "status": "Phase 1: 노트북 생성 및 소스 업로드 중..."})
                create_res = await self._run_command(["notebook", "create", notebook_title])
                notebook_id = create_res.get("id")
                if not notebook_id:
                    # create_res["id"]가 없을 경우 output에서 다시 한번 시도
                    match = re.search(r"ID:\s*([a-fA-F0-9-]{36})", create_res.get("output", ""))
                    if match:
                        notebook_id = match.group(1)
                    else:
                        raise Exception(f"노트북 생성 실패: ID를 찾을 수 없습니다. (출력: {create_res.get('output')})")
                
                print(f"[NOTEBOOKLM_SERVICE] Notebook created successfully: {notebook_id}")
                
                # 마스터 브리프 및 템플릿 파일 업로드 (기온 노트북이 아닐 때만 실행)
                # 마스터 브리프 임시 파일 생성
                with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as tmp_brief:
                    tmp_brief.write(master_brief)
                    brief_path = tmp_brief.name
                
                try:
                    # 소스 추가 (마스터 브리프)
                    print(f"[NOTEBOOKLM_SERVICE] Adding source: Master Brief")
                    await self._run_command(["source", "add", notebook_id, "--file", brief_path, "--wait"])
                    
                    # 소스 추가 (양식 PDF - 존재 시)
                    if pdf_path and os.path.exists(pdf_path):
                        print(f"[NOTEBOOKLM_SERVICE] Adding source: Template PDF")
                        await self._run_command(["source", "add", notebook_id, "--file", pdf_path, "--wait"])
                finally:
                    if os.path.exists(brief_path):
                        os.remove(brief_path)

            # Phase 2 & 3: Research Execution (Idempotency Check)
            # 요청한 리서치 모드가 기존에 성공했던 모드와 동일하면 스킵
            if last_research_mode == research_mode:
                print(f"[NOTEBOOKLM_SERVICE] Skipping Phase 2 & 3 - Research mode '{research_mode}' already completed.")
                yield json.dumps({
                    "phase": 3, 
                    "status": f"Phase 2 & 3 Skip: 기존 {research_mode.upper()} 리서치 결과가 유효하여 재사용합니다.",
                    "research_completed": True
                })
            else:
                # Phase 2: Optimize Query
                print(f"[NOTEBOOKLM_SERVICE] Phase 2 - Optimizing search query")
                yield json.dumps({"phase": 2, "status": "Phase 2: 최적의 리서치 쿼리 생성 중..."})
                # 태그를 사용하도록 유도하여 파싱 안정성 확보
                opt_query_prompt = (
                    "업로드된 사업계획서 양식과 사업 아이디어를 완벽하게 뒷받침할 객관적이고 균형 잡힌 "
                    "근거 자료(시장/기술/정책)를 찾기 위해, Deep Research에 입력할 가장 완벽한 '검색용 프롬프트' 1개만 작성해 줘. "
                    "반드시 [SEARCH_QUERY]태그 사이에 검색어만 넣어줘."
                )
                query_res = await self._run_command(["notebook", "query", notebook_id, opt_query_prompt])
                
                raw_output = query_res.get("output", "").strip()
                optimal_query = ""
                
                # ... (Tag extraction logic remains same) ...
                tag_match = re.search(r"\[SEARCH_QUERY\](.*?)\[/SEARCH_QUERY\]", raw_output, re.DOTALL)
                if tag_match:
                    optimal_query = tag_match.group(1).strip()
                
                if not optimal_query:
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
                
                # Polling research status
                max_polls = 20
                poll_count = 0
                while poll_count < max_polls:
                    await asyncio.sleep(30)
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
                        
                        # 리서치 성공 시 시그널 전송 (상위에서 DB 저장용)
                        yield json.dumps({"research_completed": True, "research_mode": research_mode})
                        break
                    else:
                        yield json.dumps({"phase": 3, "status": f"Phase 3: 리서치 진행 중 ({poll_count * 30}초 경과...)"})

            
            # Phase 4: Persona & Global Rules (Idempotency Check)
            if has_persona:
                print(f"[NOTEBOOKLM_SERVICE] Phase 4 - Skipping persona injection (already set)")
                yield json.dumps({"phase": 4, "status": "Phase 4 Skip: 글로벌 작성 규칙이 이미 적용되어 있습니다."})
            else:
                print(f"[NOTEBOOKLM_SERVICE] Phase 4 - Configuring global chat persona and style rules")
                yield json.dumps({"phase": 4, "status": "Phase 4: 글로벌 작성 규칙(명사형 종결 등) 적용 중..."})
                
                global_style_rules = """당신은 대한민국 최고의 정부지원사업 수석 컨설턴트이자 비즈니스 전략가입니다. 
앞으로의 모든 답변에서 다음의 [절대 작성 규칙]을 무조건적으로 준수하십시오:

1. 모든 문장은 반드시 '~함.', '~임.'과 같이 **명사형 또는 종결형 종결 어미**로 끝낼 것. 절대 '~입니다', '~한다' 등을 사용하지 마시오.
2. 본문은 반드시 **불렛 포인트( - 또는 * )**를 활용하여 가독성 있게 구조화할 것.
3. **'알겠습니다', '숙지했습니다', '도출했습니다'와 같은 서론, 결론, 부연 설명, 작업 확인 멘트를 절대 작성하지 마.**
4. **본문 내용 중에 [1], [2], [1-3] 등의 출처 표시(Citation)를 절대 포함하지 마.**
5. **요청받은 [작성할 목차] 텍스트를 답변의 시작이나 중간에 절대 반복하여 출력하지 마.** 본문의 실질적인 내용만 바로 시작할 것.
6. **오직 요청받은 단일 항목에 대해서만 작성하고, 이후에 이어질 다른 목차나 주제는 절대 미리 작성하지 마시오.**
7. 표(Table) 작성 요청 시, 제공된 열(Column) 구조를 유지하되 정보량에 따라 행(Row)은 자유롭게 추가할 것.
8. 전문적이고 분석적인 톤앤매너를 유지하며, 구체적인 수치와 근거를 포함하여 작성할 것."""
                
                try:
                    # nlm chat configure 를 통해 노트북 전체에 규칙 주입
                    await self._run_command([
                        "chat", "configure", notebook_id,
                        "--goal", "custom",
                        "--prompt", global_style_rules,
                        "--response-length", "longer"
                    ])
                    print("[NOTEBOOKLM_SERVICE] Global chat configuration applied successfully.")
                    yield json.dumps({"persona_injected": True})
                except Exception as e:
                    print(f"[NOTEBOOKLM_SERVICE] Warning: Failed to configure global chat settings: {e}")
                    # Fallback: 기존처럼 query로 주입 시도
                    await self._run_command(["notebook", "query", notebook_id, global_style_rules])
                    yield json.dumps({"persona_injected": True})



            # Phase 5: Recursive Drafting
            print(f"[NOTEBOOKLM_SERVICE] Phase 5 - Generating content sections")
            yield json.dumps({"phase": 5, "status": "Phase 5: 섹션별 순회 초안 작성 시작..."})
            
            async def write_sections_recursive(nodes):
                for node in nodes:
                    if node.get("content") is True:
                        title = node.get("title", "Unknown Section")
                        writing_guide = node.get("writingGuide")
                        user_instruction = node.get("userInstruction")
                        table_metadata = node.get("tableMetadata")
                        node_type = node.get("type")

                        if node.get("draft_content") and str(node.get("draft_content")).strip():
                            print(f"[NOTEBOOKLM_SERVICE] Skipping section: {title} (already exists)")
                            yield json.dumps({"phase": 5, "status": f"스킵: {title} (이미 작성됨)"})
                            continue

                        print(f"[NOTEBOOKLM_SERVICE] Drafting section: {title}")
                        yield json.dumps({"phase": 5, "status": f"작성 중: {title}"})

                        
                        # [쿼리 문자열 생성 동적 로직]
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
                                f"  주의: 오직 이 표 하나만 작성하고, 다른 표나 섹션을 추가로 작성하지 마시오.\n"
                            )
                        else:
                            prompt_parts.append("\n설정된 [절대 작성 규칙]을 엄수하여 오직 이 항목의 **본문만** 상세히 작성해 줘.")


                        
                        final_prompt = "".join(prompt_parts)
                        
                        # CLI 호출 전 약간의 대기 (API 부하 분산)
                        await asyncio.sleep(2)
                        
                        node_res = await self._run_command(["notebook", "query", notebook_id, final_prompt])
                        
                        # 결과에서 answer만 추출 시도
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
                            
                        # 사후 필터링: 문장 끝의 [1], [2] 등 제거
                        if node.get("draft_content"):
                            node["draft_content"] = self._clean_citations(node["draft_content"])
                            
                    # 자식 노드 탐색 (content 여부와 관계없이 재귀)
                    if "children" in node and node["children"]:
                        async for prog in write_sections_recursive(node["children"]):
                            yield prog

            # 전체 트리 순회 시작
            async for p in write_sections_recursive(document_tree):
                yield p

            # Final response
            print(f"[NOTEBOOKLM_SERVICE] Draft generation completed successfully")
            yield json.dumps({"status": "completed", "tree": document_tree, "notebook_id": notebook_id})

        except Exception as e:
            import traceback
            print(f"[NOTEBOOKLM_SERVICE] FATAL ERROR: {str(e)}")
            print(traceback.format_exc())
            yield json.dumps({"status": "error", "message": str(e)})

# 싱글톤 인스턴스
notebooklm_service = NotebookLMService()
