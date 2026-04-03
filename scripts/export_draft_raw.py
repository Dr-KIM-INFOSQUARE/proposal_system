import sqlite3
import json
import os

db_path = r"d:\Desktop\proposal_system\planweaver.db"
output_path = r"d:\Desktop\proposal_system\Draft_raw.md"

def export_draft_raw():
    if not os.path.exists(db_path):
        print(f"Error: Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get the latest project
    cursor.execute("SELECT id, name, filename, parsed_tree FROM projects ORDER BY created_at DESC LIMIT 1")
    project = cursor.fetchone()
    
    if not project:
        print("No projects found in database.")
        return
    
    pid, name, filename, tree_json = project
    tree = json.loads(tree_json)
    
    markdown_lines = []
    markdown_lines.append(f"### [RAW DRAFT DATA] Project: {name} (ID: {pid})")
    markdown_lines.append("\n" + "="*50 + "\n")

    def process_nodes(nodes):
        for node in nodes:
            nid = node.get('id', 'N/A')
            title = node.get('title', 'Unknown Section')
            draft = node.get('draft_content', '')
            node_type = node.get('type', 'heading')
            
            if draft:
                markdown_lines.append(f"#### [NODE_ID: {nid}] {title} ({node_type})")
                markdown_lines.append("```markdown")
                # Write the draft exactly as extracted from JSON
                markdown_lines.append(draft)
                markdown_lines.append("```")
                markdown_lines.append("\n" + "-"*30 + "\n")
            
            # Process children
            if 'children' in node and node['children']:
                process_nodes(node['children'])

    if isinstance(tree, list):
        process_nodes(tree)
    else:
        print("Warning: parsed_tree is not a list. Skipping node processing.")

    # Save to file
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(markdown_lines))
    
    print(f"Successfully exported raw draft to {output_path}")

if __name__ == "__main__":
    export_draft_raw()
