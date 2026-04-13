import sqlite3
import json

def check_node_recursive(nodes):
    is_any_checked = False
    for node in nodes:
        if node.get("checked") or node.get("contentChecked"):
            print(f"  [Found Checked Node] ID: {node.get('id')}, Title: {node.get('title')}, Checked: {node.get('checked')}, ContentChecked: {node.get('contentChecked')}")
            is_any_checked = True
        if "children" in node and node["children"]:
            if check_node_recursive(node["children"]):
                is_any_checked = True
    return is_any_checked

db_path = "planweaver.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT name, parsed_tree, selected_node_ids FROM projects")
rows = cursor.fetchall()

for name, tree_str, selected_ids_str in rows:
    print(f"\nAnalyzing Project: {name}")
    print(f"Column 'selected_node_ids': {selected_ids_str}")
    
    if not tree_str:
        print("  Parsed tree is empty.")
        continue
        
    try:
        tree = json.loads(tree_str)
        print(f"  Scanning tree with {len(tree)} top-level nodes...")
        found = check_node_recursive(tree)
        if not found:
            print("  No 'checked' or 'contentChecked' flags found inside parsed_tree nodes.")
    except Exception as e:
        print(f"  Error parsing tree: {e}")

conn.close()
