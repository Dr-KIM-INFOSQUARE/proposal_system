import sqlite3
import json

def check_project():
    try:
        conn = sqlite3.connect('planweaver.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # "hwpx 생성 테스트 3" 프로젝트 조회 (title -> name 변경)
        query = "SELECT * FROM projects WHERE name LIKE '%hwpx 생성 테스트 3%'"
        cursor.execute(query)
        rows = cursor.fetchall()
        
        if not rows:
            print("❌ 프로젝트를 찾을 수 없습니다.")
            return

        for row in rows:
            print(f"\n✅ --- [Project: {row['name']}] ---")
            print(f"🔹 ID(Internal): {row['id']}")
            print(f"🔹 Doc ID: {row['document_id']}")
            print(f"🔹 Created At: {row['created_at']}")
            
            # NotebookLM 관련 정보
            print(f"📂 [NotebookLM Status]")
            print(f"   - Notebook ID: {row['notebook_id'] if row['notebook_id'] else '미생성'}")
            
            # parsed_tree (진행 상황이 담김)
            tree_data = row['parsed_tree']
            if tree_data:
                try:
                    tree = json.loads(tree_data)
                    # 트리의 각 노드(섹션) 중 'is_ready' 또는 'content'가 있는 비율 계산
                    sections = tree.get('nodes', []) if isinstance(tree, dict) else []
                    total = len(sections)
                    completed = sum(1 for s in sections if s.get('content'))
                    
                    print(f"   - Total Sections: {total}개")
                    print(f"   - Completed Drafts: {completed}개")
                    if total > 0:
                        print(f"   - Progress: {(completed/total)*100:.1f}%")
                except:
                    print("   - Tree 분석 실패 (JSON 확인필요)")
            else:
                print("   - Parsed Tree: 없음")
            
            # Persona/Idea 정보
            print(f"🔹 Idea Snippet: {row['initial_idea'][:100] if row['initial_idea'] else 'None'}...")
    except Exception as e:
        print(f"❌ DB Access Error: {str(e)}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    check_project()
