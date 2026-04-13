import sqlite3
import json
import os

def export_data():
    db_path = 'planweaver.db'
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found.")
        return

    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute('SELECT name, parsed_tree FROM projects ORDER BY created_at DESC LIMIT 1')
        row = c.fetchone()
        if not row:
            print("No projects found in DB.")
            return

        project_name = row[0]
        tree = json.loads(row[1])
        
        draft_only = []
        enhanced_only = []

        def traverse(nodes):
            for n in nodes:
                title = n.get('title', 'Unknown')
                d = n.get('draft_content', '')
                e = n.get('extended_content', '')
                
                if d or e:
                    draft_only.append({"title": title, "content": d})
                    enhanced_only.append({"title": title, "content": e})
                
                if 'children' in n and n['children']:
                    traverse(n['children'])

        traverse(tree)

        # JSON 파일로 내보내기
        with open('draft_data_debug.json', 'w', encoding='utf-8') as f:
            json.dump(draft_only, f, ensure_ascii=False, indent=2)
            
        with open('enhanced_data_debug.json', 'w', encoding='utf-8') as f:
            json.dump(enhanced_only, f, ensure_ascii=False, indent=2)

        print(f"Project: {project_name}")
        print(f"Exported draft_data_debug.json ({len(draft_only)} items)")
        print(f"Exported enhanced_data_debug.json ({len(enhanced_only)} items)")
        
        conn.close()
    except Exception as ex:
        print(f"Error during export: {ex}")

if __name__ == "__main__":
    export_data()
