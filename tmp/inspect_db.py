import sqlite3
import json
import os

db_path = r"d:\Desktop\proposal_system\planweaver.db"

def inspect_db():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get the latest project
    cursor.execute("SELECT id, name, document_id, filename, parsed_tree FROM projects ORDER BY created_at DESC LIMIT 1")
    project = cursor.fetchone()
    
    if not project:
        print("No projects found.")
        return
    
    pid, name, doc_id, filename, tree_json = project
    print(f"Project ID: {pid}")
    print(f"Name: {name}")
    print(f"Document ID: {doc_id}")
    
    tree = json.loads(tree_json)
    
    # Write the raw tree to a temp file for inspection
    with open(r"d:\Desktop\proposal_system\tmp\tree_inspect.json", "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)
    
    print("Tree structure saved to d:/Desktop/proposal_system/tmp/tree_inspect.json")
    
    def print_nodes(nodes, indent=0):
        for node in nodes:
            label = node.get('label', node.get('text', 'No Label'))
            has_content = 'content' in node and node['content']
            # Also check draft_markdown or similar keys
            has_draft = 'draft_markdown' in node and node['draft_markdown']
            print("  " * indent + f"- {label} (Content: {'Yes' if has_content else 'No'}, Draft: {'Yes' if has_draft else 'No'})")
            if 'children' in node:
                print_nodes(node['children'], indent + 1)

    if isinstance(tree, list):
        print_nodes(tree)
    else:
        print("Tree is not a list?", type(tree))

if __name__ == "__main__":
    inspect_db()
