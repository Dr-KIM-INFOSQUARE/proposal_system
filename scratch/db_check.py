import sqlite3
import os

db_path = "planweaver.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Checking database at: {os.path.abspath(db_path)}")
    
    # 테이블 목록 확인
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables: {tables}")
    
    # 프로젝트 개수 확인
    try:
        cursor.execute("SELECT count(*) FROM projects")
        count = cursor.fetchone()[0]
        print(f"Total projects in DB: {count}")
        
        # 최근 5개 프로젝트 샘플 출력
        cursor.execute("SELECT id, name, document_id, created_at FROM projects ORDER BY created_at DESC LIMIT 5")
        rows = cursor.fetchall()
        for row in rows:
            print(f"Project: {row}")
    except Exception as e:
        print(f"Error querying projects: {e}")
        
    conn.close()
else:
    print(f"DB file not found at {db_path}")

# 현재 경로의 모든 .db 파일 찾기
print("\nSearching for other .db files in current directory:")
for f in os.listdir("."):
    if f.endswith(".db"):
        print(f"Found: {f} (size: {os.path.getsize(f)} bytes)")
