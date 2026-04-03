import sqlite3
import json
import os

db_path = r"d:\Desktop\proposal_system\planweaver.db"
output_path = r"d:\Desktop\proposal_system\Draft.md"

def export_draft():
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
    markdown_lines.append(f"# 사업계획서 초안: {name}")
    markdown_lines.append(f"- **원본 파일**: {filename}")
    markdown_lines.append(f"- **프로젝트 ID**: {pid}")
    markdown_lines.append("\n---\n")

    def process_nodes(nodes, level=1):
        for node in nodes:
            title = node.get('title', 'Unknown Section')
            draft = node.get('draft_content', '')
            
            # Add title
            # Use level to determine heading depth (max 6)
            h_level = min(level + 1, 6)
            markdown_lines.append(f"{'#' * h_level} {title}")
            markdown_lines.append("")
            
            # Add draft content if exists
            if draft:
                markdown_lines.append(draft)
                markdown_lines.append("")
            
            # Process children
            if 'children' in node and node['children']:
                process_nodes(node['children'], level + 1)

    if isinstance(tree, list):
        process_nodes(tree, 1)
    else:
        print("Warning: parsed_tree is not a list. Skipping node processing.")

    # Save to file
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(markdown_lines))
    
    print(f"Successfully exported draft to {output_path}")

if __name__ == "__main__":
    export_draft()
