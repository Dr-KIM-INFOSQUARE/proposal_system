import sqlite3
import json

db_path = "planweaver.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- Project Data Detail ---")
cursor.execute("SELECT document_id, name, selected_node_ids, content_node_ids FROM projects")
rows = cursor.fetchall()
for row in rows:
    doc_id, name, selected, content = row
    print(f"\n[Project: {name}]")
    print(f"Document ID: {doc_id}")
    print(f"Selected Node IDs: {selected} (Type: {type(selected)})")
    print(f"Content Node IDs: {content}")
    
    # JSON 파싱 시도 (문자열로 저장되어 있다면)
    try:
        if isinstance(selected, str):
            parsed = json.loads(selected)
            print(f"Parsed Selected IDs: {parsed} (First element type: {type(parsed[0]) if parsed else 'Empty'})")
    except:
        pass

conn.close()
