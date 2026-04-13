import sqlite3
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def check_mix(nodes, depth=0):
    for n in nodes:
        draft = n.get('draft_content', '')
        enhanced = n.get('extended_content', '')
        title = n.get('title', 'Unknown')
        
        if draft and enhanced:
            # Check if enhanced content exists but draft is somehow updated with enhanced content
            # or if draft contains "상세하고 전문적으로" etc (enhancement keywords)
            keywords = ["고도화", "전략", "전문적", "트렌드", "확장"]
            found_in_draft = [k for k in keywords if k in draft]
            
            if len(draft) > 10 and len(enhanced) > 10:
                print(f"{'  '*depth}- {title}")
                print(f"{'  '*(depth+1)}[DRAFT]: {draft[:100]}...")
                print(f"{'  '*(depth+1)}[ENHANCED]: {enhanced[:100]}...")
                
                if draft == enhanced:
                    print(f"{'  '*(depth+1)}⚠️ CRITICAL: Draft and Enhanced are IDENTICAL!")
                elif enhanced in draft:
                    print(f"{'  '*(depth+1)}⚠️ CRITICAL: Draft contains the Enhanced version!")
                elif found_in_draft and len(found_in_draft) > 1:
                    print(f"{'  '*(depth+1)}⚠️ WARNING: Draft contains enhancement keywords: {found_in_draft}")

        if 'children' in n and n['children']:
            check_mix(n['children'], depth + 1)

def main():
    try:
        conn = sqlite3.connect('planweaver.db')
        c = conn.cursor()
        c.execute('SELECT name, parsed_tree FROM projects ORDER BY created_at DESC LIMIT 1')
        row = c.fetchone()
        if not row: return
        print(f"Project: {row[0]}")
        tree = json.loads(row[1])
        check_mix(tree)
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
