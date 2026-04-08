import sqlite3

def inspect():
    conn = sqlite3.connect('planweaver.db')
    cursor = conn.cursor()
    
    # 모든 테이블 이름 가져오기
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [t[0] for t in cursor.fetchall()]
    print(f"Tables found: {tables}")
    
    for table in tables:
        print(f"\n--- [Schema for {table}] ---")
        cursor.execute(f"PRAGMA table_info({table})")
        columns = cursor.fetchall()
        for col in columns:
            print(f"Col {col[0]}: {col[1]} ({col[2]})")
            
        # 첫 1건 데이터 확인 (데이터 형식 파악용)
        try:
            cursor.execute(f"SELECT * FROM {table} LIMIT 1")
            row = cursor.fetchone()
            print(f"Sample data: {row}")
        except:
            pass
            
    conn.close()

if __name__ == '__main__':
    inspect()
