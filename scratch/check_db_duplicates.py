import sys
import io
import sqlite3
import json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def check_tree(nodes, depth=0):
    for n in nodes:
        draft = n.get('draft_content', '')
        # Check if draft content seems duplicated internally
        is_duplicated = False
        if draft and len(draft) > 100:
            mid = len(draft) // 2
            first_half = draft[:mid].strip()
            second_half = draft[mid:].strip()
            if first_half in second_half or second_half in first_half:
                is_duplicated = True
        
        if draft:
            print(f"{'  '*depth}- {n.get('title')} ({len(draft)} chars) {'[SUSPECTED DUPLICATE]' if is_duplicated else ''}")
        
        if 'children' in n and n['children']:
            check_tree(n['children'], depth + 1)

def main():
    try:
        conn = sqlite3.connect('planweaver.db')
        c = conn.cursor()
        c.execute('SELECT name, parsed_tree FROM projects ORDER BY created_at DESC LIMIT 1')
        row = c.fetchone()
        if not row:
            print("No projects found.")
            return
            
        print(f"Project Name: {row[0]}")
        tree = json.loads(row[1])
        check_tree(tree)
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
